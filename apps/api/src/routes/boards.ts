import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { CreateBoardRequest, UpdateBoardRequest } from '@openboard-ai/shared'
import { db, schema } from '../db/client.js'

export const boards = new Hono()

boards.post('/', zValidator('json', CreateBoardRequest), async (c) => {
  const { title } = c.req.valid('json')
  const id = nanoid(12)
  const [row] = await db
    .insert(schema.boards)
    .values({ id, title: title ?? 'Untitled' })
    .returning()
  return c.json(serialize(row), 201)
})

boards.get('/:id', async (c) => {
  const id = c.req.param('id')
  const [row] = await db.select().from(schema.boards).where(eq(schema.boards.id, id)).limit(1)
  if (!row) return c.json({ error: 'not_found' }, 404)
  return c.json(serialize(row))
})

boards.patch('/:id', zValidator('json', UpdateBoardRequest), async (c) => {
  const id = c.req.param('id')
  const patch = c.req.valid('json')
  const [row] = await db
    .update(schema.boards)
    .set({
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.snapshot !== undefined ? { snapshot: patch.snapshot } : {}),
      updatedAt: new Date(),
    })
    .where(eq(schema.boards.id, id))
    .returning()
  if (!row) return c.json({ error: 'not_found' }, 404)
  return c.json(serialize(row))
})

function serialize(row: typeof schema.boards.$inferSelect) {
  return {
    id: row.id,
    title: row.title,
    snapshot: row.snapshot,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}
