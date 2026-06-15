import { useEffect, useMemo, useRef, useState } from 'react'
import type { Modality, ModelInfo } from '@openboard-ai/shared'
import { useApiKey } from '../../settings/useApiKey'
import { useModelPreferences } from '../../settings/useModelPreferences'
import { useOpenRouterModels } from './useOpenRouterModels'

interface Props {
  modality: Modality
}

// Per-modality theme — yellow/amber/orange differentiation in the warm family
// so the picker visually belongs to the active mode.
const THEME: Record<
  Modality,
  {
    text: string
    bg: string
    ring: string
    chip: string
    accent: string
    label: string
  }
> = {
  text: {
    text: 'text-amber-700',
    bg: 'bg-yellow-50',
    ring: 'ring-amber-200',
    chip: 'bg-yellow-100 text-amber-800',
    accent: 'text-amber-600',
    label: 'Text',
  },
  image: {
    text: 'text-orange-700',
    bg: 'bg-orange-50',
    ring: 'ring-orange-200',
    chip: 'bg-orange-100 text-orange-700',
    accent: 'text-orange-600',
    label: 'Image',
  },
  video: {
    text: 'text-amber-900',
    bg: 'bg-amber-50',
    ring: 'ring-amber-300',
    chip: 'bg-amber-100 text-amber-900',
    accent: 'text-amber-800',
    label: 'Video',
  },
}

function shortName(id: string): string {
  const tail = id.split('/').pop() ?? id
  return tail.length > 22 ? `${tail.slice(0, 21)}…` : tail
}

function formatPrice(m: ModelInfo, modality: Modality): string {
  const p = m.pricing
  if (modality === 'text') {
    const prompt = p.prompt ?? 0
    const completion = p.completion ?? p.prompt ?? 0
    if (!prompt && !completion) return 'Free'
    // OpenRouter prices are per-token. Display per-million.
    return `$${(prompt * 1_000_000).toFixed(2)} / $${(completion * 1_000_000).toFixed(2)} per M`
  }
  if (modality === 'image') {
    if (p.image != null) return `$${p.image.toFixed(4)} / image`
    if (p.request != null) return `$${p.request.toFixed(4)} / request`
    return '—'
  }
  // Video pricing comes back as dollars-per-output-second (server normalizes
  // OpenRouter's `pricing_skus.cents_per_video_output_second_*` into `request`).
  if (p.request != null) return `$${p.request.toFixed(2)} / sec`
  return '—'
}

function formatContext(n: number | null): string {
  if (!n) return ''
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M ctx`
  if (n >= 1000) return `${Math.round(n / 1000)}K ctx`
  return `${n} ctx`
}

export function ModelPicker({ modality }: Props) {
  const { key: apiKey } = useApiKey()
  const { preferences, setPreference } = useModelPreferences()
  const selectedId = preferences[modality]

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)

  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const theme = THEME[modality]
  const disabled = !apiKey

  const { models, loading, error, refresh } = useOpenRouterModels(modality, {
    enabled: open && !disabled,
  })

  // Debounce search input.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim().toLowerCase()), 120)
    return () => clearTimeout(t)
  }, [query])

  // Reset highlight when filtered list changes.
  useEffect(() => {
    setActiveIndex(0)
  }, [debounced, models.length])

  // Filter + sort. Default-first is already applied server-side.
  const filtered = useMemo(() => {
    if (!debounced) return models
    return models.filter((m) => {
      return (
        m.id.toLowerCase().includes(debounced) ||
        m.name.toLowerCase().includes(debounced) ||
        (m.description?.toLowerCase().includes(debounced) ?? false) ||
        (m.provider?.toLowerCase().includes(debounced) ?? false)
      )
    })
  }, [models, debounced])

  // Click outside closes; Escape closes and returns focus to the trigger.
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

  // Autofocus search on open.
  useEffect(() => {
    if (open) {
      // Defer so the popover is mounted.
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  // Scroll active row into view.
  useEffect(() => {
    if (!open || !listRef.current) return
    const el = listRef.current.querySelector<HTMLElement>(`[data-row-index="${activeIndex}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, open])

  function commit(id: string | null) {
    setPreference(modality, id)
    setOpen(false)
    setQuery('')
  }

  function onListKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(filtered.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const pick = filtered[activeIndex]
      if (pick) commit(pick.id)
    }
  }

  // Intercept arrows/Enter on the search input so the user can type then
  // immediately move into the list — the input would otherwise swallow them
  // for cursor positioning.
  function onSearchKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter') {
      onListKey(e)
    }
  }

  // Pill label
  const defaultModel = models.find((m) => m.isDefault)
  const activeModel =
    (selectedId && models.find((m) => m.id === selectedId)) ?? null
  const pillLabel = selectedId
    ? shortName(selectedId)
    : defaultModel
    ? shortName(defaultModel.id)
    : 'default'

  return (
    <div ref={wrapRef} className="relative min-w-0 flex-none">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
        title={disabled ? 'Set OpenRouter key first' : `Choose ${theme.label.toLowerCase()} model`}
        className={`inline-flex max-w-[180px] items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-medium ring-1 transition sm:max-w-[220px] ${
          open
            ? `bg-white ${theme.text} ${theme.ring} shadow-sm`
            : selectedId
            ? `${theme.bg} ${theme.text} ring-transparent hover:ring-neutral-200/80`
            : 'bg-neutral-50 text-neutral-500 ring-neutral-200/60 hover:text-neutral-700'
        } disabled:cursor-not-allowed disabled:opacity-50`}
      >
        <svg
          className="h-2.5 w-2.5 opacity-80"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 2l2.39 4.84L20 8l-4 3.9.94 5.48L12 14.77l-4.94 2.6L8 11.9 4 8l5.61-1.16L12 2z" />
        </svg>
        <span className="min-w-0 truncate">{pillLabel}</span>
        {!selectedId && (
          <span className="text-[9.5px] text-neutral-400">· default</span>
        )}
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

      {/* Popover */}
      <div
        className={`absolute right-0 bottom-full mb-2 z-[400] w-[min(360px,calc(100vw-24px))] origin-bottom-right rounded-xl border border-neutral-200/80 bg-white/95 shadow-[0_18px_48px_-12px_rgba(0,0,0,0.22)] backdrop-blur-md transition duration-150 ease-out ${
          open
            ? 'pointer-events-auto translate-y-0 scale-100 opacity-100'
            : 'pointer-events-none translate-y-1 scale-95 opacity-0'
        }`}
        role="dialog"
        aria-label={`Model for ${theme.label.toLowerCase()}`}
        onKeyDown={onListKey}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 pt-3 pb-2">
          <div className="flex items-center gap-1.5">
            <span
              className={`inline-block h-1.5 w-1.5 rounded-full ${
                modality === 'text'
                  ? 'bg-amber-500'
                  : modality === 'image'
                  ? 'bg-orange-500'
                  : 'bg-amber-800'
              }`}
            />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
              Model for {theme.label}
            </span>
          </div>
          <button
            type="button"
            onClick={refresh}
            title="Refresh model list"
            className="rounded-md p-1 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700"
          >
            <svg
              className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M21 12a9 9 0 1 1-3-6.7" />
              <path d="M21 3v6h-6" />
            </svg>
          </button>
        </div>

        {/* Search */}
        <div className="px-3 pb-2">
          <div className="relative">
            <svg
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.3-4.3" />
            </svg>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onSearchKey}
              placeholder="Search models…"
              className="w-full rounded-md border border-neutral-200 bg-white pl-8 pr-3 py-1.5 text-[12px] text-neutral-800 placeholder:text-neutral-400 outline-none transition focus:border-neutral-300 focus:ring-2 focus:ring-neutral-200"
            />
          </div>
        </div>

        {/* List */}
        <div
          ref={listRef}
          className="max-h-[340px] overflow-y-auto px-1.5 pb-1.5"
        >
          {loading && filtered.length === 0 ? (
            <div className="space-y-1 px-1.5 py-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="h-12 animate-pulse rounded-md bg-neutral-100"
                />
              ))}
            </div>
          ) : error ? (
            <div className="px-3 py-6 text-center">
              <p className="text-[12px] text-neutral-600">Couldn't load models.</p>
              <button
                type="button"
                onClick={refresh}
                className={`mt-2 inline-flex items-center gap-1 rounded-md ${theme.bg} ${theme.text} px-2 py-1 text-[11px] font-medium transition hover:opacity-90`}
              >
                Try again
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-3 py-6 text-center text-[12px] text-neutral-500">
              No models match "{debounced}".
            </div>
          ) : (
            filtered.map((m, i) => {
              const isSelected = m.id === selectedId
              const isActive = i === activeIndex
              return (
                <button
                  key={m.id}
                  type="button"
                  data-row-index={i}
                  onClick={() => commit(m.id)}
                  onMouseEnter={() => setActiveIndex(i)}
                  className={`group flex w-full items-start gap-2 rounded-md px-2 py-2 text-left transition ${
                    isActive ? 'bg-neutral-100' : 'hover:bg-neutral-50'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-[12.5px] font-semibold text-neutral-800">
                        {m.name}
                      </span>
                      {m.isDefault && (
                        <span className={`shrink-0 rounded-full px-1.5 py-px text-[9px] font-semibold uppercase tracking-wider ${theme.chip}`}>
                          Default
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-neutral-500">
                      {m.provider && <span className="truncate">{m.provider}</span>}
                      {m.provider && formatContext(m.contextLength) && (
                        <span className="text-neutral-300">·</span>
                      )}
                      {formatContext(m.contextLength) && (
                        <span>{formatContext(m.contextLength)}</span>
                      )}
                    </div>
                    {m.description && (
                      <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-neutral-500">
                        {m.description}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {isSelected ? (
                      <svg
                        className={`h-3.5 w-3.5 ${theme.accent}`}
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
                    ) : (
                      <span className="h-3.5 w-3.5" />
                    )}
                    <span className="whitespace-nowrap text-[10px] font-medium text-neutral-500">
                      {formatPrice(m, modality)}
                    </span>
                  </div>
                </button>
              )
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-neutral-100 px-3 py-2 text-[11px]">
          <span className="text-neutral-500">
            {activeModel
              ? `Using ${shortName(activeModel.id)}`
              : 'Using default'}
          </span>
          {selectedId && (
            <button
              type="button"
              onClick={() => commit(null)}
              className={`font-medium ${theme.accent} hover:underline`}
            >
              Reset to default
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
