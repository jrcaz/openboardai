import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { zValidator } from '@hono/zod-validator'
import { bodyLimit } from 'hono/body-limit'
import { UploadVideoRequest } from '@openboard-ai/shared'
import { db, schema } from '../db/client.js'

export const videos = new Hono()

videos.get('/:id', async (c) => {
  const id = c.req.param('id')
  const [row] = await db
    .select({
      bytes: schema.aiVideos.bytes,
      mediaType: schema.aiVideos.mediaType,
    })
    .from(schema.aiVideos)
    .where(eq(schema.aiVideos.id, id))
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
    const req = c.req.valid('json')

    const [board] = await db
      .select({ id: schema.boards.id })
      .from(schema.boards)
      .where(eq(schema.boards.id, req.boardId))
      .limit(1)
    if (!board) return c.json({ error: 'board_not_found' }, 404)

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
