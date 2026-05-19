import { OPENROUTER_KEY_URL } from './links'

interface Props {
  onStart: () => void
  starting: boolean
}

export function ByokCallout({ onStart, starting }: Props) {
  return (
    <section className="py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-3xl border border-violet-100 bg-gradient-to-br from-white via-violet-50/50 to-fuchsia-50/40 p-8 sm:p-12">
          <div className="grid items-center gap-10 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-[11.5px] font-medium text-violet-700 ring-1 ring-violet-100">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z" />
                  <path d="M9 12l2 2 4-4" />
                </svg>
                Bring your own key
              </div>
              <h2 className="mt-4 text-[28px] font-semibold leading-tight tracking-tight text-neutral-900 sm:text-[32px]">
                Your key. Your browser. Nobody else's database.
              </h2>
              <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-neutral-600">
                OpenBoard AI is open source and BYOK. Your OpenRouter key is stored only in <code className="rounded bg-white px-1.5 py-0.5 font-mono text-[12.5px] text-violet-700 ring-1 ring-violet-100">localStorage</code>, sent per-request, and never persisted on the server.
              </p>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
                <button
                  type="button"
                  onClick={onStart}
                  disabled={starting}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-5 py-3 text-[14px] font-semibold text-white shadow-lg shadow-violet-500/25 transition hover:translate-y-[-1px] hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {starting ? 'Creating board…' : 'Create your first board'}
                </button>
                <a
                  href={OPENROUTER_KEY_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-3 text-[13.5px] font-medium text-violet-700 transition hover:text-violet-900"
                >
                  Need a key? Grab one
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M7 17L17 7M7 7h10v10" />
                  </svg>
                </a>
              </div>
            </div>

            <div className="lg:col-span-5">
              <ul className="space-y-3">
                <Bullet>Key never leaves the browser except as a per-request header.</Bullet>
                <Bullet>No accounts. No signup. No waitlist.</Bullet>
                <Bullet>You see exactly what's billed on your OpenRouter dashboard.</Bullet>
                <Bullet>Open source — fork, self-host, audit the wire.</Bullet>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3 rounded-xl bg-white/80 px-4 py-3 ring-1 ring-violet-100/70">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0 text-violet-600" aria-hidden="true">
        <path d="M5 13l4 4L19 7" />
      </svg>
      <span className="text-[13.5px] leading-snug text-neutral-700">{children}</span>
    </li>
  )
}
