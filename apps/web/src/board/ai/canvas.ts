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
import { sheetToText } from '../shapes/spreadsheet/formula'

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
  // Spreadsheets carry their data in props; serialize computed values to a
  // compact tab-separated grid the model can read.
  if (shapeType === 'spreadsheet') {
    const props = shape.props as {
      title?: string
      cells?: Record<string, string>
      rows?: number
      cols?: number
    }
    const label = `[Spreadsheet — title: "${props.title ?? 'Spreadsheet'}"]`
    const grid = sheetToText(props.cells ?? {}, props.rows ?? 0, props.cols ?? 0)
    return `${label}\n${grid}`
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

export type MoveShapeSpec = {
  targetId: string
  x: number
  y: number
}

export type MoveLayoutHint = 'free' | 'vertical' | 'horizontal'

export function moveShapes(
  editor: Editor,
  moves: MoveShapeSpec[],
  allowedIds: ReadonlySet<string>,
  ignoredIds: ReadonlySet<string> = new Set(),
  layoutHint: MoveLayoutHint = 'free',
): string[] {
  const currentPageIds = editor.getCurrentPageShapeIds()
  const moveIds = new Set(
    moves.map((m) => m?.targetId).filter((id): id is string => typeof id === 'string'),
  )
  const occupied = buildOccupiedRects(editor, currentPageIds, moveIds, ignoredIds)
  const safeViewport = getSafeViewportRect(editor)
  const plans = collectMovePlans(editor, moves, allowedIds, currentPageIds)
  const layout = layoutHint === 'free' ? inferMoveLayout(plans) : layoutHint

  if (layout === 'vertical' || layout === 'horizontal') {
    return applyAlignedMoves(editor, plans, layout, occupied, safeViewport)
  }

  const moved: string[] = []
  for (const plan of plans) {
    const { desired, id, shape } = plan
    const resolved = findNearestOpenRect(desired, occupied, safeViewport)

    ;(editor.updateShape as (shape: unknown) => void).call(editor, {
      id,
      type: shape.type,
      x: resolved.x,
      y: resolved.y,
    })
    occupied.push(resolved)
    moved.push(id as string)
  }

  return moved
}

type PageRect = { x: number; y: number; w: number; h: number }
type MovePlan = { id: TLShapeId; shape: TLShape; desired: PageRect }

const MOVE_COLLISION_PAD = 24
const MOVE_COLLISION_SCAN_RADIUS = 10
const MOVE_VIEWPORT_MARGIN_PX = 32
const MOVE_TOP_CHROME_PX = 72
const MOVE_BOTTOM_CHROME_PX = 220

function collectMovePlans(
  editor: Editor,
  moves: MoveShapeSpec[],
  allowedIds: ReadonlySet<string>,
  currentPageIds: ReadonlySet<TLShapeId>,
): MovePlan[] {
  const out: MovePlan[] = []
  for (const move of moves) {
    if (!move || typeof move.targetId !== 'string') continue
    if (!allowedIds.has(move.targetId)) continue
    if (!Number.isFinite(move.x) || !Number.isFinite(move.y)) continue

    const id = move.targetId as TLShapeId
    if (!currentPageIds.has(id)) continue
    const shape = editor.getShape(id)
    if (!shape || shape.isLocked) continue
    const bounds = editor.getShapePageBounds(id)
    if (!bounds) continue

    out.push({
      id,
      shape,
      desired: { x: move.x, y: move.y, w: bounds.width, h: bounds.height },
    })
  }
  return out
}

function inferMoveLayout(plans: MovePlan[]): MoveLayoutHint {
  if (plans.length < 2) return 'free'
  const xs = plans.map((p) => p.desired.x)
  const ys = plans.map((p) => p.desired.y)
  const spreadX = Math.max(...xs) - Math.min(...xs)
  const spreadY = Math.max(...ys) - Math.min(...ys)
  const avgW = plans.reduce((sum, p) => sum + p.desired.w, 0) / plans.length
  const avgH = plans.reduce((sum, p) => sum + p.desired.h, 0) / plans.length

  if (spreadY > avgH * 0.4 && spreadX <= avgW * 0.75) return 'vertical'
  if (spreadX > avgW * 0.4 && spreadY <= avgH * 0.75) return 'horizontal'
  if (spreadY > spreadX * 1.4) return 'vertical'
  if (spreadX > spreadY * 1.4) return 'horizontal'
  return 'free'
}

function applyAlignedMoves(
  editor: Editor,
  plans: MovePlan[],
  layout: Exclude<MoveLayoutHint, 'free'>,
  occupied: PageRect[],
  safeViewport: PageRect | null,
): string[] {
  const moved: string[] = []
  const vertical = layout === 'vertical'
  const sorted = [...plans].sort((a, b) =>
    vertical ? a.desired.y - b.desired.y : a.desired.x - b.desired.x,
  )
  if (sorted.length === 0) return moved

  const crossValues = sorted.map((p) => (vertical ? p.desired.x : p.desired.y))
  let cross = median(crossValues)
  let cursor = Math.min(...sorted.map((p) => (vertical ? p.desired.y : p.desired.x)))
  const maxCrossSize = Math.max(...sorted.map((p) => (vertical ? p.desired.w : p.desired.h)))
  const totalPrimarySize =
    sorted.reduce((sum, p) => sum + (vertical ? p.desired.h : p.desired.w), 0) +
    MOVE_COLLISION_PAD * (sorted.length - 1)

  if (safeViewport) {
    if (vertical) {
      if (maxCrossSize <= safeViewport.w) {
        cross = clamp(cross, safeViewport.x, safeViewport.x + safeViewport.w - maxCrossSize)
      }
      if (totalPrimarySize <= safeViewport.h) {
        cursor = clamp(cursor, safeViewport.y, safeViewport.y + safeViewport.h - totalPrimarySize)
      } else if (cursor > safeViewport.y) {
        cursor = safeViewport.y
      }
    } else {
      if (maxCrossSize <= safeViewport.h) {
        cross = clamp(cross, safeViewport.y, safeViewport.y + safeViewport.h - maxCrossSize)
      }
      if (totalPrimarySize <= safeViewport.w) {
        cursor = clamp(cursor, safeViewport.x, safeViewport.x + safeViewport.w - totalPrimarySize)
      } else if (cursor > safeViewport.x) {
        cursor = safeViewport.x
      }
    }
  }

  for (const plan of sorted) {
    const aligned = vertical
      ? { ...plan.desired, x: cross, y: cursor }
      : { ...plan.desired, x: cursor, y: cross }
    const resolved = findOpenOnAxis(aligned, occupied, layout, safeViewport)

    ;(editor.updateShape as (shape: unknown) => void).call(editor, {
      id: plan.id,
      type: plan.shape.type,
      x: resolved.x,
      y: resolved.y,
    })
    occupied.push(resolved)
    moved.push(plan.id as string)
    cursor =
      (vertical ? resolved.y + resolved.h : resolved.x + resolved.w) + MOVE_COLLISION_PAD
  }

  return moved
}

function buildOccupiedRects(
  editor: Editor,
  pageShapeIds: ReadonlySet<TLShapeId>,
  moveIds: ReadonlySet<string>,
  ignoredIds: ReadonlySet<string>,
): PageRect[] {
  const out: PageRect[] = []
  for (const id of pageShapeIds) {
    const sid = id as string
    if (moveIds.has(sid) || ignoredIds.has(sid)) continue
    const shape = editor.getShape(id)
    if (!shape || shape.type === 'arrow' || shape.type === 'highlight') continue
    const b = editor.getShapePageBounds(id)
    if (!b) continue
    out.push({ x: b.minX, y: b.minY, w: b.width, h: b.height })
  }
  return out
}

function getSafeViewportRect(editor: Editor): PageRect | null {
  const vp = editor.getViewportPageBounds()
  const zoom = Math.max(0.05, editor.getZoomLevel())
  const margin = MOVE_VIEWPORT_MARGIN_PX / zoom
  const top = MOVE_TOP_CHROME_PX / zoom
  const bottom = MOVE_BOTTOM_CHROME_PX / zoom
  const safe = {
    x: vp.minX + margin,
    y: vp.minY + top,
    w: Math.max(0, vp.width - margin * 2),
    h: Math.max(0, vp.height - top - bottom),
  }
  return safe.w > 80 && safe.h > 80 ? safe : null
}

function findOpenOnAxis(
  desired: PageRect,
  occupied: PageRect[],
  axis: Exclude<MoveLayoutHint, 'free'>,
  safeViewport: PageRect | null,
): PageRect {
  const preferred = safeViewport ? clampRectToViewport(desired, safeViewport) : desired
  if (!rectOverlapsAny(preferred, occupied)) return preferred

  const vertical = axis === 'vertical'
  const candidates: PageRect[] = []
  const addCandidate = (candidate: PageRect) => {
    candidates.push(safeViewport ? clampRectToViewport(candidate, safeViewport) : candidate)
  }
  addCandidate(preferred)
  for (const other of occupied) {
    if (vertical && !rangesOverlap(preferred.x, preferred.w, other.x, other.w, MOVE_COLLISION_PAD)) {
      continue
    }
    if (!vertical && !rangesOverlap(preferred.y, preferred.h, other.y, other.h, MOVE_COLLISION_PAD)) {
      continue
    }
    addCandidate(
      vertical
        ? { ...preferred, y: other.y + other.h + MOVE_COLLISION_PAD }
        : { ...preferred, x: other.x + other.w + MOVE_COLLISION_PAD },
    )
    addCandidate(
      vertical
        ? { ...preferred, y: other.y - preferred.h - MOVE_COLLISION_PAD }
        : { ...preferred, x: other.x - preferred.w - MOVE_COLLISION_PAD },
    )
  }

  const step = vertical
    ? Math.max(80, Math.min(240, preferred.h + MOVE_COLLISION_PAD))
    : Math.max(80, Math.min(320, preferred.w + MOVE_COLLISION_PAD))
  for (let radius = 1; radius <= MOVE_COLLISION_SCAN_RADIUS; radius++) {
    addCandidate(
      vertical
        ? { ...preferred, y: preferred.y + radius * step }
        : { ...preferred, x: preferred.x + radius * step },
    )
    addCandidate(
      vertical
        ? { ...preferred, y: preferred.y - radius * step }
        : { ...preferred, x: preferred.x - radius * step },
    )
  }

  let best: PageRect | null = null
  let bestScore = Number.POSITIVE_INFINITY
  for (const candidate of candidates) {
    if (rectOverlapsAny(candidate, occupied)) continue
    const score = vertical ? (candidate.y - preferred.y) ** 2 : (candidate.x - preferred.x) ** 2
    if (score < bestScore) {
      best = candidate
      bestScore = score
    }
  }

  return best ?? preferred
}

function findNearestOpenRect(
  desired: PageRect,
  occupied: PageRect[],
  safeViewport: PageRect | null,
): PageRect {
  const preferred = safeViewport ? clampRectToViewport(desired, safeViewport) : desired
  if (!rectOverlapsAny(preferred, occupied)) return preferred

  const candidates: PageRect[] = []
  const addCandidate = (candidate: PageRect) => {
    candidates.push(safeViewport ? clampRectToViewport(candidate, safeViewport) : candidate)
  }
  addCandidate(preferred)
  for (const other of occupied) {
    addCandidate({ ...preferred, x: other.x + other.w + MOVE_COLLISION_PAD })
    addCandidate({ ...preferred, x: other.x - preferred.w - MOVE_COLLISION_PAD })
    addCandidate({ ...preferred, y: other.y + other.h + MOVE_COLLISION_PAD })
    addCandidate({ ...preferred, y: other.y - preferred.h - MOVE_COLLISION_PAD })
  }

  const stepX = Math.max(80, Math.min(320, preferred.w + MOVE_COLLISION_PAD))
  const stepY = Math.max(80, Math.min(240, preferred.h + MOVE_COLLISION_PAD))
  for (let radius = 1; radius <= MOVE_COLLISION_SCAN_RADIUS; radius++) {
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue
        addCandidate({ ...preferred, x: preferred.x + dx * stepX, y: preferred.y + dy * stepY })
      }
    }
  }

  let best: PageRect | null = null
  let bestScore = Number.POSITIVE_INFINITY
  for (const candidate of candidates) {
    if (rectOverlapsAny(candidate, occupied)) continue
    const score = (candidate.x - desired.x) ** 2 + (candidate.y - desired.y) ** 2
    if (score < bestScore) {
      best = candidate
      bestScore = score
    }
  }

  return best ?? preferred
}

function clampRectToViewport(rect: PageRect, viewport: PageRect): PageRect {
  return {
    ...rect,
    x: clamp(rect.x, viewport.x, Math.max(viewport.x, viewport.x + viewport.w - rect.w)),
    y: clamp(rect.y, viewport.y, Math.max(viewport.y, viewport.y + viewport.h - rect.h)),
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!
}

function rectOverlapsAny(rect: PageRect, others: PageRect[]): boolean {
  return others.some((other) => rectsOverlap(rect, other, MOVE_COLLISION_PAD))
}

function rangesOverlap(aStart: number, aSize: number, bStart: number, bSize: number, pad: number): boolean {
  return aStart < bStart + bSize + pad && aStart + aSize + pad > bStart
}

function rectsOverlap(a: PageRect, b: PageRect, pad: number): boolean {
  return (
    a.x < b.x + b.w + pad &&
    a.x + a.w + pad > b.x &&
    a.y < b.y + b.h + pad &&
    a.y + a.h + pad > b.y
  )
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
