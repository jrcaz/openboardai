import type { TLStoreSnapshot } from 'tldraw'

export type ShapeTypeCounts = Record<string, number>

export function bucketPromptLength(length: number): '0-50' | '51-200' | '201-1000' | '1000+' {
  if (length <= 50) return '0-50'
  if (length <= 200) return '51-200'
  if (length <= 1000) return '201-1000'
  return '1000+'
}

export function bucketByteSize(bytes: number): '0-10k' | '10-100k' | '100k-500k' | '500k+' {
  if (bytes <= 10_000) return '0-10k'
  if (bytes <= 100_000) return '10-100k'
  if (bytes <= 500_000) return '100k-500k'
  return '500k+'
}

export function categorizeError(message: string): 'auth' | 'rate_limit' | 'timeout' | 'bad_request' | 'unknown' {
  const m = message.toLowerCase()
  if (m.includes('401') || m.includes('unauthorized') || m.includes('api key')) return 'auth'
  if (m.includes('429') || m.includes('rate limit')) return 'rate_limit'
  if (m.includes('timeout') || m.includes('timed out')) return 'timeout'
  if (m.includes('400') || m.includes('bad request')) return 'bad_request'
  return 'unknown'
}

/**
 * Walks a tldraw snapshot and returns a map of shape-type → count. Only counts
 * record types of `shape:*`; ignores camera, page, pointer, etc.
 */
export function countShapeTypes(
  snapshot: TLStoreSnapshot | Record<string, unknown> | null | undefined,
): { total: number; byType: ShapeTypeCounts } {
  const byType: ShapeTypeCounts = {}
  let total = 0
  if (!snapshot) return { total, byType }
  const store = (snapshot as { store?: Record<string, unknown> }).store ?? snapshot
  if (!store || typeof store !== 'object') return { total, byType }
  for (const value of Object.values(store)) {
    if (!value || typeof value !== 'object') continue
    const rec = value as { typeName?: string; type?: string }
    if (rec.typeName !== 'shape') continue
    const t = typeof rec.type === 'string' ? rec.type : 'unknown'
    byType[t] = (byType[t] ?? 0) + 1
    total += 1
  }
  return { total, byType }
}

export function snapshotSizeKb(snapshot: unknown): number {
  try {
    return Math.round(JSON.stringify(snapshot).length / 1024)
  } catch {
    return 0
  }
}
