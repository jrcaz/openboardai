import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/client.js'

export const images = new Hono()

images.get('/:id', async (c) => {
  const id = c.req.param('id')
  const [row] = await db
    .select({
      bytes: schema.aiImages.bytes,
      mediaType: schema.aiImages.mediaType,
    })
    .from(schema.aiImages)
    .where(eq(schema.aiImages.id, id))
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
