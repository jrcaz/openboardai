import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { auth, socialProviders } from './auth.js'
import {
  bearerOrSessionMiddleware,
  requireAuth,
  sessionMiddleware,
  type AuthEnv,
} from './middleware/auth.js'
import { agent } from './routes/agent.js'
import { ai } from './routes/ai.js'
import { boards } from './routes/boards.js'
import { htmls } from './routes/htmls.js'
import { images } from './routes/images.js'
import { keys } from './routes/keys.js'
import { mcp } from './routes/mcp.js'
import { models } from './routes/models.js'
import { publicBoards } from './routes/public.js'
import { settings } from './routes/settings.js'
import { templates } from './routes/templates.js'
import { videos } from './routes/videos.js'

const app = new Hono<AuthEnv>()

// Origins allowed to make credentialed (cookie-bearing) requests. Same-origin
// in practice (dev proxy / prod static serving); pinned here to block other sites.
const corsOrigins = [
  'http://localhost:5173',
  'http://localhost:3001',
  ...(process.env.BETTER_AUTH_TRUSTED_ORIGINS?.split(',').map((o) => o.trim()).filter(Boolean) ??
    []),
]

app.use('*', logger())
app.use(
  '/api/*',
  cors({
    origin: corsOrigins,
    credentials: true,
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'X-OpenRouter-Key', 'Authorization', 'Mcp-Session-Id'],
    exposeHeaders: ['Mcp-Session-Id'],
  }),
)

app.get('/health', (c) => c.json({ ok: true }))

// Programmatic agent surfaces support BOTH a Better Auth session cookie AND
// `Authorization: Bearer <api-key>`. Mount their auth chain first so it isn't
// overridden by the cookie-only chain below.
app.use('/api/agent/*', bearerOrSessionMiddleware, requireAuth)
app.use('/api/mcp', bearerOrSessionMiddleware, requireAuth)
app.use('/api/mcp/*', bearerOrSessionMiddleware, requireAuth)
app.route('/api/agent/v1', agent)
app.route('/api/mcp', mcp)

// Populate user/session for every other API request, then mount Better Auth's
// own handler (sign-up / sign-in / sign-out / session). Auth routes stay public.
app.use('/api/*', sessionMiddleware)
app.on(['POST', 'GET'], '/api/auth/*', (c) => auth.handler(c.req.raw))

// Public, unauthenticated config the login screen needs before a user exists —
// e.g. which social providers are enabled. Registered before requireAuth so it
// stays reachable when signed out (same as /health).
app.get('/api/public-config', (c) => c.json({ socialProviders }))

// Read-only access to publicly shared boards and their assets. Registered
// before requireAuth so anonymous viewers can reach it; each handler gates on
// boards.isPublic internally.
app.route('/api/public', publicBoards)

// Everything else under /api requires a signed-in user.
app.use('/api/*', requireAuth)

app.route('/api/boards', boards)
app.route('/api/ai', ai)
app.route('/api/images', images)
app.route('/api/videos', videos)
app.route('/api/htmls', htmls)
app.route('/api/settings', settings)
app.route('/api/models', models)
app.route('/api/keys', keys)
app.route('/api/templates', templates)

const webDist = fileURLToPath(new URL('../../web/dist/', import.meta.url))
const indexHtmlPath = join(webDist, 'index.html')
const hasWebDist = existsSync(indexHtmlPath)

if (hasWebDist) {
  const indexHtml = readFileSync(indexHtmlPath, 'utf-8')
  app.use('/*', serveStatic({ root: webDist }))
  app.get('*', (c) => {
    if (c.req.path.startsWith('/api/')) return c.notFound()
    return c.html(indexHtml)
  })
} else {
  console.warn(`[api] web dist not found at ${webDist} — static serving disabled`)
}

const port = Number(process.env.PORT ?? process.env.API_PORT ?? 3001)
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[api] listening on http://localhost:${info.port}`)
})
