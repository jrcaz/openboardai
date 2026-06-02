import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { ANALYTICS_OPT_OUT_STORAGE, isOptedOut, setOptedOut } from './posthog'

interface AnalyticsContextValue {
  optedOut: boolean
  setOptedOut: (next: boolean) => void
}

const AnalyticsContext = createContext<AnalyticsContextValue | null>(null)

export function AnalyticsProvider({ children }: { children: ReactNode }) {
  const [optedOut, setOptedOutState] = useState<boolean>(() => isOptedOut())

  const update = useCallback((next: boolean) => {
    setOptedOut(next)
    setOptedOutState(isOptedOut())
  }, [])

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== ANALYTICS_OPT_OUT_STORAGE) return
      setOptedOutState(isOptedOut())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  return (
    <AnalyticsContext.Provider value={{ optedOut, setOptedOut: update }}>
      {children}
    </AnalyticsContext.Provider>
  )
}

export function useAnalytics(): AnalyticsContextValue {
  const ctx = useContext(AnalyticsContext)
  if (!ctx) throw new Error('useAnalytics must be used inside <AnalyticsProvider>')
  return ctx
}
