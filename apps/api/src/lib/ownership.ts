import { and, eq, isNull } from 'drizzle-orm'
import { db, schema } from '../db/client.js'

/**
 * Returns the board row only if it exists AND is owned by `userId`, otherwise
 * null. Use for handlers that need the board's data behind an ownership check.
 */
export async function getOwnedBoard(boardId: string, userId: string) {
  const [row] = await db
    .select()
    .from(schema.boards)
    .where(and(eq(schema.boards.id, boardId), eq(schema.boards.userId, userId)))
    .limit(1)
  return row ?? null
}

/**
 * Lightweight ownership check — true when the board exists and belongs to the
 * user. Use for board-scoped writes (uploads, AI generation) where we only need
 * to authorize, not read the board.
 */
export async function userOwnsBoard(boardId: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: schema.boards.id })
    .from(schema.boards)
    .where(and(eq(schema.boards.id, boardId), eq(schema.boards.userId, userId)))
    .limit(1)
  return Boolean(row)
}

/**
 * Returns a legacy (pre-accounts) board's id + title only if it exists and has
 * no owner yet — i.e. it's available to be claimed. Returns null for boards
 * that don't exist or are already owned (by anyone), so callers can't use this
 * to probe ownership of someone else's board.
 */
export async function getClaimableBoard(boardId: string) {
  const [row] = await db
    .select({ id: schema.boards.id, title: schema.boards.title })
    .from(schema.boards)
    .where(and(eq(schema.boards.id, boardId), isNull(schema.boards.userId)))
    .limit(1)
  return row ?? null
}

/**
 * Atomically assigns ownership of an ownerless board to `userId`, returning the
 * updated row (or null if the board doesn't exist or was already claimed). The
 * `isNull(userId)` guard makes concurrent claims safe: only the first UPDATE
 * matches the WHERE clause; a racing second one returns no row.
 */
export async function claimBoard(boardId: string, userId: string) {
  const [row] = await db
    .update(schema.boards)
    .set({ userId, updatedAt: new Date() })
    .where(and(eq(schema.boards.id, boardId), isNull(schema.boards.userId)))
    .returning()
  return row ?? null
}
