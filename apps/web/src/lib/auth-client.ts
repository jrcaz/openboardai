import { createAuthClient } from 'better-auth/react'

// Same-origin in dev (Vite proxies /api → :3001) and in prod (the API serves the
// web build). Requests target `${origin}/api/auth/*`, so cookies flow normally.
export const authClient = createAuthClient({
  baseURL: typeof window !== 'undefined' ? window.location.origin : undefined,
})

export const { signIn, signUp, signOut, useSession } = authClient
