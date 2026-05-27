import type { ReactNode } from 'react'
import { Redirect } from 'wouter'
import { useSession } from '../lib/auth-client'

/**
 * Gates a route behind a signed-in session. While the session resolves we show
 * a quiet full-screen spinner; unauthenticated users are redirected to /login.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { data, isPending } = useSession()

  if (isPending) {
    return (
      <div className="flex min-h-full items-center justify-center bg-white">
        <span
          className="h-7 w-7 animate-spin rounded-full border-[3px] border-neutral-200 border-t-amber-500"
          role="status"
          aria-label="Loading"
        />
      </div>
    )
  }

  if (!data) return <Redirect to="/login" />

  return <>{children}</>
}
