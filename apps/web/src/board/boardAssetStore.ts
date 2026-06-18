import { nanoid } from 'nanoid'
import type { TLAsset, TLAssetStore } from 'tldraw'
import type { UploadImageRequest, UploadVideoRequest } from '@openboard-ai/shared'

const OPENBOARD_ASSET_SRC_PREFIX = 'openboardai:'
const OPENBOARD_ASSET_META_KEY = 'openboardAsset'

type StoredAssetKind = 'image' | 'video'
type StoredAssetRef = { kind: StoredAssetKind; id: string }
type JsonValue = null | string | number | boolean | JsonValue[] | { [key: string]: JsonValue }
type JsonObject = { [key: string]: JsonValue }

export function toOpenBoardAssetSrc(kind: StoredAssetKind, id: string, assetBase = '/api'): string {
  const base = assetBase.replace(/\/$/, '')
  const collection = kind === 'image' ? 'images' : 'videos'
  return `${base}/${collection}/${encodeURIComponent(id)}`
}

export function toOpenBoardAssetMeta(kind: StoredAssetKind, id: string): JsonObject {
  return { [OPENBOARD_ASSET_META_KEY]: { kind, id } }
}

export function parseOpenBoardAssetSrc(
  src: string | null | undefined,
): StoredAssetRef | null {
  if (!src) return null

  if (src.startsWith(OPENBOARD_ASSET_SRC_PREFIX)) {
    const rest = src.slice(OPENBOARD_ASSET_SRC_PREFIX.length)
    const sep = rest.indexOf(':')
    if (sep === -1) return null
    const kind = rest.slice(0, sep)
    if (kind !== 'image' && kind !== 'video') return null
    try {
      return { kind, id: decodeURIComponent(rest.slice(sep + 1)) }
    } catch {
      return null
    }
  }

  const path = parsePathname(src)
  if (!path) return null
  const match = /^\/api\/(?:public\/)?(images|videos)\/([^/?#]+)$/.exec(path)
  if (!match) return null
  const kind = match[1] === 'images' ? 'image' : 'video'
  try {
    return { kind, id: decodeURIComponent(match[2]!) }
  } catch {
    return null
  }
}

export function getOpenBoardAssetRef(asset: TLAsset): StoredAssetRef | null {
  const raw = (asset.meta as Record<string, unknown> | undefined)?.[OPENBOARD_ASSET_META_KEY]
  if (
    raw &&
    typeof raw === 'object' &&
    'kind' in raw &&
    'id' in raw &&
    (raw.kind === 'image' || raw.kind === 'video') &&
    typeof raw.id === 'string'
  ) {
    return { kind: raw.kind, id: raw.id }
  }
  return parseOpenBoardAssetSrc(getMediaProps(asset).src)
}

export function resolveOpenBoardAssetSrc(
  src: string | null | undefined,
  assetBase = '/api',
): string | null {
  if (!src) return null
  const parsed = parseOpenBoardAssetSrc(src)
  if (!parsed) return src
  return toOpenBoardAssetSrc(parsed.kind, parsed.id, assetBase)
}

export function createBoardAssetStore(boardId: string, assetBase = '/api'): TLAssetStore {
  return {
    async upload(asset, file, abortSignal) {
      const kind = asset.type === 'video' ? 'video' : 'image'
      const id = nanoid(12)
      const bytesBase64 = await fileToBase64(file)
      const props = getMediaProps(asset)
      const common = {
        id,
        boardId,
        prompt: file.name || props.name || `Uploaded ${kind}`,
        model: 'upload',
        width: props.w,
        height: props.h,
        mediaType: props.mimeType || file.type || defaultMediaType(kind),
        bytesBase64,
        resultShapeId: null,
      }

      if (kind === 'video') {
        await uploadJson('/api/videos/upload', {
          ...common,
          durationMs: null,
          hasAudio: false,
          sourceImageId: null,
        } satisfies UploadVideoRequest, abortSignal)
      } else {
        await uploadJson('/api/images/upload', common satisfies UploadImageRequest, abortSignal)
      }

      return {
        src: toOpenBoardAssetSrc(kind, id, assetBase),
        meta: toOpenBoardAssetMeta(kind, id),
      }
    },
    resolve(asset) {
      const stored = getOpenBoardAssetRef(asset)
      if (stored) return toOpenBoardAssetSrc(stored.kind, stored.id, assetBase)
      return resolveOpenBoardAssetSrc(getMediaProps(asset).src, assetBase)
    },
    async remove() {
      // Board asset rows are cascade-deleted with the board. Individual removal
      // can be added later without affecting snapshot durability.
    },
  }
}

export function createReadonlyBoardAssetStore(assetBase = '/api'): TLAssetStore {
  return {
    async upload() {
      throw new Error('Cannot upload assets in a read-only board viewer.')
    },
    resolve(asset) {
      const stored = getOpenBoardAssetRef(asset)
      if (stored) return toOpenBoardAssetSrc(stored.kind, stored.id, assetBase)
      return resolveOpenBoardAssetSrc(getMediaProps(asset).src, assetBase)
    },
  }
}

export async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

function getMediaProps(asset: TLAsset): {
  h: number
  mimeType: string | null
  name: string | null
  src: string | null
  w: number
} {
  const props = asset.props as {
    h?: number
    mimeType?: string | null
    name?: string | null
    src?: string | null
    w?: number
  }
  return {
    h: positiveInt(props.h),
    mimeType: props.mimeType ?? null,
    name: props.name ?? null,
    src: props.src ?? null,
    w: positiveInt(props.w),
  }
}

function positiveInt(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 1
  return Math.max(1, Math.round(value))
}

function defaultMediaType(kind: StoredAssetKind): string {
  return kind === 'image' ? 'image/png' : 'video/mp4'
}

async function uploadJson(
  path: string,
  body: UploadImageRequest | UploadVideoRequest,
  signal?: AbortSignal,
) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status}${text ? `: ${text}` : ''}`)
  }
}

function parsePathname(src: string): string | null {
  if (src.startsWith('/')) return src.split(/[?#]/, 1)[0] || null
  try {
    return new URL(src).pathname
  } catch {
    return null
  }
}
