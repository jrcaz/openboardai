import { type Editor, type VecLike, createShapeId } from 'tldraw'
import type { UploadHtmlRequest, UploadHtmlResponse } from '@openboard-ai/shared'
import { AI_HTML_TYPE, type AiHtmlShape } from '../shapes/AiHtmlShapeUtil'
import { createCustomShape, updateCustomShape } from '../shapes/customShape'
import { hashBoardId, track } from '../../analytics/posthog'
import { bucketByteSize, categorizeError } from '../../analytics/events'

const MAX_HTML_UPLOAD_BYTES = 2_000_000
const HTML_W = 600
const HTML_H = 400

export function isHtmlFile(file: File): boolean {
  if (file.type === 'text/html') return true
  if (file.type === 'application/xhtml+xml') return true
  return /\.x?html?$/i.test(file.name)
}

interface ImportOptions {
  boardId: string
  point?: VecLike
}

/**
 * Reads `file` as HTML text, POSTs it for sanitization + storage, and creates
 * an ai-html shape on the canvas. Surfaces errors as an error-state shape
 * rather than throwing — keeps drag-drop UX forgiving.
 */
export async function importHtmlFile(
  editor: Editor,
  file: File,
  { boardId, point }: ImportOptions,
): Promise<void> {
  if (!isHtmlFile(file)) {
    console.warn('[html-import] skipping non-html file', file.name, file.type)
    return
  }
  if (file.size > MAX_HTML_UPLOAD_BYTES) {
    console.error('[html-import] file too large', file.name, file.size)
    track('ai_html_imported', {
      board_id_hash: hashBoardId(boardId),
      byte_size_bucket: bucketByteSize(file.size),
      status: 'error',
      error_category: 'bad_request',
    })
    // Drop a small error shape so the user sees something happened.
    placeErrorShape(
      editor,
      `File too large: ${(file.size / 1024 / 1024).toFixed(2)} MB (max 2 MB)`,
      file.name,
      point,
    )
    return
  }

  const html = await file.text()
  const title = file.name.replace(/\.x?html?$/i, '') || 'Imported HTML'

  // Place the shape in 'generating' state immediately so the user sees feedback.
  const shapeId = createShapeId()
  const anchor = resolveAnchor(editor, point)
  editor.run(() => {
    createCustomShape<AiHtmlShape>(editor, {
      id: shapeId,
      type: AI_HTML_TYPE,
      x: anchor.x,
      y: anchor.y,
      props: {
        w: HTML_W,
        h: HTML_H,
        title,
        prompt: null,
        source: 'upload',
        status: 'generating',
        htmlId: null,
        errorMessage: null,
      },
    })
  })

  try {
    const res = await fetch('/api/ai/upload-html', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        boardId,
        title,
        html,
      } satisfies UploadHtmlRequest),
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`HTTP ${res.status}${body ? `: ${body}` : ''}`)
    }

    const data = (await res.json()) as UploadHtmlResponse

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
    track('ai_html_imported', {
      board_id_hash: hashBoardId(boardId),
      byte_size_bucket: bucketByteSize(file.size),
      status: 'success',
    })
  } catch (err) {
    console.error('[html-import] upload failed', err)
    const message = err instanceof Error ? err.message : 'Upload failed'
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
    track('ai_html_imported', {
      board_id_hash: hashBoardId(boardId),
      byte_size_bucket: bucketByteSize(file.size),
      status: 'error',
      error_category: categorizeError(message),
    })
  }
}

function resolveAnchor(editor: Editor, point?: VecLike): VecLike {
  if (point) return { x: point.x - HTML_W / 2, y: point.y - HTML_H / 2 }
  const vp = editor.getViewportPageBounds()
  return { x: vp.midX - HTML_W / 2, y: vp.midY - HTML_H / 2 }
}

function placeErrorShape(
  editor: Editor,
  message: string,
  title: string,
  point: VecLike | undefined,
) {
  const shapeId = createShapeId()
  const anchor = resolveAnchor(editor, point)
  editor.run(() => {
    createCustomShape<AiHtmlShape>(editor, {
      id: shapeId,
      type: AI_HTML_TYPE,
      x: anchor.x,
      y: anchor.y,
      props: {
        w: HTML_W,
        h: HTML_H,
        title,
        prompt: null,
        source: 'upload',
        status: 'error',
        htmlId: null,
        errorMessage: message,
      },
    })
  })
}
