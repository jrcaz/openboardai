import { type Editor, type VecLike, createShapeId } from 'tldraw'
import { MARKDOWN_TYPE, type MarkdownShape } from '../shapes/MarkdownShapeUtil'
import { createCustomShape } from '../shapes/customShape'

const MAX_MD_BYTES = 1_000_000
const MD_W = 480
const MD_H = 360
const MD_EXT = /\.(md|markdown|mdown|mkd|mkdn|mdwn)$/i

export function isMarkdownFile(file: File): boolean {
  if (file.type === 'text/markdown' || file.type === 'text/x-markdown') return true
  // Most browsers/OSes report an empty type (or text/plain) for .md files, so
  // fall back to the extension.
  if (file.type === '' || file.type === 'text/plain') return MD_EXT.test(file.name)
  return false
}

interface ImportOptions {
  point?: VecLike
}

/**
 * Reads `file` as markdown text and creates a `markdown` shape on the canvas
 * with the source already populated. No server call — the text is stored inline
 * in the shape props and persisted with the board snapshot.
 */
export async function importMarkdownFile(
  editor: Editor,
  file: File,
  { point }: ImportOptions,
): Promise<void> {
  if (!isMarkdownFile(file)) {
    console.warn('[markdown-import] skipping non-markdown file', file.name, file.type)
    return
  }

  const title = file.name.replace(MD_EXT, '') || 'Untitled'

  if (file.size > MAX_MD_BYTES) {
    console.error('[markdown-import] file too large', file.name, file.size)
    const mb = (file.size / 1024 / 1024).toFixed(2)
    placeShape(
      editor,
      title,
      `# ${title}\n\n> File too large: ${mb} MB (max 1 MB). It was not imported.`,
      point,
    )
    return
  }

  // Reads as UTF-8; invalid byte sequences become U+FFFD rather than throwing.
  const raw = await file.text()
  placeShape(editor, title, raw, point)
}

function placeShape(
  editor: Editor,
  title: string,
  text: string,
  point: VecLike | undefined,
): void {
  const shapeId = createShapeId()
  const anchor = resolveAnchor(editor, point)
  editor.run(() => {
    createCustomShape<MarkdownShape>(editor, {
      id: shapeId,
      type: MARKDOWN_TYPE,
      x: anchor.x,
      y: anchor.y,
      props: { w: MD_W, h: MD_H, title, text },
    })
  })
  editor.select(shapeId)
}

function resolveAnchor(editor: Editor, point?: VecLike): VecLike {
  if (point) return { x: point.x - MD_W / 2, y: point.y - MD_H / 2 }
  const vp = editor.getViewportPageBounds()
  return { x: vp.midX - MD_W / 2, y: vp.midY - MD_H / 2 }
}
