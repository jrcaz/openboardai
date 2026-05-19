import { Hono } from 'hono'
import { createHash } from 'node:crypto'
import type { ModelInfo, ModelsResponse, Modality } from '@openboard-ai/shared'
import { DEFAULTS } from '../ai/openrouter.js'

export const models = new Hono()

// ---------- /api/v1/models (chat-style, used for text + image) ----------

interface OpenRouterArchitecture {
  input_modalities?: string[]
  output_modalities?: string[]
  modality?: string
}

interface OpenRouterPricing {
  prompt?: string | number
  completion?: string | number
  image?: string | number
  request?: string | number
}

interface OpenRouterChatModel {
  id: string
  name?: string
  description?: string | null
  context_length?: number | null
  architecture?: OpenRouterArchitecture
  pricing?: OpenRouterPricing
  top_provider?: { name?: string } | null
}

// ---------- /api/v1/videos/models (separate catalog for video generation) ----------

interface OpenRouterVideoModel {
  id: string
  name?: string
  description?: string | null
  supported_resolutions?: string[]
  supported_aspect_ratios?: string[]
  supported_durations?: number[]
  supported_frame_images?: string[]
  generate_audio?: unknown
  pricing_skus?: Record<string, string | number | null | undefined>
}

interface CacheEntry {
  at: number
  data: ModelInfo[]
}

const TTL_MS = 10 * 60 * 1000
const cache = new Map<string, CacheEntry>()

function keyHash(apiKey: string): string {
  return createHash('sha1').update(apiKey).digest('hex').slice(0, 12)
}

function toNumber(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    return Number.isFinite(n) ? n : undefined
  }
  return undefined
}

function normalizeOutputs(arch?: OpenRouterArchitecture): string[] {
  const out = arch?.output_modalities
  if (Array.isArray(out) && out.length > 0) return out
  if (typeof arch?.modality === 'string') {
    const after = arch.modality.split('->').pop()?.trim()
    if (after) return after.split('+').map((s) => s.trim()).filter(Boolean)
  }
  return ['text']
}

function normalizeInputs(arch?: OpenRouterArchitecture): string[] {
  const inp = arch?.input_modalities
  if (Array.isArray(inp) && inp.length > 0) return inp
  if (typeof arch?.modality === 'string') {
    const before = arch.modality.split('->').shift()?.trim()
    if (before) return before.split('+').map((s) => s.trim()).filter(Boolean)
  }
  return ['text']
}

function providerFromId(id: string): string | null {
  const head = id.split('/')[0]
  if (!head) return null
  // Strip leading "~" used for routed slugs (e.g. "~google/gemini-pro-latest").
  return head.replace(/^~/, '') || null
}

function normalizeChat(raw: OpenRouterChatModel, modality: Modality): ModelInfo {
  return {
    id: raw.id,
    name: raw.name?.trim() || raw.id,
    description: raw.description?.trim() || null,
    contextLength:
      typeof raw.context_length === 'number' && Number.isFinite(raw.context_length)
        ? raw.context_length
        : null,
    inputModalities: normalizeInputs(raw.architecture),
    outputModalities: normalizeOutputs(raw.architecture),
    pricing: {
      ...(toNumber(raw.pricing?.prompt) !== undefined
        ? { prompt: toNumber(raw.pricing?.prompt) as number }
        : {}),
      ...(toNumber(raw.pricing?.completion) !== undefined
        ? { completion: toNumber(raw.pricing?.completion) as number }
        : {}),
      ...(toNumber(raw.pricing?.image) !== undefined
        ? { image: toNumber(raw.pricing?.image) as number }
        : {}),
      ...(toNumber(raw.pricing?.request) !== undefined
        ? { request: toNumber(raw.pricing?.request) as number }
        : {}),
    },
    provider: raw.top_provider?.name?.trim() || providerFromId(raw.id),
    isDefault: raw.id === DEFAULTS[modality],
  }
}

function normalizeVideo(raw: OpenRouterVideoModel): ModelInfo {
  // Video pricing on OpenRouter is metered per-output-second. We surface the
  // 720p rate (or the lowest available) as `pricing.request` interpreted as
  // dollars-per-second on the client — that keeps the shared ModelInfo type
  // unchanged while still showing meaningful pricing to the user.
  const sku = raw.pricing_skus ?? {}
  const cents720 = toNumber(sku.cents_per_video_output_second_720p)
  const cents480 = toNumber(sku.cents_per_video_output_second_480p)
  const cents1080 = toNumber(sku.cents_per_video_output_second_1080p)
  const cents = cents720 ?? cents480 ?? cents1080
  const dollarsPerSecond = typeof cents === 'number' ? cents / 100 : undefined

  const acceptsImageInput =
    Array.isArray(raw.supported_frame_images) && raw.supported_frame_images.length > 0

  return {
    id: raw.id,
    name: raw.name?.trim() || raw.id,
    description: raw.description?.trim() || null,
    contextLength: null,
    inputModalities: acceptsImageInput ? ['text', 'image'] : ['text'],
    outputModalities: ['video'],
    pricing: dollarsPerSecond !== undefined ? { request: dollarsPerSecond } : {},
    provider: providerFromId(raw.id),
    isDefault: raw.id === DEFAULTS.video,
  }
}

function sortModels(list: ModelInfo[]): ModelInfo[] {
  return list.sort((a, b) => {
    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1
    const ap = a.provider ?? ''
    const bp = b.provider ?? ''
    if (ap !== bp) return ap.localeCompare(bp)
    return a.name.localeCompare(b.name)
  })
}

async function fetchUpstream<T>(path: string, apiKey: string, signal: AbortSignal): Promise<{ status: number; body: T | null }> {
  const res = await fetch(`https://openrouter.ai${path}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${apiKey}` },
    signal,
  })
  if (!res.ok) return { status: res.status, body: null }
  const body = (await res.json().catch(() => null)) as T | null
  return { status: res.status, body }
}

async function loadModelsForModality(
  modality: Modality,
  apiKey: string,
  signal: AbortSignal,
): Promise<{ ok: true; data: ModelInfo[] } | { ok: false; status: number; message?: string }> {
  if (modality === 'video') {
    const { status, body } = await fetchUpstream<{ data?: OpenRouterVideoModel[] }>(
      '/api/v1/videos/models',
      apiKey,
      signal,
    )
    if (status === 401 || status === 403) return { ok: false, status: 401 }
    if (!body) return { ok: false, status: 502, message: `OpenRouter ${status}` }
    const raws = Array.isArray(body.data) ? body.data : []
    const data = raws.filter((r) => r?.id).map((r) => normalizeVideo(r))
    return { ok: true, data: sortModels(data) }
  }

  // text, image, and audio all come from /v1/models. Filter by
  // output_modalities for text/image; audio requires audio-in / text-out.
  const { status, body } = await fetchUpstream<{ data?: OpenRouterChatModel[] }>(
    '/api/v1/models',
    apiKey,
    signal,
  )
  if (status === 401 || status === 403) return { ok: false, status: 401 }
  if (!body) return { ok: false, status: 502, message: `OpenRouter ${status}` }
  const raws = Array.isArray(body.data) ? body.data : []
  const data: ModelInfo[] = []
  for (const r of raws) {
    if (!r?.id) continue
    const inputs = normalizeInputs(r.architecture)
    const outputs = normalizeOutputs(r.architecture)
    if (modality === 'audio') {
      if (!inputs.includes('audio')) continue
      if (!outputs.includes('text')) continue
    } else if (!outputs.includes(modality)) {
      continue
    }
    data.push(normalizeChat(r, modality))
  }
  return { ok: true, data: sortModels(data) }
}

models.get('/', async (c) => {
  const key = c.req.header('x-openrouter-key')?.trim()
  if (!key) return c.json({ error: 'missing-openrouter-key' }, 401)

  const raw = c.req.query('modality')
  if (raw !== 'text' && raw !== 'image' && raw !== 'video' && raw !== 'audio') {
    return c.json(
      { error: 'bad-request', message: 'modality must be text|image|video|audio' },
      400,
    )
  }
  const modality: Modality = raw

  const cacheKey = `${modality}:${keyHash(key)}`
  const cached = cache.get(cacheKey)
  if (cached && Date.now() - cached.at < TTL_MS) {
    const body: ModelsResponse = { data: cached.data, cachedAt: cached.at }
    return c.json(body)
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10000)

  try {
    const result = await loadModelsForModality(modality, key, controller.signal)
    if (!result.ok) {
      if (result.status === 401) return c.json({ error: 'unauthorized' }, 401)
      return c.json({ error: 'upstream', message: result.message ?? 'upstream error' }, 502)
    }
    const at = Date.now()
    // Evict any entries we've held past 2× TTL so a busy deployment can't
    // grow this Map without bound across many distinct API keys.
    for (const [k, entry] of cache) {
      if (at - entry.at > TTL_MS * 2) cache.delete(k)
    }
    cache.set(cacheKey, { at, data: result.data })
    const out: ModelsResponse = { data: result.data, cachedAt: at }
    return c.json(out)
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError'
    return c.json(
      { error: aborted ? 'timeout' : 'network', message: err instanceof Error ? err.message : 'unknown' },
      502,
    )
  } finally {
    clearTimeout(timer)
  }
})
