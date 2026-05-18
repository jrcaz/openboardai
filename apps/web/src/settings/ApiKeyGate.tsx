import type { ReactNode } from 'react'
import { ApiKeyDialog } from './ApiKeyDialog'
import { useApiKey } from './useApiKey'

export function ApiKeyGate({ children }: { children: ReactNode }) {
  const { key } = useApiKey()
  if (!key) return <ApiKeyDialog mode="setup" />
  return <>{children}</>
}
