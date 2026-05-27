import { useState } from 'react'

interface QA {
  q: string
  a: string
}

const FAQS: QA[] = [
  {
    q: 'How much does OpenBoard AI cost?',
    a: "The app itself is free and open source. You only pay for the AI calls you make — billed directly by OpenRouter against your own key. Text prompts are typically fractions of a cent; image and video generations cost more. You'll see every charge on your OpenRouter dashboard.",
  },
  {
    q: 'Do I need to create an account?',
    a: "No. There is no signup, no email, no waitlist. Paste your OpenRouter API key into the in-app dialog the first time you create a board and you're in. Your board lives at a shareable URL — bookmark it.",
  },
  {
    q: 'Where does my OpenRouter API key actually live?',
    a: "Only in your browser's localStorage. The server never writes it to a database, never logs it, and never sees it outside the headers of the request you triggered. If you clear your browser storage, the key is gone — re-paste it to continue.",
  },
  {
    q: 'Which AI providers power OpenBoard AI?',
    a: "OpenBoard AI reaches the top AI providers — Anthropic, Google, OpenAI, Meta, Mistral, and more — all through your OpenRouter key. That means swapping providers later is a config change, not a rewrite, and you always get the latest models without waiting on us.",
  },
  {
    q: 'Can I self-host it?',
    a: "Yes — that's the whole point. The repo is open source on GitHub. Clone it, point it at your own Postgres, set the required env vars, and run it. Every external dependency (OpenRouter, your DB) is yours.",
  },
  {
    q: 'Can multiple people edit a board at the same time?',
    a: 'Not yet. OpenBoard AI is single-player today — the URL is shareable for handoff and read-later, but two people editing the same board simultaneously will overwrite each other. Real-time collaboration is on the roadmap.',
  },
  {
    q: 'Are my boards saved? What if I close the tab?',
    a: 'Every change autosaves to Postgres. Close the tab, reload tomorrow, open the URL on a different device — your board is exactly where you left it. There is no "save" button because there\'s nothing to remember to do.',
  },
  {
    q: 'What can I put on a board besides AI output?',
    a: "Sticky notes, text, geometric shapes, freehand drawing, arrows, frames, and dragged-in images. Select any of them — including images, since the AI is vision-capable — and hit ⌘K / Ctrl+K to make them the AI's context.",
  },
]

export function Faq() {
  const [openIndex, setOpenIndex] = useState<number | null>(0)

  return (
    <section id="faq" className="border-t border-neutral-100 bg-neutral-50/60 py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <div className="text-[11.5px] font-semibold uppercase tracking-[0.18em] text-amber-600">
            Questions
          </div>
          <h2 className="mt-3 text-[32px] font-semibold leading-tight tracking-tight text-neutral-900 sm:text-[36px]">
            Things people ask before clicking start.
          </h2>
          <p className="mt-4 text-[15.5px] leading-relaxed text-neutral-600">
            Pricing, privacy, and what's actually under the hood.
          </p>
        </div>

        <ul className="mx-auto mt-12 max-w-3xl space-y-3">
          {FAQS.map((item, i) => {
            const isOpen = openIndex === i
            const buttonId = `faq-q-${i}`
            const panelId = `faq-a-${i}`
            return (
              <li
                key={item.q}
                className="group overflow-hidden rounded-2xl border border-neutral-200/70 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition hover:border-amber-200 hover:shadow-[0_12px_30px_-15px_rgba(120,53,15,0.25)]"
              >
                <button
                  type="button"
                  id={buttonId}
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={() => setOpenIndex(isOpen ? null : i)}
                  className="flex w-full items-center justify-between gap-6 px-5 py-4 text-left sm:px-6 sm:py-5"
                >
                  <span className="text-[14.5px] font-semibold text-neutral-900 sm:text-[15px]">
                    {item.q}
                  </span>
                  <span
                    aria-hidden="true"
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-yellow-50 to-amber-50 text-amber-600 ring-1 ring-amber-100 transition-transform duration-300 motion-reduce:transition-none ${isOpen ? 'rotate-45' : ''}`}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  </span>
                </button>
                <div
                  id={panelId}
                  role="region"
                  aria-labelledby={buttonId}
                  className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
                >
                  <div className="min-h-0 overflow-hidden">
                    <p className="px-5 pb-5 text-[13.5px] leading-relaxed text-neutral-600 sm:px-6 sm:pb-6">
                      {item.a}
                    </p>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
