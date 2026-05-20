import { useCallback, useRef } from 'react'
import { type Editor, createShapeId, type TLShape, type TLShapeId } from 'tldraw'
import type { AiContextShape, ChatMessage, GenerateRequest } from '@openboard-ai/shared'
import { AI_CARD_TYPE, type AiCardShape } from '../shapes/AiCardShapeUtil'
import {
  AI_HTML_TYPE,
  type AiHtmlShape,
} from '../shapes/AiHtmlShapeUtil'
import { createCustomShape, updateCustomShape } from '../shapes/customShape'
import {
  createConnectingArrow,
  extractHtmlRef,
  extractImageRef,
  extractShapeText,
  pickAnchor,
} from './canvas'
import { clearApiKey, getOpenRouterKey } from '../../settings/useApiKey'
import {
  clearModelPreference,
  getModelPreference,
  looksLikeBadModelError,
} from '../../settings/useModelPreferences'

export type GenerateMode = GenerateRequest['mode']

const CARD_W = 340
const CARD_H = 240
const HTML_W = 600
const HTML_H = 400
const HTML_GAP = 32

interface GenerateOptions {
  prompt: string
  mode?: GenerateMode
  contextShapes?: TLShape[]
  /** Optional explicit anchor; otherwise we pick a sensible spot. */
  anchorAt?: { x: number; y: number }
  /** If true, drop arrows from each contextShape -> created card. */
  connectArrows?: boolean
}

export function useAiGenerate(boardId: string, editor: Editor | null) {
  const inFlight = useRef<Set<TLShapeId>>(new Set())

  const generate = useCallback(
    async ({
      prompt,
      mode = 'prompt',
      contextShapes = [],
      anchorAt,
      connectArrows = false,
    }: GenerateOptions) => {
      if (!editor) return
      const trimmed = prompt.trim()
      if (!trimmed) return

      const w = CARD_W
      const h = CARD_H

      const anchor = anchorAt ?? pickAnchor(editor, contextShapes, w)

      const cardId = createShapeId()
      const sourceIds = contextShapes.map((s) => s.id as string)

      editor.run(() => {
        createCustomShape<AiCardShape>(editor, {
          id: cardId,
          type: AI_CARD_TYPE,
          x: anchor.x,
          y: anchor.y,
          props: {
            w,
            h,
            prompt: trimmed,
            text: '',
            status: 'pending',
            sourceShapeIds: sourceIds,
          },
        })

        if (connectArrows) {
          for (const src of contextShapes) {
            createConnectingArrow(editor, src.id, cardId)
          }
        }
      })

      inFlight.current.add(cardId)

      const messages: ChatMessage[] = [{ role: 'user', content: trimmed }]
      const ctx: AiContextShape[] = contextShapes.map((s) => {
        const ref = extractImageRef(editor, s)
        const htmlRef = extractHtmlRef(s)
        return {
          id: s.id as string,
          type: s.type,
          text: extractShapeText(editor, s).slice(0, 4000),
          ...(ref ? { imageRef: ref } : {}),
          ...(htmlRef ? { htmlRef } : {}),
        }
      })

      // Track htmlId for each tool call so we can update the right shape when
      // the tool's output arrives.
      const toolCallShapes = new Map<string, TLShapeId>()

      try {
        const modelPref = getModelPreference('text')
        const res = await fetch('/api/ai/generate', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'X-OpenRouter-Key': getOpenRouterKey() ?? '',
          },
          body: JSON.stringify({
            boardId,
            messages,
            mode,
            context: ctx.length > 0 ? { shapes: ctx } : undefined,
            resultShapeId: cardId as string,
            ...(modelPref ? { model: modelPref } : {}),
          } satisfies GenerateRequest),
        })

        if (res.status === 401) {
          clearApiKey()
          throw new Error('OpenRouter API key required')
        }

        if (!res.ok || !res.body) {
          const body = await res.text().catch(() => '')
          throw new Error(`HTTP ${res.status}: ${body}`)
        }

        // The server now returns a UI Message Stream (SSE format,
        // `data: <json>\n\n`). Parse it ourselves rather than pulling
        // in another helper — we only need a handful of event types.
        let acc = ''
        for await (const chunk of iterateUIMessageChunks(res.body)) {
          if (chunk.type === 'text-delta' && typeof chunk.delta === 'string') {
            acc += chunk.delta
            editor.run(
              () => {
                updateCustomShape<AiCardShape>(editor, {
                  id: cardId,
                  type: AI_CARD_TYPE,
                  props: {
                    text: acc,
                    status: 'streaming',
                    h: Math.min(800, Math.max(h, estimateHeight(acc, w))),
                  },
                })
              },
              { history: 'ignore' },
            )
            continue
          }

          if (
            chunk.type === 'tool-input-available' &&
            chunk.toolName === 'create_html' &&
            chunk.toolCallId
          ) {
            const input = chunk.input as { title?: string; prompt?: string }
            const htmlShapeId = createShapeId()
            toolCallShapes.set(chunk.toolCallId, htmlShapeId)

            const cardBounds = editor.getShapePageBounds(cardId)
            const htmlAnchor = cardBounds
              ? { x: cardBounds.maxX + HTML_GAP, y: cardBounds.minY }
              : { x: anchor.x + w + HTML_GAP, y: anchor.y }

            editor.run(
              () => {
                createCustomShape<AiHtmlShape>(editor, {
                  id: htmlShapeId,
                  type: AI_HTML_TYPE,
                  x: htmlAnchor.x,
                  y: htmlAnchor.y,
                  props: {
                    w: HTML_W,
                    h: HTML_H,
                    title: (input.title ?? 'Generating…').slice(0, 120),
                    prompt: input.prompt ?? null,
                    source: 'ai',
                    status: 'generating',
                    htmlId: null,
                    errorMessage: null,
                  },
                })
                createConnectingArrow(editor, cardId as string, htmlShapeId)
              },
              { history: 'ignore' },
            )
            continue
          }

          if (chunk.type === 'tool-output-available' && chunk.toolCallId) {
            const htmlShapeId = toolCallShapes.get(chunk.toolCallId)
            if (!htmlShapeId) continue
            const output = chunk.output as
              | { ok: true; htmlId: string; title: string; url: string }
              | { ok: false; error: string }
              | undefined
            if (!output) continue

            editor.run(
              () => {
                if (output.ok) {
                  updateCustomShape<AiHtmlShape>(editor, {
                    id: htmlShapeId,
                    type: AI_HTML_TYPE,
                    props: {
                      status: 'done',
                      htmlId: output.htmlId,
                      title: output.title,
                    },
                  })
                } else {
                  updateCustomShape<AiHtmlShape>(editor, {
                    id: htmlShapeId,
                    type: AI_HTML_TYPE,
                    props: {
                      status: 'error',
                      errorMessage: output.error,
                    },
                  })
                }
              },
              { history: 'ignore' },
            )
            continue
          }

          if (chunk.type === 'tool-output-error' && chunk.toolCallId) {
            const htmlShapeId = toolCallShapes.get(chunk.toolCallId)
            if (!htmlShapeId) continue
            editor.run(
              () => {
                updateCustomShape<AiHtmlShape>(editor, {
                  id: htmlShapeId,
                  type: AI_HTML_TYPE,
                  props: {
                    status: 'error',
                    errorMessage: chunk.errorText ?? 'Tool failed',
                  },
                })
              },
              { history: 'ignore' },
            )
            continue
          }

          if (chunk.type === 'error') {
            throw new Error(chunk.errorText ?? 'Stream error')
          }
        }

        editor.run(
          () => {
            updateCustomShape<AiCardShape>(editor, {
              id: cardId,
              type: AI_CARD_TYPE,
              props: { text: acc, status: 'done' },
            })
          },
          { history: 'ignore' },
        )

        return { cardId, text: acc }
      } catch (err) {
        console.error('[ai] generate failed', err)
        const message = err instanceof Error ? err.message : ''
        if (getModelPreference('text') && looksLikeBadModelError(message)) {
          clearModelPreference('text')
        }
        editor.run(
          () => {
            updateCustomShape<AiCardShape>(editor, {
              id: cardId,
              type: AI_CARD_TYPE,
              props: { status: 'error' },
            })
          },
          { history: 'ignore' },
        )
        return undefined
      } finally {
        inFlight.current.delete(cardId)
      }
    },
    [boardId, editor],
  )

  return { generate }
}

type UIMessageChunk = {
  type: string
  delta?: string
  toolCallId?: string
  toolName?: string
  input?: unknown
  output?: unknown
  errorText?: string
  [key: string]: unknown
}

/**
 * Reads a Vercel AI SDK UI Message Stream (SSE: `data: <json>\n\n`) and
 * yields each parsed chunk. Resilient to multi-byte boundaries.
 */
async function* iterateUIMessageChunks(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<UIMessageChunk> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) {
      buf += decoder.decode()
    } else if (value) {
      buf += decoder.decode(value, { stream: true })
    } else {
      continue
    }
    // SSE frames are separated by a blank line ("\n\n"). Process complete frames.
    let idx: number
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const frame = buf.slice(0, idx)
      buf = buf.slice(idx + 2)
      const lines = frame.split('\n')
      for (const line of lines) {
        if (!line.startsWith('data:')) continue
        const payload = line.slice(5).trimStart()
        if (!payload || payload === '[DONE]') continue
        try {
          yield JSON.parse(payload) as UIMessageChunk
        } catch (err) {
          console.warn('[ai] bad UI message chunk', payload.slice(0, 80), err)
        }
      }
    }
    if (done) break
  }
}

function estimateHeight(text: string, width: number): number {
  // ~7px per char at 13px font in width budget (sans-serif rough estimate).
  const charsPerLine = Math.max(20, Math.floor((width - 32) / 7))
  const newlineLines = text.split('\n').length
  const wrappedLines = Math.ceil(text.length / charsPerLine)
  const lines = Math.max(newlineLines, wrappedLines)
  return 80 + lines * 18
}
