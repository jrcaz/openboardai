import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ai } from './routes/ai.js'
import { boards } from './routes/boards.js'
import { images } from './routes/images.js'
import { settings } from './routes/settings.js'
import { videos } from './routes/videos.js'

const app = new Hono()

app.use('*', logger())
app.use(
  '/api/*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'X-OpenRouter-Key'],
  }),
)

app.get('/health', (c) => c.json({ ok: true }))

app.route('/api/boards', boards)
app.route('/api/ai', ai)
app.route('/api/images', images)
app.route('/api/videos', videos)
app.route('/api/settings', settings)

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
