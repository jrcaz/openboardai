import type { ComponentType, ReactNode } from 'react'
import { useEffect, useMemo } from 'react'
import { useLocation, useParams } from 'wouter'
import { UserMenu } from '../components/UserMenu'
import { AgentKeysSection } from '../settings/AgentKeysSection'
import { OpenRouterKeySection } from '../settings/OpenRouterKeySection'
import { BrandMark } from './landing/BrandMark'

type SectionDef = {
  slug: string
  label: string
  description: string
  Icon: ComponentType<{ className?: string }>
  enabled: boolean
  Component?: ComponentType
}

const SECTIONS: readonly SectionDef[] = [
  {
    slug: 'openrouter-key',
    label: 'OpenRouter key',
    description: 'The API key that powers AI generation on your boards',
    Icon: SparkIcon,
    enabled: true,
    Component: OpenRouterKeySection,
  },
  {
    slug: 'agent-keys',
    label: 'Agent keys',
    description: 'Programmatic access for external AI agents',
    Icon: KeyIcon,
    enabled: true,
    Component: AgentKeysSection,
  },
] as const

const DEFAULT_SLUG = SECTIONS.find((s) => s.enabled)!.slug

export function SettingsPage() {
  const params = useParams<{ section?: string }>()
  const [, setLocation] = useLocation()

  const active = useMemo(() => {
    const requested = params.section
    if (!requested) return SECTIONS.find((s) => s.slug === DEFAULT_SLUG)!
    const match = SECTIONS.find((s) => s.slug === requested && s.enabled)
    return match ?? null
  }, [params.section])

  const needsRedirect = !!params.section && !active

  useEffect(() => {
    if (needsRedirect) {
      setLocation('/settings', { replace: true })
    }
  }, [needsRedirect, setLocation])

  if (needsRedirect) return null

  const resolved = active!
  const ActiveComponent = resolved.Component

  return (
    <div className="min-h-full bg-neutral-50 text-neutral-900">
      <header className="sticky top-0 z-30 border-b border-neutral-200 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6 lg:px-8">
          <a href="/" className="flex items-center gap-2.5">
            <BrandMark size={30} />
            <span className="text-[15px] font-semibold tracking-tight text-neutral-900">
              OpenBoard AI
            </span>
          </a>
          <UserMenu />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10 lg:px-8">
        <div className="lp-fade-up mb-7">
          <h1 className="text-[24px] font-semibold tracking-tight text-neutral-900">Settings</h1>
          <p className="mt-1 text-[13.5px] text-neutral-600">
            Manage your account and how AI tools connect to your boards.
          </p>
        </div>

        <div className="lp-fade-up flex flex-col gap-6 md:flex-row md:gap-10" style={{ animationDelay: '0.04s' }}>
          <SectionNav activeSlug={resolved.slug} onSelect={(slug) => setLocation(`/settings/${slug}`)} />

          <section className="min-w-0 flex-1">
            <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-8">
              <SectionPanel key={resolved.slug}>
                {ActiveComponent ? <ActiveComponent /> : <ComingSoon section={resolved} />}
              </SectionPanel>
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}

function SectionPanel({ children }: { children: ReactNode }) {
  return (
    <div className="lp-fade-up" style={{ animationDuration: '0.22s' }}>
      {children}
    </div>
  )
}

function SectionNav({
  activeSlug,
  onSelect,
}: {
  activeSlug: string
  onSelect: (slug: string) => void
}) {
  return (
    <>
      <nav
        aria-label="Settings sections"
        className="hidden w-56 shrink-0 md:block"
      >
        <ul className="space-y-0.5">
          {SECTIONS.map((s) => {
            const isActive = s.slug === activeSlug
            return (
              <li key={s.slug}>
                <button
                  type="button"
                  disabled={!s.enabled}
                  onClick={() => s.enabled && onSelect(s.slug)}
                  aria-current={isActive ? 'page' : undefined}
                  className={[
                    'relative flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] font-medium transition',
                    isActive
                      ? 'bg-amber-50/70 text-neutral-900'
                      : s.enabled
                        ? 'text-neutral-700 hover:bg-neutral-100'
                        : 'cursor-not-allowed text-neutral-400',
                  ].join(' ')}
                >
                  {isActive && (
                    <span
                      aria-hidden="true"
                      className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-full bg-amber-500"
                    />
                  )}
                  <s.Icon className={isActive ? 'text-amber-600' : 'text-neutral-400'} />
                  <span className="flex-1 truncate">{s.label}</span>
                  {!s.enabled && (
                    <span className="rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                      Soon
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      </nav>

      <nav
        aria-label="Settings sections"
        className="md:hidden -mx-2 overflow-x-auto"
      >
        <ul className="flex gap-2 px-2 pb-1">
          {SECTIONS.map((s) => {
            const isActive = s.slug === activeSlug
            return (
              <li key={s.slug} className="shrink-0">
                <button
                  type="button"
                  disabled={!s.enabled}
                  onClick={() => s.enabled && onSelect(s.slug)}
                  aria-current={isActive ? 'page' : undefined}
                  className={[
                    'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition',
                    isActive
                      ? 'border-amber-300 bg-amber-50 text-neutral-900'
                      : s.enabled
                        ? 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'
                        : 'cursor-not-allowed border-neutral-200 bg-neutral-50 text-neutral-400',
                  ].join(' ')}
                >
                  <s.Icon className={isActive ? 'text-amber-600' : 'text-neutral-400'} />
                  {s.label}
                  {!s.enabled && (
                    <span className="rounded-full bg-white/80 px-1.5 py-0 text-[9.5px] font-semibold uppercase tracking-wider text-neutral-500">
                      Soon
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      </nav>
    </>
  )
}

function ComingSoon({ section }: { section: SectionDef }) {
  return (
    <div className="flex flex-col items-center py-10 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100 text-neutral-400">
        <section.Icon className="" />
      </div>
      <div className="text-[15px] font-semibold text-neutral-800">{section.label}</div>
      <div className="mt-1 max-w-sm text-[13px] leading-relaxed text-neutral-500">
        {section.description}. Coming soon.
      </div>
    </div>
  )
}

function SparkIcon({ className }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15l-1.9-4.1L5.5 9l4.6-1.4L12 3z" />
      <path d="M18 14l.8 1.9 1.9.8-1.9.8-.8 1.9-.8-1.9-1.9-.8 1.9-.8.8-1.9z" />
    </svg>
  )
}

function KeyIcon({ className }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
    </svg>
  )
}

