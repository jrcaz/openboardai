import { useEffect, useState } from 'react'

interface Props {
  boardId: string
  createdAt: string
  expiresAt: string
}

const DAY_MS = 86_400_000

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function dismissalKey(boardId: string, expiresAt: string): string {
  return `expiry-banner-dismissed:${boardId}:${expiresAt}`
}

export function ExpiryBanner({ boardId, createdAt, expiresAt }: Props) {
  const [dismissed, setDismissed] = useState(true)

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(dismissalKey(boardId, expiresAt)) === '1')
    } catch {
      setDismissed(false)
    }
  }, [boardId, expiresAt])

  if (dismissed) return null

  const msUntilExpiry = new Date(expiresAt).getTime() - Date.now()
  if (msUntilExpiry <= 0) return null

  const urgent = msUntilExpiry < DAY_MS
  const colors = urgent
    ? 'bg-red-50 border-red-200 text-red-800'
    : 'bg-amber-50 border-amber-200 text-amber-900'

  const onDismiss = () => {
    try {
      localStorage.setItem(dismissalKey(boardId, expiresAt), '1')
    } catch {
      // ignore — banner will reappear on next load, which is fine.
    }
    setDismissed(true)
  }

  return (
    <div
      className={`pointer-events-auto absolute left-1/2 top-4 z-[600] flex max-w-2xl -translate-x-1/2 items-center gap-3 rounded-md border px-3 py-2 text-xs shadow-sm ${colors}`}
      role="status"
    >
      <span>
        Created {formatDate(createdAt)}. This board will be deleted on{' '}
        <strong>{formatDate(expiresAt)}</strong>. Use <em>File → Export</em> to keep your work.
      </span>
      <button
        type="button"
        onClick={onDismiss}
        className="ml-2 rounded px-1.5 py-0.5 text-current opacity-70 hover:bg-black/5 hover:opacity-100"
        aria-label="Dismiss expiry warning"
      >
        ×
      </button>
    </div>
  )
}
