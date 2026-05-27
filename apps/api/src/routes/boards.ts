import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { and, desc, eq, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { zipSync, strToU8, type Zippable } from 'fflate'
import {
  CreateBoardRequest,
  UpdateBoardRequest,
  OBX_VERSION,
  type BoardSummary,
  type ObxImageMeta,
  type ObxVideoMeta,
  type ShareState,
} from '@openboard-ai/shared'
import { db, schema } from '../db/client.js'
import { claimBoard, getClaimableBoard } from '../lib/ownership.js'
import type { AuthEnv } from '../middleware/auth.js'

export const boards = new Hono<AuthEnv>()

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

// List the signed-in user's boards (most-recently edited first). Returns
// lightweight summaries without the tldraw snapshot to keep the dashboard fast.
boards.get('/', async (c) => {
  const user = c.get('user')!
  const rows = await db
    .select({
      id: schema.boards.id,
      title: schema.boards.title,
      createdAt: schema.boards.createdAt,
      updatedAt: schema.boards.updatedAt,
    })
    .from(schema.boards)
    .where(eq(schema.boards.userId, user.id))
    .orderBy(desc(schema.boards.updatedAt))
  const summaries: BoardSummary[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }))
  return c.json(summaries)
})

boards.post('/', zValidator('json', CreateBoardRequest), async (c) => {
  const user = c.get('user')!
  const { title } = c.req.valid('json')
  const id = nanoid(12)
  const [row] = await db
    .insert(schema.boards)
    .values({ id, title: title ?? 'Untitled', userId: user.id })
    .returning()
  return c.json(serialize(row), 201)
})

boards.get('/:id', async (c) => {
  const user = c.get('user')!
  const id = c.req.param('id')
  const [row] = await db
    .select()
    .from(schema.boards)
    .where(and(eq(schema.boards.id, id), eq(schema.boards.userId, user.id)))
    .limit(1)
  if (!row) return c.json({ error: 'not_found' }, 404)
  return c.json(serialize(row))
})

// Claim status for a legacy (pre-accounts) board. Behind requireAuth like all
// of /api/*, so only signed-in users can probe. Returns claimable=false for
// boards that don't exist or are already owned (by anyone) — it never reveals
// the existence or ownership of a board that isn't up for grabs.
boards.get('/:id/claim-status', async (c) => {
  const id = c.req.param('id')
  const board = await getClaimableBoard(id)
  return c.json({ claimable: Boolean(board), title: board?.title ?? null })
})

// Take ownership of an ownerless board. 409 if it doesn't exist or was already
// claimed — claimBoard is atomic (isNull guard) so a race yields exactly one winner.
boards.post('/:id/claim', async (c) => {
  const user = c.get('user')!
  const id = c.req.param('id')
  const row = await claimBoard(id, user.id)
  if (!row) return c.json({ error: 'not_claimable' }, 409)
  return c.json(serialize(row))
})

boards.patch('/:id', zValidator('json', UpdateBoardRequest), async (c) => {
  const user = c.get('user')!
  const id = c.req.param('id')
  const patch = c.req.valid('json')
  const [row] = await db
    .update(schema.boards)
    .set({
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.snapshot !== undefined ? { snapshot: patch.snapshot } : {}),
      ...(patch.isPublic !== undefined ? { isPublic: patch.isPublic } : {}),
      // Mint a share token the first time the board is made public; keep any
      // existing token on re-enable (rotation is an explicit regenerate).
      ...(patch.isPublic === true
        ? { shareToken: sql`coalesce(${schema.boards.shareToken}, ${nanoid(16)})` }
        : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(schema.boards.id, id), eq(schema.boards.userId, user.id)))
    .returning()
  if (!row) return c.json({ error: 'not_found' }, 404)
  return c.json(serialize(row))
})

// Rotate a board's share token, permanently invalidating the previous public
// link. Leaves isPublic unchanged. Owner-only like the rest of /api/boards.
boards.post('/:id/share/regenerate', async (c) => {
  const user = c.get('user')!
  const id = c.req.param('id')
  const [row] = await db
    .update(schema.boards)
    .set({ shareToken: nanoid(16), updatedAt: new Date() })
    .where(and(eq(schema.boards.id, id), eq(schema.boards.userId, user.id)))
    .returning()
  if (!row) return c.json({ error: 'not_found' }, 404)
  return c.json({ isPublic: row.isPublic, shareToken: row.shareToken } satisfies ShareState)
})

// Permanently delete a board. Asset/message tables cascade via their FKs.
boards.delete('/:id', async (c) => {
  const user = c.get('user')!
  const id = c.req.param('id')
  const [row] = await db
    .delete(schema.boards)
    .where(and(eq(schema.boards.id, id), eq(schema.boards.userId, user.id)))
    .returning({ id: schema.boards.id })
  if (!row) return c.json({ error: 'not_found' }, 404)
  return c.json({ ok: true })
})

boards.get('/:id/export', async (c) => {
  const user = c.get('user')!
  const id = c.req.param('id')
  const [board] = await db
    .select()
    .from(schema.boards)
    .where(and(eq(schema.boards.id, id), eq(schema.boards.userId, user.id)))
    .limit(1)
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
  const user = c.get('user')!
  const id = c.req.param('id')
  const [board] = await db
    .select({ id: schema.boards.id })
    .from(schema.boards)
    .where(and(eq(schema.boards.id, id), eq(schema.boards.userId, user.id)))
    .limit(1)
  if (!board) return c.json({ error: 'not_found' }, 404)

  await db.delete(schema.aiImages).where(eq(schema.aiImages.boardId, id))
  await db.delete(schema.aiVideos).where(eq(schema.aiVideos.boardId, id))
  return c.json({ ok: true })
})

function serialize(row: typeof schema.boards.$inferSelect) {
  return {
    id: row.id,
    title: row.title,
    snapshot: row.snapshot,
    isPublic: row.isPublic,
    shareToken: row.shareToken,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}
