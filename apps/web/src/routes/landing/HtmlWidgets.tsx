import type { ReactNode } from 'react'
import { HtmlWidgetMock } from './HtmlWidgetMock'

export function HtmlWidgets() {
  return (
    <section id="html-widgets" className="border-t border-neutral-100 py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-3xl border border-amber-100 bg-gradient-to-br from-white via-yellow-50/50 to-amber-50/40 p-8 sm:p-12">
          <div className="grid items-center gap-10 lg:grid-cols-12">
            <div className="lg:col-span-6">
              <HtmlWidgetMock />
            </div>

            <div className="lg:col-span-6">
              <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-[11.5px] font-medium text-amber-700 ring-1 ring-amber-100">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M9 8l-4 4 4 4" />
                  <path d="M15 8l4 4-4 4" />
                  <path d="M13 6l-2 12" />
                </svg>
                Interactive widgets
              </div>
              <h2 className="mt-4 text-[28px] font-semibold leading-tight tracking-tight text-neutral-900 sm:text-[32px]">
                Drop in real HTML. It runs on the board.
              </h2>
              <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-neutral-600">
                Generate an interactive widget from a prompt, upload an <code className="rounded bg-white px-1.5 py-0.5 font-mono text-[12.5px] text-amber-700 ring-1 ring-amber-100">.html</code> file, or drag one onto the canvas. It mounts in a sandboxed iframe, drags like any shape, and goes interactive on double-click.
              </p>

              <ul className="mt-7 space-y-3">
                <Bullet>Prompt Claude for a chart, form, or calculator — it streams back a full HTML doc and renders inline.</Bullet>
                <Bullet>Drag any <code className="rounded bg-white px-1 py-0.5 font-mono text-[12px] text-amber-700 ring-1 ring-amber-100">.html</code> file onto the canvas, or use the import button. Sandboxed with <code className="rounded bg-white px-1 py-0.5 font-mono text-[12px] text-amber-700 ring-1 ring-amber-100">allow-scripts</code> only.</Bullet>
                <Bullet>Double-click to interact; Esc returns to selection. Drag, resize, and align like any other shape.</Bullet>
                <Bullet>The widget's source becomes context for follow-up prompts — iterate on it without leaving the board.</Bullet>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function Bullet({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-start gap-3 rounded-xl bg-white/80 px-4 py-3 ring-1 ring-amber-100/70">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0 text-amber-600" aria-hidden="true">
        <path d="M5 13l4 4L19 7" />
      </svg>
      <span className="text-[13.5px] leading-snug text-neutral-700">{children}</span>
    </li>
  )
}
