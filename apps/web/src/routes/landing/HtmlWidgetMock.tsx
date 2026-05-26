export function HtmlWidgetMock() {
  return (
    <div className="relative aspect-[5/4] w-full overflow-hidden rounded-3xl bg-white shadow-[0_20px_60px_-25px_rgba(120,53,15,0.35)] ring-1 ring-amber-100">
      <div className="lp-dot-grid absolute inset-0" aria-hidden="true" />

      <div
        className="lp-float-a absolute left-[5%] top-[12%] w-[38%] rounded-md bg-yellow-200/95 px-3.5 py-3 text-[12px] leading-snug text-neutral-800 shadow-[0_8px_24px_-10px_rgba(0,0,0,0.25)] ring-1 ring-yellow-300/60"
        aria-hidden="true"
      >
        <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-yellow-900/70">
          Sticky note
        </div>
        <div className="font-medium">Build a chart</div>
        <ul className="mt-1.5 space-y-0.5 text-[11.5px] text-neutral-700">
          <li>• quarterly revenue</li>
          <li>• show growth %</li>
          <li>• interactive tooltip</li>
        </ul>
      </div>

      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 500 400"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <marker id="hw-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" fill="#fbbf24" />
          </marker>
        </defs>
        <path
          d="M195,140 C245,160 260,200 305,215"
          fill="none"
          stroke="#fbbf24"
          strokeWidth="2"
          strokeDasharray="4 4"
          markerEnd="url(#hw-arrow)"
        />
      </svg>

      <div
        className="lp-float-b absolute bottom-[10%] right-[5%] w-[58%] overflow-hidden rounded-xl bg-white shadow-[0_12px_30px_-12px_rgba(120,53,15,0.35)] ring-1 ring-amber-200"
        aria-hidden="true"
      >
        <div className="flex items-center justify-between gap-2 border-b border-neutral-100 bg-gradient-to-b from-white to-neutral-50/60 px-2.5 py-1.5">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider text-amber-700">
              AI HTML
            </span>
            <span className="truncate text-[11px] font-medium text-neutral-700">
              Q3 revenue.html
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[9.5px] font-medium text-neutral-700">
              Interact
            </span>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-400">
              <path d="M7 17L17 7M7 7h10v10" />
            </svg>
          </div>
        </div>

        <div className="px-3 pt-2.5 pb-3">
          <div className="mb-1 text-[10px] font-medium text-neutral-700">
            Quarterly revenue (USD, M)
          </div>
          <svg viewBox="0 0 220 110" className="h-auto w-full" preserveAspectRatio="xMidYMid meet">
            <defs>
              <linearGradient id="hw-bar" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#fbbf24" />
                <stop offset="100%" stopColor="#f59e0b" />
              </linearGradient>
              <linearGradient id="hw-bar-soft" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#fde68a" />
                <stop offset="100%" stopColor="#fcd34d" />
              </linearGradient>
            </defs>

            <line x1="10" y1="92" x2="210" y2="92" stroke="#e5e7eb" strokeWidth="1" />

            <rect x="22"  y="60" width="22" height="32" rx="3" fill="url(#hw-bar-soft)" />
            <rect x="62"  y="46" width="22" height="46" rx="3" fill="url(#hw-bar-soft)" />
            <rect x="102" y="38" width="22" height="54" rx="3" fill="url(#hw-bar)" />
            <rect x="142" y="22" width="22" height="70" rx="3" fill="url(#hw-bar)" />
            <rect x="182" y="32" width="22" height="60" rx="3" fill="url(#hw-bar-soft)" />

            <circle cx="153" cy="22" r="4" fill="#f59e0b" className="animate-ai-image-dot" />

            <g>
              <rect x="128" y="2" width="50" height="16" rx="4" fill="#0f172a" />
              <text x="153" y="13" textAnchor="middle" fontSize="9" fontWeight="600" fill="#fde68a" fontFamily="-apple-system, BlinkMacSystemFont, sans-serif">$4.2M</text>
              <path d="M150 18 L153 22 L156 18 Z" fill="#0f172a" />
            </g>

            <g fontSize="7" fill="#9ca3af" fontFamily="-apple-system, BlinkMacSystemFont, sans-serif" textAnchor="middle">
              <text x="33"  y="103">Q1</text>
              <text x="73"  y="103">Q2</text>
              <text x="113" y="103">Q3</text>
              <text x="153" y="103">Q4</text>
              <text x="193" y="103">Q5e</text>
            </g>
          </svg>
        </div>
      </div>

      <div
        className="lp-html-drop absolute left-[42%] top-[8%] inline-flex items-center gap-1.5 rounded-md bg-white px-2 py-1 text-[10.5px] font-medium text-neutral-700 shadow-md ring-1 ring-neutral-200"
        aria-hidden="true"
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-600">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6" />
        </svg>
        revenue.html
      </div>

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-yellow-50/60 via-transparent to-amber-50/40" aria-hidden="true" />
    </div>
  )
}
