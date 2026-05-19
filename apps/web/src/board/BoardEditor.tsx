import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Tldraw,
  type Editor,
  type TLStoreSnapshot,
  getSnapshot,
  loadSnapshot,
} from 'tldraw'
import 'tldraw/tldraw.css'
import { api } from '../lib/api'
import { AiCardShapeUtil } from './shapes/AiCardShapeUtil'
import { AiHtmlShapeUtil } from './shapes/AiHtmlShapeUtil'
import { AiImageShapeUtil } from './shapes/AiImageShapeUtil'
import { AiVideoShapeUtil } from './shapes/AiVideoShapeUtil'
import { AiPromptBar } from './ai/AiPromptBar'
import { importHtmlFile, isHtmlFile } from './ai/useAiHtmlImport'
import { PresentationToggle } from './present/PresentationToggle'
import { LaserCursor } from './present/LaserCursor'
import { usePresentationShortcuts } from './present/usePresentationShortcuts'
import { SettingsButton } from '../settings/SettingsButton'
import { GitHubBadge } from './GitHubBadge'
import { ToolsToggle } from './ToolsToggle'
import { useToolsVisible } from './useToolsVisible'

const customShapeUtils = [
  AiCardShapeUtil,
  AiImageShapeUtil,
  AiVideoShapeUtil,
  AiHtmlShapeUtil,
]

const TLDRAW_LICENSE_KEY = import.meta.env.VITE_TLDRAW_LICENSE_KEY

interface Props {
  boardId: string
}

export function BoardEditor({ boardId }: Props) {
  const [editor, setEditor] = useState<Editor | null>(null)
  const [isPresenting, setIsPresenting] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const initialSnapshotRef = useRef<TLStoreSnapshot | null>(null)
  const loadedRef = useRef(false)
  const saveTimerRef = useRef<number | null>(null)
  const lastSavedRef = useRef<string>('')

  // Pre-fetch the snapshot before <Tldraw> mounts so we can pass it via prop —
  // avoids a flicker where empty store is rendered then replaced.
  useEffect(() => {
    let cancelled = false
    api
      .getBoard(boardId)
      .then((board) => {
        if (cancelled) return
        if (board.snapshot && Object.keys(board.snapshot).length > 0) {
          initialSnapshotRef.current = board.snapshot as unknown as TLStoreSnapshot
        }
        loadedRef.current = true
        // Force a render to mount <Tldraw> with the snapshot prop.
        setEditor((e) => e)
        forceMount()
      })
      .catch((err) => setLoadError((err as Error).message))
    return () => {
      cancelled = true
    }
  }, [boardId])

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
        const otherFiles: File[] = []
        for (const f of info.files) {
          if (isHtmlFile(f)) htmlFiles.push(f)
          else otherFiles.push(f)
        }
        for (const f of htmlFiles) {
          await importHtmlFile(ed, f, { boardId, point: info.point })
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

  usePresentationShortcuts({ editor, isPresenting, setIsPresenting })

  const { visible: toolsVisible, toggle: toggleTools } = useToolsVisible()

  if (loadError) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-red-600">
        Failed to load board: {loadError}
      </div>
    )
  }

  if (!loadedRef.current) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-neutral-500">
        Loading board…
      </div>
    )
  }

  return (
    <div
      className={`app-shell${isPresenting ? ' is-presenting' : ''}${
        !toolsVisible && !isPresenting ? ' tools-hidden' : ''
      }`}
    >
      <Tldraw
        shapeUtils={customShapeUtils}
        snapshot={initialSnapshotRef.current ?? undefined}
        onMount={handleMount}
        licenseKey={TLDRAW_LICENSE_KEY || undefined}
      />
      <div className="top-right-cluster pointer-events-none absolute right-4 top-4 z-[500] flex items-center gap-2">
        <GitHubBadge />
        <ToolsToggle visible={toolsVisible} onToggle={toggleTools} />
        <SettingsButton />
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

