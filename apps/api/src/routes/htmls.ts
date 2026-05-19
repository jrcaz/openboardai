import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/client.js'

export const htmls = new Hono()

// Strict CSP for embedded HTML widgets:
// - default-src 'self' + data/blob covers most static assets.
// - script/style 'unsafe-inline' is required for the kind of self-contained
//   docs the AI generates (everything inlined). The sandbox attribute on the
//   <iframe> already prevents same-origin access, so inline scripts can't
//   reach the parent or read cookies.
// - frame-ancestors * so the canvas page (any host) can embed us.
const HTML_CSP =
  "default-src 'self' data: blob:; " +
  "script-src 'unsafe-inline' 'unsafe-eval' https: data:; " +
  "style-src 'unsafe-inline' https: data:; " +
  "img-src * data: blob:; " +
  "font-src * data:; " +
  "connect-src https:; " +
  "frame-ancestors *;"

htmls.get('/:id', async (c) => {
  const id = c.req.param('id')
  const [row] = await db
    .select({ bytes: schema.aiHtmls.bytes })
    .from(schema.aiHtmls)
    .where(eq(schema.aiHtmls.id, id))
    .limit(1)

  if (!row) return c.notFound()

  const buf = row.bytes as Buffer
  const out = new Uint8Array(buf.byteLength)
  out.set(buf)
  return new Response(out, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'content-length': String(out.byteLength),
      'cache-control': 'public, max-age=31536000, immutable',
      'content-security-policy': HTML_CSP,
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
    },
  })
})
