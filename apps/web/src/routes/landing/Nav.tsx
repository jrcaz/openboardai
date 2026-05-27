import { Link } from 'wouter'
import { BrandMark } from './BrandMark'
import { GITHUB_URL } from './links'
import { useSession } from '../../lib/auth-client'
import { UserMenu } from '../../components/UserMenu'

export function LandingNav() {
  const { data: session, isPending } = useSession()

  return (
    <header className="absolute inset-x-0 top-0 z-20">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6 lg:px-8">
        <a href="/" className="flex items-center gap-2.5">
          <BrandMark size={30} />
          <span className="text-[15px] font-semibold tracking-tight text-neutral-900">
            OpenBoard AI
          </span>
        </a>
        <nav className="flex items-center gap-1 text-[13px] font-medium text-neutral-600 sm:gap-5">
          <a href="#features" className="hidden rounded-md px-2 py-1 transition hover:text-neutral-900 sm:inline">
            Features
          </a>
          <a href="#how" className="hidden rounded-md px-2 py-1 transition hover:text-neutral-900 sm:inline">
            How it works
          </a>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 transition hover:text-neutral-900"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.55v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.55-.29-5.23-1.28-5.23-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.04 0 0 .97-.31 3.18 1.18a11.06 11.06 0 015.79 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.58.23 2.75.11 3.04.74.81 1.18 1.84 1.18 3.1 0 4.42-2.69 5.4-5.25 5.68.41.36.78 1.06.78 2.13v3.15c0 .31.2.66.8.55C20.22 21.38 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5z" />
            </svg>
            GitHub
          </a>

          {isPending ? null : session ? (
            <>
              <Link
                href="/dashboard"
                className="hidden rounded-md px-2 py-1 transition hover:text-neutral-900 sm:inline"
              >
                Dashboard
              </Link>
              <UserMenu />
            </>
          ) : (
            <>
              <Link href="/login" className="rounded-md px-2 py-1 transition hover:text-neutral-900">
                Sign in
              </Link>
              <Link
                href="/signup"
                className="inline-flex items-center rounded-lg bg-neutral-900 px-3 py-1.5 font-semibold text-white transition hover:bg-neutral-800"
              >
                Sign up
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  )
}
