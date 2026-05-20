import {
  type Editor,
  createShapeId,
  renderPlaintextFromRichText,
  type TLShape,
  type TLShapeId,
  type TLAssetId,
  type TLRichText,
} from 'tldraw'

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
