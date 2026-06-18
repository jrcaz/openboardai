import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  DefaultToolbar,
  DefaultToolbarContent,
  Tldraw,
  TldrawUiMenuItem,
  type Editor,
  type TLCamera,
  type TLCameraOptions,
  type TLFrameShape,
  type TLComponents,
  type TLImageShape,
  type TLRecord,
  type TLShape,
  type TLShapeId,
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
import { SlideshowControls } from './present/SlideshowControls'
import {
  findInitialPresentationFrame,
  getPresentationFrames,
  moveToPresentationFrame,
} from './present/slides'
import { UserMenu } from '../components/UserMenu'
import { GitHubBadge } from './GitHubBadge'
import { ToolsToggle } from './ToolsToggle'
import { useToolsVisible } from './useToolsVisible'
import { FileMenu } from './FileMenu'
import { BoardLoading } from './BoardLoading'
import { ShareButton } from './ShareButton'
import { ProjectsSidebar } from './ProjectsSidebar'
import { createBoardAssetStore } from './boardAssetStore'

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
      onSelect: () => editor.setCurrentTool(SPREADSHEET_TYPE),
    }
    return tools
  },
}

const baseComponents: TLComponents = {
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

type ImageAnnotationSession = {
  imageId: TLShapeId
  wasLocked: boolean
  camera: TLCamera
  cameraOptions: TLCameraOptions
}

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
  const [isPresenting, setIsPresenting] = useState(false)
  const [selectedImage, setSelectedImage] = useState<TLImageShape | null>(null)
  const [annotationSession, setAnnotationSession] = useState<ImageAnnotationSession | null>(null)
  const [presentationFrameId, setPresentationFrameId] = useState<TLShapeId | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [boardTitle, setBoardTitle] = useState('Untitled')
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

  // Pre-fetch the snapshot before <Tldraw> mounts so we can pass it via prop —
  // avoids a flicker where empty store is rendered then replaced.
  useEffect(() => {
    let cancelled = false
    setLoadError(null)
    setClaimable(null)
    api
      .getBoard(boardId)
      .then((board) => {
        if (cancelled) return
        if (board.snapshot && Object.keys(board.snapshot).length > 0) {
          initialSnapshotRef.current = board.snapshot as unknown as TLStoreSnapshot
        }
        setBoardTitle(board.title || 'Untitled')
        setShare({ isPublic: board.isPublic, shareToken: board.shareToken })
        loadedRef.current = true
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
          await importMarkdownFile(ed, f, { point: info.point })
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
          } catch (err) {
            console.error('[board] save failed', err)
          }
        }, 1500)
      }

      const unlisten = ed.store.listen(scheduleSave, { source: 'all', scope: 'document' })
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
        // The editor now remounts on board switch (BoardPage keys by boardId).
        // If a debounced save is still pending, flush it to this board so the
        // last edits aren't dropped on the way out.
        if (saveTimerRef.current != null) flush()
      }
    },
    [boardId],
  )

  useEffect(() => {
    if (!editor) {
      setSelectedImage(null)
      return
    }
    const updateSelection = () => {
      const selected = editor.getSelectedShapes()
      setSelectedImage(
        selected.length === 1 && selected[0]?.type === 'image'
          ? (selected[0] as TLImageShape)
          : null,
      )
    }
    updateSelection()
    return editor.store.listen(updateSelection, { source: 'all', scope: 'session' })
  }, [editor])

  const annotationShapeIdsRef = useRef(new Set<TLShapeId>())

  useEffect(() => {
    if (!editor || !annotationSession) return
    annotationShapeIdsRef.current = new Set()
    const unlisten = editor.store.listen(
      (entry) => {
        for (const record of Object.values(entry.changes.added) as TLRecord[]) {
          if (record.typeName !== 'shape') continue
          const shape = record as TLShape
          if (shape.id !== annotationSession.imageId && shape.type !== 'group') {
            annotationShapeIdsRef.current.add(shape.id)
          }
        }
      },
      { source: 'user', scope: 'document' },
    )
    return unlisten
  }, [annotationSession, editor])

  const startImageAnnotation = useCallback(() => {
    if (!editor || !selectedImage || annotationSession) return
    const bounds = editor.getShapePageBounds(selectedImage.id)
    if (!bounds) return

    const camera = editor.getCamera()
    const cameraOptions = editor.getCameraOptions()
    setAnnotationSession({
      imageId: selectedImage.id,
      wasLocked: selectedImage.isLocked,
      camera,
      cameraOptions,
    })

    editor.run(
      () => {
        editor.updateShape<TLImageShape>({ id: selectedImage.id, type: 'image', isLocked: true })
        editor.selectNone()
        editor.setCurrentTool('draw')
        editor.setCameraOptions({
          ...cameraOptions,
          constraints: {
            bounds: { x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h },
            padding: { x: 96, y: 96 },
            origin: { x: 0.5, y: 0.5 },
            initialZoom: 'fit-max-100',
            baseZoom: 'fit-max-100',
            behavior: 'contain',
          },
        })
        editor.zoomToBounds(bounds, { inset: 96, animation: { duration: 180 } })
      },
      { ignoreShapeLock: true },
    )
  }, [annotationSession, editor, selectedImage])

  const finishImageAnnotation = useCallback(
    (group: boolean) => {
      if (!editor || !annotationSession) return
      const image = editor.getShape(annotationSession.imageId) as TLImageShape | undefined
      const annotationIds = [...annotationShapeIdsRef.current].filter((id) => editor.getShape(id))

      editor.run(
        () => {
          if (image) {
            editor.updateShape<TLImageShape>({
              id: annotationSession.imageId,
              type: 'image',
              isLocked: annotationSession.wasLocked,
            })
          }
          editor.setCameraOptions(annotationSession.cameraOptions)
          editor.setCamera(annotationSession.camera, { force: true })
          editor.setCurrentTool('select')
          if (group && image && annotationIds.length > 0) {
            editor.groupShapes([annotationSession.imageId, ...annotationIds], { select: true })
          } else if (image) {
            editor.select(annotationSession.imageId)
          }
        },
        { ignoreShapeLock: true },
      )
      annotationShapeIdsRef.current = new Set()
      setAnnotationSession(null)
    },
    [annotationSession, editor],
  )

  useEffect(() => {
    if (!annotationSession) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      finishImageAnnotation(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [annotationSession, finishImageAnnotation])

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
      } catch (err) {
        if (currentBoardIdRef.current !== requestedFor) return
        console.error('[share] toggle failed', err)
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
    } catch (err) {
      if (currentBoardIdRef.current !== requestedFor) return
      console.error('[share] regenerate failed', err)
      setShareError(friendlyShareError(err, 'Could not generate a new link.'))
    } finally {
      if (currentBoardIdRef.current === requestedFor) setShareBusy(false)
    }
  }, [boardId])

  const handleRename = useCallback(
    async (title: string) => {
      const requestedFor = boardId
      const previousTitle = boardTitle
      setBoardTitle(title)
      try {
        const board = await api.renameBoard(requestedFor, title)
        if (currentBoardIdRef.current !== requestedFor) return
        setBoardTitle(board.title || 'Untitled')
      } catch (err) {
        if (currentBoardIdRef.current !== requestedFor) return
        setBoardTitle(previousTitle)
        throw err
      }
    },
    [boardId, boardTitle],
  )

  const enterPresentation = useCallback(() => {
    if (!editor) return
    setIsPresenting(true)
    editor.setCurrentTool('laser')

    const frames = getPresentationFrames(editor)
    const initialFrame = findInitialPresentationFrame(editor, frames)
    setPresentationFrameId(initialFrame?.id ?? null)
    if (initialFrame) moveToPresentationFrame(editor, initialFrame.id)
  }, [editor])

  const exitPresentation = useCallback(() => {
    if (!editor) return
    setIsPresenting(false)
    setPresentationFrameId(null)
    editor.setCurrentTool('select')
  }, [editor])

  const stepPresentation = useCallback(
    (delta: -1 | 1) => {
      if (!editor) return
      const frames = getPresentationFrames(editor)
      if (frames.length === 0) {
        setPresentationFrameId(null)
        return
      }

      const fallback = findInitialPresentationFrame(editor, frames)
      const currentIndex = presentationFrameId
        ? frames.findIndex((frame: TLFrameShape) => frame.id === presentationFrameId)
        : -1
      const fallbackIndex = fallback
        ? frames.findIndex((frame: TLFrameShape) => frame.id === fallback.id)
        : 0
      const baseIndex = currentIndex >= 0 ? currentIndex : Math.max(fallbackIndex, 0)
      const nextIndex = (baseIndex + delta + frames.length) % frames.length
      const next = frames[nextIndex]
      if (!next) return
      setPresentationFrameId(next.id)
      moveToPresentationFrame(editor, next.id)
    },
    [editor, presentationFrameId],
  )

  usePresentationShortcuts({
    editor,
    isPresenting,
    enterPresentation,
    exitPresentation,
    stepPresentation,
  })

  const { visible: toolsVisible, toggle: toggleTools } = useToolsVisible()
  const assetStore = useMemo(() => createBoardAssetStore(boardId), [boardId])

  const editorComponents = useMemo<TLComponents>(
    () => ({
      ...baseComponents,
      MenuPanel: () => (
        <nav className="tlui-menu-zone board-title-menu-zone" aria-label="Board">
          <BoardTitleInlineEditor
            title={boardTitle}
            isPresenting={isPresenting}
            onRename={handleRename}
          />
        </nav>
      ),
      HelperButtons: null,
      TopPanel: null,
    }),
    [boardTitle, handleRename, isPresenting],
  )

  if (claimable) {
    return (
      <ClaimBoardScreen
        boardId={boardId}
        title={claimable.title}
        onClaimed={() => {
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
        components={editorComponents}
        assetUrls={assetUrls}
        snapshot={initialSnapshotRef.current ?? undefined}
        assets={assetStore}
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
          onDismissError={() => setShareError(null)}
        />
        <FileMenu editor={editor} boardId={boardId} />
        <ToolsToggle visible={toolsVisible} onToggle={toggleTools} />
        <div className="pointer-events-auto">
          <UserMenu />
        </div>
        <PresentationToggle
          editor={editor}
          isPresenting={isPresenting}
          onEnter={enterPresentation}
          onExit={exitPresentation}
        />
      </div>
      <LaserCursor editor={editor} />
      {!isPresenting && !annotationSession && selectedImage && (
        <div className="pointer-events-auto absolute left-1/2 top-24 z-[520] -translate-x-1/2 sm:top-16">
          <button
            type="button"
            title="Annotate image"
            onClick={startImageAnnotation}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-2.5 text-[12px] font-semibold text-neutral-800 shadow-lg transition hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-amber-300"
          >
            <PencilIcon />
            <span>Annotate image</span>
          </button>
        </div>
      )}
      {!isPresenting && annotationSession && (
        <div className="pointer-events-auto absolute left-1/2 top-20 z-[620] flex max-w-[calc(100vw-1rem)] -translate-x-1/2 items-center gap-2 rounded-lg border border-amber-200 bg-white/95 px-2 py-1.5 shadow-lg backdrop-blur sm:top-4">
          <div className="flex items-center gap-2 px-2 text-[12px] font-medium text-neutral-700">
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            Image annotation
          </div>
          <button
            type="button"
            title="Cancel image annotation"
            onClick={() => finishImageAnnotation(false)}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-2.5 text-[12px] font-semibold text-neutral-700 transition hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-amber-300"
          >
            <XIcon />
            <span>Cancel</span>
          </button>
          <button
            type="button"
            title="Done annotating image"
            onClick={() => finishImageAnnotation(true)}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-neutral-900 px-2.5 text-[12px] font-semibold text-white transition hover:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-amber-300"
          >
            <CheckIcon />
            <span>Done</span>
          </button>
        </div>
      )}
      <SlideshowControls
        editor={editor}
        isPresenting={isPresenting}
        currentFrameId={presentationFrameId}
        onStep={stepPresentation}
      />
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

function PencilIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  )
}

function XIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
      className="shrink-0"
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

function BoardTitleInlineEditor({
  title,
  isPresenting,
  onRename,
}: {
  title: string
  isPresenting: boolean
  onRename: (title: string) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(title)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!editing) setDraft(title)
  }, [title, editing])

  useEffect(() => {
    if (!editing) return
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [editing])

  const commit = useCallback(async () => {
    const next = draft.trim()
    if (!next) {
      setDraft(title)
      setEditing(false)
      setError(null)
      return
    }
    if (next === title) {
      setEditing(false)
      setError(null)
      return
    }

    setSaving(true)
    setError(null)
    try {
      await onRename(next)
      setEditing(false)
    } catch (err) {
      setError('Could not rename board.')
      console.error('[board] rename failed', err)
    } finally {
      setSaving(false)
    }
  }, [draft, onRename, title])

  const cancel = useCallback(() => {
    setDraft(title)
    setEditing(false)
    setError(null)
  }, [title])

  if (isPresenting) return null

  return (
    <div className="board-title-control pointer-events-auto relative flex h-10 w-[min(320px,calc(100vw-136px))] flex-col items-stretch">
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          maxLength={200}
          disabled={saving}
          aria-label="Board title"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => void commit()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              e.currentTarget.blur()
            } else if (e.key === 'Escape') {
              e.preventDefault()
              cancel()
            }
          }}
          className="m-1 h-8 w-[calc(100%-8px)] rounded-md border border-neutral-300 bg-white px-2.5 text-[13px] font-semibold text-neutral-900 outline-none transition focus:border-amber-300 focus:ring-2 focus:ring-amber-200 disabled:opacity-70"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="group flex h-10 w-full max-w-full items-center gap-1.5 px-3 text-[13px] font-semibold text-neutral-900 transition hover:bg-neutral-200/50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-amber-300"
          title="Rename board"
        >
          <span className="truncate">{title || 'Untitled'}</span>
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="shrink-0 text-neutral-400 opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100"
            aria-hidden="true"
          >
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4Z" />
          </svg>
        </button>
      )}
      {error && (
        <div className="absolute left-0 top-full mt-1 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-[11.5px] font-medium text-red-700 shadow-sm">
          {error}
        </div>
      )}
    </div>
  )
}
