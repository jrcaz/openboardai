import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  SubAgentsStorage,
  type Modality,
  type SubAgent,
} from '@openboard-ai/shared'

export const SUB_AGENTS_STORAGE = 'openboard-ai:sub-agents'

type ActiveMap = SubAgentsStorage['activeByModality']

const EMPTY: SubAgentsStorage = {
  agents: [],
  activeByModality: { text: null, image: null, video: null },
}

function read(): SubAgentsStorage {
  if (typeof window === 'undefined') return EMPTY
  try {
    const raw = window.localStorage.getItem(SUB_AGENTS_STORAGE)
    if (!raw) return EMPTY
    const parsed = SubAgentsStorage.safeParse(JSON.parse(raw))
    if (!parsed.success) return EMPTY
    // Clean up dangling active references whose agent was deleted.
    const ids = new Set(parsed.data.agents.map((a) => a.id))
    const active: ActiveMap = {
      text: parsed.data.activeByModality.text && ids.has(parsed.data.activeByModality.text)
        ? parsed.data.activeByModality.text
        : null,
      image: parsed.data.activeByModality.image && ids.has(parsed.data.activeByModality.image)
        ? parsed.data.activeByModality.image
        : null,
      video: parsed.data.activeByModality.video && ids.has(parsed.data.activeByModality.video)
        ? parsed.data.activeByModality.video
        : null,
    }
    return { agents: parsed.data.agents, activeByModality: active }
  } catch {
    return EMPTY
  }
}

function write(state: SubAgentsStorage) {
  if (typeof window === 'undefined') return
  if (
    state.agents.length === 0 &&
    !state.activeByModality.text &&
    !state.activeByModality.image &&
    !state.activeByModality.video
  ) {
    window.localStorage.removeItem(SUB_AGENTS_STORAGE)
    return
  }
  window.localStorage.setItem(SUB_AGENTS_STORAGE, JSON.stringify(state))
}

export type NewSubAgentInput = Omit<SubAgent, 'id' | 'createdAt' | 'updatedAt'>
export type UpdateSubAgentInput = Partial<NewSubAgentInput>

interface Ctx {
  agents: SubAgent[]
  activeByModality: ActiveMap
  agentsByModality: (modality: Modality) => SubAgent[]
  activeAgent: (modality: Modality) => SubAgent | null
  setActive: (modality: Modality, id: string | null) => void
  create: (input: NewSubAgentInput) => SubAgent
  update: (id: string, patch: UpdateSubAgentInput) => void
  remove: (id: string) => void
  findBySlug: (modality: Modality, slug: string) => SubAgent | null
}

const SubAgentsContext = createContext<Ctx | null>(null)

function newId(): string {
  // 12 chars from crypto.randomUUID()-style alphabet; avoids extra dep.
  const r = Math.random().toString(36).slice(2, 8)
  const t = Date.now().toString(36).slice(-6)
  return `${t}${r}`
}

export function SubAgentsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SubAgentsStorage>(() => read())
  const isFirstRender = useRef(true)

  // Persist as effect to keep StrictMode double-invokes from double-writing.
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    write(state)
  }, [state])

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== SUB_AGENTS_STORAGE) return
      setState(read())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const setActive = useCallback((modality: Modality, id: string | null) => {
    setState((prev) => ({
      ...prev,
      activeByModality: { ...prev.activeByModality, [modality]: id },
    }))
  }, [])

  const create = useCallback((input: NewSubAgentInput): SubAgent => {
    const now = Date.now()
    const agent: SubAgent = { ...input, id: newId(), createdAt: now, updatedAt: now }
    setState((prev) => ({ ...prev, agents: [...prev.agents, agent] }))
    return agent
  }, [])

  const update = useCallback((id: string, patch: UpdateSubAgentInput) => {
    setState((prev) => ({
      ...prev,
      agents: prev.agents.map((a) =>
        a.id === id ? { ...a, ...patch, id: a.id, createdAt: a.createdAt, updatedAt: Date.now() } : a,
      ),
    }))
  }, [])

  const remove = useCallback((id: string) => {
    setState((prev) => {
      const active: ActiveMap = {
        text: prev.activeByModality.text === id ? null : prev.activeByModality.text,
        image: prev.activeByModality.image === id ? null : prev.activeByModality.image,
        video: prev.activeByModality.video === id ? null : prev.activeByModality.video,
      }
      return {
        agents: prev.agents.filter((a) => a.id !== id),
        activeByModality: active,
      }
    })
  }, [])

  const ctx = useMemo<Ctx>(
    () => ({
      agents: state.agents,
      activeByModality: state.activeByModality,
      agentsByModality: (modality) => state.agents.filter((a) => a.modality === modality),
      activeAgent: (modality) => {
        const id = state.activeByModality[modality]
        if (!id) return null
        return state.agents.find((a) => a.id === id) ?? null
      },
      findBySlug: (modality, slug) =>
        state.agents.find((a) => a.modality === modality && a.slug === slug) ?? null,
      setActive,
      create,
      update,
      remove,
    }),
    [state, setActive, create, update, remove],
  )

  return createElement(SubAgentsContext.Provider, { value: ctx }, children)
}

export function useSubAgents(): Ctx {
  const ctx = useContext(SubAgentsContext)
  if (!ctx) throw new Error('useSubAgents must be used inside <SubAgentsProvider>')
  return ctx
}

/** Non-hook accessor — used from fetch callbacks where hooks aren't available. */
export function getActiveAgent(modality: Modality): SubAgent | null {
  const state = read()
  const id = state.activeByModality[modality]
  if (!id) return null
  return state.agents.find((a) => a.id === id) ?? null
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32) || 'agent'
}
