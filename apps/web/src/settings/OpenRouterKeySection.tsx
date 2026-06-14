import { useEffect, useId, useRef, useState } from 'react'
import { api, type ValidateKeyResponse } from '../lib/api'
import { useApiKey } from './useApiKey'

type Status =
  | { kind: 'idle' }
  | { kind: 'validating' }
  | { kind: 'saved' }
  | { kind: 'error'; message: string }

function maskKey(key: string): string {
  const tail = key.slice(-4)
  return `sk-or-v1-${'•'.repeat(16)}${tail}`
}

function reasonToMessage(
  reason: Exclude<ValidateKeyResponse, { valid: true }>['reason'],
): string {
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

export function OpenRouterKeySection() {
  const { key: storedKey, setKey } = useApiKey()

  const [editing, setEditing] = useState<boolean>(!storedKey)
  const [value, setValue] = useState('')
  const [show, setShow] = useState(false)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [credits, setCredits] = useState<number | undefined>(undefined)

  const inputRef = useRef<HTMLInputElement | null>(null)
  const inputId = useId()

  // Drop back to the edit form if the key is cleared elsewhere (e.g. a 401
  // from an AI request clears it via clearApiKey).
  useEffect(() => {
    if (!storedKey) setEditing(true)
  }, [storedKey])

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

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
      setValue('')
      setShow(false)
      setEditing(false)
      setStatus({ kind: 'saved' })
    } else {
      setStatus({ kind: 'error', message: reasonToMessage(result.reason) })
    }
  }

  function onRemove() {
    setKey(null)
    setCredits(undefined)
    setValue('')
    setEditing(true)
    setStatus({ kind: 'idle' })
  }

  return (
    <div>
      <header className="mb-6">
        <h2 className="text-[18px] font-semibold tracking-tight text-neutral-900">
          OpenRouter API key
        </h2>
        <p className="mt-1.5 max-w-2xl text-[13.5px] leading-relaxed text-neutral-600">
          OpenBoard AI uses OpenRouter to power AI generation on your boards. Your key is stored
          only in this browser and is sent to OpenRouter through this app's server — we never store
          or log it.
        </p>
      </header>

      {!editing && storedKey ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
              Active key
            </div>
            <div className="mt-1 font-mono text-[13px] text-neutral-800">{maskKey(storedKey)}</div>
            {typeof credits === 'number' && (
              <div className="mt-2 text-[12px] text-emerald-700">
                ${credits.toFixed(2)} remaining on OpenRouter
              </div>
            )}
          </div>

          {status.kind === 'saved' && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-[12.5px] text-emerald-700">
              Key saved.
            </div>
          )}

          <div className="flex items-center justify-between gap-2 pt-1">
            <button
              type="button"
              onClick={onRemove}
              className="text-[12.5px] font-medium text-neutral-500 transition hover:text-red-600"
            >
              Remove key
            </button>
            <button
              type="button"
              onClick={() => {
                setValue('')
                setEditing(true)
                setStatus({ kind: 'idle' })
              }}
              className="rounded-lg bg-neutral-900 px-3.5 py-2 text-[13px] font-medium text-white transition hover:bg-neutral-800"
            >
              Replace key
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="max-w-md space-y-4">
          <div>
            <label
              htmlFor={inputId}
              className="mb-1.5 block text-[12.5px] font-medium text-neutral-700"
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
                className="w-full rounded-lg border border-neutral-300 bg-white px-3.5 py-2.5 pr-10 font-mono text-[13px] text-neutral-900 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
                disabled={status.kind === 'validating'}
              />
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                tabIndex={-1}
                aria-label={show ? 'Hide key' : 'Show key'}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700"
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
              className="mt-2 inline-flex items-center gap-1 text-[12px] font-medium text-amber-700 transition hover:text-amber-800"
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
            {storedKey && (
              <button
                type="button"
                onClick={() => {
                  setEditing(false)
                  setStatus({ kind: 'idle' })
                }}
                className="rounded-lg px-3.5 py-2 text-[13px] font-medium text-neutral-600 transition hover:bg-neutral-100"
                disabled={status.kind === 'validating'}
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={submitDisabled}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-amber-400 to-orange-400 px-4 py-2 text-[13px] font-semibold text-neutral-900 shadow-sm transition hover:from-amber-500 hover:to-orange-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {status.kind === 'validating' && (
                <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
                  <path fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
              )}
              {status.kind === 'validating' ? 'Validating…' : 'Validate & Save'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
