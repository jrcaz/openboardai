import { useCallback } from 'react'
import { type Editor, createShapeId, type TLShapeId } from 'tldraw'
import type { AudioMediaType, GenerateTranscriptionRequest } from '@openboard-ai/shared'
import {
  AI_TRANSCRIPTION_TYPE,
  type AiTranscriptionShape,
} from '../shapes/AiTranscriptionShapeUtil'
import { createCustomShape, updateCustomShape } from '../shapes/customShape'
import { pickAnchor } from './canvas'
import { clearApiKey, getOpenRouterKey } from '../../settings/useApiKey'
import {
  clearModelPreference,
  getModelPreference,
  looksLikeBadModelError,
} from '../../settings/useModelPreferences'

interface TranscribeOptions {
  audioBlob: Blob
  mediaType: AudioMediaType
  durationMs?: number
  instruction?: string
  anchorAt?: { x: number; y: number }
  /** Retry path: reuse an existing shape instead of creating a new one. */
  reuseShapeId?: TLShapeId
}

const CARD_W = 360
const CARD_H = 220

export function useAiAudioGenerate(boardId: string, editor: Editor | null) {
  return useCallback(
    async ({
      audioBlob,
      mediaType,
      durationMs,
      instruction,
      anchorAt,
      reuseShapeId,
    }: TranscribeOptions) => {
      if (!editor) return
      if (audioBlob.size === 0) return

      const shapeId = reuseShapeId ?? createShapeId()
      const startedAt = Date.now()

      if (reuseShapeId) {
        editor.run(() => {
          updateCustomShape<AiTranscriptionShape>(editor, {
            id: reuseShapeId,
            type: AI_TRANSCRIPTION_TYPE,
            props: {
              status: 'transcribing',
              transcript: '',
              mediaType,
              durationMs: durationMs ?? null,
              instruction: instruction ?? '',
              errorMessage: null,
              startedAt,
            },
          })
        })
      } else {
        const anchor = anchorAt ?? pickAnchor(editor, [], CARD_W)
        editor.run(() => {
          createCustomShape<AiTranscriptionShape>(editor, {
            id: shapeId,
            type: AI_TRANSCRIPTION_TYPE,
            x: anchor.x,
            y: anchor.y,
            props: {
              w: CARD_W,
              h: CARD_H,
              status: 'transcribing',
              audioId: null,
              mediaType,
              durationMs: durationMs ?? null,
              transcript: '',
              instruction: instruction ?? '',
              errorMessage: null,
              startedAt,
            },
          })
        })
      }

      try {
        const arrayBuf = await audioBlob.arrayBuffer()
        const audioBase64 = bytesToBase64(new Uint8Array(arrayBuf))
        const modelPref = getModelPreference('audio')

        const res = await fetch('/api/ai/generate-transcription', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'X-OpenRouter-Key': getOpenRouterKey() ?? '',
          },
          body: JSON.stringify({
            boardId,
            audioBase64,
            mediaType,
            ...(durationMs != null ? { durationMs } : {}),
            ...(instruction ? { instruction } : {}),
            resultShapeId: shapeId as string,
            ...(modelPref ? { model: modelPref } : {}),
          } satisfies GenerateTranscriptionRequest),
        })

        if (res.status === 401) {
          clearApiKey()
          throw new Error('OpenRouter API key required')
        }
        if (!res.ok || !res.body) {
          const body = await res.text().catch(() => '')
          throw new Error(`HTTP ${res.status}${body ? `: ${body}` : ''}`)
        }

        // Surface the audioId as soon as the headers land — this lets the
        // in-card audio player mount before the model emits its first token.
        const audioId = res.headers.get('x-audio-id')
        if (audioId) {
          editor.run(
            () => {
              updateCustomShape<AiTranscriptionShape>(editor, {
                id: shapeId,
                type: AI_TRANSCRIPTION_TYPE,
                props: { audioId },
              })
            },
            { history: 'ignore' },
          )
        }

        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
        let acc = ''
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          if (!value) continue
          acc += value
          editor.run(
            () => {
              updateCustomShape<AiTranscriptionShape>(editor, {
                id: shapeId,
                type: AI_TRANSCRIPTION_TYPE,
                props: { transcript: acc, status: 'transcribing' },
              })
            },
            { history: 'ignore' },
          )
        }

        editor.run(
          () => {
            updateCustomShape<AiTranscriptionShape>(editor, {
              id: shapeId,
              type: AI_TRANSCRIPTION_TYPE,
              props: { transcript: acc, status: 'done' },
            })
          },
          { history: 'ignore' },
        )

        return { shapeId, audioId, transcript: acc }
      } catch (err) {
        console.error('[ai] transcription failed', err)
        const message = err instanceof Error ? err.message : 'Transcription failed'
        if (getModelPreference('audio') && looksLikeBadModelError(message)) {
          clearModelPreference('audio')
        }
        editor.run(
          () => {
            updateCustomShape<AiTranscriptionShape>(editor, {
              id: shapeId,
              type: AI_TRANSCRIPTION_TYPE,
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

// Chunked base64 encode. `btoa(String.fromCharCode(...bytes))` blows the
// call stack on large arrays (Opus@32kbps for 1 min ≈ 240 KB → fine, but a
// 20-min recording can be ~5 MB and exceeds the spread-args limit).
function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, i + CHUNK)
    binary += String.fromCharCode.apply(null, Array.from(slice) as number[])
  }
  return btoa(binary)
}
