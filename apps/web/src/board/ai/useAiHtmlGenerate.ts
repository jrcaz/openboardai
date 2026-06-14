import { useCallback } from 'react'
import { type Editor, createShapeId, type TLShape, type TLShapeId } from 'tldraw'
import type { GenerateHtmlRequest, GenerateHtmlResponse } from '@openboard-ai/shared'
import { AI_HTML_TYPE, type AiHtmlShape } from '../shapes/AiHtmlShapeUtil'
import { createCustomShape, updateCustomShape } from '../shapes/customShape'
import { createConnectingArrow, pickAnchor } from './canvas'
import { clearApiKey, getOpenRouterKey } from '../../settings/useApiKey'
import {
  clearModelPreference,
  getModelPreference,
  looksLikeBadModelError,
} from '../../settings/useModelPreferences'

interface GenerateHtmlOptions {
  prompt: string
  title?: string
  contextShapes?: TLShape[]
  connectArrows?: boolean
  /** Reuse an existing shape (used by Retry). */
  reuseShapeId?: TLShapeId
  /** Overwrite an existing stored HTML asset instead of creating a new one. */
  editHtmlId?: string
}

const HTML_W = 600
const HTML_H = 400

export function useAiHtmlGenerate(boardId: string, editor: Editor | null) {
  return useCallback(
    async ({
      prompt,
      title,
      contextShapes = [],
      connectArrows = false,
      reuseShapeId,
      editHtmlId,
    }: GenerateHtmlOptions) => {
      if (!editor) return
      const trimmed = prompt.trim()
      if (!trimmed) return

      const shapeId = reuseShapeId ?? createShapeId()
      const existingShape = reuseShapeId
        ? (editor.getShape(reuseShapeId) as AiHtmlShape | undefined)
        : undefined
      const resolvedTitle =
        (title ?? existingShape?.props.title ?? trimmed).slice(0, 120) || 'Untitled'

      if (reuseShapeId) {
        editor.run(() => {
          updateCustomShape<AiHtmlShape>(editor, {
            id: reuseShapeId,
            type: AI_HTML_TYPE,
            props: {
              prompt: trimmed,
              title: resolvedTitle,
              status: 'generating',
              htmlId: editHtmlId ?? null,
              errorMessage: null,
            },
          })
        })
      } else {
        const anchor = pickAnchor(editor, contextShapes, HTML_W)
        editor.run(() => {
          createCustomShape<AiHtmlShape>(editor, {
            id: shapeId,
            type: AI_HTML_TYPE,
            x: anchor.x,
            y: anchor.y,
            props: {
              w: HTML_W,
              h: HTML_H,
              title: resolvedTitle,
              prompt: trimmed,
              source: 'ai',
              status: 'generating',
              htmlId: null,
              errorMessage: null,
            },
          })
          if (connectArrows) {
            for (const src of contextShapes) {
              createConnectingArrow(editor, src.id, shapeId)
            }
          }
        })
      }

      try {
        const modelPref = getModelPreference('text')
        const res = await fetch('/api/ai/generate-html', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'X-OpenRouter-Key': getOpenRouterKey() ?? '',
          },
          body: JSON.stringify({
            boardId,
            prompt: trimmed,
            title: resolvedTitle,
            ...(editHtmlId ? { editHtmlId } : {}),
            resultShapeId: shapeId as string,
            ...(modelPref ? { model: modelPref } : {}),
          } satisfies GenerateHtmlRequest),
        })

        if (res.status === 401) {
          clearApiKey()
          throw new Error('OpenRouter API key required')
        }

        if (!res.ok) {
          const body = await res.text().catch(() => '')
          throw new Error(`HTTP ${res.status}${body ? `: ${body}` : ''}`)
        }

        const data = (await res.json()) as GenerateHtmlResponse

        editor.run(
          () => {
            updateCustomShape<AiHtmlShape>(editor, {
              id: shapeId,
              type: AI_HTML_TYPE,
              props: {
                status: 'done',
                htmlId: data.htmlId,
                title: data.title,
              },
            })
          },
          { history: 'ignore' },
        )

        return { shapeId, htmlId: data.htmlId }
      } catch (err) {
        console.error('[ai] html generate failed', err)
        const message = err instanceof Error ? err.message : 'Generation failed'
        if (getModelPreference('text') && looksLikeBadModelError(message)) {
          clearModelPreference('text')
        }
        editor.run(
          () => {
            updateCustomShape<AiHtmlShape>(editor, {
              id: shapeId,
              type: AI_HTML_TYPE,
              props: { status: 'error', errorMessage: message },
            })
          },
          { history: 'ignore' },
        )
        return undefined
      }
    },
    [boardId, editor],
  )
}
