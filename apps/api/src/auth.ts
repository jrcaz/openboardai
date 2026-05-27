import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { db, schema } from './db/client.js'

const baseURL = process.env.BETTER_AUTH_URL ?? 'http://localhost:3001'
const isProduction = process.env.NODE_ENV === 'production'

// Fail fast rather than let Better Auth sign sessions with a missing/weak secret —
// a deploy without this set would otherwise produce forgeable sessions.
const secret = process.env.BETTER_AUTH_SECRET
if (!secret) {
  throw new Error(
    'BETTER_AUTH_SECRET is required. Generate one with: openssl rand -base64 32',
  )
}

// Origins allowed to drive auth requests. Extra origins can be supplied via
// BETTER_AUTH_TRUSTED_ORIGINS (comma-separated) for deployed environments.
//
// In development the web app's Vite port isn't guaranteed — Vite falls back to
// 5174, 5175, … when 5173 is taken — so we trust any localhost port via wildcard
// host patterns (Better Auth matches a `*` pattern against the request host).
// Production stays strict: only the base URL (added automatically) and any
// explicitly configured origins are trusted.
const envOrigins =
  process.env.BETTER_AUTH_TRUSTED_ORIGINS?.split(',').map((o) => o.trim()).filter(Boolean) ?? []

const trustedOrigins = isProduction
  ? envOrigins
  : ['http://localhost:5173', 'http://localhost:3001', 'localhost:*', '127.0.0.1:*', ...envOrigins]

// GitHub OAuth is opt-in: only wired up when both credentials are present, so the
// app still boots in environments where GitHub isn't configured. The web app reads
// `socialProviders` (via /api/public-config) to decide whether to show the button.
const githubClientId = process.env.GITHUB_CLIENT_ID
const githubClientSecret = process.env.GITHUB_CLIENT_SECRET
export const socialProviders = { github: Boolean(githubClientId && githubClientSecret) }

export const auth = betterAuth({
  baseURL,
  secret,
  trustedOrigins,
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  emailAndPassword: {
    enabled: true,
    // No email-sending wired up yet, so don't gate sign-in on verification.
    requireEmailVerification: false,
  },
  // Default account-linking links a GitHub login to an existing email/password
  // account only when GitHub reports the email as verified — the secure default,
  // so no `account.accountLinking` override is needed.
  ...(socialProviders.github
    ? { socialProviders: { github: { clientId: githubClientId!, clientSecret: githubClientSecret! } } }
    : {}),
})
