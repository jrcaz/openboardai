import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { and, desc, eq, or } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import {
  CreateBoardFromTemplateRequest,
  CreateTemplateRequest,
  type BoardTemplateSummary,
} from '@openboard-ai/shared'
import { db, schema } from '../db/client.js'
import type { AuthEnv } from '../middleware/auth.js'

export const templates = new Hono<AuthEnv>()

templates.get('/', async (c) => {
  const user = c.get('user')!
  const rows = await db
    .select()
    .from(schema.boardTemplates)
    .where(or(eq(schema.boardTemplates.userId, user.id), eq(schema.boardTemplates.isPublic, true)))
    .orderBy(desc(schema.boardTemplates.updatedAt))

  return c.json(
    rows.map((row): BoardTemplateSummary => serializeTemplate(row, user.id)),
  )
})

templates.post('/', zValidator('json', CreateTemplateRequest), async (c) => {
  const user = c.get('user')!
  const req = c.req.valid('json')

  const [board] = await db
    .select()
    .from(schema.boards)
    .where(and(eq(schema.boards.id, req.boardId), eq(schema.boards.userId, user.id)))
    .limit(1)
  if (!board) return c.json({ error: 'board_not_found' }, 404)

  const [row] = await db
    .insert(schema.boardTemplates)
    .values({
      id: nanoid(12),
      userId: user.id,
      sourceBoardId: board.id,
      title: req.title,
      description: req.description ?? null,
      snapshot: (board.snapshot ?? {}) as Record<string, unknown>,
      isPublic: req.isPublic ?? false,
    })
    .returning()

  return c.json(serializeTemplate(row, user.id), 201)
})

templates.post(
  '/:id/boards',
  zValidator('json', CreateBoardFromTemplateRequest),
  async (c) => {
    const user = c.get('user')!
    const id = c.req.param('id')
    const req = c.req.valid('json')

    const [template] = await db
      .select()
      .from(schema.boardTemplates)
      .where(
        and(
          eq(schema.boardTemplates.id, id),
          or(eq(schema.boardTemplates.userId, user.id), eq(schema.boardTemplates.isPublic, true)),
        ),
      )
      .limit(1)
    if (!template) return c.json({ error: 'template_not_found' }, 404)

    const boardId = nanoid(12)
    const { snapshot, copyAssets } = await prepareTemplateSnapshot(
      template.snapshot,
      template.sourceBoardId,
      boardId,
    )

    const board = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(schema.boards)
        .values({
          id: boardId,
          userId: user.id,
          title: req.title ?? template.title,
          snapshot,
        })
        .returning()

      await copyAssets(tx)
      return created
    })

    return c.json(
      {
        id: board.id,
        title: board.title,
        snapshot: board.snapshot,
        isPublic: board.isPublic,
        shareToken: board.shareToken,
        createdAt: board.createdAt.toISOString(),
        updatedAt: board.updatedAt.toISOString(),
      },
      201,
    )
  },
)

function serializeTemplate(
  row: typeof schema.boardTemplates.$inferSelect,
  userId: string,
): BoardTemplateSummary {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    isPublic: row.isPublic,
    owner: row.userId === userId ? 'user' : 'public',
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

async function prepareTemplateSnapshot(
  originalSnapshot: Record<string, unknown>,
  sourceBoardId: string | null,
  targetBoardId: string,
) {
  if (!sourceBoardId) {
    return { snapshot: cloneJson(originalSnapshot), copyAssets: async (_client: AssetWriter = db) => {} }
  }

  const [images, videos, htmls] = await Promise.all([
    db.select().from(schema.aiImages).where(eq(schema.aiImages.boardId, sourceBoardId)),
    db.select().from(schema.aiVideos).where(eq(schema.aiVideos.boardId, sourceBoardId)),
    db.select().from(schema.aiHtmls).where(eq(schema.aiHtmls.boardId, sourceBoardId)),
  ])

  const imageIdMap = new Map(images.map((row) => [row.id, nanoid(12)]))
  const videoIdMap = new Map(videos.map((row) => [row.id, nanoid(12)]))
  const htmlIdMap = new Map(htmls.map((row) => [row.id, nanoid(12)]))
  const snapshot = remapSnapshotIds(originalSnapshot, imageIdMap, videoIdMap, htmlIdMap)

  return {
    snapshot,
    copyAssets: async (client: AssetWriter = db) => {
      if (images.length > 0) {
        await client.insert(schema.aiImages).values(
          images.map((row) => ({
            id: imageIdMap.get(row.id)!,
            boardId: targetBoardId,
            prompt: row.prompt,
            model: row.model,
            width: row.width,
            height: row.height,
            mediaType: row.mediaType,
            bytes: row.bytes as Buffer,
            resultShapeId: row.resultShapeId,
          })),
        )
      }
      if (htmls.length > 0) {
        await client.insert(schema.aiHtmls).values(
          htmls.map((row) => ({
            id: htmlIdMap.get(row.id)!,
            boardId: targetBoardId,
            title: row.title,
            prompt: row.prompt,
            source: row.source,
            model: row.model,
            byteSize: row.byteSize,
            bytes: row.bytes as Buffer,
            resultShapeId: row.resultShapeId,
          })),
        )
      }
      if (videos.length > 0) {
        await client.insert(schema.aiVideos).values(
          videos.map((row) => ({
            id: videoIdMap.get(row.id)!,
            boardId: targetBoardId,
            prompt: row.prompt,
            model: row.model,
            width: row.width,
            height: row.height,
            durationMs: row.durationMs,
            hasAudio: row.hasAudio,
            mediaType: row.mediaType,
            bytes: row.bytes as Buffer,
            resultShapeId: row.resultShapeId,
            sourceImageId: row.sourceImageId ? imageIdMap.get(row.sourceImageId) ?? null : null,
          })),
        )
      }
    },
  }
}

type AssetWriter = Pick<typeof db, 'insert'>

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function remapSnapshotIds(
  snapshot: Record<string, unknown>,
  imageIdMap: Map<string, string>,
  videoIdMap: Map<string, string>,
  htmlIdMap: Map<string, string>,
): Record<string, unknown> {
  const cloned = cloneJson(snapshot)
  const store = (cloned.store ?? cloned.records) as Record<string, unknown> | undefined
  if (!store || typeof store !== 'object') return cloned

  for (const record of Object.values(store)) {
    if (!record || typeof record !== 'object') continue
    const r = record as { typeName?: string; type?: string; props?: Record<string, unknown> }
    if (r.typeName !== 'shape' || !r.props) continue

    if (r.type === 'ai-image') {
      const oldId = r.props.imageId
      if (typeof oldId === 'string' && imageIdMap.has(oldId)) {
        r.props.imageId = imageIdMap.get(oldId)!
      }
    } else if (r.type === 'ai-video') {
      const oldVid = r.props.videoId
      if (typeof oldVid === 'string' && videoIdMap.has(oldVid)) {
        r.props.videoId = videoIdMap.get(oldVid)!
      }
      const oldSrc = r.props.sourceImageId
      if (typeof oldSrc === 'string' && imageIdMap.has(oldSrc)) {
        r.props.sourceImageId = imageIdMap.get(oldSrc)!
      }
    } else if (r.type === 'ai-html') {
      const oldHtml = r.props.htmlId
      if (typeof oldHtml === 'string' && htmlIdMap.has(oldHtml)) {
        r.props.htmlId = htmlIdMap.get(oldHtml)!
      }
    }
  }

  return cloned
}
