import { type Editor, type TLShape, type TLShapeId, createShapeId } from 'tldraw'
import type { AiContextShape, ChatMessage, GenerateRequest } from '@openboard-ai/shared'
import { AI_CARD_TYPE, type AiCardShape } from '../shapes/AiCardShapeUtil'
import { createCustomShape } from '../shapes/customShape'
import { extractShapeText } from './canvas'

const CHILD_W = 220
const CHILD_H = 140
const RADIUS = 280

/**
 * Fan-out 4 short follow-up cards from a source shape, arrow-connected back.
 * Server runs in mode=expand which biases toward a numbered list of 4 items.
 */
export async function extractAndExpand(editor: Editor, boardId: string, source: TLShape) {
  const sourceText = extractShapeText(editor, source)
  const sourceBounds = editor.getShapePageBounds(source.id)
  if (!sourceBounds) return

  const ctx: AiContextShape[] = [
    { id: source.id as string, type: source.type, text: sourceText.slice(0, 4000) },
  ]
  const messages: ChatMessage[] = [
    {
      role: 'user',
      content:
        sourceText.trim().length > 0
          ? `Generate 4 short follow-up ideas that build on this:\n\n${sourceText}`
          : 'Generate 4 short follow-up ideas.',
    },
  ]

  // Pre-allocate the first card's id so the API can persist `result_shape_id`
  // pointing at a stable shape (the canonical "expansion result").
  const firstCardId = createShapeId()

  const res = await fetch('/api/ai/generate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      boardId,
      messages,
      mode: 'expand',
      context: { shapes: ctx },
      resultShapeId: firstCardId as string,
    } satisfies GenerateRequest),
  })

  if (!res.ok || !res.body) {
    console.error('[expand] HTTP error', res.status)
    return
  }

  const text = await res.text()
  const ideas = parseNumberedList(text).slice(0, 4)
  if (ideas.length === 0) return

  const center = { x: sourceBounds.maxX + 80, y: sourceBounds.midY }
  const angles = spreadAngles(ideas.length)

  editor.run(() => {
    ideas.forEach((idea, i) => {
      const a = angles[i]!
      const cx = center.x + Math.cos(a) * RADIUS - CHILD_W / 2
      const cy = center.y + Math.sin(a) * RADIUS - CHILD_H / 2

      const cardId = i === 0 ? firstCardId : createShapeId()
      createCustomShape<AiCardShape>(editor, {
        id: cardId,
        type: AI_CARD_TYPE,
        x: cx,
        y: cy,
        props: {
          w: CHILD_W,
          h: CHILD_H,
          prompt: 'Expansion',
          text: idea,
          status: 'done',
          sourceShapeIds: [source.id as string],
        },
      })

      createBoundArrow(editor, source.id, cardId)
    })
  })
}

function createBoundArrow(editor: Editor, fromId: TLShapeId, toId: TLShapeId) {
  const fromBounds = editor.getShapePageBounds(fromId)
  const toBounds = editor.getShapePageBounds(toId)
  if (!fromBounds || !toBounds) return

  const arrowId = createShapeId()
  editor.createShape({
    id: arrowId,
    type: 'arrow',
    x: 0,
    y: 0,
    props: {
      start: { x: fromBounds.maxX, y: fromBounds.midY },
      end: { x: toBounds.midX, y: toBounds.midY },
    } as never,
  })

  editor.createBindings([
    {
      type: 'arrow',
      fromId: arrowId,
      toId: fromId,
      props: { terminal: 'start', isPrecise: false, isExact: false, normalizedAnchor: { x: 0.5, y: 0.5 } },
    } as never,
    {
      type: 'arrow',
      fromId: arrowId,
      toId,
      props: { terminal: 'end', isPrecise: false, isExact: false, normalizedAnchor: { x: 0.5, y: 0.5 } },
    } as never,
  ])
}

function parseNumberedList(text: string): string[] {
  // Match lines starting with "1." / "1)" / "- " / "* "
  const lines = text.split(/\r?\n/)
  const items: string[] = []
  for (const raw of lines) {
    const line = raw.trim()
    const m = line.match(/^(?:\d+[.)]|[-*])\s+(.+)/)
    if (m && m[1]) items.push(m[1].trim())
  }
  if (items.length > 0) return items
  // Fallback: split by sentence/double-newline
  return text
    .split(/\n\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function spreadAngles(n: number): number[] {
  // Arc from -45° to +45° around the source's right side.
  const start = -Math.PI / 4
  const end = Math.PI / 4
  if (n === 1) return [0]
  const step = (end - start) / (n - 1)
  return Array.from({ length: n }, (_, i) => start + i * step)
}
