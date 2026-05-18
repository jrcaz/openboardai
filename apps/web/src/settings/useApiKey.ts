import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'

export const API_KEY_STORAGE = 'openboard-ai:openrouter-key'
export const API_KEY_CLEARED_EVENT = 'openboard-ai:key-cleared'

export function getOpenRouterKey(): string | null {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem(API_KEY_STORAGE)
}

interface ApiKeyContextValue {
  key: string | null
  setKey: (next: string | null) => void
}

const ApiKeyContext = createContext<ApiKeyContextValue | null>(null)

export function ApiKeyProvider({ children }: { children: ReactNode }) {
  const [key, setKeyState] = useState<string | null>(() => getOpenRouterKey())

  const setKey = useCallback((next: string | null) => {
    if (typeof window === 'undefined') return
    if (next) window.localStorage.setItem(API_KEY_STORAGE, next)
    else window.localStorage.removeItem(API_KEY_STORAGE)
    setKeyState(next)
  }, [])

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== API_KEY_STORAGE) return
      setKeyState(e.newValue)
    }
    function onCleared() {
      setKeyState(null)
    }
    window.addEventListener('storage', onStorage)
    window.addEventListener(API_KEY_CLEARED_EVENT, onCleared)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener(API_KEY_CLEARED_EVENT, onCleared)
    }
  }, [])

  return createElement(ApiKeyContext.Provider, { value: { key, setKey } }, children)
}

export function useApiKey(): ApiKeyContextValue {
  const ctx = useContext(ApiKeyContext)
  if (!ctx) throw new Error('useApiKey must be used inside <ApiKeyProvider>')
  return ctx
}

/**
 * Called from AI request hooks when the server returns 401 — clears the
 * stored key and pings ApiKeyProvider so the gate re-engages immediately.
 */
export function clearApiKey() {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(API_KEY_STORAGE)
  window.dispatchEvent(new Event(API_KEY_CLEARED_EVENT))
}
