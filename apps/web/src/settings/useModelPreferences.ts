import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { Modality } from '@openboard-ai/shared'

export const MODEL_PREFS_STORAGE = 'openboard-ai:models'

export interface ModelPreferences {
  text: string | null
  image: string | null
  video: string | null
}

const EMPTY: ModelPreferences = { text: null, image: null, video: null }

function read(): ModelPreferences {
  if (typeof window === 'undefined') return EMPTY
  try {
    const raw = window.localStorage.getItem(MODEL_PREFS_STORAGE)
    if (!raw) return EMPTY
    const parsed = JSON.parse(raw) as Partial<ModelPreferences>
    return {
      text: typeof parsed.text === 'string' && parsed.text ? parsed.text : null,
      image: typeof parsed.image === 'string' && parsed.image ? parsed.image : null,
      video: typeof parsed.video === 'string' && parsed.video ? parsed.video : null,
    }
  } catch {
    return EMPTY
  }
}

function write(prefs: ModelPreferences) {
  if (typeof window === 'undefined') return
  // Drop the entry entirely when empty to keep localStorage tidy.
  if (!prefs.text && !prefs.image && !prefs.video) {
    window.localStorage.removeItem(MODEL_PREFS_STORAGE)
    return
  }
  window.localStorage.setItem(MODEL_PREFS_STORAGE, JSON.stringify(prefs))
}

interface Ctx {
  preferences: ModelPreferences
  setPreference: (modality: Modality, id: string | null) => void
  clear: (modality: Modality) => void
}

const ModelPreferencesContext = createContext<Ctx | null>(null)

export function ModelPreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<ModelPreferences>(() => read())
  const isFirstRender = useRef(true)

  const setPreference = useCallback((modality: Modality, id: string | null) => {
    setPreferences((prev) => ({
      ...prev,
      [modality]: id && id.trim() ? id.trim() : null,
    }))
  }, [])

  const clear = useCallback((modality: Modality) => {
    setPreferences((prev) => ({ ...prev, [modality]: null }))
  }, [])

  // Persist as an effect so StrictMode's double-invoke of updaters can't lead
  // to redundant writes and the side-effect runs exactly once per change.
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    write(preferences)
  }, [preferences])

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== MODEL_PREFS_STORAGE) return
      setPreferences(read())
    }
    function onCleared() {
      setPreferences(read())
    }
    window.addEventListener('storage', onStorage)
    window.addEventListener(MODEL_PREF_CLEARED_EVENT, onCleared)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener(MODEL_PREF_CLEARED_EVENT, onCleared)
    }
  }, [])

  return createElement(
    ModelPreferencesContext.Provider,
    { value: { preferences, setPreference, clear } },
    children,
  )
}

export function useModelPreferences(): Ctx {
  const ctx = useContext(ModelPreferencesContext)
  if (!ctx) throw new Error('useModelPreferences must be used inside <ModelPreferencesProvider>')
  return ctx
}

/** Read directly without subscribing — useful from fetch hooks that aren't components. */
export function getModelPreference(modality: Modality): string | null {
  return read()[modality]
}

export const MODEL_PREF_CLEARED_EVENT = 'openboard-ai:model-pref-cleared'

/** Imperatively clear a stale preference (used when a generate call fails because the model is gone). */
export function clearModelPreference(modality: Modality): void {
  if (typeof window === 'undefined') return
  const current = read()
  const next: ModelPreferences = { ...current, [modality]: null }
  write(next)
  window.dispatchEvent(
    new CustomEvent(MODEL_PREF_CLEARED_EVENT, { detail: { modality } }),
  )
}

/**
 * Heuristic: should we drop the chosen model and fall back to default?
 * Triggers on common OpenRouter / SDK error phrasings.
 */
export function looksLikeBadModelError(message: string): boolean {
  const m = message.toLowerCase()
  return (
    m.includes('model not found') ||
    m.includes('no endpoints found') ||
    m.includes('not a valid model') ||
    m.includes('does not support') ||
    m.includes('model_unsupported') ||
    m.includes('unknown model') ||
    m.includes('invalid model')
  )
}
