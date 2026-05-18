import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
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

const port = Number(process.env.API_PORT ?? 3001)
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[api] listening on http://localhost:${info.port}`)
})
