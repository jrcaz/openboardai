import { Hono } from 'hono'
import { and, eq } from 'drizzle-orm'
import { db, schema } from '../db/client.js'
import type { AuthEnv } from '../middleware/auth.js'

export const htmls = new Hono<AuthEnv>()

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
  const user = c.get('user')!
  const id = c.req.param('id')
  // Join through the owning board so users can only read their own widgets.
  const [row] = await db
    .select({ bytes: schema.aiHtmls.bytes })
    .from(schema.aiHtmls)
    .innerJoin(schema.boards, eq(schema.aiHtmls.boardId, schema.boards.id))
    .where(and(eq(schema.aiHtmls.id, id), eq(schema.boards.userId, user.id)))
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
