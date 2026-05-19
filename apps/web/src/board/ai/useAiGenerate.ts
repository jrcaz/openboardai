import { useCallback, useRef } from 'react'
import { type Editor, createShapeId, type TLShape, type TLShapeId } from 'tldraw'
import type {
  AiContextShape,
  ChatMessage,
  GenerateRequest,
  SubAgent,
} from '@openboard-ai/shared'
import { AI_CARD_TYPE, type AiCardShape } from '../shapes/AiCardShapeUtil'
import { createCustomShape, updateCustomShape } from '../shapes/customShape'
import { createConnectingArrow, extractImageRef, extractShapeText, pickAnchor } from './canvas'
import { clearApiKey, getOpenRouterKey } from '../../settings/useApiKey'
import {
  clearModelPreference,
  getModelPreference,
  looksLikeBadModelError,
} from '../../settings/useModelPreferences'

export type GenerateMode = GenerateRequest['mode']

const CARD_W = 340
const CARD_H = 240

interface GenerateOptions {
  prompt: string
  mode?: GenerateMode
  contextShapes?: TLShape[]
  /** Optional explicit anchor; otherwise we pick a sensible spot. */
  anchorAt?: { x: number; y: number }
  /** Override card size (used for "expand" small cards). */
  size?: { w: number; h: number }
  /** If true, drop arrows from each contextShape -> created card. */
  connectArrows?: boolean
  /** Custom sub-agent to apply: overrides model + adds system prompt + sampling. */
  agent?: SubAgent | null
}

export function useAiGenerate(boardId: string, editor: Editor | null) {
  const inFlight = useRef<Set<TLShapeId>>(new Set())

  const generate = useCallback(
    async ({
      prompt,
      mode = 'prompt',
      contextShapes = [],
      anchorAt,
      size,
      connectArrows = false,
      agent = null,
    }: GenerateOptions) => {
      if (!editor) return
      const trimmed = prompt.trim()
      if (!trimmed) return

      const w = size?.w ?? CARD_W
      const h = size?.h ?? CARD_H

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
        return {
          id: s.id as string,
          type: s.type,
          text: extractShapeText(editor, s).slice(0, 4000),
          ...(ref ? { imageRef: ref } : {}),
        }
      })

      try {
        const modelPref = getModelPreference('text')
        const resolvedModel = agent?.model?.trim() || modelPref
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
            ...(resolvedModel ? { model: resolvedModel } : {}),
            ...(agent?.systemPrompt ? { agentSystemPrompt: agent.systemPrompt } : {}),
            ...(typeof agent?.temperature === 'number' ? { temperature: agent.temperature } : {}),
            ...(typeof agent?.maxTokens === 'number' ? { maxTokens: agent.maxTokens } : {}),
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

        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
        let acc = ''
        let firstChunk = true

        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          if (!value) continue
          acc += value

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

          if (firstChunk) firstChunk = false
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

function estimateHeight(text: string, width: number): number {
  // ~7px per char at 13px font in width budget (sans-serif rough estimate).
  const charsPerLine = Math.max(20, Math.floor((width - 32) / 7))
  const newlineLines = text.split('\n').length
  const wrappedLines = Math.ceil(text.length / charsPerLine)
  const lines = Math.max(newlineLines, wrappedLines)
  return 80 + lines * 18
}
