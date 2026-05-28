import { useState } from 'react'
import { AgentKeysDialog } from './AgentKeysDialog'

export function AgentKeysButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Agent access keys"
        aria-label="Manage agent access keys"
        className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full border border-neutral-200 bg-white/95 text-neutral-600 shadow-[0_4px_24px_-8px_rgba(0,0,0,0.18)] backdrop-blur transition hover:bg-neutral-100 hover:text-neutral-900"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
        </svg>
      </button>
      {open && <AgentKeysDialog onClose={() => setOpen(false)} />}
    </>
  )
}
