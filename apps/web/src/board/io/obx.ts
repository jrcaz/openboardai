import { unzipSync, zipSync, strToU8, strFromU8, type Zippable } from 'fflate'
import { nanoid } from 'nanoid'
import {
  ObxManifest,
  ObxBoard,
  ObxImageMeta,
  ObxVideoMeta,
  type UploadImageRequest,
  type UploadVideoRequest,
} from '@openboard-ai/shared'

export interface ParsedObx {
  manifest: ObxManifest
  title: string
  snapshot: Record<string, unknown>
  images: Array<{ oldId: string; meta: ObxImageMeta; bytes: Uint8Array }>
  videos: Array<{ oldId: string; meta: ObxVideoMeta; bytes: Uint8Array }>
}

export interface RemappedObx {
  snapshot: Record<string, unknown>
  imageUploads: Array<Omit<UploadImageRequest, 'boardId'>>
  videoUploads: Array<Omit<UploadVideoRequest, 'boardId'>>
}

export async function parseObx(buffer: ArrayBuffer): Promise<ParsedObx> {
  const u8 = new Uint8Array(buffer)
  let entries: Record<string, Uint8Array>
  try {
    entries = unzipSync(u8)
  } catch {
    throw new Error('File is not a valid .obx archive.')
  }

  const manifestRaw = entries['manifest.json']
  if (!manifestRaw) throw new Error('Missing manifest.json in .obx file.')
  const manifest = ObxManifest.parse(JSON.parse(strFromU8(manifestRaw)))

  const boardRaw = entries['board.json']
  if (!boardRaw) throw new Error('Missing board.json in .obx file.')
  const board = ObxBoard.parse(JSON.parse(strFromU8(boardRaw)))

  const images: ParsedObx['images'] = []
  const videos: ParsedObx['videos'] = []

  const imageIds = new Set<string>()
  const videoIds = new Set<string>()
  for (const path of Object.keys(entries)) {
    if (path.startsWith('assets/images/') && path.endsWith('.meta.json')) {
      const id = path.slice('assets/images/'.length, -'.meta.json'.length)
      imageIds.add(id)
    } else if (path.startsWith('assets/videos/') && path.endsWith('.meta.json')) {
      const id = path.slice('assets/videos/'.length, -'.meta.json'.length)
      videoIds.add(id)
    }
  }

  for (const oldId of imageIds) {
    const metaPath = `assets/images/${oldId}.meta.json`
    const meta = ObxImageMeta.parse(JSON.parse(strFromU8(entries[metaPath])))
    const bytes = findAssetBytes(entries, `assets/images/${oldId}.`)
    if (!bytes) throw new Error(`Missing bytes for image ${oldId} in .obx file.`)
    images.push({ oldId, meta, bytes })
  }
  for (const oldId of videoIds) {
    const metaPath = `assets/videos/${oldId}.meta.json`
    const meta = ObxVideoMeta.parse(JSON.parse(strFromU8(entries[metaPath])))
    const bytes = findAssetBytes(entries, `assets/videos/${oldId}.`)
    if (!bytes) throw new Error(`Missing bytes for video ${oldId} in .obx file.`)
    videos.push({ oldId, meta, bytes })
  }

  return { manifest, title: board.title, snapshot: board.snapshot, images, videos }
}

function findAssetBytes(
  entries: Record<string, Uint8Array>,
  prefix: string,
): Uint8Array | null {
  for (const [path, bytes] of Object.entries(entries)) {
    if (!path.startsWith(prefix)) continue
    if (path.endsWith('.meta.json')) continue
    return bytes
  }
  return null
}

export function remintAndRemap(parsed: ParsedObx): RemappedObx {
  const imageIdMap = new Map<string, string>()
  for (const img of parsed.images) imageIdMap.set(img.oldId, nanoid(12))

  const videoIdMap = new Map<string, string>()
  for (const vid of parsed.videos) videoIdMap.set(vid.oldId, nanoid(12))

  const snapshot = remapSnapshotIds(parsed.snapshot, imageIdMap, videoIdMap)

  const imageUploads = parsed.images.map((img) => ({
    id: imageIdMap.get(img.oldId)!,
    prompt: img.meta.prompt,
    model: img.meta.model,
    width: img.meta.width,
    height: img.meta.height,
    mediaType: img.meta.mediaType,
    bytesBase64: bytesToBase64(img.bytes),
  }))

  const videoUploads = parsed.videos.map((vid) => ({
    id: videoIdMap.get(vid.oldId)!,
    prompt: vid.meta.prompt,
    model: vid.meta.model,
    width: vid.meta.width,
    height: vid.meta.height,
    mediaType: vid.meta.mediaType,
    bytesBase64: bytesToBase64(vid.bytes),
    durationMs: vid.meta.durationMs,
    hasAudio: vid.meta.hasAudio,
    sourceImageId: vid.meta.sourceImageId
      ? imageIdMap.get(vid.meta.sourceImageId) ?? null
      : null,
  }))

  return { snapshot, imageUploads, videoUploads }
}

function remapSnapshotIds(
  snapshot: Record<string, unknown>,
  imageIdMap: Map<string, string>,
  videoIdMap: Map<string, string>,
): Record<string, unknown> {
  // Deep clone via JSON to avoid mutating the parsed object.
  const cloned = JSON.parse(JSON.stringify(snapshot)) as Record<string, unknown>
  const store = (cloned.store ?? cloned.records) as Record<string, unknown> | undefined
  if (!store || typeof store !== 'object') return cloned

  for (const record of Object.values(store)) {
    if (!record || typeof record !== 'object') continue
    const r = record as { typeName?: string; type?: string; props?: Record<string, unknown> }
    if (r.typeName !== 'shape' || !r.props) continue

    if (r.type === 'ai-image') {
      const oldId = r.props.imageId
      if (typeof oldId === 'string' && imageIdMap.has(oldId)) {
        r.props.imageId = imageIdMap.get(oldId)!
      }
    } else if (r.type === 'ai-video') {
      const oldVid = r.props.videoId
      if (typeof oldVid === 'string' && videoIdMap.has(oldVid)) {
        r.props.videoId = videoIdMap.get(oldVid)!
      }
      const oldSrc = r.props.sourceImageId
      if (typeof oldSrc === 'string' && imageIdMap.has(oldSrc)) {
        r.props.sourceImageId = imageIdMap.get(oldSrc)!
      }
    }
  }

  return cloned
}

export function bytesToBase64(u8: Uint8Array): string {
  // Chunked encoding to avoid call-stack limits with large assets.
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < u8.length; i += chunkSize) {
    const chunk = u8.subarray(i, Math.min(i + chunkSize, u8.length))
    binary += String.fromCharCode.apply(null, chunk as unknown as number[])
  }
  return btoa(binary)
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Defer revoke to give the browser time to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// Re-export zip primitives so tests / future tooling can build .obx files programmatically.
export { unzipSync, zipSync, strToU8, strFromU8, type Zippable }
