import { lt, sql } from 'drizzle-orm'
import { db, schema } from '../db/client.js'

const MAX_TTL_DAYS = 3650
const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000

let cachedTtlDays: number | null | undefined
let intervalHandle: ReturnType<typeof setInterval> | null = null
let shutdownRegistered = false

export function getBoardTtlDays(): number | null {
  if (cachedTtlDays !== undefined) return cachedTtlDays
  const raw = process.env.BOARD_TTL_DAYS
  if (raw === undefined || raw.trim() === '') {
    cachedTtlDays = null
    return null
  }
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0 || parsed > MAX_TTL_DAYS) {
    console.warn(
      `[cleanup] BOARD_TTL_DAYS="${raw}" is invalid (expected integer between 1 and ${MAX_TTL_DAYS}). Auto-delete disabled.`,
    )
    cachedTtlDays = null
    return null
  }
  cachedTtlDays = parsed
  return parsed
}

export async function deleteExpiredBoards(ttlDays: number): Promise<number> {
  const deleted = await db
    .delete(schema.boards)
    .where(lt(schema.boards.createdAt, sql`now() - make_interval(days => ${ttlDays})`))
    .returning({ id: schema.boards.id })
  return deleted.length
}

// Multi-instance safety: the delete is idempotent — concurrent runs from two
// API instances during a Railway rolling deploy will simply no-op the second
// run. If side effects (logs, webhooks, counters) are ever added to this job,
// wrap the body in `pg_try_advisory_lock` instead.
async function runOnce(ttlDays: number): Promise<void> {
  try {
    const count = await deleteExpiredBoards(ttlDays)
    if (count > 0) {
      console.log(`[cleanup] deleted ${count} boards older than ${ttlDays} days`)
    }
  } catch (err) {
    console.error('[cleanup] failed', err)
  }
}

export function startBoardCleanupJob(): void {
  const ttlDays = getBoardTtlDays()
  if (ttlDays === null) {
    console.log('[cleanup] disabled (BOARD_TTL_DAYS not set)')
    return
  }
  console.log(`[cleanup] enabled — boards older than ${ttlDays} days will be deleted every 6h`)

  void runOnce(ttlDays)
  intervalHandle = setInterval(() => {
    void runOnce(ttlDays)
  }, CLEANUP_INTERVAL_MS)

  if (!shutdownRegistered) {
    shutdownRegistered = true
    const stop = () => {
      if (intervalHandle) {
        clearInterval(intervalHandle)
        intervalHandle = null
      }
    }
    process.on('SIGTERM', stop)
    process.on('SIGINT', stop)
  }
}
