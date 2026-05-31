import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import {
  AgentAddItemRequest,
  AgentGenerateRequest,
  AgentMoveItemsRequest,
  type AgentBoardContent,
  type AgentBoardSummary,
  type AgentMoveItemsResponse,
} from '@openboard-ai/shared'
import {
  addTextToBoard,
  generateOnBoard,
  listBoards,
  moveItemsOnBoard,
  readBoard,
} from '../lib/agent-actions.js'
import type { AuthEnv } from '../middleware/auth.js'

export const agent = new Hono<AuthEnv>()

agent.get('/boards', async (c) => {
  const user = c.get('user')!
  const rows = await listBoards(user.id)
  return c.json(rows satisfies AgentBoardSummary[])
})

agent.get('/boards/:id', async (c) => {
  const user = c.get('user')!
  const id = c.req.param('id')
  const includeSnapshot = c.req.query('include') === 'snapshot'
  const board = await readBoard(user.id, id, { includeSnapshot })
  if (!board) return c.json({ error: 'not_found' }, 404)
  return c.json(board satisfies AgentBoardContent)
})

agent.post(
  '/boards/:id/items',
  zValidator('json', AgentAddItemRequest),
  async (c) => {
    const user = c.get('user')!
    const id = c.req.param('id')
    const body = c.req.valid('json')
    const result = await addTextToBoard(user.id, id, body)
    if (!result) return c.json({ error: 'not_found' }, 404)
    return c.json(result, 201)
  },
)

agent.post(
  '/boards/:id/items/move',
  zValidator('json', AgentMoveItemsRequest),
  async (c) => {
    const user = c.get('user')!
    const id = c.req.param('id')
    const body = c.req.valid('json')
    const result = await moveItemsOnBoard(user.id, id, body)
    if (!result) return c.json({ error: 'not_found' }, 404)
    return c.json(result satisfies AgentMoveItemsResponse)
  },
)

agent.post(
  '/boards/:id/generate',
  zValidator('json', AgentGenerateRequest),
  async (c) => {
    const user = c.get('user')!
    const id = c.req.param('id')
    const body = c.req.valid('json')
    const key = c.req.header('x-openrouter-key')?.trim()
    if (!key) {
      return c.json(
        {
          error: 'missing_openrouter_key',
          message:
            'Send your OpenRouter key in the X-OpenRouter-Key header. BYOK — we never store it.',
        },
        400,
      )
    }
    try {
      const result = await generateOnBoard(user.id, id, { ...body, openRouterKey: key })
      if (!result) return c.json({ error: 'not_found' }, 404)
      return c.json(result, 201)
    } catch (err) {
      console.error('[agent] generation failed', err)
      const message = err instanceof Error ? err.message : 'unknown'
      return c.json({ error: 'generation_failed', message }, 500)
    }
  },
)
