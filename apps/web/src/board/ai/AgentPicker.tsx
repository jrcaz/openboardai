import { useEffect, useRef, useState } from 'react'
import type { Modality, SubAgent } from '@openboard-ai/shared'
import { useSubAgents } from '../../settings/useSubAgents'

interface Props {
  modality: Modality
  onManage: () => void
}

const THEME: Record<Modality, { text: string; bg: string; ring: string; dot: string }> = {
  text: {
    text: 'text-amber-700',
    bg: 'bg-yellow-50',
    ring: 'ring-amber-200',
    dot: 'bg-amber-500',
  },
  image: {
    text: 'text-orange-700',
    bg: 'bg-orange-50',
    ring: 'ring-orange-200',
    dot: 'bg-orange-500',
  },
  video: {
    text: 'text-amber-900',
    bg: 'bg-amber-50',
    ring: 'ring-amber-300',
    dot: 'bg-amber-800',
  },
}

export function AgentPicker({ modality, onManage }: Props) {
  const { agentsByModality, activeAgent, setActive } = useSubAgents()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const agents = agentsByModality(modality)
  const active = activeAgent(modality)
  const theme = THEME[modality]

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (!wrapRef.current) return
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  function commit(id: string | null) {
    setActive(modality, id)
    setOpen(false)
  }

  const pillLabel = active ? active.name : 'No agent'

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={active ? `Active agent: ${active.name}` : 'Choose a sub-agent'}
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-medium ring-1 transition ${
          open
            ? `bg-white ${theme.text} ${theme.ring} shadow-sm`
            : active
            ? `${theme.bg} ${theme.text} ring-transparent hover:ring-neutral-200/80`
            : 'bg-neutral-50 text-neutral-500 ring-neutral-200/60 hover:text-neutral-700'
        }`}
      >
        <span aria-hidden="true" className="text-[12px] leading-none">
          {active?.icon || (
            <svg
              className="h-2.5 w-2.5 opacity-80"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21a8 8 0 0 1 16 0" />
            </svg>
          )}
        </span>
        <span className="max-w-[140px] truncate">{pillLabel}</span>
        <svg
          className={`h-2.5 w-2.5 opacity-70 transition-transform ${open ? '-rotate-180' : ''}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      <div
        className={`absolute right-0 bottom-full mb-2 z-[400] w-[300px] origin-bottom-right rounded-xl border border-neutral-200/80 bg-white/95 shadow-[0_18px_48px_-12px_rgba(0,0,0,0.22)] backdrop-blur-md transition duration-150 ease-out ${
          open
            ? 'pointer-events-auto translate-y-0 scale-100 opacity-100'
            : 'pointer-events-none translate-y-1 scale-95 opacity-0'
        }`}
        role="dialog"
        aria-label="Choose a sub-agent"
      >
        <div className="flex items-center gap-1.5 px-3 pt-3 pb-2">
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${theme.dot}`} />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
            Sub-agents · {modality}
          </span>
        </div>

        <div className="max-h-[300px] overflow-y-auto px-1.5 pb-1.5">
          <AgentRow
            label="No agent"
            description="Use default system prompt"
            selected={!active}
            onClick={() => commit(null)}
          />
          {agents.length === 0 ? (
            <div className="px-3 py-4 text-center text-[11px] text-neutral-500">
              You have no {modality} agents yet.
            </div>
          ) : (
            agents.map((a) => (
              <AgentRow
                key={a.id}
                icon={a.icon}
                label={a.name}
                slug={a.slug}
                description={a.description}
                selected={active?.id === a.id}
                onClick={() => commit(a.id)}
              />
            ))
          )}
        </div>

        <div className="flex items-center justify-between border-t border-neutral-100 px-3 py-2 text-[11px]">
          <span className="text-neutral-500">
            {active ? `Active: ${active.name}` : 'No agent selected'}
          </span>
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              onManage()
            }}
            className={`font-medium ${theme.text} hover:underline`}
          >
            Manage agents…
          </button>
        </div>
      </div>
    </div>
  )
}

function AgentRow({
  icon,
  label,
  slug,
  description,
  selected,
  onClick,
}: {
  icon?: string
  label: string
  slug?: string
  description?: SubAgent['description']
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex w-full items-start gap-2 rounded-md px-2 py-2 text-left transition ${
        selected ? 'bg-neutral-100' : 'hover:bg-neutral-50'
      }`}
    >
      <span aria-hidden="true" className="mt-0.5 w-5 shrink-0 text-center text-[14px] leading-none">
        {icon || '·'}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[12.5px] font-semibold text-neutral-800">{label}</span>
          {slug && (
            <span className="shrink-0 rounded bg-neutral-100 px-1.5 py-px font-mono text-[9.5px] text-neutral-500">
              /{slug}
            </span>
          )}
        </div>
        {description && (
          <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-neutral-500">
            {description}
          </p>
        )}
      </div>
      {selected && (
        <svg
          className="mt-1 h-3.5 w-3.5 shrink-0 text-amber-600"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M20 6L9 17l-5-5" />
        </svg>
      )}
    </button>
  )
}
