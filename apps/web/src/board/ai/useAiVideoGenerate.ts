import { useCallback } from 'react'
import { type Editor, createShapeId, type TLShape, type TLShapeId } from 'tldraw'
import type {
  GenerateVideoRequest,
  GenerateVideoResponse,
  SubAgent,
  VideoAspect,
} from '@openboard-ai/shared'
import { AI_VIDEO_TYPE, type AiVideoShape } from '../shapes/AiVideoShapeUtil'
import { createCustomShape, updateCustomShape } from '../shapes/customShape'
import { createConnectingArrow, pickAnchor } from './canvas'
import { clearApiKey, getOpenRouterKey } from '../../settings/useApiKey'
import {
  clearModelPreference,
  getModelPreference,
  looksLikeBadModelError,
} from '../../settings/useModelPreferences'

interface GenerateVideoOptions {
  prompt: string
  aspect: VideoAspect
  generateAudio: boolean
  /** When set, uses this aiImages.id as first frame (image-to-video). */
  sourceImageId?: string
  contextShapes?: TLShape[]
  connectArrows?: boolean
  /** Reuse an existing shape (used by Retry). */
  reuseShapeId?: TLShapeId
  /** Custom sub-agent — prepends `systemPrompt` to the user prompt and overrides model. */
  agent?: SubAgent | null
}

const CANVAS_DIMS_FOR: Record<VideoAspect, { w: number; h: number }> = {
  '16:9': { w: 480, h: 270 },
  '9:16': { w: 270, h: 480 },
}

export function useAiVideoGenerate(boardId: string, editor: Editor | null) {
  return useCallback(
    async ({
      prompt,
      aspect,
      generateAudio,
      sourceImageId,
      contextShapes = [],
      connectArrows = false,
      reuseShapeId,
      agent = null,
    }: GenerateVideoOptions) => {
      if (!editor) return
      const userPrompt = prompt.trim()
      if (!userPrompt) return

      // Video endpoints have no system message, so the agent's system prompt
      // is folded into the prompt itself as a template prefix for the API call.
      const apiPrompt = agent?.systemPrompt?.trim()
        ? `${agent.systemPrompt.trim()}\n\n${userPrompt}`
        : userPrompt

      const dims = CANVAS_DIMS_FOR[aspect]
      const shapeId = reuseShapeId ?? createShapeId()
      const startedAt = Date.now()

      if (reuseShapeId) {
        editor.run(() => {
          updateCustomShape<AiVideoShape>(editor, {
            id: reuseShapeId,
            type: AI_VIDEO_TYPE,
            props: {
              prompt: userPrompt,
              status: 'generating',
              videoId: null,
              mediaType: null,
              hasAudio: generateAudio,
              sourceImageId: sourceImageId ?? null,
              errorMessage: null,
              startedAt,
            },
          })
        })
      } else {
        const anchor = pickAnchor(editor, contextShapes, dims.w)
        editor.run(() => {
          createCustomShape<AiVideoShape>(editor, {
            id: shapeId,
            type: AI_VIDEO_TYPE,
            x: anchor.x,
            y: anchor.y,
            props: {
              w: dims.w,
              h: dims.h,
              prompt: userPrompt,
              status: 'generating',
              videoId: null,
              mediaType: null,
              aspect,
              hasAudio: generateAudio,
              sourceImageId: sourceImageId ?? null,
              errorMessage: null,
              startedAt,
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
        const modelPref = getModelPreference('video')
        const resolvedModel = agent?.model?.trim() || modelPref
        const res = await fetch('/api/ai/generate-video', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'X-OpenRouter-Key': getOpenRouterKey() ?? '',
          },
          body: JSON.stringify({
            boardId,
            prompt: apiPrompt,
            aspect,
            generateAudio,
            ...(sourceImageId ? { sourceImageId } : {}),
            resultShapeId: shapeId as string,
            ...(resolvedModel ? { model: resolvedModel } : {}),
          } satisfies GenerateVideoRequest),
        })

        if (res.status === 401) {
          clearApiKey()
          throw new Error('OpenRouter API key required')
        }

        if (!res.ok) {
          const body = await res.text().catch(() => '')
          throw new Error(`HTTP ${res.status}${body ? `: ${body}` : ''}`)
        }

        const data = (await res.json()) as GenerateVideoResponse

        editor.run(
          () => {
            updateCustomShape<AiVideoShape>(editor, {
              id: shapeId,
              type: AI_VIDEO_TYPE,
              props: {
                status: 'done',
                videoId: data.videoId,
                mediaType: data.mediaType,
                hasAudio: data.hasAudio,
              },
            })
          },
          { history: 'ignore' },
        )

        return { shapeId, videoId: data.videoId }
      } catch (err) {
        console.error('[ai] video generate failed', err)
        const message = err instanceof Error ? err.message : 'Generation failed'
        if (getModelPreference('video') && looksLikeBadModelError(message)) {
          clearModelPreference('video')
        }
        editor.run(
          () => {
            updateCustomShape<AiVideoShape>(editor, {
              id: shapeId,
              type: AI_VIDEO_TYPE,
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
