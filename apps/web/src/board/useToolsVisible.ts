import { useCallback, useEffect, useState } from 'react'
import { track } from '../analytics/posthog'

const STORAGE_KEY = 'openboard-ai:tools-visible'

function readInitial(): boolean {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(STORAGE_KEY) === '1'
}

export function useToolsVisible() {
  const [visible, setVisibleState] = useState<boolean>(readInitial)

  const setVisible = useCallback((next: boolean) => {
    if (typeof window !== 'undefined') {
      if (next) window.localStorage.setItem(STORAGE_KEY, '1')
      else window.localStorage.removeItem(STORAGE_KEY)
    }
    setVisibleState(next)
  }, [])

  const toggle = useCallback(() => {
    setVisible(!visible)
    track('tools_panel_toggled', { visible: !visible })
  }, [visible, setVisible])

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== STORAGE_KEY) return
      setVisibleState(e.newValue === '1')
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  return { visible, setVisible, toggle }
}
