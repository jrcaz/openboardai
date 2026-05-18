import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { api, type ValidateKeyResponse } from '../lib/api'
import { useApiKey } from './useApiKey'

interface Props {
  mode: 'setup' | 'settings'
  onClose?: () => void
}

type Status =
  | { kind: 'idle' }
  | { kind: 'validating' }
  | { kind: 'error'; message: string }

function maskKey(key: string): string {
  const tail = key.slice(-4)
  return `sk-or-v1-${'•'.repeat(16)}${tail}`
}

function reasonToMessage(reason: Exclude<ValidateKeyResponse, { valid: true }>['reason']): string {
  switch (reason) {
    case 'unauthorized':
      return "Couldn't validate that key — check it and try again."
    case 'timeout':
      return 'OpenRouter took too long to respond. Try again in a moment.'
    case 'network':
      return "Couldn't reach the validation service. Check your connection."
    case 'upstream':
      return 'OpenRouter returned an unexpected response. Try again.'
    case 'bad-request':
      return 'That key looks malformed. Double-check and try again.'
  }
}

export function ApiKeyDialog({ mode, onClose }: Props) {
  const { key: storedKey, setKey } = useApiKey()
  const isSetup = mode === 'setup'

  const [editing, setEditing] = useState<boolean>(isSetup || !storedKey)
  const [value, setValue] = useState('')
  const [show, setShow] = useState(false)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [credits, setCredits] = useState<number | undefined>(undefined)

  const inputRef = useRef<HTMLInputElement | null>(null)
  const cardRef = useRef<HTMLDivElement | null>(null)
  const inputId = useId()

  // Autofocus input when entering edit mode.
  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  // ESC closes (settings mode only).
  useEffect(() => {
    if (isSetup) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && status.kind !== 'validating') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isSetup, onClose, status.kind])

  // Focus trap inside the card.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Tab' || !cardRef.current) return
      const focusables = cardRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])',
      )
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const trimmed = value.trim()
  const submitDisabled = trimmed.length === 0 || status.kind === 'validating'

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitDisabled) return
    setStatus({ kind: 'validating' })
    const result = await api.validateKey(trimmed)
    if (result.valid) {
      setKey(trimmed)
      setCredits(result.credits)
      setStatus({ kind: 'idle' })
      if (!isSetup) {
        setEditing(false)
        setValue('')
        // Auto-close settings dialog after a brief beat so user sees the success state.
        setTimeout(() => onClose?.(), 400)
      }
    } else {
      setStatus({ kind: 'error', message: reasonToMessage(result.reason) })
    }
  }

  function onBackdropClick(e: React.MouseEvent) {
    if (isSetup || status.kind === 'validating') return
    if (e.target === e.currentTarget) onClose?.()
  }

  function onRemove() {
    setKey(null)
    onClose?.()
  }

  return createPortal(
    <div
      onClick={onBackdropClick}
      className="pointer-events-auto fixed inset-0 z-[600] flex items-center justify-center bg-neutral-950/40 backdrop-blur-md p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${inputId}-title`}
    >
      <div
        ref={cardRef}
        className="w-full max-w-md rounded-2xl bg-white shadow-2xl ring-1 ring-black/5 p-7"
      >
        <div className="mb-5">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
              </svg>
            </div>
            <h2
              id={`${inputId}-title`}
              className="text-[17px] font-semibold text-neutral-900"
            >
              {isSetup ? 'Welcome to OpenBoard AI' : 'OpenRouter API key'}
            </h2>
          </div>
          <p className="mt-3 text-[13.5px] leading-relaxed text-neutral-600">
            {isSetup
              ? 'This app uses OpenRouter to power AI generation. Paste your key to get started — it’s stored only in this browser.'
              : 'Update or remove the key OpenBoard AI uses for OpenRouter requests. The key is stored only in this browser.'}
          </p>
        </div>

        {!editing && storedKey ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                Active key
              </div>
              <div className="mt-1 font-mono text-[13px] text-neutral-800">
                {maskKey(storedKey)}
              </div>
              {typeof credits === 'number' && (
                <div className="mt-2 text-[12px] text-emerald-700">
                  ${credits.toFixed(2)} remaining on OpenRouter
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 pt-1">
              <button
                type="button"
                onClick={onRemove}
                className="text-[12.5px] font-medium text-neutral-500 hover:text-red-600 transition"
              >
                Remove key
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg px-3.5 py-2 text-[13px] font-medium text-neutral-600 hover:bg-neutral-100 transition"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setValue('')
                    setEditing(true)
                    setStatus({ kind: 'idle' })
                  }}
                  className="rounded-lg bg-neutral-900 px-3.5 py-2 text-[13px] font-medium text-white hover:bg-neutral-800 transition"
                >
                  Replace key
                </button>
              </div>
            </div>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label
                htmlFor={inputId}
                className="block text-[12.5px] font-medium text-neutral-700 mb-1.5"
              >
                OpenRouter API key
              </label>
              <div className="relative">
                <input
                  id={inputId}
                  ref={inputRef}
                  type={show ? 'text' : 'password'}
                  value={value}
                  onChange={(e) => {
                    setValue(e.target.value)
                    if (status.kind === 'error') setStatus({ kind: 'idle' })
                  }}
                  placeholder="sk-or-v1-..."
                  autoComplete="off"
                  spellCheck={false}
                  className="w-full rounded-lg border border-neutral-300 bg-white px-3.5 py-2.5 pr-10 font-mono text-[13px] text-neutral-900 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-200"
                  disabled={status.kind === 'validating'}
                />
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  tabIndex={-1}
                  aria-label={show ? 'Hide key' : 'Show key'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 transition"
                >
                  {show ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
              <a
                href="https://openrouter.ai/keys"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-[12px] font-medium text-violet-600 hover:text-violet-700 transition"
              >
                Don't have one? Get a key
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M7 17L17 7M7 7h10v10" />
                </svg>
              </a>
            </div>

            {status.kind === 'error' && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-[12.5px] text-red-700">
                {status.message}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              {!isSetup && (
                <button
                  type="button"
                  onClick={() => {
                    setEditing(false)
                    setStatus({ kind: 'idle' })
                  }}
                  className="rounded-lg px-3.5 py-2 text-[13px] font-medium text-neutral-600 hover:bg-neutral-100 transition"
                  disabled={status.kind === 'validating'}
                >
                  Cancel
                </button>
              )}
              <button
                type="submit"
                disabled={submitDisabled}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-2 text-[13px] font-semibold text-white shadow-sm transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {status.kind === 'validating' && (
                  <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
                    <path fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                )}
                {status.kind === 'validating' ? 'Validating…' : 'Validate & Continue'}
              </button>
            </div>
          </form>
        )}

        <div className="mt-5 border-t border-neutral-100 pt-3 text-[11.5px] leading-relaxed text-neutral-500">
          Your key never leaves your browser except to call OpenRouter through this app's server. We don't store or log it.
        </div>
      </div>
    </div>,
    document.body,
  )
}
