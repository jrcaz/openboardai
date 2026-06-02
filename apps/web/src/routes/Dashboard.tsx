import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation } from 'wouter'
import type { BoardSummary } from '@openboard-ai/shared'
import { api } from '../lib/api'
import { relativeTime } from '../lib/relativeTime'
import { downloadBlob } from '../board/io/obx'
import { BrandMark } from './landing/BrandMark'
import { UserMenu } from '../components/UserMenu'
import { hashBoardId, track } from '../analytics/posthog'

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; boards: BoardSummary[] }

export function Dashboard() {
  const [, setLocation] = useLocation()
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [creating, setCreating] = useState(false)
  const [renaming, setRenaming] = useState<BoardSummary | null>(null)
  const [deleting, setDeleting] = useState<BoardSummary | null>(null)

  const load = useCallback(async () => {
    setState({ kind: 'loading' })
    try {
      const boards = await api.listBoards()
      setState({ kind: 'ready', boards })
      track('dashboard_loaded', { board_count: boards.length, status: 'success' })
    } catch (err) {
      setState({ kind: 'error', message: (err as Error).message })
      track('dashboard_loaded', { status: 'error' })
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const createBoard = useCallback(async () => {
    if (creating) return
    setCreating(true)
    try {
      const board = await api.createBoard()
      track('board_created', {
        source: 'dashboard',
        board_id_hash: hashBoardId(board.id),
      })
      setLocation(`/b/${board.id}`)
    } catch (err) {
      setCreating(false)
      track('board_created', { source: 'dashboard', status: 'error' })
      alert('Failed to create board: ' + (err as Error).message)
    }
  }, [creating, setLocation])

  // Optimistic rename — patch the list immediately, roll back on failure.
  const commitRename = useCallback(
    async (board: BoardSummary, title: string) => {
      const trimmed = title.trim()
      setRenaming(null)
      if (!trimmed || trimmed === board.title) return
      setState((s) =>
        s.kind === 'ready'
          ? { kind: 'ready', boards: s.boards.map((b) => (b.id === board.id ? { ...b, title: trimmed } : b)) }
          : s,
      )
      try {
        await api.renameBoard(board.id, trimmed)
        track('board_renamed', { board_id_hash: hashBoardId(board.id), source: 'dashboard' })
      } catch (err) {
        track('board_renamed', {
          board_id_hash: hashBoardId(board.id),
          source: 'dashboard',
          status: 'error',
        })
        alert('Rename failed: ' + (err as Error).message)
        void load()
      }
    },
    [load],
  )

  // Optimistic delete — drop from the list immediately, restore on failure.
  const commitDelete = useCallback(async (board: BoardSummary) => {
    setDeleting(null)
    setState((s) =>
      s.kind === 'ready' ? { kind: 'ready', boards: s.boards.filter((b) => b.id !== board.id) } : s,
    )
    try {
      await api.deleteBoard(board.id)
      track('board_deleted', { board_id_hash: hashBoardId(board.id), source: 'dashboard' })
    } catch (err) {
      track('board_deleted', {
        board_id_hash: hashBoardId(board.id),
        source: 'dashboard',
        status: 'error',
      })
      alert('Delete failed: ' + (err as Error).message)
      setState((s) =>
        s.kind === 'ready'
          ? { kind: 'ready', boards: [board, ...s.boards].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) }
          : s,
      )
    }
  }, [])

  const exportBoard = useCallback(async (board: BoardSummary) => {
    try {
      const blob = await api.exportBoard(board.id)
      downloadBlob(blob, `${safeName(board.title)}.obx`)
      track('board_exported', {
        board_id_hash: hashBoardId(board.id),
        source: 'dashboard',
      })
    } catch (err) {
      track('board_exported', {
        board_id_hash: hashBoardId(board.id),
        source: 'dashboard',
        status: 'error',
      })
      alert('Export failed: ' + (err as Error).message)
    }
  }, [])

  return (
    <div className="min-h-full bg-neutral-50 text-neutral-900">
      <header className="sticky top-0 z-30 border-b border-neutral-200 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6 lg:px-8">
          <a href="/" className="flex items-center gap-2.5">
            <BrandMark size={30} />
            <span className="text-[15px] font-semibold tracking-tight text-neutral-900">
              OpenBoard AI
            </span>
          </a>
          <div className="flex items-center gap-2">
            <Link
              href="/settings"
              className="rounded-lg px-3 py-1.5 text-[13px] font-medium text-neutral-600 transition hover:bg-neutral-100 hover:text-neutral-900"
            >
              Settings
            </Link>
            <UserMenu />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-10 lg:px-8">
        <div className="lp-fade-up mb-7 flex items-end justify-between">
          <div>
            <h1 className="text-[26px] font-semibold tracking-tight text-neutral-900">Your boards</h1>
            <p className="mt-1 text-[14px] text-neutral-600">
              {state.kind === 'ready' && state.boards.length > 0
                ? `${state.boards.length} board${state.boards.length === 1 ? '' : 's'}`
                : 'Create a board to start designing with AI.'}
            </p>
          </div>
        </div>

        {state.kind === 'loading' && <SkeletonGrid />}

        {state.kind === 'error' && (
          <ErrorState message={state.message} onRetry={load} />
        )}

        {state.kind === 'ready' && state.boards.length === 0 && (
          <EmptyState onCreate={createBoard} creating={creating} />
        )}

        {state.kind === 'ready' && state.boards.length > 0 && (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <CreateCard onCreate={createBoard} creating={creating} />
            {state.boards.map((board, i) => (
              <BoardCard
                key={board.id}
                board={board}
                index={i}
                onOpen={() => {
                  track('dashboard_board_opened', {
                    board_id_hash: hashBoardId(board.id),
                    index: i,
                  })
                  setLocation(`/b/${board.id}`)
                }}
                onRename={() => setRenaming(board)}
                onExport={() => exportBoard(board)}
                onDelete={() => setDeleting(board)}
              />
            ))}
          </div>
        )}
      </main>

      {renaming && (
        <RenameDialog
          board={renaming}
          onCancel={() => setRenaming(null)}
          onSubmit={(title) => commitRename(renaming, title)}
        />
      )}
      {deleting && (
        <ConfirmDeleteDialog
          board={deleting}
          onCancel={() => setDeleting(null)}
          onConfirm={() => commitDelete(deleting)}
        />
      )}
    </div>
  )
}

// --- Cards ---

function CreateCard({ onCreate, creating }: { onCreate: () => void; creating: boolean }) {
  return (
    <button
      type="button"
      onClick={onCreate}
      disabled={creating}
      className="lp-fade-up group flex min-h-[208px] flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-neutral-300 bg-white/60 p-6 text-center transition hover:-translate-y-0.5 hover:border-amber-400 hover:bg-amber-50/40 disabled:cursor-wait disabled:opacity-70"
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-400 text-neutral-900 shadow-sm transition group-hover:scale-105">
        {creating ? (
          <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.3" strokeWidth="4" />
            <path fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
        )}
      </span>
      <span className="text-[14px] font-semibold text-neutral-800">
        {creating ? 'Creating…' : 'New board'}
      </span>
    </button>
  )
}

function BoardCard({
  board,
  index,
  onOpen,
  onRename,
  onExport,
  onDelete,
}: {
  board: BoardSummary
  index: number
  onOpen: () => void
  onRename: () => void
  onExport: () => void
  onDelete: () => void
}) {
  return (
    <div
      className="lp-fade-up group relative flex min-h-[208px] cursor-pointer flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-[0_12px_32px_-12px_rgba(0,0,0,0.22)]"
      style={{ animationDelay: `${Math.min(index, 6) * 0.05}s` }}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen()
        }
      }}
    >
      {/* placeholder canvas preview (no thumbnails yet) */}
      <div className="lp-dot-grid relative h-32 bg-gradient-to-br from-amber-50 via-white to-orange-50">
        <div className="absolute inset-0 flex items-center justify-center text-amber-300/80">
          <BrandMark size={34} />
        </div>
      </div>

      <div className="flex flex-1 items-center justify-between gap-2 px-4 py-3.5">
        <div className="min-w-0">
          <div className="truncate text-[14px] font-semibold text-neutral-900">{board.title}</div>
          <div className="mt-0.5 text-[12px] text-neutral-500">Edited {relativeTime(board.updatedAt)}</div>
        </div>
        <CardMenu onRename={onRename} onExport={onExport} onDelete={onDelete} />
      </div>
    </div>
  )
}

function CardMenu({
  onRename,
  onExport,
  onDelete,
}: {
  onRename: () => void
  onExport: () => void
  onDelete: () => void
}) {
  const [open, setOpen] = useState(false)
  // Fixed-viewport coords for the portaled menu (right-aligned to the trigger).
  const [coords, setCoords] = useState<{ top: number; right: number } | null>(null)
  const triggerRef = useRef<HTMLDivElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      const t = e.target as Node
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return
      setOpen(false)
    }
    const close = () => setOpen(false)
    document.addEventListener('pointerdown', onPointerDown)
    // The menu is position:fixed, so close it on scroll/resize rather than let it
    // drift away from the card it belongs to.
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [open])

  // stopPropagation so menu interaction never triggers the card's "open".
  return (
    <div ref={triggerRef} className="shrink-0" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={(e) => {
          if (open) {
            setOpen(false)
            return
          }
          const r = e.currentTarget.getBoundingClientRect()
          setCoords({ top: r.bottom + 6, right: window.innerWidth - r.right })
          setOpen(true)
        }}
        aria-label="Board options"
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-400 opacity-0 transition hover:bg-neutral-100 hover:text-neutral-700 focus:opacity-100 group-hover:opacity-100 aria-expanded:opacity-100"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="12" cy="5" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="12" cy="19" r="1.6" />
        </svg>
      </button>
      {open &&
        coords &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            onClick={(e) => e.stopPropagation()}
            className="lp-fade-up fixed z-50 w-40 origin-top-right overflow-hidden rounded-xl border border-neutral-200 bg-white p-1.5 shadow-[0_12px_40px_-8px_rgba(0,0,0,0.25)]"
            style={{ top: coords.top, right: coords.right, animationDuration: '0.15s' }}
          >
            <MenuItem onClick={() => { setOpen(false); onRename() }} label="Rename" icon={<PencilIcon />} />
            <MenuItem onClick={() => { setOpen(false); onExport() }} label="Export (.obx)" icon={<DownloadIcon />} />
            <MenuItem
              onClick={() => { setOpen(false); onDelete() }}
              label="Delete"
              icon={<TrashIcon />}
              danger
            />
          </div>,
          document.body,
        )}
    </div>
  )
}

function MenuItem({
  onClick,
  label,
  icon,
  danger,
}: {
  onClick: () => void
  label: string
  icon: React.ReactNode
  danger?: boolean
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium transition ${
        danger
          ? 'text-neutral-700 hover:bg-red-50 hover:text-red-600'
          : 'text-neutral-700 hover:bg-neutral-100'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}

// --- States ---

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="min-h-[208px] overflow-hidden rounded-2xl border border-neutral-200 bg-white"
        >
          <div className="h-32 animate-pulse bg-neutral-100" />
          <div className="space-y-2 px-4 py-4">
            <div className="h-3.5 w-2/3 animate-pulse rounded bg-neutral-100" />
            <div className="h-3 w-1/3 animate-pulse rounded bg-neutral-100" />
          </div>
        </div>
      ))}
    </div>
  )
}

function EmptyState({ onCreate, creating }: { onCreate: () => void; creating: boolean }) {
  return (
    <div className="lp-fade-up flex flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-300 bg-white/60 px-6 py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-100 to-orange-100 text-amber-500">
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="5" width="18" height="14" rx="2.5" />
          <path d="M12 9v6M9 12h6" />
        </svg>
      </div>
      <h2 className="mt-5 text-[18px] font-semibold text-neutral-900">No boards yet</h2>
      <p className="mt-1.5 max-w-sm text-[14px] leading-relaxed text-neutral-600">
        Your boards live here — create one to start generating images, video, and interactive widgets on an infinite canvas.
      </p>
      <button
        type="button"
        onClick={onCreate}
        disabled={creating}
        className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 to-orange-400 px-5 py-3 text-[14px] font-semibold text-neutral-900 shadow-lg shadow-amber-500/30 transition hover:from-amber-500 hover:to-orange-500 active:translate-y-px disabled:cursor-wait disabled:opacity-70"
      >
        {creating ? 'Creating…' : 'Create your first board'}
      </button>
    </div>
  )
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="lp-fade-up flex flex-col items-center justify-center rounded-2xl border border-red-200 bg-red-50 px-6 py-16 text-center">
      <h2 className="text-[16px] font-semibold text-red-800">Couldn't load your boards</h2>
      <p className="mt-1.5 max-w-md text-[13px] text-red-700">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-5 rounded-lg border border-red-300 bg-white px-4 py-2 text-[13px] font-medium text-red-700 transition hover:bg-red-100"
      >
        Try again
      </button>
    </div>
  )
}

// --- Dialogs ---

function ModalShell({ children, onCancel }: { children: React.ReactNode; onCancel: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return createPortal(
    <div
      className="fixed inset-0 z-[600] flex items-center justify-center bg-neutral-950/40 p-4 backdrop-blur-md"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className="lp-fade-up w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-black/5" style={{ animationDuration: '0.2s' }}>
        {children}
      </div>
    </div>,
    document.body,
  )
}

function RenameDialog({
  board,
  onCancel,
  onSubmit,
}: {
  board: BoardSummary
  onCancel: () => void
  onSubmit: (title: string) => void
}) {
  const [value, setValue] = useState(board.title)
  const inputRef = useRef<HTMLInputElement | null>(null)
  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  return (
    <ModalShell onCancel={onCancel}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          onSubmit(value)
        }}
      >
        <h2 className="text-[16px] font-semibold text-neutral-900">Rename board</h2>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={200}
          className="mt-4 w-full rounded-lg border border-neutral-300 bg-white px-3.5 py-2.5 text-[14px] text-neutral-900 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
        />
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-3.5 py-2 text-[13px] font-medium text-neutral-600 transition hover:bg-neutral-100"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!value.trim()}
            className="rounded-lg bg-neutral-900 px-3.5 py-2 text-[13px] font-semibold text-white transition hover:bg-neutral-800 disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </form>
    </ModalShell>
  )
}

function ConfirmDeleteDialog({
  board,
  onCancel,
  onConfirm,
}: {
  board: BoardSummary
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <ModalShell onCancel={onCancel}>
      <h2 className="text-[16px] font-semibold text-neutral-900">Delete board?</h2>
      <p className="mt-2 text-[13.5px] leading-relaxed text-neutral-600">
        <span className="font-medium text-neutral-800">{board.title}</span> and everything on it —
        images, videos, and widgets — will be permanently deleted. This can't be undone.
      </p>
      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-3.5 py-2 text-[13px] font-medium text-neutral-600 transition hover:bg-neutral-100"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="rounded-lg bg-red-600 px-3.5 py-2 text-[13px] font-semibold text-white transition hover:bg-red-700"
        >
          Delete board
        </button>
      </div>
    </ModalShell>
  )
}

// --- helpers ---

function safeName(title: string): string {
  return title.replace(/[^a-zA-Z0-9-_ ]/g, '').trim().replace(/\s+/g, '_') || 'board'
}

function PencilIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4z" />
    </svg>
  )
}

function DownloadIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <path d="M7 10l5 5 5-5M12 15V3" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2m2 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6" />
    </svg>
  )
}
