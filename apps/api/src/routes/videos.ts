import { Hono } from 'hono'
import { and, eq } from 'drizzle-orm'
import { zValidator } from '@hono/zod-validator'
import { bodyLimit } from 'hono/body-limit'
import { UploadVideoRequest } from '@openboard-ai/shared'
import { db, schema } from '../db/client.js'
import type { AuthEnv } from '../middleware/auth.js'
import { userOwnsBoard } from '../lib/ownership.js'

export const videos = new Hono<AuthEnv>()

videos.get('/:id', async (c) => {
  const user = c.get('user')!
  const id = c.req.param('id')
  // Join through the owning board so users can only read their own assets.
  const [row] = await db
    .select({
      bytes: schema.aiVideos.bytes,
      mediaType: schema.aiVideos.mediaType,
    })
    .from(schema.aiVideos)
    .innerJoin(schema.boards, eq(schema.aiVideos.boardId, schema.boards.id))
    .where(and(eq(schema.aiVideos.id, id), eq(schema.boards.userId, user.id)))
    .limit(1)

  if (!row) return c.notFound()

  const buf = row.bytes as Buffer
  const out = new Uint8Array(buf.byteLength)
  out.set(buf)
  return new Response(out, {
    headers: {
      'content-type': row.mediaType,
      'content-length': String(out.byteLength),
      'accept-ranges': 'bytes',
      'cache-control': 'public, max-age=31536000, immutable',
    },
  })
})

videos.post(
  '/upload',
  bodyLimit({
    maxSize: 200 * 1024 * 1024,
    onError: (c) => c.json({ error: 'payload_too_large' }, 413),
  }),
  zValidator('json', UploadVideoRequest),
  async (c) => {
    const user = c.get('user')!
    const req = c.req.valid('json')

    if (!(await userOwnsBoard(req.boardId, user.id)))
      return c.json({ error: 'board_not_found' }, 404)

    const bytes = Buffer.from(req.bytesBase64, 'base64')

    await db.insert(schema.aiVideos).values({
      id: req.id,
      boardId: req.boardId,
      prompt: req.prompt,
      model: req.model,
      width: req.width,
      height: req.height,
      mediaType: req.mediaType,
      bytes,
      resultShapeId: req.resultShapeId ?? null,
      durationMs: req.durationMs,
      hasAudio: req.hasAudio,
      sourceImageId: req.sourceImageId,
    })

    return c.json({ id: req.id }, 201)
  },
)
