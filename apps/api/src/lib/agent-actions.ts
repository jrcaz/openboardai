import { desc, eq } from 'drizzle-orm'
import { db, schema } from '../db/client.js'
import { getOwnedBoard } from './ownership.js'
import {
  buildAiCardShape,
  buildAiHtmlShape,
  buildAiImageShape,
  buildNoteShape,
  buildTextShape,
  listItems,
  mergeAndPersist,
  type AgentItem,
} from './snapshot.js'
import { generateAndPersistImage } from '../ai/image.js'
import { generateAndPersistHtml } from '../ai/html.js'
import { DEFAULTS, getOpenRouter } from '../ai/openrouter.js'
import { generateText } from 'ai'
import { nanoid } from 'nanoid'

// ---------------------------------------------------------------------------
// Shared agent actions. Pure functions, no Hono context. Used by both the
// REST surface (`routes/agent.ts`) and the MCP surface (`routes/mcp.ts`) so
// there's exactly one implementation of each capability.
// ---------------------------------------------------------------------------

export interface AgentBoardSummary {
  id: string
  title: string
  createdAt: string
  updatedAt: string
}

export async function listBoards(userId: string): Promise<AgentBoardSummary[]> {
  const rows = await db
    .select({
      id: schema.boards.id,
      title: schema.boards.title,
      createdAt: schema.boards.createdAt,
      updatedAt: schema.boards.updatedAt,
    })
    .from(schema.boards)
    .where(eq(schema.boards.userId, userId))
    .orderBy(desc(schema.boards.updatedAt))
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }))
}

export interface AgentBoardContent {
  id: string
  title: string
  updatedAt: string
  items: AgentItem[]
  snapshot?: Record<string, unknown> | null
}

export async function readBoard(
  userId: string,
  boardId: string,
  { includeSnapshot = false }: { includeSnapshot?: boolean } = {},
): Promise<AgentBoardContent | null> {
  const row = await getOwnedBoard(boardId, userId)
  if (!row) return null
  return {
    id: row.id,
    title: row.title,
    updatedAt: row.updatedAt.toISOString(),
    items: listItems(row.snapshot ?? null),
    ...(includeSnapshot ? { snapshot: row.snapshot } : {}),
  }
}

export interface AddTextResult {
  shapeId: string
}

export async function addTextToBoard(
  userId: string,
  boardId: string,
  opts: { kind: 'text' | 'note'; text: string; x?: number; y?: number; color?: string },
): Promise<AddTextResult | null> {
  const result = await mergeAndPersist(boardId, userId, (parsed) => {
    const built =
      opts.kind === 'note'
        ? buildNoteShape(parsed.store, parsed.pageId, {
            text: opts.text,
            x: opts.x,
            y: opts.y,
            color: opts.color,
          })
        : buildTextShape(parsed.store, parsed.pageId, {
            text: opts.text,
            x: opts.x,
            y: opts.y,
            color: opts.color,
          })
    return [built]
  })
  if (!result) return null
  return { shapeId: result.shapeIds[0]! }
}

export interface MoveItemsResult {
  movedIds: string[]
  skippedIds: string[]
}

export async function moveItemsOnBoard(
  userId: string,
  boardId: string,
  opts: { moves: { id: string; x: number; y: number }[] },
): Promise<MoveItemsResult | null> {
  const movedIds: string[] = []
  const skippedIds: string[] = []
  const result = await mergeAndPersist(boardId, userId, (parsed) => {
    for (const move of opts.moves) {
      const rec = parsed.store[move.id]
      if (!rec || rec.typeName !== 'shape' || rec.isLocked === true) {
        skippedIds.push(move.id)
        continue
      }
      rec.x = move.x
      rec.y = move.y
      movedIds.push(move.id)
    }
    return []
  })
  if (!result) return null
  return { movedIds, skippedIds }
}

export type AgentGenerateKind = 'text' | 'image' | 'html'

export interface GenerateOnBoardResult {
  kind: AgentGenerateKind
  shapeId: string
  // Populated when kind = 'image' | 'html' — the asset id is also referenced
  // inside the injected shape's props but we surface it so REST/MCP callers
  // can show a direct link without re-reading the snapshot.
  assetId?: string
  url?: string
  text?: string
}

export async function generateOnBoard(
  userId: string,
  boardId: string,
  opts: {
    kind: AgentGenerateKind
    prompt: string
    openRouterKey: string
    x?: number
    y?: number
    model?: string
    title?: string
  },
): Promise<GenerateOnBoardResult | null> {
  // Ownership pre-check; mergeAndPersist re-checks atomically below.
  if (!(await getOwnedBoard(boardId, userId))) return null

  const openrouter = getOpenRouter(opts.openRouterKey)

  if (opts.kind === 'image') {
    const persisted = await generateAndPersistImage({
      openrouter,
      boardId,
      prompt: opts.prompt,
      model: opts.model,
    })
    const merge = await mergeAndPersist(boardId, userId, (parsed) => [
      buildAiImageShape(parsed.store, parsed.pageId, {
        prompt: persisted.prompt,
        imageId: persisted.imageId,
        mediaType: persisted.mediaType,
        aspect: persisted.aspect,
        x: opts.x,
        y: opts.y,
      }),
    ])
    if (!merge) return null
    return {
      kind: 'image',
      shapeId: merge.shapeIds[0]!,
      assetId: persisted.imageId,
      url: `/api/images/${persisted.imageId}`,
    }
  }

  if (opts.kind === 'html') {
    const selected = opts.model?.trim() || DEFAULTS.text
    const persisted = await generateAndPersistHtml({
      openrouter,
      boardId,
      prompt: opts.prompt,
      title: opts.title,
      model: selected,
    })
    const merge = await mergeAndPersist(boardId, userId, (parsed) => [
      buildAiHtmlShape(parsed.store, parsed.pageId, {
        title: persisted.title,
        prompt: opts.prompt,
        htmlId: persisted.htmlId,
        x: opts.x,
        y: opts.y,
      }),
    ])
    if (!merge) return null
    return {
      kind: 'html',
      shapeId: merge.shapeIds[0]!,
      assetId: persisted.htmlId,
      url: `/api/htmls/${persisted.htmlId}`,
    }
  }

  // kind === 'text' — generate a short markdown response and drop it on the
  // board as an ai-card (the same custom shape the in-app prompt bar uses).
  const selected = opts.model?.trim() || DEFAULTS.text
  const { text } = await generateText({
    model: openrouter.chat(selected),
    prompt: opts.prompt,
  })
  // Persist the exchange so it shows up in the board's message history just
  // like an in-app generation would.
  await db.insert(schema.aiMessages).values({
    id: nanoid(12),
    boardId,
    prompt: opts.prompt,
    response: text,
    model: selected,
    mode: 'prompt',
    contextShapeIds: [],
    resultShapeId: null,
  })
  const merge = await mergeAndPersist(boardId, userId, (parsed) => [
    buildAiCardShape(parsed.store, parsed.pageId, {
      prompt: opts.prompt,
      text,
      x: opts.x,
      y: opts.y,
    }),
  ])
  if (!merge) return null
  return { kind: 'text', shapeId: merge.shapeIds[0]!, text }
}
