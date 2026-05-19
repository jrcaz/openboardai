export function HeroMock() {
  return (
    <div className="relative aspect-[5/4] w-full overflow-hidden rounded-3xl bg-white shadow-[0_20px_60px_-25px_rgba(120,53,15,0.35)] ring-1 ring-amber-100">
      <div className="lp-dot-grid absolute inset-0" aria-hidden="true" />

      <div
        className="lp-float-a absolute left-[6%] top-[14%] w-[42%] rounded-md bg-yellow-200/95 px-3.5 py-3 text-[12px] leading-snug text-neutral-800 shadow-[0_8px_24px_-10px_rgba(0,0,0,0.25)] ring-1 ring-yellow-300/60"
        aria-hidden="true"
      >
        <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-yellow-900/70">
          Sticky note
        </div>
        <div className="font-medium">User research findings</div>
        <ul className="mt-1.5 space-y-0.5 text-[11.5px] text-neutral-700">
          <li>• 5 user interviews</li>
          <li>• 2 recurring themes</li>
          <li>• 1 surprise insight</li>
        </ul>
      </div>

      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 500 400"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <marker id="lp-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" fill="#fbbf24" />
          </marker>
        </defs>
        <path
          d="M210,150 C260,170 270,210 310,230"
          fill="none"
          stroke="#fbbf24"
          strokeWidth="2"
          strokeDasharray="4 4"
          markerEnd="url(#lp-arrow)"
        />
      </svg>

      <div
        className="lp-float-b absolute bottom-[10%] right-[6%] w-[54%] rounded-xl bg-white px-4 py-3.5 shadow-[0_12px_30px_-12px_rgba(120,53,15,0.35)] ring-1 ring-amber-200"
        aria-hidden="true"
      >
        <div className="mb-2 flex items-center gap-1.5">
          <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-400 text-[8px] text-neutral-900">
            <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 2l1.6 4.4L18 8l-4.4 1.6L12 14l-1.6-4.4L6 8l4.4-1.6z" />
            </svg>
          </span>
          <span className="text-[10.5px] font-semibold uppercase tracking-wider text-amber-700">
            AI card · generating
          </span>
        </div>
        <div className="text-[11.5px] font-medium text-neutral-900">Top recurring themes:</div>
        <div className="mt-2 space-y-1.5">
          <div className="lp-shimmer-bar h-2.5 w-[88%] rounded-full" />
          <div className="lp-shimmer-bar h-2.5 w-[72%] rounded-full" />
          <div className="lp-shimmer-bar h-2.5 w-[80%] rounded-full" />
          <div className="flex items-center gap-1">
            <div className="lp-shimmer-bar h-2.5 w-[40%] rounded-full" />
            <span className="lp-caret -mt-0.5 inline-block h-3 w-[2px] bg-amber-500" />
          </div>
        </div>
      </div>

      <div
        className="lp-pill-float absolute right-[10%] top-[10%] flex items-center gap-1.5 rounded-full bg-neutral-900/90 px-3 py-1.5 text-[11px] font-medium text-white shadow-lg ring-1 ring-white/10 backdrop-blur"
        aria-hidden="true"
      >
        <kbd className="rounded bg-white/15 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide">⌘</kbd>
        <kbd className="rounded bg-white/15 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide">K</kbd>
        <span className="pl-0.5 text-white/80">ask Claude</span>
      </div>

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-yellow-50/60 via-transparent to-amber-50/40" aria-hidden="true" />
    </div>
  )
}
