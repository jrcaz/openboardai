import { Hono } from 'hono'
import type { Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { zValidator } from '@hono/zod-validator'
import {
  experimental_generateVideo as generateVideo,
  generateImage,
  streamText,
  type ModelMessage,
} from 'ai'
import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import {
  GenerateImageRequest,
  GenerateRequest,
  GenerateTranscriptionRequest,
  GenerateVideoRequest,
  type GenerateImageResponse,
  type GenerateVideoResponse,
  type ImageAspect,
  type VideoAspect,
} from '@openboard-ai/shared'
import { db, schema } from '../db/client.js'
import { DEFAULTS, buildSystemPrompt, getOpenRouter } from '../ai/openrouter.js'

export const ai = new Hono()

function requireOpenRouter(c: Context) {
  const key = c.req.header('x-openrouter-key')?.trim()
  if (!key) {
    throw new HTTPException(401, {
      res: c.json({ error: 'missing-openrouter-key' }, 401),
    })
  }
  return { openrouter: getOpenRouter(key), apiKey: key }
}

ai.post('/generate', zValidator('json', GenerateRequest), async (c) => {
  const { openrouter } = requireOpenRouter(c)
  const { messages, boardId, mode, context, resultShapeId, model } = c.req.valid('json')
  const selected = model?.trim() || DEFAULTS.text

  const lastUser = [...messages].reverse().find((m) => m.role === 'user')
  const promptText = lastUser?.content ?? ''

  const imageParts = await resolveContextImages(context?.shapes ?? [])
  const llmMessages = attachImagesToLastUser(messages, imageParts)

  const result = streamText({
    model: openrouter.chat(selected),
    system: buildSystemPrompt({ mode, context }),
    messages: llmMessages,
    onFinish: async ({ text }) => {
      try {
        await db.insert(schema.aiMessages).values({
          id: nanoid(12),
          boardId,
          prompt: promptText,
          response: text,
          model: selected,
          mode,
          contextShapeIds: context?.shapes.map((s) => s.id) ?? [],
          resultShapeId: resultShapeId ?? null,
        })
      } catch (err) {
        console.error('[ai] failed to persist ai_message', err)
      }
    },
    onError: ({ error }) => {
      console.error('[ai] stream error', error)
    },
  })

  return result.toTextStreamResponse()
})

// Recorded dimensions per aspect — OpenRouter's image SDK ignores `size` and
// only accepts `aspectRatio`, so these are nominal canvas dimensions we persist
// for layout (the actual returned image bytes carry their own intrinsic size).
const DIMS_FOR: Record<ImageAspect, { w: number; h: number }> = {
  '1:1': { w: 1024, h: 1024 },
  '16:9': { w: 1536, h: 864 },
  '9:16': { w: 864, h: 1536 },
}

ai.post('/generate-image', zValidator('json', GenerateImageRequest), async (c) => {
  const { openrouter } = requireOpenRouter(c)
  const { boardId, prompt, aspect, resultShapeId, model } = c.req.valid('json')
  const selected =
    model?.trim() || process.env.OPENROUTER_IMAGE_MODEL || DEFAULTS.image

  try {
    const dims = DIMS_FOR[aspect]
    const { image } = await generateImage({
      model: openrouter.imageModel(selected),
      prompt,
      aspectRatio: aspect,
    })

    const id = nanoid(12)
    const mediaType = image.mediaType ?? 'image/png'
    const bytes = Buffer.from(image.uint8Array)

    await db.insert(schema.aiImages).values({
      id,
      boardId,
      prompt,
      model: selected,
      width: dims.w,
      height: dims.h,
      mediaType,
      bytes,
      resultShapeId: resultShapeId ?? null,
    })

    const body: GenerateImageResponse = {
      imageId: id,
      url: `/api/images/${id}`,
      width: dims.w,
      height: dims.h,
      mediaType,
      prompt,
    }
    return c.json(body)
  } catch (err) {
    console.error('[ai] image generation failed', err)
    const raw = err instanceof Error ? err.message : 'unknown'
    // OpenRouter occasionally returns 200 with an empty body for some image
    // models. Surface a hint instead of the raw JSON-parse error.
    const message = /Unexpected end of JSON input|Invalid JSON response/.test(raw)
      ? selected === DEFAULTS.image
        ? `${selected} returned an empty response. Try again or pick a different model.`
        : `${selected} returned an empty response. Try again or pick a different model (e.g. ${DEFAULTS.image}).`
      : raw
    return c.json({ error: 'image_generation_failed', message }, 500)
  }
})

// veo-3.1 (premium, $0.40/sec @ 1080p+audio) requires a large upfront credit
// reservation that returns 402 even with $100+ remaining. veo-3.1-fast is the
// same model family, supports text-to-video + image-to-video + audio, and
// runs at ~$0.12/sec @ 1080p+audio (~3× cheaper, smaller hold).
const VIDEO_RES_FOR: Record<
  VideoAspect,
  { aspectRatio: `${number}:${number}`; w: number; h: number }
> = {
  '16:9': { aspectRatio: '16:9', w: 1920, h: 1080 },
  '9:16': { aspectRatio: '9:16', w: 1080, h: 1920 },
}

ai.post('/generate-video', zValidator('json', GenerateVideoRequest), async (c) => {
  const { openrouter, apiKey } = requireOpenRouter(c)
  const { boardId, prompt, aspect, generateAudio, sourceImageId, resultShapeId, model } =
    c.req.valid('json')
  const selected =
    model?.trim() || process.env.OPENROUTER_VIDEO_MODEL || DEFAULTS.video

  try {
    let imageInput:
      | { type: 'binary'; data: Uint8Array; mediaType: string }
      | undefined
    if (sourceImageId) {
      const [src] = await db
        .select({
          bytes: schema.aiImages.bytes,
          mediaType: schema.aiImages.mediaType,
        })
        .from(schema.aiImages)
        .where(eq(schema.aiImages.id, sourceImageId))
        .limit(1)
      if (src) {
        const srcBuf = src.bytes as Buffer
        const bin = new Uint8Array(srcBuf.byteLength)
        bin.set(srcBuf)
        imageInput = { type: 'binary', data: bin, mediaType: src.mediaType }
      }
    }

    const dims = VIDEO_RES_FOR[aspect]

    const { videos, providerMetadata, warnings } = await generateVideo({
      model: openrouter.videoModel(selected, {
        generateAudio,
        pollIntervalMs: 3000,
        maxPollTimeMs: 600_000,
      }),
      prompt,
      aspectRatio: dims.aspectRatio,
      ...(imageInput ? { image: imageInput } : {}),
      // OpenRouter's `unsigned_urls` (e.g. /api/v1/videos/<id>/content) still
      // require the Bearer token; the AI SDK's default download() sends no
      // auth and gets a 401. Re-attach the header for openrouter.ai URLs.
      download: async ({ url, abortSignal }) => {
        const headers: Record<string, string> = {}
        if (url.hostname.endsWith('openrouter.ai')) {
          headers['Authorization'] = `Bearer ${apiKey}`
        }
        const res = await fetch(url, { headers, signal: abortSignal })
        if (!res.ok) {
          throw new Error(
            `video download failed: ${res.status} ${res.statusText}`,
          )
        }
        const buf = new Uint8Array(await res.arrayBuffer())
        const mediaType = res.headers.get('content-type') ?? undefined
        return { data: buf, mediaType }
      },
    })

    if (warnings.length > 0) console.warn('[ai] video warnings', warnings)
    const v = videos[0]
    if (!v) throw new Error('no_video_returned')

    const bytes = Buffer.from(v.uint8Array)
    const mediaType = v.mediaType || 'video/mp4'

    const id = nanoid(12)
    const meta = providerMetadata?.openrouter as { durationMs?: unknown } | undefined
    const durationMs =
      typeof meta?.durationMs === 'number' ? meta.durationMs : null

    await db.insert(schema.aiVideos).values({
      id,
      boardId,
      prompt,
      model: selected,
      width: dims.w,
      height: dims.h,
      durationMs,
      hasAudio: generateAudio,
      mediaType,
      bytes,
      resultShapeId: resultShapeId ?? null,
      sourceImageId: sourceImageId ?? null,
    })

    const body: GenerateVideoResponse = {
      videoId: id,
      url: `/api/videos/${id}`,
      width: dims.w,
      height: dims.h,
      durationMs,
      mediaType,
      hasAudio: generateAudio,
      prompt,
    }
    return c.json(body)
  } catch (err) {
    console.error('[ai] video generation failed', err)
    const message = err instanceof Error ? err.message : 'unknown'
    return c.json({ error: 'video_generation_failed', message }, 500)
  }
})

ai.post(
  '/generate-transcription',
  zValidator('json', GenerateTranscriptionRequest),
  async (c) => {
    const { openrouter } = requireOpenRouter(c)
    const { boardId, audioBase64, mediaType, durationMs, instruction, resultShapeId, model } =
      c.req.valid('json')
    const selected =
      model?.trim() || process.env.OPENROUTER_AUDIO_MODEL || DEFAULTS.audio

    let audioBuf: Buffer
    try {
      audioBuf = Buffer.from(audioBase64, 'base64')
      if (audioBuf.byteLength === 0) throw new Error('empty')
    } catch {
      return c.json({ error: 'bad_request', message: 'audioBase64 was empty or invalid' }, 400)
    }
    const audioBytes = new Uint8Array(audioBuf.byteLength)
    audioBytes.set(audioBuf)

    // Persist source audio up-front so `/api/audios/:id` can serve it during
    // streaming (the client gets the id back via response headers before the
    // model emits its first token) and so a failed transcription stays retryable.
    const id = nanoid(12)
    try {
      await db.insert(schema.aiTranscriptions).values({
        id,
        boardId,
        model: selected,
        mediaType,
        bytes: audioBuf,
        durationMs: durationMs ?? null,
        transcript: '',
        instruction: instruction ?? null,
        resultShapeId: resultShapeId ?? null,
      })
    } catch (err) {
      console.error('[ai] failed to persist transcription row', err)
      return c.json({ error: 'persist_failed', message: 'could not save audio' }, 500)
    }

    const trimmedInstruction = instruction?.trim()
    const systemLines = [
      'You are a precise transcription engine. Convert the user-supplied audio into plain text.',
      '- Preserve speaker phrasing; do not summarize or paraphrase unless the user explicitly asks.',
      '- Use sentence punctuation and natural paragraph breaks.',
      '- Output the transcript text only — no markdown headers, no commentary, no preface.',
    ]
    if (trimmedInstruction) {
      systemLines.push('', `Additional instruction from the user: ${trimmedInstruction}`)
    }
    const system = systemLines.join('\n')

    const result = streamText({
      model: openrouter.chat(selected),
      system,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'file', data: audioBytes, mediaType },
            { type: 'text', text: 'Transcribe the audio above.' },
          ],
        },
      ],
      onFinish: async ({ text }) => {
        try {
          await db
            .update(schema.aiTranscriptions)
            .set({ transcript: text })
            .where(eq(schema.aiTranscriptions.id, id))
        } catch (err) {
          console.error('[ai] failed to persist transcript text', err)
        }
      },
      onError: ({ error }) => {
        console.error('[ai] transcription stream error', error)
      },
    })

    const response = result.toTextStreamResponse()
    response.headers.set('x-audio-id', id)
    response.headers.set('x-audio-url', `/api/audios/${id}`)
    if (durationMs != null) response.headers.set('x-audio-duration-ms', String(durationMs))
    // The browser hides non-safelisted response headers from JS unless we
    // explicitly expose them via CORS. The wildcard `*` allowed-origin in
    // index.ts doesn't auto-expose custom headers — they need to be listed.
    response.headers.set(
      'access-control-expose-headers',
      'x-audio-id, x-audio-url, x-audio-duration-ms',
    )
    return response
  },
)

// Cap inline vision payload — Claude handles a few images fine but we don't
// want a runaway selection of 20 photos to balloon the request.
const MAX_CONTEXT_IMAGES = 4

type ImagePart = { type: 'image'; image: Uint8Array | URL; mediaType?: string }

async function resolveContextImages(
  shapes: { imageRef?: { imageId?: string; dataUrl?: string; mediaType?: string } }[],
): Promise<ImagePart[]> {
  const out: ImagePart[] = []
  for (const s of shapes) {
    if (out.length >= MAX_CONTEXT_IMAGES) break
    const ref = s.imageRef
    if (!ref) continue

    if (ref.imageId) {
      const [row] = await db
        .select({
          bytes: schema.aiImages.bytes,
          mediaType: schema.aiImages.mediaType,
        })
        .from(schema.aiImages)
        .where(eq(schema.aiImages.id, ref.imageId))
        .limit(1)
      if (!row) continue
      const buf = row.bytes as Buffer
      const bin = new Uint8Array(buf.byteLength)
      bin.set(buf)
      out.push({ type: 'image', image: bin, mediaType: row.mediaType })
      continue
    }

    if (ref.dataUrl) {
      if (ref.dataUrl.startsWith('data:')) {
        const m = ref.dataUrl.match(/^data:([^;]+);base64,(.+)$/)
        if (!m) continue
        const mediaType = m[1]!
        const buf = Buffer.from(m[2]!, 'base64')
        const bin = new Uint8Array(buf.byteLength)
        bin.set(buf)
        out.push({ type: 'image', image: bin, mediaType })
      } else {
        try {
          out.push({
            type: 'image',
            image: new URL(ref.dataUrl),
            ...(ref.mediaType ? { mediaType: ref.mediaType } : {}),
          })
        } catch {
          // Invalid URL — skip silently rather than failing the whole request.
        }
      }
    }
  }
  return out
}

function attachImagesToLastUser(
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  images: ImagePart[],
): ModelMessage[] {
  const out = messages.map((m) => ({ role: m.role, content: m.content })) as ModelMessage[]
  if (images.length === 0) return out
  for (let i = out.length - 1; i >= 0; i--) {
    if (out[i]!.role !== 'user') continue
    const text = messages[i]!.content
    out[i] = {
      role: 'user',
      content: [...images, { type: 'text', text }],
    }
    break
  }
  return out
}
