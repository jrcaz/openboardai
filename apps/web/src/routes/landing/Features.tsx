import type { ReactNode } from 'react'

interface Feature {
  title: string
  body: string
  icon: ReactNode
  badge?: string
}

const ICON_STROKE = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

const FEATURES: Feature[] = [
  {
    title: 'AI text generation',
    body: 'Press ⌘K / Ctrl+K to open a prompt bar. Claude streams its reply directly into a card on the canvas.',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" {...ICON_STROKE}>
        <path d="M4 7h16M4 12h10M4 17h7" />
        <path d="M17 14l1.2 2.6 2.6 1.2-2.6 1.2L17 21.6l-1.2-2.6L13.2 17.8l2.6-1.2z" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    title: 'Selection-aware context',
    body: 'Selected shapes — sticky notes, text, geo, images, prior AI cards — flow in as context. Vision-capable for images.',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" {...ICON_STROKE}>
        <path d="M4 4h4M16 4h4M4 20h4M16 20h4M4 4v4M20 4v4M4 16v4M20 16v4" />
        <rect x="9" y="9" width="6" height="6" rx="1" />
      </svg>
    ),
  },
  {
    title: 'AI images',
    body: 'Generate via Google Gemini 2.5 Flash Image. Square, widescreen, or portrait aspect — straight onto the board.',
    badge: 'Gemini',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" {...ICON_STROKE}>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <circle cx="9" cy="10" r="1.5" />
        <path d="M3 17l5-5 4 4 3-3 6 6" />
      </svg>
    ),
  },
  {
    title: 'AI video',
    body: 'Generate via Google Veo 3.1 Fast. Text-to-video or image-to-video, with optional audio, persisted on the canvas.',
    badge: 'Veo',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" {...ICON_STROKE}>
        <rect x="3" y="6" width="14" height="12" rx="2" />
        <path d="M17 10l4-2v8l-4-2z" />
      </svg>
    ),
  },
  {
    title: 'Presentation mode',
    body: 'Press P to hide chrome and read like a deck. L drops a laser cursor. Esc exits — no extra tools needed.',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" {...ICON_STROKE}>
        <rect x="3" y="4" width="18" height="12" rx="1.5" />
        <path d="M8 20h8M12 16v4" />
      </svg>
    ),
  },
  {
    title: 'Persistent snapshots',
    body: 'Boards autosave to Postgres on every change. Reload, share the URL, pick up where you left off.',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" {...ICON_STROKE}>
        <ellipse cx="12" cy="6" rx="8" ry="3" />
        <path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
      </svg>
    ),
  },
  {
    title: 'Bring your own key',
    body: 'Your OpenRouter key lives in this browser. The server proxies AI calls with it but never stores or logs it.',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" {...ICON_STROKE}>
        <path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    ),
  },
]

export function Features() {
  return (
    <section id="features" className="border-t border-neutral-100 bg-neutral-50/60 py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="max-w-2xl">
          <div className="text-[11.5px] font-semibold uppercase tracking-[0.18em] text-amber-600">
            What's on the board
          </div>
          <h2 className="mt-3 text-[32px] font-semibold leading-tight tracking-tight text-neutral-900 sm:text-[36px]">
            A whiteboard that thinks alongside you.
          </h2>
          <p className="mt-4 text-[15.5px] leading-relaxed text-neutral-600">
            Every feature is one keystroke or selection away. No prompt-engineering ceremony, no app switching — just shapes, selections, and answers in the same surface.
          </p>
        </div>

        <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <li
              key={f.title}
              className="group relative flex flex-col rounded-2xl border border-neutral-200/70 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition hover:-translate-y-0.5 hover:border-amber-200 hover:shadow-[0_12px_30px_-15px_rgba(120,53,15,0.25)]"
            >
              <div className="flex items-start justify-between">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-yellow-50 to-amber-50 text-amber-600 ring-1 ring-amber-100">
                  {f.icon}
                </div>
                {f.badge && (
                  <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-600">
                    {f.badge}
                  </span>
                )}
              </div>
              <div className="mt-4 text-[14.5px] font-semibold text-neutral-900">{f.title}</div>
              <p className="mt-1.5 text-[13px] leading-relaxed text-neutral-600">{f.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
