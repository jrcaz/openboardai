import { useState } from 'react'
import { api } from '../lib/api'

interface Props {
  boardId: string
  /** The legacy board's title, shown for context. Null if unknown. */
  title: string | null
  /** Called once the board has been successfully claimed by the current user. */
  onClaimed: () => void
}

/**
 * Shown when a signed-in user opens an ownerless (pre-accounts) board's URL.
 * Lets them take ownership so the board joins their dashboard, instead of the
 * dead-end "board isn't available" error. Mirrors the Dashboard empty-state
 * aesthetic (amber gradient, icon tile, lp-fade-up entrance).
 */
export function ClaimBoardScreen({ boardId, title, onClaimed }: Props) {
  const [claiming, setClaiming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // A 409 means the board is no longer claimable (already taken / gone). When
  // that happens there's nothing more to do here, so we drop the claim button.
  const [conflict, setConflict] = useState(false)

  async function handleClaim() {
    setClaiming(true)
    setError(null)
    try {
      await api.claimBoard(boardId)
      onClaimed()
    } catch (err) {
      const message = (err as Error).message
      if (/\b409\b/.test(message)) {
        setConflict(true)
        setError('This board was just claimed by someone else.')
      } else {
        setError("Couldn't claim this board. Please try again.")
      }
      setClaiming(false)
    }
  }

  return (
    <div className="flex h-full items-center justify-center bg-neutral-50 px-6">
      <div className="lp-fade-up w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-100 to-orange-100 text-amber-500">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            className="h-7 w-7"
            aria-hidden
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 3.5v17M4 4.5h13l-2.2 4 2.2 4H4" />
          </svg>
        </div>

        <h1 className="mt-5 text-[18px] font-semibold text-neutral-900">Claim this board</h1>

        <p className="mt-1.5 text-[14px] leading-relaxed text-neutral-600">
          {title ? (
            <>
              <span className="font-medium text-neutral-900">“{title}”</span> was created before
              accounts existed, so it isn&rsquo;t on anyone&rsquo;s dashboard yet.
            </>
          ) : (
            <>This board was created before accounts existed, so it isn&rsquo;t on anyone&rsquo;s dashboard yet.</>
          )}{' '}
          Claim it to add it to your boards.
        </p>

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-left text-[13px] text-red-700">
            {error}
          </div>
        )}

        <div className="mt-6 flex flex-col gap-2.5">
          {!conflict && (
            <button
              type="button"
              onClick={handleClaim}
              disabled={claiming}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 to-orange-400 px-5 py-3 text-[14px] font-semibold text-neutral-900 shadow-lg shadow-amber-500/30 transition hover:from-amber-500 hover:to-orange-500 active:translate-y-px disabled:cursor-wait disabled:opacity-70"
            >
              {claiming && (
                <span
                  className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-900/30 border-t-neutral-900"
                  aria-hidden
                />
              )}
              {claiming ? 'Claiming…' : 'Claim board'}
            </button>
          )}
          <a
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-xl px-5 py-2.5 text-[13px] font-medium text-neutral-600 transition hover:bg-neutral-100"
          >
            Back to your boards
          </a>
        </div>
      </div>
    </div>
  )
}
