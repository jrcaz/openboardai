import { Hono } from 'hono'
import { and, eq } from 'drizzle-orm'
import { zValidator } from '@hono/zod-validator'
import { bodyLimit } from 'hono/body-limit'
import { UploadImageRequest } from '@openboard-ai/shared'
import { db, schema } from '../db/client.js'
import type { AuthEnv } from '../middleware/auth.js'
import { userOwnsBoard } from '../lib/ownership.js'

export const images = new Hono<AuthEnv>()

images.get('/:id', async (c) => {
  const user = c.get('user')!
  const id = c.req.param('id')
  // Join through the owning board so a user can only read assets on their own
  // boards, even if they guess another board's asset id.
  const [row] = await db
    .select({
      bytes: schema.aiImages.bytes,
      mediaType: schema.aiImages.mediaType,
    })
    .from(schema.aiImages)
    .innerJoin(schema.boards, eq(schema.aiImages.boardId, schema.boards.id))
    .where(and(eq(schema.aiImages.id, id), eq(schema.boards.userId, user.id)))
    .limit(1)

  if (!row) return c.notFound()

  const buf = row.bytes as Buffer
  // Copy into a Uint8Array backed by a regular ArrayBuffer (BodyInit-compatible).
  const out = new Uint8Array(buf.byteLength)
  out.set(buf)
  return new Response(out, {
    headers: {
      'content-type': row.mediaType,
      'content-length': String(out.byteLength),
      'cache-control': 'public, max-age=31536000, immutable',
    },
  })
})

images.post(
  '/upload',
  bodyLimit({
    maxSize: 100 * 1024 * 1024,
    onError: (c) => c.json({ error: 'payload_too_large' }, 413),
  }),
  zValidator('json', UploadImageRequest),
  async (c) => {
    const user = c.get('user')!
    const req = c.req.valid('json')

    if (!(await userOwnsBoard(req.boardId, user.id)))
      return c.json({ error: 'board_not_found' }, 404)

    const bytes = Buffer.from(req.bytesBase64, 'base64')

    await db.insert(schema.aiImages).values({
      id: req.id,
      boardId: req.boardId,
      prompt: req.prompt,
      model: req.model,
      width: req.width,
      height: req.height,
      mediaType: req.mediaType,
      bytes,
      resultShapeId: req.resultShapeId ?? null,
    })

    return c.json({ id: req.id }, 201)
  },
)
