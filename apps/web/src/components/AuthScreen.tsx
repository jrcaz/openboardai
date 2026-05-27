import { useEffect, useState } from 'react'
import { Link, Redirect, useLocation } from 'wouter'
import { BrandMark } from '../routes/landing/BrandMark'
import { signIn, signUp, useSession } from '../lib/auth-client'
import { api } from '../lib/api'

type Mode = 'login' | 'signup'

const COPY: Record<Mode, { title: string; subtitle: string; cta: string; switchTo: Mode }> = {
  login: {
    title: 'Welcome back',
    subtitle: 'Sign in to reach your boards.',
    cta: 'Sign in',
    switchTo: 'signup',
  },
  signup: {
    title: 'Create your account',
    subtitle: 'One place for all your boards — no files to juggle.',
    cta: 'Create account',
    switchTo: 'login',
  },
}

const MIN_PASSWORD = 8

export function AuthScreen({ mode }: { mode: Mode }) {
  const [, setLocation] = useLocation()
  const { data: session, isPending: sessionPending } = useSession()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Whether the GitHub button should show — backend tells us if it's configured.
  const [githubEnabled, setGithubEnabled] = useState(false)
  const [githubSubmitting, setGithubSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false
    api
      .getAuthConfig()
      .then((cfg) => {
        if (!cancelled) setGithubEnabled(cfg.socialProviders.github)
      })
      .catch(() => {
        // Leave the button hidden if we can't reach the config — email still works.
      })
    return () => {
      cancelled = true
    }
  }, [])

  // GitHub OAuth failures redirect back here with `?error=…` — surface it once,
  // then strip the param so a refresh doesn't keep showing the banner.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('error')) {
      setError('Couldn’t sign in with GitHub. Please try again.')
      window.history.replaceState(null, '', window.location.pathname)
    }
  }, [])

  // Already signed in → skip the form entirely.
  if (!sessionPending && session) return <Redirect to="/dashboard" />

  const copy = COPY[mode]
  const isSignup = mode === 'signup'
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  const canSubmit =
    !submitting &&
    emailOk &&
    password.length >= MIN_PASSWORD &&
    (!isSignup || name.trim().length > 0)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)

    const result = isSignup
      ? await signUp.email({ name: name.trim(), email: email.trim(), password })
      : await signIn.email({ email: email.trim(), password })

    if (result.error) {
      setSubmitting(false)
      setError(
        result.error.message ||
          (isSignup
            ? "Couldn't create your account. Try again."
            : "Couldn't sign you in. Check your email and password."),
      )
      return
    }
    setLocation('/dashboard')
  }

  async function handleGithub() {
    setGithubSubmitting(true)
    setError(null)
    // Absolute callback URLs so the post-OAuth redirect lands on the web origin
    // (in dev the API is on a different port). Both go through a full-page
    // redirect; on success Better Auth navigates us, on failure it returns here
    // with `?error=…`. A thrown error means the request never left — surface it.
    const result = await signIn.social({
      provider: 'github',
      callbackURL: `${window.location.origin}/dashboard`,
      errorCallbackURL: `${window.location.origin}/login`,
    })
    if (result?.error) {
      setGithubSubmitting(false)
      setError('Couldn’t sign in with GitHub. Please try again.')
    }
  }

  return (
    <div className="relative flex min-h-full flex-col bg-white text-neutral-900">
      {/* faint dot grid for a touch of depth, matching the landing aesthetic */}
      <div className="lp-dot-grid pointer-events-none absolute inset-0 opacity-[0.5] [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" />

      <header className="relative z-10">
        <div className="mx-auto flex h-16 max-w-7xl items-center px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2.5">
            <BrandMark size={30} />
            <span className="text-[15px] font-semibold tracking-tight text-neutral-900">
              OpenBoard AI
            </span>
          </Link>
        </div>
      </header>

      <main className="relative z-10 flex flex-1 items-center justify-center px-4 pb-16">
        <div className="lp-fade-up w-full max-w-md rounded-2xl bg-white p-7 shadow-2xl ring-1 ring-black/5 sm:p-8">
          <div className="mb-6">
            <h1 className="text-[22px] font-semibold tracking-tight text-neutral-900">
              {copy.title}
            </h1>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-neutral-600">{copy.subtitle}</p>
          </div>

          {githubEnabled && (
            <div className="mb-5">
              <button
                type="button"
                onClick={handleGithub}
                disabled={githubSubmitting}
                className="inline-flex w-full items-center justify-center gap-2.5 rounded-xl border border-neutral-300 bg-white px-5 py-3 text-[14px] font-semibold text-neutral-900 transition hover:bg-neutral-50 active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200 disabled:cursor-wait disabled:opacity-60"
              >
                {githubSubmitting ? <Spinner /> : <GitHubIcon />}
                {githubSubmitting ? 'Redirecting…' : 'Continue with GitHub'}
              </button>

              <div className="mt-5 flex items-center gap-3" aria-hidden="true">
                <span className="h-px flex-1 bg-neutral-200" />
                <span className="text-[11.5px] font-medium uppercase tracking-wide text-neutral-400">
                  or continue with email
                </span>
                <span className="h-px flex-1 bg-neutral-200" />
              </div>
            </div>
          )}

          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            {isSignup && (
              <Field label="Name" htmlFor="name">
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  autoComplete="name"
                  className={INPUT_CLASS}
                  disabled={submitting}
                />
              </Field>
            )}

            <Field label="Email" htmlFor="email">
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  if (error) setError(null)
                }}
                placeholder="you@example.com"
                autoComplete="email"
                className={INPUT_CLASS}
                disabled={submitting}
              />
            </Field>

            <Field
              label="Password"
              htmlFor="password"
              hint={isSignup ? `At least ${MIN_PASSWORD} characters` : undefined}
            >
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    if (error) setError(null)
                  }}
                  placeholder="••••••••"
                  autoComplete={isSignup ? 'new-password' : 'current-password'}
                  className={`${INPUT_CLASS} pr-10`}
                  disabled={submitting}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700"
                >
                  {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            </Field>

            {error && (
              <div
                className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-[12.5px] text-red-700"
                role="alert"
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={!canSubmit}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 to-orange-400 px-5 py-3 text-[14px] font-semibold text-neutral-900 shadow-lg shadow-amber-500/30 transition hover:from-amber-500 hover:to-orange-500 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
            >
              {submitting && <Spinner />}
              {submitting ? 'Just a moment…' : copy.cta}
            </button>
          </form>

          <p className="mt-6 text-center text-[13px] text-neutral-600">
            {isSignup ? 'Already have an account?' : "Don't have an account?"}{' '}
            <Link
              href={copy.switchTo === 'login' ? '/login' : '/signup'}
              className="font-semibold text-amber-700 transition hover:text-amber-800"
            >
              {copy.switchTo === 'login' ? 'Sign in' : 'Sign up'}
            </Link>
          </p>
        </div>
      </main>
    </div>
  )
}

const INPUT_CLASS =
  'w-full rounded-lg border border-neutral-300 bg-white px-3.5 py-2.5 text-[14px] text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-200 disabled:opacity-60'

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string
  htmlFor: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <label htmlFor={htmlFor} className="block text-[12.5px] font-medium text-neutral-700">
          {label}
        </label>
        {hint && <span className="text-[11.5px] text-neutral-400">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
      <path fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  )
}

function GitHubIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  )
}

function EyeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function EyeOffIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  )
}
