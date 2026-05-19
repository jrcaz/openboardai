import { useCallback, useEffect, useRef, useState } from 'react'
import type { Modality, ModelInfo } from '@openboard-ai/shared'
import { api } from '../../lib/api'
import { getOpenRouterKey } from '../../settings/useApiKey'

const CACHE_TTL_MS = 10 * 60 * 1000

interface CacheEntry {
  at: number
  data: ModelInfo[]
}

// Cache key includes a short prefix of the API key so swapping keys forces a
// fresh fetch instead of returning stale results from the previous account.
function cacheKey(modality: Modality, apiKey: string): string {
  return `${modality}:${apiKey.slice(0, 8)}`
}

const cache = new Map<string, CacheEntry>()
const inflight = new Map<string, Promise<ModelInfo[]>>()

async function fetchOnce(modality: Modality, apiKey: string): Promise<ModelInfo[]> {
  const k = cacheKey(modality, apiKey)
  const existing = inflight.get(k)
  if (existing) return existing

  const promise = (async () => {
    const res = await api.fetchModels(modality, apiKey)
    return res.data
  })()
  inflight.set(k, promise)
  try {
    const data = await promise
    cache.set(k, { at: Date.now(), data })
    return data
  } finally {
    inflight.delete(k)
  }
}

interface Options {
  enabled: boolean
}

interface Result {
  models: ModelInfo[]
  loading: boolean
  error: string | null
  refresh: () => void
}

export function useOpenRouterModels(modality: Modality, { enabled }: Options): Result {
  const apiKey = getOpenRouterKey() ?? ''
  const [models, setModels] = useState<ModelInfo[]>(() =>
    apiKey ? cache.get(cacheKey(modality, apiKey))?.data ?? [] : [],
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const load = useCallback(
    async (force: boolean) => {
      const key = getOpenRouterKey()
      if (!key) {
        setError('missing-openrouter-key')
        return
      }
      const k = cacheKey(modality, key)
      const cached = cache.get(k)
      if (!force && cached && Date.now() - cached.at < CACHE_TTL_MS) {
        setModels(cached.data)
        return
      }
      setLoading(true)
      setError(null)
      try {
        if (force) cache.delete(k)
        const data = await fetchOnce(modality, key)
        if (!mounted.current) return
        setModels(data)
      } catch (err) {
        if (!mounted.current) return
        setError(err instanceof Error ? err.message : 'Failed to load models')
      } finally {
        if (mounted.current) setLoading(false)
      }
    },
    [modality],
  )

  useEffect(() => {
    if (!enabled) return
    void load(false)
  }, [enabled, load])

  const refresh = useCallback(() => {
    void load(true)
  }, [load])

  return { models, loading, error, refresh }
}
