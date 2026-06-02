import { useCallback, useEffect, useRef, useState } from 'react'
import {
  DefaultToolbar,
  DefaultToolbarContent,
  Tldraw,
  TldrawUiMenuItem,
  type Editor,
  type TLComponents,
  type TLStoreSnapshot,
  type TLUiAssetUrlOverrides,
  type TLUiOverrides,
  getSnapshot,
  loadSnapshot,
  useIsToolSelected,
  useTools,
} from 'tldraw'
import { api } from '../lib/api'
import { ClaimBoardScreen } from './ClaimBoardScreen'
import { customShapeUtils } from './shapes/customShapeUtils'
import {
  SPREADSHEET_TYPE,
  SpreadsheetShapeTool,
} from './shapes/SpreadsheetShapeUtil'
import { AiPromptBar } from './ai/AiPromptBar'
import { importHtmlFile, isHtmlFile } from './ai/useAiHtmlImport'
import { importMarkdownFile, isMarkdownFile } from './ai/useMarkdownImport'
import { PresentationToggle } from './present/PresentationToggle'
import { LaserCursor } from './present/LaserCursor'
import { usePresentationShortcuts } from './present/usePresentationShortcuts'
import { SettingsButton } from '../settings/SettingsButton'
import { UserMenu } from '../components/UserMenu'
import { GitHubBadge } from './GitHubBadge'
import { ToolsToggle } from './ToolsToggle'
import { useToolsVisible } from './useToolsVisible'
import { FileMenu } from './FileMenu'
import { BoardLoading } from './BoardLoading'
import { ShareButton } from './ShareButton'
import { ProjectsSidebar } from './ProjectsSidebar'
import { hashBoardId, track } from '../analytics/posthog'
import { countShapeTypes, snapshotSizeKb } from '../analytics/events'

const ACTIVE_HEARTBEAT_MS = 60_000

const customTools = [SpreadsheetShapeTool]

// A monochrome grid glyph for the toolbar. tldraw renders icons via CSS mask,
// so a black-stroked SVG data URI shows up tinted in the toolbar's accent.
const SPREADSHEET_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg>`
const SPREADSHEET_ICON = 'spreadsheet-grid'

const assetUrls: TLUiAssetUrlOverrides = {
  icons: {
    [SPREADSHEET_ICON]: `data:image/svg+xml;utf8,${encodeURIComponent(SPREADSHEET_ICON_SVG)}`,
  },
}

const uiOverrides: TLUiOverrides = {
  tools(editor, tools) {
    // No `kbd` shortcut — keeps the canvas key map clean and avoids any future
    // collision with built-in tldraw bindings; the toolbar button is the entry.
    tools[SPREADSHEET_TYPE] = {
      id: SPREADSHEET_TYPE,
      icon: SPREADSHEET_ICON,
      label: 'Spreadsheet',
      onSelect: () => {
        track('spreadsheet_tool_selected')
        editor.setCurrentTool(SPREADSHEET_TYPE)
      },
    }
    return tools
  },
}

const components: TLComponents = {
  Toolbar: (props) => {
    const tools = useTools()
    const isSelected = useIsToolSelected(tools[SPREADSHEET_TYPE])
    return (
      <DefaultToolbar {...props}>
        <DefaultToolbarContent />
        <TldrawUiMenuItem {...tools[SPREADSHEET_TYPE]} isSelected={isSelected} />
      </DefaultToolbar>
    )
  },
}

const TLDRAW_LICENSE_KEY = import.meta.env.VITE_TLDRAW_LICENSE_KEY

// Maps an HTTP status (parsed out of `lib/api.ts`'s "HTTP <code>: <body>"
// error string) to a short message we can render in the share popover.
function friendlyShareError(err: unknown, fallback: string): string {
  const message = err instanceof Error ? err.message : String(err)
  const match = /^HTTP (\d+):/.exec(message)
  if (!match) return fallback
  const status = Number(match[1])
  if (status === 401) return 'Your session has expired. Please sign in again.'
  if (status === 403) return "You don't have permission to share this board."
  if (status === 404) return "This board no longer exists, or isn't yours."
  if (status >= 500) return 'The server had a problem updating sharing. Please try again.'
  return fallback
}

interface Props {
  boardId: string
}

export function BoardEditor({ boardId }: Props) {
  const [editor, setEditor] = useState<Editor | null>(null)
  const [isPresenting, setIsPresentingState] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  // Set when the board 404s but is an ownerless legacy board the user can claim.
  const [claimable, setClaimable] = useState<{ title: string | null } | null>(null)
  // Public sharing state owned at this level so the ShareButton is purely
  // presentational and any update from toggle/regenerate is reflected in a
  // single source of truth (rather than divergent state inside the button).
  const [share, setShare] = useState<{ isPublic: boolean; shareToken: string | null }>({
    isPublic: false,
    shareToken: null,
  })
  const [shareBusy, setShareBusy] = useState(false)
  const [shareError, setShareError] = useState<string | null>(null)
  // Bumped after a successful claim to re-run the load effect (board is now ours).
  const [reloadNonce, setReloadNonce] = useState(0)
  const initialSnapshotRef = useRef<TLStoreSnapshot | null>(null)
  const loadedRef = useRef(false)
  const saveTimerRef = useRef<number | null>(null)
  const lastSavedRef = useRef<string>('')
  const openedAtRef = useRef<number>(Date.now())
  const lastHeartbeatRef = useRef<number>(0)

  const setIsPresenting = useCallback((next: boolean) => {
    setIsPresentingState((prev) => {
      if (prev !== next) track('presentation_mode_toggled', { enabled: next })
      return next
    })
  }, [])

  // Pre-fetch the snapshot before <Tldraw> mounts so we can pass it via prop —
  // avoids a flicker where empty store is rendered then replaced.
  useEffect(() => {
    let cancelled = false
    setLoadError(null)
    setClaimable(null)
    openedAtRef.current = Date.now()
    lastHeartbeatRef.current = 0
    loadedRef.current = false
    lastSavedRef.current = ''
    api
      .getBoard(boardId)
      .then((board) => {
        if (cancelled) return
        if (board.snapshot && Object.keys(board.snapshot).length > 0) {
          initialSnapshotRef.current = board.snapshot as unknown as TLStoreSnapshot
        } else {
          initialSnapshotRef.current = null
        }
        setShare({ isPublic: board.isPublic, shareToken: board.shareToken })
        loadedRef.current = true
        const snap = initialSnapshotRef.current
        const { total, byType } = countShapeTypes(snap)
        track('board_opened', {
          board_id_hash: hashBoardId(boardId),
          shape_count: total,
          shape_type_counts: byType,
          snapshot_size_kb: snap ? snapshotSizeKb(snap) : 0,
        })
        // Force a render to mount <Tldraw> with the snapshot prop.
        setEditor((e) => e)
        forceMount()
      })
      .catch(async (err) => {
        if (cancelled) return
        const message = (err as Error).message
        // A 404 might be an ownerless legacy board the user can claim rather
        // than a genuinely missing/forbidden one — probe before erroring out.
        if (/\b404\b/.test(message)) {
          try {
            const status = await api.getBoardClaimStatus(boardId)
            if (cancelled) return
            if (status.claimable) {
              setClaimable({ title: status.title })
              return
            }
          } catch {
            // fall through to the generic error below
          }
        }
        if (!cancelled) setLoadError(message)
      })
    return () => {
      cancelled = true
    }
  }, [boardId, reloadNonce])

  const [, forceTick] = useState(0)
  const forceMount = useCallback(() => forceTick((t) => t + 1), [])

  const handleMount = useCallback(
    (ed: Editor) => {
      setEditor(ed)

      // If we didn't have a snapshot at first paint (rare race), load now.
      if (initialSnapshotRef.current && !ed.store.has(ed.getCurrentPageId())) {
        loadSnapshot(ed.store, initialSnapshotRef.current)
      }

      // Intercept dropped/pasted .html files and route them to our import
      // pipeline. Capture tldraw's default `files` handler first so non-html
      // drops (images, etc.) still work — calling `putExternalContent` here
      // would recurse back into us.
      const edHandlers = (
        ed as unknown as {
          externalContentHandlers: Record<
            string,
            ((info: unknown) => unknown) | null | undefined
          >
        }
      ).externalContentHandlers
      const defaultFiles = edHandlers?.files ?? null

      ed.registerExternalContentHandler('files', async (info) => {
        const htmlFiles: File[] = []
        const markdownFiles: File[] = []
        const otherFiles: File[] = []
        for (const f of info.files) {
          if (isHtmlFile(f)) htmlFiles.push(f)
          else if (isMarkdownFile(f)) markdownFiles.push(f)
          else otherFiles.push(f)
        }
        for (const f of htmlFiles) {
          await importHtmlFile(ed, f, { boardId, point: info.point })
        }
        for (const f of markdownFiles) {
          await importMarkdownFile(ed, f, { boardId, point: info.point })
        }
        if (otherFiles.length > 0 && defaultFiles) {
          await defaultFiles({ ...info, files: otherFiles } as unknown)
        }
      })

      const scheduleSave = () => {
        if (saveTimerRef.current != null) clearTimeout(saveTimerRef.current)
        saveTimerRef.current = window.setTimeout(async () => {
          try {
            const snap = getSnapshot(ed.store)
            const serialized = JSON.stringify(snap)
            if (serialized === lastSavedRef.current) return
            await api.saveSnapshot(boardId, snap as unknown as Record<string, unknown>)
            lastSavedRef.current = serialized
            const now = Date.now()
            if (now - lastHeartbeatRef.current >= ACTIVE_HEARTBEAT_MS) {
              lastHeartbeatRef.current = now
              const { total, byType } = countShapeTypes(snap as unknown as Record<string, unknown>)
              track('board_active', {
                board_id_hash: hashBoardId(boardId),
                shape_count: total,
                shape_type_counts: byType,
                time_since_open_s: Math.round((now - openedAtRef.current) / 1000),
              })
            }
          } catch (err) {
            console.error('[board] save failed', err)
          }
        }, 1500)
      }

      const unlisten = ed.store.listen(scheduleSave, { source: 'user', scope: 'document' })
      // Save on unload too — debounce may be in flight.
      const flush = () => {
        if (saveTimerRef.current != null) {
          clearTimeout(saveTimerRef.current)
          saveTimerRef.current = null
        }
        const snap = getSnapshot(ed.store)
        navigator.sendBeacon?.(
          `/api/boards/${boardId}`,
          new Blob([JSON.stringify({ snapshot: snap })], { type: 'application/json' }),
        )
      }
      window.addEventListener('beforeunload', flush)

      return () => {
        unlisten()
        window.removeEventListener('beforeunload', flush)
        if (saveTimerRef.current != null) clearTimeout(saveTimerRef.current)
      }
    },
    [boardId],
  )

  // Mirrors the current `boardId` prop so async share handlers below can detect
  // when the user has navigated to a different board mid-flight and skip
  // writing the stale response into the new board's share state.
  const currentBoardIdRef = useRef(boardId)
  useEffect(() => {
    currentBoardIdRef.current = boardId
  }, [boardId])

  // Toggle public sharing on/off. Owned here (not in ShareButton) so the
  // server's authoritative response always lands in the same `share` state the
  // rest of the editor reads — no chance of a stale child copy diverging.
  const handleShareToggle = useCallback(
    async (next: boolean) => {
      const requestedFor = boardId
      setShareBusy(true)
      setShareError(null)
      try {
        const board = await api.setBoardPublic(requestedFor, next)
        if (currentBoardIdRef.current !== requestedFor) return
        setShare({ isPublic: board.isPublic, shareToken: board.shareToken })
        track('board_share_toggled', {
          board_id_hash: hashBoardId(requestedFor),
          is_public: board.isPublic,
          requested_public: next,
          status: 'success',
        })
      } catch (err) {
        if (currentBoardIdRef.current !== requestedFor) return
        console.error('[share] toggle failed', err)
        track('board_share_toggled', {
          board_id_hash: hashBoardId(requestedFor),
          requested_public: next,
          status: 'error',
        })
        setShareError(friendlyShareError(err, 'Could not update sharing.'))
      } finally {
        if (currentBoardIdRef.current === requestedFor) setShareBusy(false)
      }
    },
    [boardId],
  )

  const handleShareRegenerate = useCallback(async () => {
    const requestedFor = boardId
    setShareBusy(true)
    setShareError(null)
    try {
      const next = await api.regenerateShareToken(requestedFor)
      if (currentBoardIdRef.current !== requestedFor) return
      setShare({ isPublic: next.isPublic, shareToken: next.shareToken })
      track('board_share_regenerated', {
        board_id_hash: hashBoardId(requestedFor),
        is_public: next.isPublic,
        status: 'success',
      })
    } catch (err) {
      if (currentBoardIdRef.current !== requestedFor) return
      console.error('[share] regenerate failed', err)
      track('board_share_regenerated', {
        board_id_hash: hashBoardId(requestedFor),
        status: 'error',
      })
      setShareError(friendlyShareError(err, 'Could not generate a new link.'))
    } finally {
      if (currentBoardIdRef.current === requestedFor) setShareBusy(false)
    }
  }, [boardId])

  usePresentationShortcuts({ editor, isPresenting, setIsPresenting })

  const { visible: toolsVisible, toggle: toggleTools } = useToolsVisible()

  if (claimable) {
    return (
      <ClaimBoardScreen
        boardId={boardId}
        title={claimable.title}
        onClaimed={() => {
          track('board_claimed', { board_id_hash: hashBoardId(boardId) })
          setClaimable(null)
          setReloadNonce((n) => n + 1)
        }}
      />
    )
  }

  if (loadError) {
    const notFound = /\b404\b/.test(loadError)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="text-[15px] font-semibold text-neutral-800">
          {notFound ? "This board isn't available" : 'Failed to load board'}
        </div>
        <div className="max-w-md text-[13px] text-neutral-500">
          {notFound
            ? "It may have been deleted, or it belongs to another account."
            : loadError}
        </div>
        <a
          href="/dashboard"
          className="mt-1 inline-flex items-center rounded-lg bg-gradient-to-r from-amber-400 to-orange-400 px-4 py-2 text-[13px] font-semibold text-neutral-900 shadow-sm transition hover:from-amber-500 hover:to-orange-500"
        >
          Back to your boards
        </a>
      </div>
    )
  }

  if (!loadedRef.current) {
    return <BoardLoading />
  }

  return (
    <div
      className={`app-shell${isPresenting ? ' is-presenting' : ''}${
        !toolsVisible && !isPresenting ? ' tools-hidden' : ''
      }`}
    >
      <Tldraw
        shapeUtils={customShapeUtils}
        tools={customTools}
        overrides={uiOverrides}
        components={components}
        assetUrls={assetUrls}
        snapshot={initialSnapshotRef.current ?? undefined}
        onMount={handleMount}
        licenseKey={TLDRAW_LICENSE_KEY || undefined}
      />
      <ProjectsSidebar boardId={boardId} isPresenting={isPresenting} />
      <div className="top-right-cluster pointer-events-none absolute right-4 top-4 z-[500] flex items-center gap-2">
        <GitHubBadge />
        <ShareButton
          isPublic={share.isPublic}
          shareToken={share.shareToken}
          busy={shareBusy}
          error={shareError}
          onToggle={handleShareToggle}
          onRegenerate={handleShareRegenerate}
          onCopy={() =>
            track('board_share_link_copied', {
              board_id_hash: hashBoardId(boardId),
            })
          }
          onOpenChange={(open) =>
            open &&
            track('board_share_popover_opened', {
              board_id_hash: hashBoardId(boardId),
              is_public: share.isPublic,
            })
          }
          onDismissError={() => setShareError(null)}
        />
        <FileMenu editor={editor} boardId={boardId} />
        <ToolsToggle visible={toolsVisible} onToggle={toggleTools} />
        <SettingsButton />
        <div className="pointer-events-auto">
          <UserMenu />
        </div>
        <PresentationToggle
          editor={editor}
          isPresenting={isPresenting}
          onPresentChange={setIsPresenting}
        />
      </div>
      <LaserCursor editor={editor} />
      <div
        className={`transition-all duration-200 ${
          isPresenting
            ? 'pointer-events-none translate-y-8 opacity-0'
            : ''
        }`}
      >
        <AiPromptBar boardId={boardId} editor={editor} />
      </div>
    </div>
  )
}
