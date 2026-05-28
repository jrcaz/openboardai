import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'wouter'
import type { BoardSummary } from '@openboard-ai/shared'
import { api } from '../lib/api'
import { relativeTime } from '../lib/relativeTime'
import { BrandMark } from '../routes/landing/BrandMark'

type LoadState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; boards: BoardSummary[] }

interface Props {
  boardId: string
  isPresenting: boolean
}

const COLLAPSE_DELAY_MS = 180

export function ProjectsSidebar({ boardId, isPresenting }: Props) {
  const [, setLocation] = useLocation()
  const [expanded, setExpanded] = useState(false)
  const [state, setState] = useState<LoadState>({ kind: 'idle' })
  const [creating, setCreating] = useState(false)
  const collapseTimer = useRef<number | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const toggleRef = useRef<HTMLButtonElement | null>(null)

  const load = useCallback(async () => {
    setState({ kind: 'loading' })
    try {
      const boards = await api.listBoards()
      setState({ kind: 'ready', boards })
    } catch (err) {
      setState({ kind: 'error', message: (err as Error).message })
    }
  }, [])

  // Lazy-load on first expand, refresh when navigating to a different board so
  // the active highlight and updatedAt times stay accurate.
  useEffect(() => {
    if (!expanded) return
    if (state.kind === 'idle' || state.kind === 'error') void load()
  }, [expanded, load, state.kind])

  // Refresh the list when the user navigates to a different board *while the
  // sidebar is open* — otherwise the next open will trigger its own load.
  useEffect(() => {
    if (!expanded) return
    if (state.kind === 'ready') void load()
  }, [boardId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Collapse on navigation away from this board.
  useEffect(() => {
    setExpanded(false)
  }, [boardId])

  // Esc to close while expanded.
  useEffect(() => {
    if (!expanded) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setExpanded(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [expanded])

  const cancelCollapse = useCallback(() => {
    if (collapseTimer.current != null) {
      clearTimeout(collapseTimer.current)
      collapseTimer.current = null
    }
  }, [])

  const scheduleCollapse = useCallback(() => {
    cancelCollapse()
    collapseTimer.current = window.setTimeout(() => {
      setExpanded(false)
      collapseTimer.current = null
    }, COLLAPSE_DELAY_MS)
  }, [cancelCollapse])

  const open = useCallback(() => {
    cancelCollapse()
    setExpanded(true)
  }, [cancelCollapse])

  const handleFocusOut = useCallback((e: React.FocusEvent<HTMLDivElement>) => {
    // If focus moved to something outside the panel, close. Treat the toggle
    // button as "inside" so Shift+Tab from the first panel item lands on the
    // toggle without close→reopen flicker (its onFocus would just reopen).
    if (!panelRef.current) return
    const next = e.relatedTarget as Node | null
    if (next && panelRef.current.contains(next)) return
    if (next && toggleRef.current?.contains(next)) return
    setExpanded(false)
  }, [])

  const handleCreate = useCallback(async () => {
    if (creating) return
    setCreating(true)
    try {
      const board = await api.createBoard()
      setLocation(`/b/${board.id}`)
    } catch (err) {
      setCreating(false)
      alert('Failed to create board: ' + (err as Error).message)
    }
  }, [creating, setLocation])

  const openBoard = useCallback(
    (id: string) => {
      if (id === boardId) {
        setExpanded(false)
        return
      }
      setLocation(`/b/${id}`)
    },
    [boardId, setLocation],
  )

  if (isPresenting) return null

  const boards = state.kind === 'ready' ? state.boards : []

  return (
    <>
      {/* Hover bridge: an invisible strip on the very left edge so users can
          enter the sidebar zone without needing to land precisely on the
          button. Only catches pointer events when collapsed. */}
      <div
        aria-hidden="true"
        className={`absolute left-0 top-0 z-[480] h-full w-3 ${
          expanded ? 'pointer-events-none' : ''
        }`}
        onPointerEnter={open}
      />

      {/* Toggle button — styled to look like a sibling tile of tldraw's
          .tlui-menu-zone (flush to top-left corner, same bg, rounded BR). */}
      <button
        ref={toggleRef}
        type="button"
        aria-label={expanded ? 'Close boards' : 'Open boards'}
        aria-expanded={expanded}
        data-expanded={expanded}
        tabIndex={expanded ? -1 : 0}
        onPointerEnter={open}
        onFocus={open}
        onClick={() => (expanded ? setExpanded(false) : open())}
        className="projects-sidebar-toggle"
      >
        <PanelLeftIcon />
      </button>

      {/* Panel */}
      <div
        ref={panelRef}
        onPointerEnter={open}
        onPointerLeave={scheduleCollapse}
        onBlur={handleFocusOut}
        className={`absolute left-0 top-0 z-[500] flex h-full w-72 flex-col border-r border-neutral-200 bg-white/95 shadow-[0_12px_40px_-8px_rgba(0,0,0,0.25)] backdrop-blur-md transition-transform duration-200 ease-out ${
          expanded
            ? 'translate-x-0 pointer-events-auto'
            : '-translate-x-full pointer-events-none'
        }`}
        inert={!expanded}
      >
        <header className="flex items-center justify-between gap-2 border-b border-neutral-200/80 px-4 py-3.5">
          <a
            href="/dashboard"
            className="group flex min-w-0 items-center gap-2.5"
            onClick={(e) => {
              e.preventDefault()
              setLocation('/dashboard')
            }}
          >
            <BrandMark size={28} />
            <span className="truncate text-[14px] font-semibold tracking-tight text-neutral-900 group-hover:text-neutral-700">
              Your boards
            </span>
          </a>
          <button
            type="button"
            aria-label="Close boards"
            onClick={() => setExpanded(false)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700"
          >
            <PanelLeftIcon />
          </button>
        </header>

        <div className="px-3 pt-3">
          <button
            type="button"
            onClick={handleCreate}
            disabled={creating}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-amber-400 to-orange-400 px-3 py-2 text-[13px] font-semibold text-neutral-900 shadow-sm transition hover:from-amber-500 hover:to-orange-500 active:translate-y-px disabled:cursor-wait disabled:opacity-70"
          >
            {creating ? (
              <Spinner />
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
            )}
            <span>{creating ? 'Creating…' : 'New board'}</span>
          </button>
        </div>

        <div className="mt-2 flex-1 overflow-y-auto px-2 pb-3">
          {state.kind === 'loading' && <SidebarSkeleton />}
          {state.kind === 'error' && (
            <SidebarError message={state.message} onRetry={() => void load()} />
          )}
          {state.kind === 'ready' && boards.length === 0 && (
            <p className="px-3 py-6 text-center text-[12.5px] text-neutral-500">
              You don't have any other boards yet.
            </p>
          )}
          {state.kind === 'ready' && boards.length > 0 && (
            <ul className="flex flex-col gap-0.5" role="list">
              {boards
                .slice()
                .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
                .map((board) => {
                  const isActive = board.id === boardId
                  return (
                    <li key={board.id}>
                      <button
                        type="button"
                        onClick={() => openBoard(board.id)}
                        aria-current={isActive ? 'page' : undefined}
                        className={`group flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition ${
                          isActive
                            ? 'bg-amber-50 ring-1 ring-amber-200'
                            : 'hover:bg-neutral-100'
                        }`}
                      >
                        <span
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${
                            isActive
                              ? 'bg-gradient-to-br from-amber-400 to-orange-400 text-neutral-900'
                              : 'bg-neutral-100 text-neutral-500 group-hover:bg-white group-hover:text-neutral-700'
                          }`}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <rect x="3" y="5" width="18" height="14" rx="2.5" />
                          </svg>
                        </span>
                        <span className="min-w-0 flex-1">
                          <span
                            className={`block truncate text-[13px] font-medium ${
                              isActive ? 'text-neutral-900' : 'text-neutral-800'
                            }`}
                          >
                            {board.title || 'Untitled board'}
                          </span>
                          <span className="block truncate text-[11.5px] text-neutral-500">
                            {relativeTime(board.updatedAt)}
                          </span>
                        </span>
                      </button>
                    </li>
                  )
                })}
            </ul>
          )}
        </div>

        <footer className="border-t border-neutral-200/80 px-3 py-2.5">
          <button
            type="button"
            onClick={() => setLocation('/dashboard')}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-medium text-neutral-600 transition hover:bg-neutral-100 hover:text-neutral-900"
          >
            View all boards
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12h14M13 5l7 7-7 7" />
            </svg>
          </button>
        </footer>
      </div>
    </>
  )
}

function PanelLeftIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <path d="M9 4v16" />
    </svg>
  )
}

function Spinner() {
  return (
    <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.3" strokeWidth="4" />
      <path fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  )
}

function SidebarSkeleton() {
  return (
    <div className="flex flex-col gap-1 px-1">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-2.5 rounded-lg px-2 py-2">
          <div className="h-8 w-8 shrink-0 animate-pulse rounded-md bg-neutral-100" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-3/4 animate-pulse rounded bg-neutral-100" />
            <div className="h-2.5 w-1/3 animate-pulse rounded bg-neutral-100" />
          </div>
        </div>
      ))}
    </div>
  )
}

function SidebarError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="mx-1 mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-center">
      <p className="text-[12.5px] font-medium text-red-800">Couldn't load boards</p>
      <p className="mt-0.5 truncate text-[11.5px] text-red-600">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-2 rounded-md border border-red-200 bg-white px-2.5 py-1 text-[11.5px] font-medium text-red-700 transition hover:bg-red-100"
      >
        Try again
      </button>
    </div>
  )
}
