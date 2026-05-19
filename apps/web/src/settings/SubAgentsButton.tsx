import { useState } from 'react'
import { SubAgentsDialog } from './SubAgentsDialog'

interface Props {
  /** External control of open state (used so the prompt bar can open it via "Manage agents…"). */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function SubAgentsButton({ open: controlledOpen, onOpenChange }: Props) {
  const [internalOpen, setInternalOpen] = useState(false)
  const open = controlledOpen ?? internalOpen
  const setOpen = (v: boolean) => {
    if (onOpenChange) onOpenChange(v)
    else setInternalOpen(v)
  }
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Manage sub-agents"
        aria-label="Manage sub-agents"
        className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full border border-neutral-200 bg-white/95 text-neutral-600 shadow-[0_4px_24px_-8px_rgba(0,0,0,0.18)] backdrop-blur transition hover:bg-neutral-100 hover:text-neutral-900"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21a8 8 0 0 1 16 0" />
        </svg>
      </button>
      {open && <SubAgentsDialog onClose={() => setOpen(false)} />}
    </>
  )
}
