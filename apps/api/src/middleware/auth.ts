import type { MiddlewareHandler } from 'hono'
import { auth } from '../auth.js'

export type AuthUser = typeof auth.$Infer.Session.user
export type AuthSession = typeof auth.$Infer.Session.session

export type AuthVariables = {
  user: AuthUser | null
  session: AuthSession | null
}

export type AuthEnv = { Variables: AuthVariables }

/**
 * Resolves the Better Auth session from request cookies and stashes the user
 * and session on the Hono context for downstream handlers. Runs for every
 * /api/* request (including auth routes — harmless there).
 */
export const sessionMiddleware: MiddlewareHandler<AuthEnv> = async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  c.set('user', session?.user ?? null)
  c.set('session', session?.session ?? null)
  await next()
}

/**
 * Rejects unauthenticated requests with 401. Auth routes (/api/auth/*) are
 * skipped so sign-in/sign-up remain reachable. Must run after sessionMiddleware.
 */
export const requireAuth: MiddlewareHandler<AuthEnv> = async (c, next) => {
  if (c.req.path.startsWith('/api/auth/')) return next()
  if (!c.get('user')) return c.json({ error: 'unauthorized' }, 401)
  return next()
}
