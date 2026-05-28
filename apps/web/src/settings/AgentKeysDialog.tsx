import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ApiKeySummary, CreatedApiKey } from '@openboard-ai/shared'
import { api } from '../lib/api'

interface Props {
  onClose: () => void
}

function formatRelative(iso: string | null): string {
  if (!iso) return 'never used'
  const ms = Date.now() - new Date(iso).getTime()
  const sec = Math.floor(ms / 1000)
  if (sec < 60) return 'just now'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 30) return `${day}d ago`
  return new Date(iso).toLocaleDateString()
}

export function AgentKeysDialog({ onClose }: Props) {
  const [keys, setKeys] = useState<ApiKeySummary[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [justCreated, setJustCreated] = useState<CreatedApiKey | null>(null)
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const cardRef = useRef<HTMLDivElement | null>(null)
  const inputId = useId()

  const refresh = useCallback(async () => {
    try {
      const rows = await api.listApiKeys()
      setKeys(rows)
    } catch (err) {
      setLoadError((err as Error).message)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !creating) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, creating])

  async function onCreate(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || creating) return
    setCreating(true)
    setCreateError(null)
    try {
      const created = await api.createApiKey(trimmed)
      setJustCreated(created)
      setName('')
      await refresh()
    } catch (err) {
      setCreateError((err as Error).message)
    } finally {
      setCreating(false)
    }
  }

  async function onRevoke(id: string) {
    if (!confirm('Revoke this key? Any agent using it will lose access immediately.')) return
    setRevokingId(id)
    try {
      await api.revokeApiKey(id)
      await refresh()
    } catch (err) {
      alert((err as Error).message)
    } finally {
      setRevokingId(null)
    }
  }

  function onBackdrop(e: React.MouseEvent) {
    if (creating) return
    if (e.target === e.currentTarget) onClose()
  }

  function copy(text: string) {
    void navigator.clipboard.writeText(text).catch(() => {})
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://your.host'

  return createPortal(
    <div
      onClick={onBackdrop}
      className="pointer-events-auto fixed inset-0 z-[600] flex items-center justify-center bg-neutral-950/40 backdrop-blur-md p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${inputId}-title`}
    >
      <div
        ref={cardRef}
        className="relative w-full max-w-xl rounded-2xl bg-white shadow-2xl ring-1 ring-black/5 p-7 max-h-[90vh] overflow-y-auto"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 rounded-md p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 transition"
          disabled={creating}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6l-12 12" />
          </svg>
        </button>

        <div className="mb-5">
          <h2 id={`${inputId}-title`} className="text-[17px] font-semibold text-neutral-900">
            Agent access keys
          </h2>
          <p className="mt-2 text-[13.5px] leading-relaxed text-neutral-600">
            Create an API key to let external AI agents (Claude Desktop, Cursor, custom scripts)
            read your boards and add new content to them. Each key acts as you — keep it secret.
          </p>
        </div>

        {justCreated && (
          <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-amber-800">
              Copy this key now — you won't see it again
            </div>
            <div className="mt-2 flex items-center gap-2">
              <code className="flex-1 break-all rounded-md bg-white px-2.5 py-1.5 font-mono text-[12px] text-neutral-900 ring-1 ring-amber-200">
                {justCreated.plaintext}
              </code>
              <button
                type="button"
                onClick={() => copy(justCreated.plaintext)}
                className="rounded-md bg-neutral-900 px-2.5 py-1.5 text-[12px] font-medium text-white hover:bg-neutral-800 transition"
              >
                Copy
              </button>
            </div>
            <div className="mt-3 space-y-1.5 text-[12px] text-neutral-700">
              <div className="font-semibold">Use it</div>
              <div>
                REST:{' '}
                <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[11.5px]">
                  curl -H "Authorization: Bearer {justCreated.plaintext.slice(0, 12)}..."{' '}
                  {origin}/api/agent/v1/boards
                </code>
              </div>
              <div>
                MCP:{' '}
                <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[11.5px]">
                  {origin}/api/mcp
                </code>{' '}
                with header{' '}
                <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[11.5px]">
                  Authorization: Bearer …
                </code>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setJustCreated(null)}
              className="mt-3 text-[12px] font-medium text-amber-900 hover:underline"
            >
              I've saved the key — dismiss
            </button>
          </div>
        )}

        <form onSubmit={onCreate} className="mb-5 flex gap-2">
          <input
            id={inputId}
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              if (createError) setCreateError(null)
            }}
            placeholder="e.g. claude-desktop"
            maxLength={80}
            disabled={creating}
            className="flex-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-[13px] text-neutral-900 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-200 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={creating || name.trim().length === 0}
            className="rounded-lg bg-gradient-to-r from-amber-400 to-orange-400 px-4 py-2 text-[13px] font-semibold text-neutral-900 shadow-sm transition hover:from-amber-500 hover:to-orange-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {creating ? 'Creating…' : 'Create key'}
          </button>
        </form>
        {createError && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">
            {createError}
          </div>
        )}

        <div className="rounded-xl border border-neutral-200">
          <div className="border-b border-neutral-200 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
            Active keys
          </div>
          {loadError && (
            <div className="px-4 py-3 text-[13px] text-red-700">{loadError}</div>
          )}
          {keys === null && !loadError && (
            <div className="px-4 py-6 text-center text-[13px] text-neutral-400">Loading…</div>
          )}
          {keys && keys.length === 0 && (
            <div className="px-4 py-6 text-center text-[13px] text-neutral-400">
              No keys yet. Create one above to give an agent access.
            </div>
          )}
          {keys && keys.length > 0 && (
            <ul className="divide-y divide-neutral-100">
              {keys.map((k) => (
                <li key={k.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium text-neutral-900">{k.name}</div>
                    <div className="mt-0.5 flex items-center gap-2 text-[11.5px] text-neutral-500">
                      <code className="font-mono">{k.prefix}…</code>
                      <span>·</span>
                      <span>created {formatRelative(k.createdAt)}</span>
                      <span>·</span>
                      <span>{formatRelative(k.lastUsedAt)}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRevoke(k.id)}
                    disabled={revokingId === k.id}
                    className="rounded-md border border-neutral-200 px-2.5 py-1 text-[12px] font-medium text-neutral-700 hover:border-red-200 hover:bg-red-50 hover:text-red-700 transition disabled:opacity-50"
                  >
                    {revokingId === k.id ? 'Revoking…' : 'Revoke'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-5 border-t border-neutral-100 pt-3 text-[11.5px] leading-relaxed text-neutral-500">
          Keys are stored hashed — we never store the plaintext. AI generation tools require the
          caller to also send their OpenRouter key as <code className="font-mono">X-OpenRouter-Key</code>.
        </div>
      </div>
    </div>,
    document.body,
  )
}
