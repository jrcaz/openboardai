import type {
  BoardResponse,
  Modality,
  ModelsResponse,
  UploadAssetResponse,
  UploadImageRequest,
  UploadVideoRequest,
} from '@openboard-ai/shared'

export class ApiError extends Error {
  status: number
  body: string
  constructor(status: number, body: string) {
    super(`HTTP ${status}: ${body}`)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new ApiError(res.status, body)
  }
  return res.json() as Promise<T>
}

export type ValidateKeyResponse =
  | { valid: true; credits?: number }
  | { valid: false; reason: 'unauthorized' | 'network' | 'timeout' | 'upstream' | 'bad-request' }

export const api = {
  createBoard: (title?: string) =>
    fetch('/api/boards', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title }),
    }).then((r) => json<BoardResponse>(r)),

  getBoard: (id: string) => fetch(`/api/boards/${id}`).then((r) => json<BoardResponse>(r)),

  saveSnapshot: (id: string, snapshot: Record<string, unknown>) =>
    fetch(`/api/boards/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ snapshot }),
    }).then((r) => json<BoardResponse>(r)),

  exportBoard: async (id: string): Promise<Blob> => {
    const res = await fetch(`/api/boards/${id}/export`)
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new ApiError(res.status, body)
    }
    return res.blob()
  },

  deleteBoardAssets: (id: string) =>
    fetch(`/api/boards/${id}/assets`, { method: 'DELETE' }).then((r) =>
      json<{ ok: true }>(r),
    ),

  uploadImage: (req: UploadImageRequest) =>
    fetch('/api/images/upload', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(req),
    }).then((r) => json<UploadAssetResponse>(r)),

  uploadVideo: (req: UploadVideoRequest) =>
    fetch('/api/videos/upload', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(req),
    }).then((r) => json<UploadAssetResponse>(r)),

  validateKey: async (key: string): Promise<ValidateKeyResponse> => {
    try {
      const res = await fetch('/api/settings/validate-key', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key }),
      })
      if (!res.ok) return { valid: false, reason: 'network' }
      return (await res.json()) as ValidateKeyResponse
    } catch {
      return { valid: false, reason: 'network' }
    }
  },

  fetchModels: async (modality: Modality, apiKey: string): Promise<ModelsResponse> => {
    const res = await fetch(`/api/models?modality=${encodeURIComponent(modality)}`, {
      headers: { 'X-OpenRouter-Key': apiKey },
    })
    return json<ModelsResponse>(res)
  },
}
