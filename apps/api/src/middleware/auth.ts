import type { MiddlewareHandler } from 'hono'
import { eq } from 'drizzle-orm'
import { auth } from '../auth.js'
import { db, schema } from '../db/client.js'
import { resolveApiKey } from '../lib/apikeys.js'

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
 * For agent surfaces (/api/agent, /api/mcp). Resolves the request's user from
 * either a Better Auth session cookie (preferred — lets the browser dogfood the
 * endpoints) OR an `Authorization: Bearer <key>` header. The bearer path is
 * what external AI agents use; the key is validated against the api_keys table.
 * Leaves `user` null on context if neither auth source succeeds — pair with
 * `requireAuth` to reject.
 */
export const bearerOrSessionMiddleware: MiddlewareHandler<AuthEnv> = async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  if (session?.user) {
    c.set('user', session.user)
    c.set('session', session.session)
    return next()
  }

  const authHeader = c.req.header('authorization')?.trim()
  const bearer =
    authHeader && /^bearer\s+/i.test(authHeader)
      ? authHeader.replace(/^bearer\s+/i, '').trim()
      : null
  if (bearer) {
    const resolved = await resolveApiKey(bearer)
    if (resolved) {
      const [row] = await db
        .select()
        .from(schema.user)
        .where(eq(schema.user.id, resolved.userId))
        .limit(1)
      if (row) {
        c.set('user', row as AuthUser)
        c.set('session', null)
        return next()
      }
    }
  }

  c.set('user', null)
  c.set('session', null)
  return next()
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
