import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { zipSync, strToU8, type Zippable } from 'fflate'
import {
  CreateBoardRequest,
  UpdateBoardRequest,
  OBX_VERSION,
  type ObxImageMeta,
  type ObxVideoMeta,
} from '@openboard-ai/shared'
import { db, schema } from '../db/client.js'
import { getBoardTtlDays } from '../jobs/boardCleanup.js'

export const boards = new Hono()

const MS_PER_DAY = 86_400_000

function extFromMediaType(mediaType: string): string {
  const m = mediaType.toLowerCase()
  if (m === 'image/png') return 'png'
  if (m === 'image/jpeg' || m === 'image/jpg') return 'jpg'
  if (m === 'image/webp') return 'webp'
  if (m === 'image/gif') return 'gif'
  if (m === 'video/mp4') return 'mp4'
  if (m === 'video/webm') return 'webm'
  if (m === 'video/quicktime') return 'mov'
  const slash = m.indexOf('/')
  return slash >= 0 ? m.slice(slash + 1) : 'bin'
}

function safeFilename(title: string): string {
  const cleaned = title.replace(/[^a-zA-Z0-9-_ ]/g, '').trim().replace(/\s+/g, '_')
  return (cleaned || 'board') + '.obx'
}

boards.post('/', zValidator('json', CreateBoardRequest), async (c) => {
  const { title } = c.req.valid('json')
  const id = nanoid(12)
  const [row] = await db
    .insert(schema.boards)
    .values({ id, title: title ?? 'Untitled' })
    .returning()
  return c.json(serialize(row), 201)
})

boards.get('/:id', async (c) => {
  const id = c.req.param('id')
  const [row] = await db.select().from(schema.boards).where(eq(schema.boards.id, id)).limit(1)
  if (!row) return c.json({ error: 'not_found' }, 404)
  return c.json(serialize(row))
})

boards.patch('/:id', zValidator('json', UpdateBoardRequest), async (c) => {
  const id = c.req.param('id')
  const patch = c.req.valid('json')
  const [row] = await db
    .update(schema.boards)
    .set({
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.snapshot !== undefined ? { snapshot: patch.snapshot } : {}),
      updatedAt: new Date(),
    })
    .where(eq(schema.boards.id, id))
    .returning()
  if (!row) return c.json({ error: 'not_found' }, 404)
  return c.json(serialize(row))
})

boards.get('/:id/export', async (c) => {
  const id = c.req.param('id')
  const [board] = await db.select().from(schema.boards).where(eq(schema.boards.id, id)).limit(1)
  if (!board) return c.json({ error: 'not_found' }, 404)

  const images = await db
    .select()
    .from(schema.aiImages)
    .where(eq(schema.aiImages.boardId, id))
  const videos = await db
    .select()
    .from(schema.aiVideos)
    .where(eq(schema.aiVideos.boardId, id))

  const files: Zippable = {}

  files['manifest.json'] = strToU8(
    JSON.stringify({
      version: OBX_VERSION,
      exportedAt: new Date().toISOString(),
      originalBoardId: board.id,
      title: board.title,
      counts: { images: images.length, videos: videos.length },
    }),
  )

  files['board.json'] = strToU8(
    JSON.stringify({
      title: board.title,
      snapshot: board.snapshot ?? {},
    }),
  )

  for (const img of images) {
    const ext = extFromMediaType(img.mediaType)
    const buf = img.bytes as Buffer
    const u8 = new Uint8Array(buf.byteLength)
    u8.set(buf)
    files[`assets/images/${img.id}.${ext}`] = u8
    const meta: ObxImageMeta = {
      prompt: img.prompt,
      model: img.model,
      width: img.width,
      height: img.height,
      mediaType: img.mediaType,
    }
    files[`assets/images/${img.id}.meta.json`] = strToU8(JSON.stringify(meta))
  }

  for (const vid of videos) {
    const ext = extFromMediaType(vid.mediaType)
    const buf = vid.bytes as Buffer
    const u8 = new Uint8Array(buf.byteLength)
    u8.set(buf)
    files[`assets/videos/${vid.id}.${ext}`] = u8
    const meta: ObxVideoMeta = {
      prompt: vid.prompt,
      model: vid.model,
      width: vid.width,
      height: vid.height,
      mediaType: vid.mediaType,
      durationMs: vid.durationMs,
      hasAudio: vid.hasAudio,
      sourceImageId: vid.sourceImageId,
    }
    files[`assets/videos/${vid.id}.meta.json`] = strToU8(JSON.stringify(meta))
  }

  const zipped = zipSync(files, { level: 6 })
  const out = new Uint8Array(zipped.byteLength)
  out.set(zipped)

  return new Response(out, {
    headers: {
      'content-type': 'application/zip',
      'content-length': String(out.byteLength),
      'content-disposition': `attachment; filename="${safeFilename(board.title)}"`,
      'cache-control': 'no-store',
    },
  })
})

boards.delete('/:id/assets', async (c) => {
  const id = c.req.param('id')
  const [board] = await db
    .select({ id: schema.boards.id })
    .from(schema.boards)
    .where(eq(schema.boards.id, id))
    .limit(1)
  if (!board) return c.json({ error: 'not_found' }, 404)

  await db.delete(schema.aiImages).where(eq(schema.aiImages.boardId, id))
  await db.delete(schema.aiVideos).where(eq(schema.aiVideos.boardId, id))
  return c.json({ ok: true })
})

function serialize(row: typeof schema.boards.$inferSelect) {
  const ttlDays = getBoardTtlDays()
  const expiresAt = ttlDays
    ? new Date(row.createdAt.getTime() + ttlDays * MS_PER_DAY).toISOString()
    : null
  return {
    id: row.id,
    title: row.title,
    snapshot: row.snapshot,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    expiresAt,
  }
}
