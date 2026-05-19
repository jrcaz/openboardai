const STEPS = [
  {
    step: '01',
    title: 'Sketch',
    body: 'Drop sticky notes, text, geo shapes, or drag images onto an infinite tldraw canvas. Arrange them however you think.',
  },
  {
    step: '02',
    title: 'Select & ask',
    body: 'Select any shapes — including images — and hit ⌘K / Ctrl+K. The selection becomes context for Claude.',
  },
  {
    step: '03',
    title: 'Iterate',
    body: 'Use Expand to fan out follow-ups, presentation mode to demo, and snapshots so nothing is lost between sessions.',
  },
]

export function HowItWorks() {
  return (
    <section id="how" className="py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="max-w-2xl">
          <div className="text-[11.5px] font-semibold uppercase tracking-[0.18em] text-violet-600">
            How it works
          </div>
          <h2 className="mt-3 text-[32px] font-semibold leading-tight tracking-tight text-neutral-900 sm:text-[36px]">
            Three steps. No tutorials.
          </h2>
        </div>

        <ol className="mt-12 grid gap-5 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <li
              key={s.step}
              className="relative overflow-hidden rounded-2xl border border-neutral-200/70 bg-white p-6"
            >
              <div
                aria-hidden="true"
                className="absolute -right-4 -top-6 select-none text-[110px] font-bold leading-none text-neutral-100"
              >
                {s.step}
              </div>
              <div className="relative">
                <div className="flex items-center gap-2 text-[11.5px] font-semibold uppercase tracking-wider text-violet-600">
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-[10px] text-white">
                    {i + 1}
                  </span>
                  Step {s.step}
                </div>
                <h3 className="mt-4 text-[20px] font-semibold tracking-tight text-neutral-900">
                  {s.title}
                </h3>
                <p className="mt-2 text-[13.5px] leading-relaxed text-neutral-600">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
