import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/client.js'

export const audios = new Hono()

audios.get('/:id', async (c) => {
  const id = c.req.param('id')
  const [row] = await db
    .select({
      bytes: schema.aiTranscriptions.bytes,
      mediaType: schema.aiTranscriptions.mediaType,
    })
    .from(schema.aiTranscriptions)
    .where(eq(schema.aiTranscriptions.id, id))
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
