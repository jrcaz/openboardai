import { createHash, randomBytes } from 'node:crypto'
import { and, desc, eq, isNull } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { db, schema } from '../db/client.js'

// Secrets are 32 bytes (256 bits) of randomness, base64url-encoded, with a
// fixed prefix that makes leaked keys easy to scan for in logs/repos.
const KEY_PREFIX = 'obai_'
const KEY_RAW_BYTES = 32

function hash(key: string): string {
  return createHash('sha256').update(key).digest('hex')
}

export function generateRawKey(): { plaintext: string; prefix: string; keyHash: string } {
  const body = randomBytes(KEY_RAW_BYTES).toString('base64url')
  const plaintext = `${KEY_PREFIX}${body}`
  return {
    plaintext,
    prefix: plaintext.slice(0, 12),
    keyHash: hash(plaintext),
  }
}

export interface CreatedApiKey {
  id: string
  name: string
  prefix: string
  plaintext: string
  createdAt: Date
}

export async function createApiKey(userId: string, name: string): Promise<CreatedApiKey> {
  const { plaintext, prefix, keyHash } = generateRawKey()
  const id = nanoid(12)
  const [row] = await db
    .insert(schema.apiKeys)
    .values({ id, userId, name, prefix, keyHash })
    .returning()
  return {
    id: row!.id,
    name: row!.name,
    prefix: row!.prefix,
    plaintext,
    createdAt: row!.createdAt,
  }
}

export interface ApiKeySummary {
  id: string
  name: string
  prefix: string
  createdAt: string
  lastUsedAt: string | null
}

export async function listApiKeys(userId: string): Promise<ApiKeySummary[]> {
  const rows = await db
    .select()
    .from(schema.apiKeys)
    .where(and(eq(schema.apiKeys.userId, userId), isNull(schema.apiKeys.revokedAt)))
    .orderBy(desc(schema.apiKeys.createdAt))
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    prefix: r.prefix,
    createdAt: r.createdAt.toISOString(),
    lastUsedAt: r.lastUsedAt?.toISOString() ?? null,
  }))
}

export async function revokeApiKey(userId: string, id: string): Promise<boolean> {
  // Soft-delete by setting revokedAt — preserves prefix for audit trail in case
  // someone needs to correlate to an old request log entry. Verification gates
  // on `revokedAt IS NULL` so revoked keys stop authenticating immediately.
  const [row] = await db
    .update(schema.apiKeys)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(schema.apiKeys.id, id),
        eq(schema.apiKeys.userId, userId),
        isNull(schema.apiKeys.revokedAt),
      ),
    )
    .returning({ id: schema.apiKeys.id })
  return Boolean(row)
}

/**
 * Looks up the owning userId for a bearer key. Returns null if the key is
 * missing/revoked. Touches `lastUsedAt` so the UI can show stale keys.
 */
export async function resolveApiKey(plaintext: string): Promise<{ userId: string } | null> {
  if (!plaintext.startsWith(KEY_PREFIX)) return null
  const keyHash = hash(plaintext)
  const [row] = await db
    .select({ id: schema.apiKeys.id, userId: schema.apiKeys.userId })
    .from(schema.apiKeys)
    .where(and(eq(schema.apiKeys.keyHash, keyHash), isNull(schema.apiKeys.revokedAt)))
    .limit(1)
  if (!row) return null
  // Fire-and-forget — failure to update lastUsedAt should never block auth.
  void db
    .update(schema.apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(schema.apiKeys.id, row.id))
    .catch(() => {})
  return { userId: row.userId }
}
