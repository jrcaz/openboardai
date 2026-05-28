import { useState } from 'react'
import { BrandMark } from '../routes/landing/BrandMark'

// Unobtrusive branding shown on the public read-only viewer. Sits bottom-left
// (tldraw's own watermark, when unlicensed, sits bottom-right) and only the
// interactive pills capture pointer events, so the canvas stays fully usable.
// A clickable brand badge drives recognition/traffic; a dismissible CTA invites
// viewers to create their own board.
export function PublicBadge() {
  const [showCta, setShowCta] = useState(true)

  return (
    <div className="pointer-events-none fixed bottom-3 left-3 z-[500] flex items-center gap-2">
      <a
        href="/"
        title="Made with OpenBoard AI"
        className="pointer-events-auto flex items-center gap-2 rounded-full border border-neutral-200 bg-white/95 py-1.5 pl-1.5 pr-3 text-neutral-700 shadow-[0_4px_24px_-8px_rgba(0,0,0,0.18)] backdrop-blur transition hover:bg-neutral-100 hover:text-neutral-900"
      >
        <BrandMark size={22} />
        <span className="text-[12.5px] font-semibold tracking-tight">
          Made with OpenBoard AI
        </span>
      </a>

      {showCta && (
        <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-neutral-200 bg-white/95 py-1 pl-3 pr-1 shadow-[0_4px_24px_-8px_rgba(0,0,0,0.18)] backdrop-blur">
          <a
            href="/signup"
            className="rounded-full bg-gradient-to-r from-amber-400 to-orange-400 px-3 py-1 text-[12.5px] font-semibold text-neutral-900 transition hover:from-amber-500 hover:to-orange-500"
          >
            Create your own board
          </a>
          <button
            type="button"
            onClick={() => setShowCta(false)}
            title="Dismiss"
            aria-label="Dismiss"
            className="flex h-6 w-6 items-center justify-center rounded-full text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}
