import { Hono } from 'hono'
import { and, eq } from 'drizzle-orm'
import type { PublicBoardResponse } from '@openboard-ai/shared'
import { db, schema } from '../db/client.js'
import type { AuthEnv } from '../middleware/auth.js'

// Unauthenticated, read-only access to boards their owner has shared publicly.
// Mounted BEFORE requireAuth in index.ts so it stays reachable when signed out.
// Every query gates on `boards.isPublic = true`, so private boards (and the
// assets on them) are never exposed here.
export const publicBoards = new Hono<AuthEnv>()

// Stream stored bytes back with the same caching semantics the authed asset
// routes use. `extraHeaders` carries per-type concerns (range support, CSP).
function bytesResponse(
  bytes: Buffer,
  contentType: string,
  extraHeaders: Record<string, string> = {},
): Response {
  const out = new Uint8Array(bytes.byteLength)
  out.set(bytes)
  return new Response(out, {
    headers: {
      'content-type': contentType,
      'content-length': String(out.byteLength),
      'cache-control': 'public, max-age=31536000, immutable',
      ...extraHeaders,
    },
  })
}

// Mirrors the CSP used by the authed /api/htmls route for embedded widgets.
const HTML_CSP =
  "default-src 'self' data: blob:; " +
  "script-src 'unsafe-inline' 'unsafe-eval' https: data:; " +
  "style-src 'unsafe-inline' https: data:; " +
  "img-src * data: blob:; " +
  "font-src * data:; " +
  "connect-src https:; " +
  "frame-ancestors *;"

publicBoards.get('/boards/:token', async (c) => {
  const token = c.req.param('token')
  const [row] = await db
    .select()
    .from(schema.boards)
    .where(and(eq(schema.boards.shareToken, token), eq(schema.boards.isPublic, true)))
    .limit(1)
  if (!row) return c.json({ error: 'not_found' }, 404)
  const body: PublicBoardResponse = {
    id: row.id,
    title: row.title,
    snapshot: row.snapshot ?? null,
    updatedAt: row.updatedAt.toISOString(),
  }
  return c.json(body)
})

publicBoards.get('/images/:id', async (c) => {
  const id = c.req.param('id')
  const [row] = await db
    .select({ bytes: schema.aiImages.bytes, mediaType: schema.aiImages.mediaType })
    .from(schema.aiImages)
    .innerJoin(schema.boards, eq(schema.aiImages.boardId, schema.boards.id))
    .where(and(eq(schema.aiImages.id, id), eq(schema.boards.isPublic, true)))
    .limit(1)
  if (!row) return c.notFound()
  return bytesResponse(row.bytes as Buffer, row.mediaType)
})

publicBoards.get('/videos/:id', async (c) => {
  const id = c.req.param('id')
  const [row] = await db
    .select({ bytes: schema.aiVideos.bytes, mediaType: schema.aiVideos.mediaType })
    .from(schema.aiVideos)
    .innerJoin(schema.boards, eq(schema.aiVideos.boardId, schema.boards.id))
    .where(and(eq(schema.aiVideos.id, id), eq(schema.boards.isPublic, true)))
    .limit(1)
  if (!row) return c.notFound()
  return bytesResponse(row.bytes as Buffer, row.mediaType, { 'accept-ranges': 'bytes' })
})

publicBoards.get('/htmls/:id', async (c) => {
  const id = c.req.param('id')
  const [row] = await db
    .select({ bytes: schema.aiHtmls.bytes })
    .from(schema.aiHtmls)
    .innerJoin(schema.boards, eq(schema.aiHtmls.boardId, schema.boards.id))
    .where(and(eq(schema.aiHtmls.id, id), eq(schema.boards.isPublic, true)))
    .limit(1)
  if (!row) return c.notFound()
  return bytesResponse(row.bytes as Buffer, 'text/html; charset=utf-8', {
    'content-security-policy': HTML_CSP,
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
  })
})
