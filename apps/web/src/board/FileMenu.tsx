import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation } from 'wouter'
import { type Editor, loadSnapshot, type TLStoreSnapshot } from 'tldraw'
import { api } from '../lib/api'
import { downloadBlob, parseObx, remintAndRemap, type ParsedObx, type RemappedObx } from './io/obx'
import { hashBoardId, track } from '../analytics/posthog'
import { countShapeTypes } from '../analytics/events'

interface Props {
  editor: Editor | null
  boardId: string
}

type ImportStatus =
  | { kind: 'idle' }
  | { kind: 'parsing' }
  | { kind: 'choosing'; parsed: ParsedObx; remapped: RemappedObx }
  | { kind: 'importing'; mode: 'new' | 'replace'; progress: string }
  | { kind: 'error'; message: string }

export function FileMenu({ editor, boardId }: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [, setLocation] = useLocation()
  const [exporting, setExporting] = useState(false)
  const [status, setStatus] = useState<ImportStatus>({ kind: 'idle' })

  async function onSave() {
    if (exporting) return
    setExporting(true)
    try {
      const blob = await api.exportBoard(boardId)
      const filename = filenameFromHeader(blob) ?? `board-${boardId}.obx`
      downloadBlob(blob, filename)
      track('board_exported', { board_id_hash: hashBoardId(boardId) })
    } catch (err) {
      console.error('[file-menu] export failed', err)
      setStatus({ kind: 'error', message: (err as Error).message })
    } finally {
      setExporting(false)
    }
  }

  async function onFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setStatus({ kind: 'parsing' })
    try {
      const buffer = await file.arrayBuffer()
      const parsed = await parseObx(buffer)
      const remapped = remintAndRemap(parsed)
      setStatus({ kind: 'choosing', parsed, remapped })
    } catch (err) {
      console.error('[file-menu] parse failed', err)
      setStatus({ kind: 'error', message: (err as Error).message })
    }
  }

  async function runImport(mode: 'new' | 'replace', parsed: ParsedObx, remapped: RemappedObx) {
    setStatus({ kind: 'importing', mode, progress: 'Preparing…' })
    try {
      let targetBoardId = boardId
      if (mode === 'new') {
        setStatus({ kind: 'importing', mode, progress: 'Creating board…' })
        const newBoard = await api.createBoard(parsed.title || 'Imported board')
        targetBoardId = newBoard.id
        track('board_created', {
          source: 'file_import',
          board_id_hash: hashBoardId(newBoard.id),
        })
      } else {
        setStatus({ kind: 'importing', mode, progress: 'Clearing existing assets…' })
        await api.deleteBoardAssets(targetBoardId)
        track('board_assets_cleared', { board_id_hash: hashBoardId(targetBoardId) })
      }

      let i = 0
      for (const img of remapped.imageUploads) {
        i++
        setStatus({
          kind: 'importing',
          mode,
          progress: `Uploading image ${i}/${remapped.imageUploads.length}…`,
        })
        await api.uploadImage({ ...img, boardId: targetBoardId })
      }

      let j = 0
      for (const vid of remapped.videoUploads) {
        j++
        setStatus({
          kind: 'importing',
          mode,
          progress: `Uploading video ${j}/${remapped.videoUploads.length}…`,
        })
        await api.uploadVideo({ ...vid, boardId: targetBoardId })
      }

      setStatus({ kind: 'importing', mode, progress: 'Saving canvas…' })
      await api.saveSnapshot(targetBoardId, remapped.snapshot)

      const { total } = countShapeTypes(remapped.snapshot as unknown as Record<string, unknown>)
      track('board_imported', {
        board_id_hash: hashBoardId(targetBoardId),
        mode,
        shape_count: total,
      })

      if (mode === 'new') {
        setLocation(`/b/${targetBoardId}`)
      } else if (editor) {
        loadSnapshot(editor.store, remapped.snapshot as unknown as TLStoreSnapshot)
      }

      setStatus({ kind: 'idle' })
    } catch (err) {
      console.error('[file-menu] import failed', err)
      setStatus({ kind: 'error', message: (err as Error).message })
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={onSave}
        disabled={exporting}
        title="Save board to file (.obx)"
        aria-label="Save board to file"
        className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full border border-neutral-200 bg-white/95 text-neutral-600 shadow-[0_4px_24px_-8px_rgba(0,0,0,0.18)] backdrop-blur transition hover:bg-neutral-100 hover:text-neutral-900 disabled:opacity-50"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
      </button>

      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        title="Import board from file (.obx)"
        aria-label="Import board from file"
        className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full border border-neutral-200 bg-white/95 text-neutral-600 shadow-[0_4px_24px_-8px_rgba(0,0,0,0.18)] backdrop-blur transition hover:bg-neutral-100 hover:text-neutral-900"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept=".obx,application/zip"
        onChange={onFilePicked}
        className="hidden"
      />

      {status.kind === 'parsing' && (
        <BusyDialog title="Reading file" message="Parsing .obx archive…" />
      )}

      {status.kind === 'choosing' && (
        <ChoiceDialog
          parsed={status.parsed}
          onCancel={() => setStatus({ kind: 'idle' })}
          onChoose={(mode) => runImport(mode, status.parsed, status.remapped)}
        />
      )}

      {status.kind === 'importing' && (
        <BusyDialog
          title={status.mode === 'new' ? 'Creating new board' : 'Replacing current board'}
          message={status.progress}
        />
      )}

      {status.kind === 'error' && (
        <ErrorDialog message={status.message} onClose={() => setStatus({ kind: 'idle' })} />
      )}
    </>
  )
}

function filenameFromHeader(blob: Blob): string | null {
  // Blob doesn't expose Content-Disposition; we use boardId-based fallback.
  // Kept as a hook for future server hints.
  void blob
  return null
}

function ChoiceDialog({
  parsed,
  onChoose,
  onCancel,
}: {
  parsed: ParsedObx
  onChoose: (mode: 'new' | 'replace') => void
  onCancel: () => void
}) {
  return createPortal(
    <div
      className="pointer-events-auto fixed inset-0 z-[600] flex items-center justify-center bg-neutral-950/40 backdrop-blur-md p-4"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <div className="relative w-full max-w-md rounded-2xl bg-white p-7 shadow-2xl ring-1 ring-black/5">
        <h2 className="text-[17px] font-semibold text-neutral-900">Import board</h2>
        <p className="mt-2 text-[13.5px] leading-relaxed text-neutral-600">
          <span className="font-medium text-neutral-800">{parsed.title || 'Untitled board'}</span>{' '}
          — {parsed.manifest.counts.images} image
          {parsed.manifest.counts.images === 1 ? '' : 's'},{' '}
          {parsed.manifest.counts.videos} video
          {parsed.manifest.counts.videos === 1 ? '' : 's'}.
        </p>
        <p className="mt-4 text-[13px] leading-relaxed text-neutral-600">
          How would you like to import this file?
        </p>

        <div className="mt-5 space-y-2.5">
          <button
            type="button"
            onClick={() => onChoose('new')}
            className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-left transition hover:border-amber-300 hover:bg-amber-50"
          >
            <div className="text-[13.5px] font-semibold text-neutral-900">Open as new board</div>
            <div className="mt-0.5 text-[12.5px] text-neutral-600">
              Creates a fresh board at a new URL. Your current board is untouched.
            </div>
          </button>

          <button
            type="button"
            onClick={() => onChoose('replace')}
            className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-left transition hover:border-red-300 hover:bg-red-50"
          >
            <div className="text-[13.5px] font-semibold text-neutral-900">Replace current board</div>
            <div className="mt-0.5 text-[12.5px] text-neutral-600">
              Overwrites this board's contents and deletes its existing AI assets. This can't be
              undone.
            </div>
          </button>
        </div>

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-3.5 py-2 text-[13px] font-medium text-neutral-600 transition hover:bg-neutral-100"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function BusyDialog({ title, message }: { title: string; message: string }) {
  return createPortal(
    <div
      className="pointer-events-auto fixed inset-0 z-[600] flex items-center justify-center bg-neutral-950/40 backdrop-blur-md p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative w-full max-w-sm rounded-2xl bg-white p-7 shadow-2xl ring-1 ring-black/5">
        <h2 className="text-[15px] font-semibold text-neutral-900">{title}</h2>
        <p className="mt-2 text-[13px] text-neutral-600">{message}</p>
      </div>
    </div>,
    document.body,
  )
}

function ErrorDialog({ message, onClose }: { message: string; onClose: () => void }) {
  return createPortal(
    <div
      className="pointer-events-auto fixed inset-0 z-[600] flex items-center justify-center bg-neutral-950/40 backdrop-blur-md p-4"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="relative w-full max-w-md rounded-2xl bg-white p-7 shadow-2xl ring-1 ring-black/5">
        <h2 className="text-[15px] font-semibold text-red-700">Import failed</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-neutral-700">{message}</p>
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-neutral-900 px-3.5 py-2 text-[13px] font-medium text-white transition hover:bg-neutral-800"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
