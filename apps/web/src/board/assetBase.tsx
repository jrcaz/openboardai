import { createContext, useContext, type ReactNode } from 'react'

// AI-shape assets are served from owner-gated routes under `/api` in the editor
// and from token-scoped public, isPublic-gated routes in the shared read-only
// viewer. Shape components resolve their asset URLs against this base so the
// same components work in both contexts without knowing which they're in.
const AssetBaseContext = createContext<string>('/api')

export function publicBoardAssetBase(token: string): string {
  return `/api/public/boards/${encodeURIComponent(token)}`
}

export function AssetBaseProvider({
  base,
  children,
}: {
  base: string
  children: ReactNode
}) {
  return <AssetBaseContext.Provider value={base}>{children}</AssetBaseContext.Provider>
}

export function useAssetBase(): string {
  return useContext(AssetBaseContext)
}
