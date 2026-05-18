import { Hono } from 'hono'

export const settings = new Hono()

interface ValidateBody {
  key?: unknown
}

interface OpenRouterCreditsResponse {
  data?: {
    total_credits?: number
    total_usage?: number
  }
}

settings.post('/validate-key', async (c) => {
  let body: ValidateBody = {}
  try {
    body = (await c.req.json()) as ValidateBody
  } catch {
    return c.json({ valid: false, reason: 'bad-request' }, 400)
  }

  const key = typeof body.key === 'string' ? body.key.trim() : ''
  if (!key) {
    return c.json({ valid: false, reason: 'bad-request' }, 400)
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)

  try {
    const res = await fetch('https://openrouter.ai/api/v1/credits', {
      method: 'GET',
      headers: { Authorization: `Bearer ${key}` },
      signal: controller.signal,
    })

    if (res.status === 401 || res.status === 403) {
      return c.json({ valid: false, reason: 'unauthorized' as const })
    }
    if (!res.ok) {
      return c.json({ valid: false, reason: 'upstream' as const })
    }

    const data = (await res.json().catch(() => ({}))) as OpenRouterCreditsResponse
    const total = data?.data?.total_credits
    const used = data?.data?.total_usage
    const remaining =
      typeof total === 'number' && typeof used === 'number'
        ? Math.max(0, total - used)
        : undefined

    return c.json({ valid: true as const, credits: remaining })
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError'
    return c.json({ valid: false, reason: aborted ? ('timeout' as const) : ('network' as const) })
  } finally {
    clearTimeout(timer)
  }
})
