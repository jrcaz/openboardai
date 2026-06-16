import type {
  ApiKeySummary,
  BoardClaimStatus,
  BoardListResponse,
  BoardResponse,
  CreatedApiKey,
  Modality,
  ModelsResponse,
  PublicBoardResponse,
  ShareState,
  UploadAssetResponse,
  UploadImageRequest,
  UploadVideoRequest,
} from '@openboard-ai/shared'

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status}: ${body}`)
  }
  return res.json() as Promise<T>
}

export type ValidateKeyResponse =
  | { valid: true; credits?: number }
  | { valid: false; reason: 'unauthorized' | 'network' | 'timeout' | 'upstream' | 'bad-request' }

export const api = {
  // Public, pre-auth config the login screen reads (e.g. enabled social providers).
  getAuthConfig: () =>
    fetch('/api/public-config').then((r) =>
      json<{ socialProviders: { github: boolean } }>(r),
    ),

  listBoards: () => fetch('/api/boards').then((r) => json<BoardListResponse>(r)),

  createBoard: (title?: string) =>
    fetch('/api/boards', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title }),
    }).then((r) => json<BoardResponse>(r)),

  getBoard: (id: string) => fetch(`/api/boards/${id}`).then((r) => json<BoardResponse>(r)),

  // Anonymous, read-only fetch of a publicly shared board by its share token.
  getPublicBoard: (token: string) =>
    fetch(`/api/public/boards/${encodeURIComponent(token)}`).then((r) =>
      json<PublicBoardResponse>(r),
    ),

  // Toggle public sharing on/off. Enabling mints a share token if absent.
  setBoardPublic: (id: string, isPublic: boolean) =>
    fetch(`/api/boards/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ isPublic }),
    }).then((r) => json<BoardResponse>(r)),

  // Rotate the share token, permanently invalidating the previous public link.
  regenerateShareToken: (id: string) =>
    fetch(`/api/boards/${id}/share/regenerate`, { method: 'POST' }).then((r) =>
      json<ShareState>(r),
    ),

  // Whether a board that we can't open (404) is an ownerless legacy board the
  // current user is allowed to claim.
  getBoardClaimStatus: (id: string) =>
    fetch(`/api/boards/${id}/claim-status`).then((r) => json<BoardClaimStatus>(r)),

  // Take ownership of an ownerless board; resolves to the now-owned board.
  claimBoard: (id: string) =>
    fetch(`/api/boards/${id}/claim`, { method: 'POST' }).then((r) => json<BoardResponse>(r)),

  renameBoard: (id: string, title: string) =>
    fetch(`/api/boards/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title }),
    }).then((r) => json<BoardResponse>(r)),

  deleteBoard: (id: string) =>
    fetch(`/api/boards/${id}`, { method: 'DELETE' }).then((r) => json<{ ok: true }>(r)),

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
      throw new Error(`HTTP ${res.status}: ${body}`)
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

  // --- Programmatic-access API keys for external AI agents.
  // The plaintext secret is returned ONCE by `createApiKey` and never again.

  listApiKeys: () => fetch('/api/keys').then((r) => json<ApiKeySummary[]>(r)),

  createApiKey: (name: string) =>
    fetch('/api/keys', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    }).then((r) => json<CreatedApiKey>(r)),

  revokeApiKey: (id: string) =>
    fetch(`/api/keys/${id}`, { method: 'DELETE' }).then((r) =>
      json<{ ok: true }>(r),
    ),
}
