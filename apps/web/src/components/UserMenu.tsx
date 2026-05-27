import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'wouter'
import { signOut, useSession } from '../lib/auth-client'

function initials(name: string | null | undefined, email: string): string {
  const source = (name && name.trim()) || email
  const parts = source.split(/[\s@._-]+/).filter(Boolean)
  const letters = parts.slice(0, 2).map((p) => p[0]!.toUpperCase())
  return letters.join('') || email[0]!.toUpperCase()
}

export function UserMenu() {
  const { data } = useSession()
  const [, setLocation] = useLocation()
  const [open, setOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!data) return null
  const { user } = data

  async function handleSignOut() {
    setSigningOut(true)
    await signOut()
    setLocation('/')
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-400 text-[12.5px] font-semibold text-neutral-900 shadow-sm ring-1 ring-black/5 transition hover:brightness-105 active:scale-95"
      >
        {initials(user.name, user.email)}
      </button>

      {open && (
        <div
          role="menu"
          className="lp-fade-up absolute right-0 z-[700] mt-2 w-60 origin-top-right overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-[0_12px_40px_-8px_rgba(0,0,0,0.25)]"
          style={{ animationDuration: '0.18s' }}
        >
          <div className="border-b border-neutral-100 px-4 py-3">
            <div className="truncate text-[13px] font-semibold text-neutral-900">
              {user.name || 'Your account'}
            </div>
            <div className="mt-0.5 truncate text-[12px] text-neutral-500">{user.email}</div>
          </div>
          <div className="p-1.5">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false)
                setLocation('/dashboard')
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium text-neutral-700 transition hover:bg-neutral-100"
            >
              <GridIcon />
              My boards
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={handleSignOut}
              disabled={signingOut}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium text-neutral-700 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-60"
            >
              <SignOutIcon />
              {signingOut ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function GridIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  )
}

function SignOutIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
      <path d="M16 17l5-5-5-5M21 12H9" />
    </svg>
  )
}
