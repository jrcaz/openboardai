import { NoImageGeneratedError, generateImage } from 'ai'
import { nanoid } from 'nanoid'
import { db, schema } from '../db/client.js'
import { DEFAULTS } from './openrouter.js'
import type { ImageAspect } from '@openboard-ai/shared'

// Recorded canvas dimensions per aspect. OpenRouter's image SDK only honors
// `aspectRatio` (not size); these are nominal sizes used for layout/display.
const DIMS_FOR: Record<ImageAspect, { w: number; h: number }> = {
  '1:1': { w: 1024, h: 1024 },
  '16:9': { w: 1536, h: 864 },
  '9:16': { w: 864, h: 1536 },
}

export interface PersistedImage {
  imageId: string
  width: number
  height: number
  mediaType: string
  aspect: ImageAspect
  prompt: string
  model: string
}

export async function generateAndPersistImage({
  openrouter,
  openRouterKey,
  boardId,
  prompt,
  aspect = '1:1',
  model,
  resultShapeId,
}: {
  openrouter: ReturnType<typeof import('@openrouter/ai-sdk-provider').createOpenRouter>
  openRouterKey: string
  boardId: string
  prompt: string
  aspect?: ImageAspect
  model?: string
  resultShapeId?: string | null
}): Promise<PersistedImage> {
  const selected = model?.trim() || process.env.OPENROUTER_IMAGE_MODEL || DEFAULTS.image
  const dims = DIMS_FOR[aspect]

  const image = await generateOpenRouterImage({
    openrouter,
    openRouterKey,
    model: selected,
    prompt,
    aspect,
  })

  const id = nanoid(12)
  const mediaType = image.mediaType ?? 'image/png'
  const bytes = Buffer.from(image.bytes)

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

  return {
    imageId: id,
    width: dims.w,
    height: dims.h,
    mediaType,
    aspect,
    prompt,
    model: selected,
  }
}

async function generateOpenRouterImage({
  openrouter,
  openRouterKey,
  model,
  prompt,
  aspect,
}: {
  openrouter: ReturnType<typeof import('@openrouter/ai-sdk-provider').createOpenRouter>
  openRouterKey: string
  model: string
  prompt: string
  aspect: ImageAspect
}): Promise<{ bytes: Uint8Array; mediaType: string }> {
  try {
    const { image } = await generateImage({
      model: openrouter.imageModel(model),
      prompt,
      aspectRatio: aspect,
    })
    return {
      bytes: image.uint8Array,
      mediaType: image.mediaType ?? 'image/png',
    }
  } catch (err) {
    if (!NoImageGeneratedError.isInstance(err)) throw err
    return generateOpenRouterImageOnly({
      apiKey: openRouterKey,
      model,
      prompt,
      aspect,
    })
  }
}

async function generateOpenRouterImageOnly({
  apiKey,
  model,
  prompt,
  aspect,
}: {
  apiKey: string
  model: string
  prompt: string
  aspect: ImageAspect
}): Promise<{ bytes: Uint8Array; mediaType: string }> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
      'http-referer': process.env.OPENROUTER_APP_URL ?? 'http://localhost:5173',
      'x-title': process.env.OPENROUTER_APP_NAME ?? 'openboard-ai',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      modalities: ['image'],
      image_config: { aspect_ratio: aspect },
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`OpenRouter image generation failed (${res.status})${body ? `: ${body}` : ''}`)
  }

  const data = (await res.json().catch(() => null)) as OpenRouterImageOnlyResponse | null
  const imageUrl = data?.choices?.[0]?.message?.images?.[0]?.image_url?.url
  if (!imageUrl) {
    throw new Error(
      `${model} did not return image data. Try a different image model or a more specific prompt.`,
    )
  }

  return decodeOpenRouterImageUrl(imageUrl, apiKey)
}

interface OpenRouterImageOnlyResponse {
  choices?: Array<{
    message?: {
      images?: Array<{
        image_url?: {
          url?: string
        }
      }>
    }
  }>
}

async function decodeOpenRouterImageUrl(
  imageUrl: string,
  apiKey: string,
): Promise<{ bytes: Uint8Array; mediaType: string }> {
  const dataUrl = imageUrl.match(/^data:([^;]+);base64,(.+)$/)
  if (dataUrl) {
    return {
      mediaType: dataUrl[1]!,
      bytes: Buffer.from(dataUrl[2]!, 'base64'),
    }
  }

  if (!/^https?:\/\//i.test(imageUrl)) {
    return {
      mediaType: 'image/png',
      bytes: Buffer.from(imageUrl, 'base64'),
    }
  }

  const res = await fetch(imageUrl, {
    headers: imageUrl.includes('openrouter.ai') ? { authorization: `Bearer ${apiKey}` } : undefined,
  })
  if (!res.ok) {
    throw new Error(`OpenRouter returned an image URL that could not be fetched (${res.status}).`)
  }
  const bytes = new Uint8Array(await res.arrayBuffer())
  return {
    bytes,
    mediaType: res.headers.get('content-type') ?? 'image/png',
  }
}
