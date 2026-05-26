import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'openboard-ai:auto-connect-arrows'

function readInitial(): boolean {
  if (typeof window === 'undefined') return true
  return window.localStorage.getItem(STORAGE_KEY) !== '0'
}

export function useAutoConnectArrows() {
  const [enabled, setEnabledState] = useState<boolean>(readInitial)

  const setEnabled = useCallback((next: boolean) => {
    if (typeof window !== 'undefined') {
      if (next) window.localStorage.removeItem(STORAGE_KEY)
      else window.localStorage.setItem(STORAGE_KEY, '0')
    }
    setEnabledState(next)
  }, [])

  const toggle = useCallback(() => setEnabled(!enabled), [enabled, setEnabled])

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== STORAGE_KEY) return
      setEnabledState(e.newValue !== '0')
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  return { enabled, setEnabled, toggle }
}
