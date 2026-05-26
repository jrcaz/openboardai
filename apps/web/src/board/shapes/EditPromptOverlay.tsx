import { useEffect, useRef, useState } from 'react'
import { stopEventPropagation } from 'tldraw'

type Accent = 'amber' | 'orange' | 'video' | 'violet'

const ACCENT_BUTTON: Record<Accent, string> = {
  amber: 'bg-amber-400 text-neutral-900 hover:bg-amber-500',
  orange: 'bg-gradient-to-r from-orange-300 to-orange-400 text-neutral-900 hover:from-orange-400 hover:to-orange-500',
  video: 'bg-gradient-to-r from-amber-600 to-amber-800 text-white hover:from-amber-700 hover:to-amber-900',
  violet: 'bg-violet-600 text-white hover:bg-violet-700',
}

const ACCENT_FOCUS: Record<Accent, string> = {
  amber: 'focus-within:ring-amber-300',
  orange: 'focus-within:ring-orange-300',
  video: 'focus-within:ring-amber-500',
  violet: 'focus-within:ring-violet-300',
}

interface Props {
  initialPrompt: string
  onSubmit: (newPrompt: string) => void
  onCancel: () => void
  accent: Accent
  submitLabel?: string
}

export function EditPromptOverlay({
  initialPrompt,
  onSubmit,
  onCancel,
  accent,
  submitLabel = 'Regenerate',
}: Props) {
  const [value, setValue] = useState(initialPrompt)
  const taRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const ta = taRef.current
    if (!ta) return
    ta.focus()
    ta.select()
  }, [])

  const trimmed = value.trim()
  const canSubmit = trimmed.length > 0 && trimmed !== initialPrompt.trim()

  function handleSubmit() {
    if (!canSubmit) return
    onSubmit(trimmed)
  }

  return (
    <div
      className="absolute inset-0 z-20 flex flex-col gap-2 rounded-[inherit] bg-white/95 p-3 shadow-[0_4px_24px_-8px_rgba(0,0,0,0.18)] backdrop-blur"
      onPointerDown={stopEventPropagation}
      onWheel={stopEventPropagation}
    >
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
        Edit prompt
      </div>
      <div
        className={`flex-1 rounded-lg border border-neutral-200 bg-white focus-within:ring-2 ${ACCENT_FOCUS[accent]}`}
      >
        <textarea
          ref={taRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault()
              onCancel()
              return
            }
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSubmit()
            }
          }}
          className="h-full w-full resize-none rounded-lg border-0 bg-transparent p-2 text-[13px] leading-snug text-neutral-800 placeholder:text-neutral-400 focus:outline-none"
          placeholder="Edit prompt…"
        />
      </div>
      <div className="flex items-center justify-end gap-1.5">
        <button
          onClick={(e) => {
            e.stopPropagation()
            onCancel()
          }}
          className="rounded-lg px-2.5 py-1 text-[11px] font-medium text-neutral-600 hover:bg-neutral-100"
        >
          Cancel
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            handleSubmit()
          }}
          disabled={!canSubmit}
          className={`rounded-lg px-3 py-1 text-[11px] font-medium shadow-sm transition disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:text-neutral-400 disabled:shadow-none ${ACCENT_BUTTON[accent]}`}
        >
          {submitLabel}
        </button>
      </div>
    </div>
  )
}

export function PencilButton({
  accent,
  onClick,
  title = 'Edit prompt',
  className = '',
}: {
  accent: Accent
  onClick: () => void
  title?: string
  className?: string
}) {
  const ring =
    accent === 'amber'
      ? 'ring-amber-200 text-amber-700 hover:bg-amber-50'
      : accent === 'orange'
      ? 'ring-orange-200 text-orange-700 hover:bg-orange-50'
      : accent === 'video'
      ? 'ring-amber-300 text-amber-900 hover:bg-amber-50'
      : 'ring-violet-200 text-violet-700 hover:bg-violet-50'
  return (
    <button
      type="button"
      onPointerDown={stopEventPropagation}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      title={title}
      className={`flex h-6 w-6 items-center justify-center rounded-full bg-white/95 shadow-sm ring-1 backdrop-blur-sm transition ${ring} ${className}`}
    >
      <svg
        className="h-3 w-3"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
      </svg>
    </button>
  )
}
