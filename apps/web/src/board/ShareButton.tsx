import { useState } from 'react'

interface Props {
  isPublic: boolean
  shareToken: string | null
  busy: boolean
  error: string | null
  onToggle: (next: boolean) => void
  onRegenerate: () => void
  onDismissError: () => void
  onCopy?: () => void
  onOpenChange?: (open: boolean) => void
}

// Owner control for public read-only sharing. Toggling on mints a share link;
// "New link" rotates the token and breaks the old URL. State (isPublic /
// shareToken / busy / error) lives in BoardEditor so it stays the single source
// of truth — this component is presentational with only ephemeral popover UI
// state (whether the panel is open, whether copy feedback is showing).
export function ShareButton({
  isPublic,
  shareToken,
  busy,
  error,
  onToggle,
  onRegenerate,
  onDismissError,
  onCopy,
  onOpenChange,
}: Props) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  const shareUrl = shareToken ? `${window.location.origin}/p/${shareToken}` : null

  function handleRegenerate() {
    if (!window.confirm('Generate a new link? The current link will stop working.')) return
    onRegenerate()
  }

  function copy() {
    if (!shareUrl) return
    navigator.clipboard.writeText(shareUrl).then(
      () => {
        setCopied(true)
        onCopy?.()
        setTimeout(() => setCopied(false), 1500)
      },
      () => {},
    )
  }

  function closePopover() {
    setOpen(false)
    onOpenChange?.(false)
    onDismissError()
  }

  return (
    <div className="pointer-events-auto relative">
      <button
        type="button"
        onClick={() => {
          setOpen((o) => {
            const next = !o
            onOpenChange?.(next)
            return next
          })
        }}
        title="Share board"
        aria-label="Share board"
        className={`flex h-8 w-8 items-center justify-center rounded-full border shadow-[0_4px_24px_-8px_rgba(0,0,0,0.18)] backdrop-blur transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:ring-offset-1 ${
          isPublic
            ? 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100'
            : 'border-neutral-200 bg-white/95 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
        }`}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98" />
        </svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-[590]" onClick={closePopover} />
          <div className="absolute right-0 top-full z-[600] mt-2 w-80 rounded-2xl border border-neutral-200 bg-white p-4 text-left shadow-2xl ring-1 ring-black/5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-[14px] font-semibold text-neutral-900">Share board</h3>
                <p className="mt-0.5 text-[12px] leading-snug text-neutral-500">
                  Anyone with the link can view this board (read-only).
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={isPublic}
                disabled={busy}
                onClick={() => onToggle(!isPublic)}
                className={`relative mt-0.5 h-6 w-11 flex-none rounded-full transition disabled:opacity-50 ${
                  isPublic ? 'bg-amber-500' : 'bg-neutral-300'
                }`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                    isPublic ? 'left-[22px]' : 'left-0.5'
                  }`}
                />
              </button>
            </div>

            {error && (
              <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-[12px] leading-snug text-red-700">
                {error}
              </div>
            )}

            {isPublic && shareUrl && (
              <div className="mt-4 space-y-2">
                <div className="flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-neutral-50 p-1 pl-2.5">
                  <input
                    readOnly
                    value={shareUrl}
                    onFocus={(e) => e.currentTarget.select()}
                    className="min-w-0 flex-1 truncate bg-transparent text-[12px] text-neutral-700 outline-none"
                  />
                  <button
                    type="button"
                    onClick={copy}
                    className="flex-none rounded-md bg-neutral-900 px-2.5 py-1 text-[12px] font-medium text-white transition hover:bg-neutral-800"
                  >
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handleRegenerate}
                  disabled={busy}
                  className="text-[12px] font-medium text-neutral-500 transition hover:text-neutral-800 disabled:opacity-50"
                >
                  Generate new link
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
