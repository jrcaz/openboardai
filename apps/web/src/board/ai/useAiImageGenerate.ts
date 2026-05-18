import { useCallback } from 'react'
import { type Editor, createShapeId, type TLShape, type TLShapeId } from 'tldraw'
import type { GenerateImageRequest, GenerateImageResponse, ImageAspect } from '@openboard-ai/shared'
import { AI_IMAGE_TYPE, type AiImageShape } from '../shapes/AiImageShapeUtil'
import { createConnectingArrow, pickAnchor } from './canvas'
import { clearApiKey, getOpenRouterKey } from '../../settings/useApiKey'

interface GenerateImageOptions {
  prompt: string
  aspect: ImageAspect
  contextShapes?: TLShape[]
  connectArrows?: boolean
  /** Reuse an existing shape (used by Retry). */
  reuseShapeId?: TLShapeId
}

const CANVAS_DIMS_FOR: Record<ImageAspect, { w: number; h: number }> = {
  '1:1': { w: 360, h: 360 },
  '16:9': { w: 480, h: 270 },
  '9:16': { w: 270, h: 480 },
}

export function useAiImageGenerate(boardId: string, editor: Editor | null) {
  return useCallback(
    async ({
      prompt,
      aspect,
      contextShapes = [],
      connectArrows = false,
      reuseShapeId,
    }: GenerateImageOptions) => {
      if (!editor) return
      const trimmed = prompt.trim()
      if (!trimmed) return

      const dims = CANVAS_DIMS_FOR[aspect]
      const shapeId = reuseShapeId ?? createShapeId()

      if (reuseShapeId) {
        // Reset existing shape (Retry flow): back to generating state.
        editor.run(() => {
          editor.updateShape<AiImageShape>({
            id: reuseShapeId,
            type: AI_IMAGE_TYPE,
            props: {
              prompt: trimmed,
              status: 'generating',
              imageId: null,
              mediaType: null,
              errorMessage: null,
            },
          })
        })
      } else {
        const anchor = pickAnchor(editor, contextShapes, dims.w)
        editor.run(() => {
          editor.createShape<AiImageShape>({
            id: shapeId,
            type: AI_IMAGE_TYPE,
            x: anchor.x,
            y: anchor.y,
            props: {
              w: dims.w,
              h: dims.h,
              prompt: trimmed,
              status: 'generating',
              imageId: null,
              mediaType: null,
              aspect,
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
        const res = await fetch('/api/ai/generate-image', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'X-OpenRouter-Key': getOpenRouterKey() ?? '',
          },
          body: JSON.stringify({
            boardId,
            prompt: trimmed,
            aspect,
            resultShapeId: shapeId as string,
          } satisfies GenerateImageRequest),
        })

        if (res.status === 401) {
          clearApiKey()
          throw new Error('OpenRouter API key required')
        }

        if (!res.ok) {
          const body = await res.text().catch(() => '')
          throw new Error(`HTTP ${res.status}${body ? `: ${body}` : ''}`)
        }

        const data = (await res.json()) as GenerateImageResponse

        editor.run(
          () => {
            editor.updateShape<AiImageShape>({
              id: shapeId,
              type: AI_IMAGE_TYPE,
              props: {
                status: 'done',
                imageId: data.imageId,
                mediaType: data.mediaType,
              },
            })
          },
          { history: 'ignore' },
        )

        return { shapeId, imageId: data.imageId }
      } catch (err) {
        console.error('[ai] image generate failed', err)
        const message = err instanceof Error ? err.message : 'Generation failed'
        editor.run(
          () => {
            editor.updateShape<AiImageShape>({
              id: shapeId,
              type: AI_IMAGE_TYPE,
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
