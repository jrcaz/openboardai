import { HeroMock } from './HeroMock'
import { GITHUB_URL, TLDRAW_URL } from './links'

interface Props {
  onStart: () => void
  starting: boolean
}

export function Hero({ onStart, starting }: Props) {
  return (
    <section className="relative overflow-hidden pt-28 pb-20 sm:pt-32 lg:pt-36 lg:pb-28">
      <div
        className="pointer-events-none absolute inset-x-0 -top-40 -z-10 transform-gpu overflow-hidden blur-3xl"
        aria-hidden="true"
      >
        <div
          className="relative left-1/2 aspect-[1155/678] w-[72rem] -translate-x-1/2 rotate-[30deg] bg-gradient-to-tr from-violet-300 to-fuchsia-200 opacity-40"
          style={{
            clipPath:
              'polygon(74% 44%, 100% 61%, 97% 26%, 85% 0%, 80% 2%, 72% 32%, 60% 62%, 52% 68%, 47% 58%, 45% 34%, 27% 76%, 0% 64%, 17% 100%, 27% 76%, 76% 97%, 74% 44%)',
          }}
        />
      </div>

      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-12 lg:gap-10">
          <div className="lg:col-span-6">
            <h1 className="lp-fade-up text-[40px] font-semibold leading-[1.05] tracking-tight text-neutral-900 sm:text-[52px] lg:text-[56px]">
              An AI-native{' '}
              <span className="bg-gradient-to-r from-violet-600 to-fuchsia-600 bg-clip-text text-transparent">
                infinite whiteboard
              </span>
              .
            </h1>
            <p className="lp-fade-up-d2 mt-6 max-w-xl text-[16px] leading-relaxed text-neutral-600 sm:text-[17px]">
              Drop shapes on a canvas, select them, and ask Claude to reason, expand, or generate alongside them. Text, images, and video land back on the board as movable, persistent objects.
            </p>

            <div className="lp-fade-up-d3 mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={onStart}
                disabled={starting}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-5 py-3 text-[14px] font-semibold text-white shadow-lg shadow-violet-500/25 transition hover:translate-y-[-1px] hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {starting ? (
                  <>
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
                      <path fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                    Creating board…
                  </>
                ) : (
                  <>
                    Create a board
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M5 12h14M13 5l7 7-7 7" />
                    </svg>
                  </>
                )}
              </button>
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-white px-5 py-3 text-[14px] font-semibold text-neutral-800 transition hover:border-neutral-300 hover:bg-neutral-50"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.55v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.55-.29-5.23-1.28-5.23-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.04 0 0 .97-.31 3.18 1.18a11.06 11.06 0 015.79 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.58.23 2.75.11 3.04.74.81 1.18 1.84 1.18 3.1 0 4.42-2.69 5.4-5.25 5.68.41.36.78 1.06.78 2.13v3.15c0 .31.2.66.8.55C20.22 21.38 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5z" />
                </svg>
                Star on GitHub
              </a>
            </div>

            <p className="lp-fade-up-d4 mt-5 text-[12.5px] text-neutral-500">
              Bring your own OpenRouter key — stored only in this browser. No accounts, no waitlists.
            </p>
          </div>

          <div className="lp-fade-up-d2 lg:col-span-6">
            <HeroMock />
            <p className="mt-3 text-right text-[11.5px] text-neutral-400">
              <a
                href={TLDRAW_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 transition hover:text-neutral-600"
              >
                Canvas surface by tldraw
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M7 17L17 7M7 7h10v10" />
                </svg>
              </a>
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
