import dns from 'node:dns/promises'
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import sanitizeHtml from 'sanitize-html'

const TIMEOUT_MS = 10_000
const MAX_BYTES = 500_000
const MAX_REDIRECTS = 3
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:'])
const ALLOWED_CONTENT_TYPES = new Set([
  'text/html',
  'text/plain',
  'text/markdown',
  'application/xhtml+xml',
  'application/json',
])

export type FetchResult =
  | {
      ok: true
      url: string
      finalUrl: string
      title: string | null
      contentType: string
      text: string
      truncated: boolean
    }
  | { ok: false; error: string }

function isPrivateIPv4(ip: string): boolean {
  if (!net.isIPv4(ip)) return false
  const parts = ip.split('.').map(Number)
  const a = parts[0]!
  const b = parts[1]!
  if (a === 0) return true // 0.0.0.0/8 (unspecified / "this network")
  if (a === 10) return true // 10.0.0.0/8 (private)
  if (a === 127) return true // 127.0.0.0/8 (loopback)
  if (a === 169 && b === 254) return true // 169.254.0.0/16 (link-local — includes cloud metadata 169.254.169.254)
  if (a === 172 && b >= 16 && b <= 31) return true // 172.16.0.0/12 (private)
  if (a === 192 && b === 168) return true // 192.168.0.0/16 (private)
  if (a === 100 && b >= 64 && b <= 127) return true // 100.64.0.0/10 (CGNAT)
  if (a >= 224) return true // 224.0.0.0/4 (multicast) + 240.0.0.0/4 (reserved)
  return false
}

function isPrivateIPv6(ip: string): boolean {
  if (!net.isIPv6(ip)) return false
  // Canonicalize via WHATWG URL — `dns.lookup` is not guaranteed to return the
  // RFC 5952 compressed form, so direct string compares against '::1' would
  // miss expanded variants like '0:0:0:0:0:0:0:1'.
  let norm: string
  try {
    norm = new URL(`http://[${ip}]/`).hostname
  } catch {
    norm = ip.toLowerCase()
  }
  if (norm === '::' || norm === '::1') return true
  const v4Mapped = norm.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (v4Mapped) return isPrivateIPv4(v4Mapped[1]!)
  // IPv4-mapped in hex form (WHATWG-normalized): ::ffff:7f00:1
  const v4Hex = norm.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/)
  if (v4Hex) {
    const hi = parseInt(v4Hex[1]!, 16)
    const lo = parseInt(v4Hex[2]!, 16)
    return isPrivateIPv4(
      `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`,
    )
  }
  if (/^f[cd][0-9a-f]{2}:/.test(norm)) return true // fc00::/7 (unique-local)
  if (/^fe[89ab][0-9a-f]:/.test(norm)) return true // fe80::/10 (link-local)
  return false
}

function isPrivateAddress(ip: string): boolean {
  return isPrivateIPv4(ip) || isPrivateIPv6(ip)
}

type Resolution =
  | { ok: true; address: string; family: 4 | 6 }
  | { ok: false; error: string }

// Resolve the hostname ONCE, validate every returned address, and return a
// single concrete IP to dial. The caller pins this IP into the request's
// `lookup` callback so the actual TCP connect cannot re-resolve and end up
// at a private address (DNS-rebinding TOCTOU).
async function resolveAndValidate(hostname: string): Promise<Resolution> {
  if (net.isIP(hostname)) {
    if (isPrivateAddress(hostname)) return { ok: false, error: 'blocked_private_address' }
    return { ok: true, address: hostname, family: net.isIPv4(hostname) ? 4 : 6 }
  }
  let addrs: { address: string; family: number }[]
  try {
    addrs = await dns.lookup(hostname, { all: true })
  } catch {
    return { ok: false, error: 'dns_lookup_failed' }
  }
  if (addrs.length === 0) return { ok: false, error: 'dns_no_records' }
  for (const a of addrs) {
    if (isPrivateAddress(a.address)) return { ok: false, error: 'blocked_private_address' }
  }
  // Prefer IPv4 when available — many container/cloud environments have v4
  // outbound but no working v6 path, and picking a v6 first would silently
  // time out.
  const chosen = addrs.find((a) => a.family === 4) ?? addrs[0]!
  return { ok: true, address: chosen.address, family: chosen.family === 6 ? 6 : 4 }
}

function parseContentTypeHeader(header: string | string[] | undefined): string {
  if (!header) return ''
  const value = Array.isArray(header) ? (header[0] ?? '') : header
  const [type] = value.toLowerCase().split(';')
  return (type ?? '').trim()
}

function extractTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  if (!m) return null
  const title = m[1]!.replace(/\s+/g, ' ').trim()
  return title ? title.slice(0, 200) : null
}

function htmlToText(html: string): string {
  const noComments = html.replace(/<!--[\s\S]*?-->/g, '')
  const stripped = sanitizeHtml(noComments, {
    allowedTags: [],
    allowedAttributes: {},
    // Drop the *contents* of these too — sanitize-html keeps inner text by
    // default, which would surface raw JS/CSS source as visible "text".
    nonTextTags: ['style', 'script', 'noscript', 'svg'],
  })
  return stripped.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
}

type HttpResponse = {
  status: number
  headers: http.IncomingHttpHeaders
  body: NodeJS.ReadableStream
}

function doRequest(
  url: URL,
  opts: {
    address: string
    family: 4 | 6
    signal: AbortSignal
    headers: Record<string, string>
  },
): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const isHttps = url.protocol === 'https:'
    const port = url.port ? Number(url.port) : isHttps ? 443 : 80
    // Dial the pre-validated IP directly (no DNS lookup happens inside
    // request — that's what closes the rebinding TOCTOU). The Host header
    // and TLS SNI still carry the original hostname so virtual hosting and
    // certificate validation work normally.
    const requestOptions: https.RequestOptions = {
      method: 'GET',
      host: opts.address,
      port,
      path: (url.pathname || '/') + url.search,
      family: opts.family,
      headers: {
        host: url.host,
        ...opts.headers,
      },
      ...(isHttps
        ? { servername: url.hostname, rejectUnauthorized: true }
        : {}),
    }
    let settled = false
    const lib = isHttps ? https : http
    const req = lib.request(requestOptions, (res) => {
      if (settled) return
      settled = true
      resolve({
        status: res.statusCode ?? 0,
        headers: res.headers,
        body: res,
      })
    })
    req.on('error', (err) => {
      if (settled) return
      settled = true
      reject(err)
    })
    const onAbort = () => {
      req.destroy(new DOMException('aborted', 'AbortError'))
    }
    if (opts.signal.aborted) {
      onAbort()
    } else {
      opts.signal.addEventListener('abort', onAbort, { once: true })
    }
    req.end()
  })
}

async function readCapped(
  body: NodeJS.ReadableStream,
): Promise<{ text: string; truncated: boolean }> {
  return new Promise((resolve, reject) => {
    const decoder = new TextDecoder('utf-8', { fatal: false })
    let bytes = 0
    let out = ''
    let done = false
    const finish = (truncated: boolean) => {
      if (done) return
      done = true
      resolve({ text: out, truncated })
    }
    body.on('data', (chunk: Buffer) => {
      if (done) return
      bytes += chunk.length
      if (bytes > MAX_BYTES) {
        const keep = chunk.length - (bytes - MAX_BYTES)
        if (keep > 0) out += decoder.decode(chunk.subarray(0, keep), { stream: false })
        body.removeAllListeners('data')
        body.removeAllListeners('end')
        // Keep the 'error' listener attached — destroy() may cause the
        // underlying socket to emit 'error', and an EventEmitter with no
        // 'error' listener throws. The `done` guard prevents double-resolve.
        ;(body as NodeJS.ReadableStream & { destroy?: () => void }).destroy?.()
        finish(true)
        return
      }
      out += decoder.decode(chunk, { stream: true })
    })
    body.on('end', () => {
      if (done) return
      out += decoder.decode()
      finish(false)
    })
    body.on('error', (err: Error) => {
      if (done) return
      done = true
      reject(err)
    })
  })
}

function drain(body: NodeJS.ReadableStream): void {
  ;(body as NodeJS.ReadableStream & { destroy?: () => void }).destroy?.()
}

export async function fetchUrlForModel(rawUrl: string): Promise<FetchResult> {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return { ok: false, error: 'invalid_url' }
  }
  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    return { ok: false, error: 'unsupported_protocol' }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    let currentUrl = url
    let redirects = 0
    while (true) {
      const resolution = await resolveAndValidate(currentUrl.hostname)
      if (!resolution.ok) return { ok: false, error: resolution.error }

      const response = await doRequest(currentUrl, {
        address: resolution.address,
        family: resolution.family,
        signal: controller.signal,
        headers: {
          'user-agent': 'openboard-ai-fetcher/1.0',
          accept:
            'text/html, text/plain, application/json, text/markdown, application/xhtml+xml;q=0.9, */*;q=0.1',
        },
      })

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.location
        drain(response.body)
        const loc = Array.isArray(location) ? location[0] : location
        if (!loc) return { ok: false, error: 'redirect_without_location' }
        if (++redirects > MAX_REDIRECTS) return { ok: false, error: 'too_many_redirects' }
        let nextUrl: URL
        try {
          nextUrl = new URL(loc, currentUrl)
        } catch {
          return { ok: false, error: 'invalid_redirect_target' }
        }
        if (!ALLOWED_PROTOCOLS.has(nextUrl.protocol)) {
          return { ok: false, error: 'unsupported_protocol' }
        }
        currentUrl = nextUrl
        continue
      }

      if (response.status < 200 || response.status >= 300) {
        drain(response.body)
        return { ok: false, error: `http_${response.status}` }
      }

      const contentType = parseContentTypeHeader(response.headers['content-type'])
      if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
        drain(response.body)
        return { ok: false, error: 'unsupported_content_type' }
      }

      const { text: raw, truncated } = await readCapped(response.body)

      const isHtml = contentType === 'text/html' || contentType === 'application/xhtml+xml'
      const title = isHtml ? extractTitle(raw) : null
      const text = isHtml ? htmlToText(raw) : raw

      return {
        ok: true,
        url: rawUrl,
        finalUrl: currentUrl.toString(),
        title,
        contentType,
        text,
        truncated,
      }
    }
  } catch (err) {
    console.error('[fetch_url] request failed', { url: rawUrl, err })
    if ((err as Error).name === 'AbortError') return { ok: false, error: 'timeout' }
    const message = err instanceof Error ? err.message : 'unknown'
    return { ok: false, error: `fetch_failed: ${message}` }
  } finally {
    clearTimeout(timer)
  }
}
