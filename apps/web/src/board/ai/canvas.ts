import {
  type Editor,
  createShapeId,
  renderPlaintextFromRichText,
  type TLShape,
  type TLShapeId,
  type TLAssetId,
  type TLRichText,
} from 'tldraw'
import type { BoardShapeIndexEntry } from '@openboard-ai/shared'

// tldraw's `toRichText` helper lives in @tldraw/tlschema and is NOT re-exported
// by the top-level `tldraw` barrel (our only tldraw dependency), so we inline
// its (trivial) plain-text → TipTap-doc conversion here.
function plainTextToRichText(text: string): TLRichText {
  const content = text.split('\n').map((line) =>
    line
      ? { type: 'paragraph', content: [{ type: 'text', text: line }] }
      : { type: 'paragraph' },
  )
  return { type: 'doc', content } as TLRichText
}

export const CARD_GAP = 32

export function pickAnchor(editor: Editor, contextShapes: TLShape[], cardW: number) {
  if (contextShapes.length > 0) {
    const bounds =
      editor.getSelectionPageBounds() ?? editor.getShapePageBounds(contextShapes[0]!.id)
    if (bounds) {
      return { x: bounds.maxX + CARD_GAP, y: bounds.minY }
    }
  }
  const vp = editor.getViewportPageBounds()
  return { x: vp.midX - cardW / 2, y: vp.midY - 80 }
}

export function createConnectingArrow(editor: Editor, fromId: string, toId: TLShapeId) {
  const arrowId = createShapeId()
  const fromBounds = editor.getShapePageBounds(fromId as TLShapeId)
  const toBounds = editor.getShapePageBounds(toId)
  if (!fromBounds || !toBounds) return

  editor.createShape({
    id: arrowId,
    type: 'arrow',
    x: 0,
    y: 0,
    props: {
      start: { x: fromBounds.maxX, y: fromBounds.midY },
      end: { x: toBounds.minX, y: toBounds.midY },
    } as never,
  })

  editor.createBindings([
    {
      type: 'arrow',
      fromId: arrowId,
      toId: fromId as TLShapeId,
      props: {
        terminal: 'start',
        isPrecise: false,
        isExact: false,
        normalizedAnchor: { x: 0.5, y: 0.5 },
      },
    } as never,
    {
      type: 'arrow',
      fromId: arrowId,
      toId,
      props: {
        terminal: 'end',
        isPrecise: false,
        isExact: false,
        normalizedAnchor: { x: 0.5, y: 0.5 },
      },
    } as never,
  ])
}

export function extractShapeText(editor: Editor, shape: TLShape): string {
  const shapeType = shape.type as string
  // AI cards represent prior exchanges — include both sides so the model can
  // refer back to "what was asked" and "what was answered".
  if (shapeType === 'ai-card') {
    const props = shape.props as { prompt?: string; text?: string }
    const parts: string[] = []
    if (props.prompt) parts.push(`Prior user prompt: ${props.prompt}`)
    if (props.text) parts.push(`Prior AI response:\n${props.text}`)
    return parts.join('\n\n')
  }
  // AI images have no text content; surface the generation prompt instead.
  if (shapeType === 'ai-image') {
    const props = shape.props as { prompt?: string }
    return props.prompt
      ? `[AI-generated image — prompt: "${props.prompt}"]`
      : '[AI-generated image]'
  }
  // AI videos: same idea — text-mode follow-ups can reference the prompt.
  if (shapeType === 'ai-video') {
    const props = shape.props as { prompt?: string }
    return props.prompt
      ? `[AI-generated video — prompt: "${props.prompt}"]`
      : '[AI-generated video]'
  }
  // ai-html widgets render an embedded iframe; surface title + originating
  // prompt as the text caption. The full HTML source is attached separately
  // via `extractHtmlRef` so the server can inline it into the system prompt.
  if (shapeType === 'ai-html') {
    const props = shape.props as {
      title?: string
      prompt?: string | null
      source?: 'ai' | 'upload'
      status?: string
    }
    const label = props.source === 'upload' ? 'Uploaded HTML' : 'AI-generated HTML'
    const parts: string[] = [`[${label} widget — title: "${props.title ?? 'Untitled'}"]`]
    if (props.prompt) parts.push(`Originating prompt: ${props.prompt}`)
    if (props.status && props.status !== 'done') {
      parts.push(`(status: ${props.status} — no rendered content available yet)`)
    }
    return parts.join('\n')
  }
  const props = shape.props as Record<string, unknown>
  if (typeof props.text === 'string') return props.text
  // tldraw v4 stores `note`/`text`/`geo` label content as a TipTap rich-text
  // document, not a flat string — convert it to plain text via tldraw's helper.
  const richText = (props as { richText?: TLRichText }).richText
  if (richText) {
    try {
      return renderPlaintextFromRichText(editor, richText)
    } catch {
      return ''
    }
  }
  return ''
}

/**
 * If `shape` carries an image we can show to a vision-capable model, return
 * a ref the server can resolve to bytes. `ai-image` uses our DB id; tldraw's
 * native `image` shape uses its asset's `src` (data: URL or remote URL).
 */
export function extractImageRef(
  editor: Editor,
  shape: TLShape,
): { imageId?: string; dataUrl?: string; mediaType?: string } | undefined {
  const shapeType = shape.type as string
  if (shapeType === 'ai-image') {
    const props = shape.props as { imageId?: string | null; mediaType?: string | null }
    if (!props.imageId) return undefined
    return {
      imageId: props.imageId,
      ...(props.mediaType ? { mediaType: props.mediaType } : {}),
    }
  }
  if (shapeType === 'image') {
    const props = shape.props as { assetId?: TLAssetId | null }
    if (!props.assetId) return undefined
    const asset = editor.getAsset(props.assetId)
    if (!asset) return undefined
    const aprops = asset.props as { src?: string | null; mimeType?: string | null }
    if (!aprops.src) return undefined
    return {
      dataUrl: aprops.src,
      ...(aprops.mimeType ? { mediaType: aprops.mimeType } : {}),
    }
  }
  return undefined
}

/**
 * If `shape` is a finished ai-html widget, return a ref the server can resolve
 * to the stored HTML bytes (so the LLM can read what the widget renders).
 * Returns undefined while the widget is still generating or errored.
 */
export function extractHtmlRef(shape: TLShape): { htmlId: string } | undefined {
  if ((shape.type as string) !== 'ai-html') return undefined
  const props = shape.props as { htmlId?: string | null; status?: string }
  if (!props.htmlId || props.status !== 'done') return undefined
  return { htmlId: props.htmlId }
}

const BOARD_INDEX_MAX = 150
const BOARD_LABEL_MAX = 120

/**
 * Builds a lightweight index of every shape on the current page so the AI can
 * target ANY shape for annotation (not just the user's selection). Skips the
 * annotation primitives the agent itself draws (`arrow`, `highlight`) so it
 * can't annotate its own marks.
 */
export function buildBoardShapeIndex(editor: Editor): BoardShapeIndexEntry[] {
  const out: BoardShapeIndexEntry[] = []
  for (const id of editor.getCurrentPageShapeIds()) {
    if (out.length >= BOARD_INDEX_MAX) break
    const shape = editor.getShape(id)
    if (!shape) continue
    if (shape.type === 'arrow' || shape.type === 'highlight') continue
    const b = editor.getShapePageBounds(id)
    if (!b) continue
    const label = extractShapeText(editor, shape)
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, BOARD_LABEL_MAX)
    out.push({
      id: id as string,
      type: shape.type,
      bounds: { x: b.minX, y: b.minY, w: b.width, h: b.height },
      label,
    })
  }
  return out
}

export type AnnotationSpec = {
  kind: 'arrow' | 'box' | 'ellipse' | 'callout' | 'highlight'
  targetId: string
  label?: string
  color?: string
}

const ANNOTATION_PAD = 16
const CALLOUT_W = 200
const ARROW_OFFSET = 80

/**
 * Draws one annotation anchored to an EXISTING target shape using native tldraw
 * shapes. Returns the ids of shapes it created, or [] if the target id can't be
 * resolved (deleted / on another page). Must be called inside `editor.run(...)`.
 */
export function createAnnotation(editor: Editor, spec: AnnotationSpec): TLShapeId[] {
  const targetId = spec.targetId as TLShapeId
  const b = editor.getShapePageBounds(targetId)
  if (!b) return []
  const color = spec.color ?? 'red'

  if (spec.kind === 'box' || spec.kind === 'ellipse') {
    const id = createShapeId()
    editor.createShape({
      id,
      type: 'geo',
      x: b.minX - ANNOTATION_PAD,
      y: b.minY - ANNOTATION_PAD,
      props: {
        geo: spec.kind === 'box' ? 'rectangle' : 'ellipse',
        w: b.width + ANNOTATION_PAD * 2,
        h: b.height + ANNOTATION_PAD * 2,
        color,
        fill: 'none',
        dash: 'solid',
        size: 'm',
      } as never,
    })
    return [id]
  }

  if (spec.kind === 'callout') {
    const id = createShapeId()
    editor.createShape({
      id,
      type: 'text',
      x: b.maxX + ANNOTATION_PAD,
      y: b.minY,
      props: {
        richText: plainTextToRichText(spec.label ?? ''),
        color,
        w: CALLOUT_W,
        autoSize: false,
      } as never,
    })
    return [id]
  }

  if (spec.kind === 'highlight') {
    const id = createShapeId()
    editor.createShape({
      id,
      type: 'highlight',
      x: b.minX,
      y: b.midY,
      props: {
        // The highlight palette is limited; force a safe, visible value.
        color: 'yellow',
        size: 'xl',
        isComplete: true,
        segments: [
          {
            type: 'straight',
            points: [
              { x: 0, y: 0, z: 0.5 },
              { x: b.width, y: 0, z: 0.5 },
            ],
          },
        ],
      } as never,
    })
    return [id]
  }

  // arrow: END binds to the target; START is a free point up-and-left of it.
  const arrowId = createShapeId()
  editor.createShape({
    id: arrowId,
    type: 'arrow',
    x: 0,
    y: 0,
    props: {
      start: { x: b.minX - ARROW_OFFSET, y: b.minY - ARROW_OFFSET },
      end: { x: b.minX, y: b.minY },
      ...(spec.label ? { richText: plainTextToRichText(spec.label) } : {}),
      color,
    } as never,
  })
  editor.createBindings([
    {
      type: 'arrow',
      fromId: arrowId,
      toId: targetId,
      props: {
        terminal: 'end',
        isPrecise: false,
        isExact: false,
        normalizedAnchor: { x: 0.5, y: 0.5 },
      },
    } as never,
  ])
  return [arrowId]
}
