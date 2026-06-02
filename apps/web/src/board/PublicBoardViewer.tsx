import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'wouter'
import { Tldraw, type Editor, type TLStoreSnapshot } from 'tldraw'
import 'tldraw/tldraw.css'
import { api } from '../lib/api'
import { customShapeUtils } from './shapes/customShapeUtils'
import { AssetBaseProvider } from './assetBase'
import { PublicBadge } from './PublicBadge'
import { countShapeTypes, snapshotSizeKb } from '../analytics/events'
import { hashValue, track } from '../analytics/posthog'

const TLDRAW_LICENSE_KEY = import.meta.env.VITE_TLDRAW_LICENSE_KEY

// Anonymous, read-only viewer for a publicly shared board. Deliberately lean —
// no auth, no autosave, no AI/editing UI. tldraw runs in read-only mode with its
// chrome hidden so the snapshot reads as a clean canvas; only pan/zoom and
// viewing embedded widgets are possible.
export function PublicBoardViewer() {
  const { token } = useParams<{ token: string }>()
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const snapshotRef = useRef<TLStoreSnapshot | null>(null)
  const [, forceMount] = useState(0)

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    api
      .getPublicBoard(token)
      .then((board) => {
        if (cancelled) return
        if (board.snapshot && Object.keys(board.snapshot).length > 0) {
          snapshotRef.current = board.snapshot as unknown as TLStoreSnapshot
        }
        document.title = `${board.title || 'Untitled'} · OpenBoard AI`
        const snap = snapshotRef.current
        const { total, byType } = countShapeTypes(snap)
        track('public_board_viewed', {
          public_token_hash: hashValue(token),
          shape_count: total,
          shape_type_counts: byType,
          snapshot_size_kb: snap ? snapshotSizeKb(snap) : 0,
          status: 'success',
        })
        setStatus('ready')
        forceMount((n) => n + 1)
      })
      .catch(() => {
        if (!cancelled) {
          track('public_board_viewed', {
            public_token_hash: hashValue(token),
            status: 'error',
          })
          setStatus('error')
        }
      })
    return () => {
      cancelled = true
    }
  }, [token])

  const handleMount = useCallback((editor: Editor) => {
    editor.updateInstanceState({ isReadonly: true })
    // Frame the whole board so viewers land on the content regardless of where
    // the owner left their camera.
    editor.zoomToFit()
  }, [])

  if (status === 'loading') {
    return (
      <div className="flex h-full items-center justify-center text-sm text-neutral-500">
        Loading board…
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="text-[15px] font-semibold text-neutral-800">
          This board isn't available
        </div>
        <div className="max-w-md text-[13px] text-neutral-500">
          The link may be turned off or no longer valid.
        </div>
        <a
          href="/"
          className="mt-1 inline-flex items-center rounded-lg bg-gradient-to-r from-amber-400 to-orange-400 px-4 py-2 text-[13px] font-semibold text-neutral-900 shadow-sm transition hover:from-amber-500 hover:to-orange-500"
        >
          Go to OpenBoard AI
        </a>
      </div>
    )
  }

  return (
    <AssetBaseProvider base="/api/public">
      <div className="app-shell">
        <Tldraw
          shapeUtils={customShapeUtils}
          snapshot={snapshotRef.current ?? undefined}
          hideUi
          onMount={handleMount}
          licenseKey={TLDRAW_LICENSE_KEY || undefined}
        />
        <PublicBadge />
      </div>
    </AssetBaseProvider>
  )
}
