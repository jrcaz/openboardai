import type { CSSProperties } from 'react'

type Tile = {
  rest: string
  delayMs: number
  position: string
  tint: string
  ring: string
  content: React.ReactNode
}

const TILES: Tile[] = [
  {
    rest: 'rotate(-4deg)',
    delayMs: 0,
    position: 'left-[28px] top-[24px]',
    tint: 'bg-gradient-to-br from-amber-100 to-amber-50',
    ring: 'ring-amber-200/70',
    content: (
      <svg viewBox="0 0 48 30" className="h-7 w-11 text-amber-500" fill="none">
        <rect x="1" y="1" width="46" height="28" rx="3" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="13" cy="11" r="2.5" fill="currentColor" opacity="0.8" />
        <path d="M5 24 L18 14 L28 21 L36 15 L43 24 Z" fill="currentColor" opacity="0.55" />
      </svg>
    ),
  },
  {
    rest: 'rotate(3deg)',
    delayMs: 180,
    position: 'right-[24px] top-[28px]',
    tint: 'bg-gradient-to-br from-rose-100 to-rose-50',
    ring: 'ring-rose-200/70',
    content: (
      <svg viewBox="0 0 40 32" className="h-7 w-9 text-rose-500" fill="none">
        <rect x="1" y="1" width="38" height="30" rx="4" stroke="currentColor" strokeWidth="1.5" opacity="0.75" />
        <path d="M16 10 L28 16 L16 22 Z" fill="currentColor" />
      </svg>
    ),
  },
  {
    rest: 'rotate(2deg)',
    delayMs: 360,
    position: 'left-[36px] bottom-[24px]',
    tint: 'bg-gradient-to-br from-yellow-100 to-amber-50',
    ring: 'ring-yellow-200/70',
    content: (
      <div className="flex w-full flex-col gap-[5px] px-3">
        <div className="h-[5px] w-[78%] rounded-full bg-amber-400/70" />
        <div className="h-[5px] w-[92%] rounded-full bg-amber-300/60" />
        <div className="h-[5px] w-[54%] rounded-full bg-amber-300/60" />
        <div className="h-[5px] w-[70%] rounded-full bg-amber-300/50" />
      </div>
    ),
  },
  {
    rest: 'rotate(-2deg)',
    delayMs: 540,
    position: 'right-[32px] bottom-[20px]',
    tint: 'bg-gradient-to-br from-slate-100 to-slate-50',
    ring: 'ring-slate-200/70',
    content: (
      <span className="font-mono text-[15px] font-semibold tracking-tight text-slate-500">
        &lt;/&gt;
      </span>
    ),
  },
]

export function BoardLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex h-full flex-col items-center justify-center gap-6 px-6"
    >
      <div aria-hidden="true" className="animate-board-loader-float relative">
        <div
          className="relative h-[200px] w-[320px] overflow-hidden rounded-2xl bg-white ring-1 ring-neutral-200 lp-dot-grid"
          style={{ boxShadow: '0 12px 40px -16px rgba(15, 23, 42, 0.18), 0 2px 6px -2px rgba(15, 23, 42, 0.06)' }}
        >
          {TILES.map((tile) => (
            <div
              key={tile.position}
              className={`animate-board-tile-in absolute ${tile.position} flex h-[64px] w-[112px] items-center justify-center rounded-xl ring-1 ${tile.ring} ${tile.tint} shadow-[0_4px_14px_-6px_rgba(15,23,42,0.18)]`}
              style={
                {
                  ['--tile-rest']: tile.rest,
                  animationDelay: `${tile.delayMs}ms`,
                } as CSSProperties
              }
            >
              {tile.content}
            </div>
          ))}

          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div
              className="animate-board-shimmer-sweep absolute -top-4 -bottom-4 left-0 w-[60%]"
              style={{
                background:
                  'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.55) 50%, transparent 100%)',
              }}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col items-center gap-3">
        <div className="text-[13px] font-medium text-neutral-700">Loading your board</div>
        <div className="text-[12px] text-neutral-500">Putting the pieces together…</div>
        <div className="lp-shimmer-bar h-[3px] w-40 rounded-full" />
      </div>
    </div>
  )
}
