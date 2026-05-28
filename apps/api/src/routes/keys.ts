import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { createApiKey, listApiKeys, revokeApiKey } from '../lib/apikeys.js'
import type { AuthEnv } from '../middleware/auth.js'

export const keys = new Hono<AuthEnv>()

const CreateKeyRequest = z.object({
  name: z.string().trim().min(1).max(80),
})

keys.get('/', async (c) => {
  const user = c.get('user')!
  const rows = await listApiKeys(user.id)
  return c.json(rows)
})

keys.post('/', zValidator('json', CreateKeyRequest), async (c) => {
  const user = c.get('user')!
  const { name } = c.req.valid('json')
  const created = await createApiKey(user.id, name)
  // `plaintext` is returned ONCE on creation; the UI must show + offer copy
  // and the user is expected to store it themselves. Subsequent reads only
  // expose the prefix.
  return c.json(
    {
      id: created.id,
      name: created.name,
      prefix: created.prefix,
      plaintext: created.plaintext,
      createdAt: created.createdAt.toISOString(),
    },
    201,
  )
})

keys.delete('/:id', async (c) => {
  const user = c.get('user')!
  const id = c.req.param('id')
  const ok = await revokeApiKey(user.id, id)
  if (!ok) return c.json({ error: 'not_found' }, 404)
  return c.json({ ok: true })
})
