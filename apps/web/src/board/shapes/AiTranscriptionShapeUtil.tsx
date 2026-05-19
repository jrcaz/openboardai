import { useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  BaseBoxShapeUtil,
  HTMLContainer,
  type Editor,
  type RecordProps,
  T,
  type TLBaseShape,
  stopEventPropagation,
} from 'tldraw'
import { updateCustomShape } from './customShape'

export const AI_TRANSCRIPTION_TYPE = 'ai-transcription' as const

export type AiTranscriptionStatus = 'transcribing' | 'done' | 'error'

export type AiTranscriptionShape = TLBaseShape<
  typeof AI_TRANSCRIPTION_TYPE,
  {
    w: number
    h: number
    status: AiTranscriptionStatus
    audioId: string | null
    mediaType: string | null
    durationMs: number | null
    transcript: string
    instruction: string
    errorMessage: string | null
    /** Epoch ms when transcription began — used by the elapsed timer. */
    startedAt: number | null
  }
>

// @ts-expect-error tldraw 4.5+ narrowed TLBaseBoxShape to a closed union of built-in shapes; custom shape types are no longer accepted as generic args.
export class AiTranscriptionShapeUtil extends BaseBoxShapeUtil<AiTranscriptionShape> {
  static override type = AI_TRANSCRIPTION_TYPE
  static override props: RecordProps<AiTranscriptionShape> = {
    w: T.number,
    h: T.number,
    status: T.literalEnum('transcribing', 'done', 'error'),
    audioId: T.string.nullable(),
    mediaType: T.string.nullable(),
    durationMs: T.number.nullable(),
    transcript: T.string,
    instruction: T.string,
    errorMessage: T.string.nullable(),
    startedAt: T.number.nullable(),
  }

  override getDefaultProps(): AiTranscriptionShape['props'] {
    return {
      w: 360,
      h: 220,
      status: 'transcribing',
      audioId: null,
      mediaType: null,
      durationMs: null,
      transcript: '',
      instruction: '',
      errorMessage: null,
      startedAt: null,
    }
  }

  override canResize() {
    return true
  }

  override component(shape: AiTranscriptionShape) {
    return <AiTranscriptionComponent shape={shape} editor={this.editor} />
  }

  override indicator(shape: AiTranscriptionShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={14} ry={14} />
  }
}

function AiTranscriptionComponent({
  shape,
  editor,
}: {
  shape: AiTranscriptionShape
  editor: Editor
}) {
  const { w, h, status, audioId, durationMs, transcript, instruction, errorMessage, startedAt } =
    shape.props
  const cardRef = useRef<HTMLDivElement>(null)

  // Auto-grow shape height to fit rendered transcript content. Never shrink —
  // if the user manually drags the resize handle larger, we leave it alone.
  useEffect(() => {
    const el = cardRef.current
    if (!el) return
    let raf = 0
    const measure = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const measured = Math.ceil(el.scrollHeight)
        if (measured > h + 1) {
          updateCustomShape<AiTranscriptionShape>(editor, {
            id: shape.id,
            type: AI_TRANSCRIPTION_TYPE,
            props: { h: measured },
          })
        }
      })
    }
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    measure()
    return () => {
      ro.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [editor, shape.id, h, w, transcript, status])

  const borderClass =
    status === 'transcribing'
      ? 'border-indigo-300'
      : status === 'error'
      ? 'border-red-300'
      : 'border-neutral-200'

  return (
    <HTMLContainer
      id={shape.id}
      style={{ pointerEvents: 'all', width: w, height: h }}
    >
      <div
        ref={cardRef}
        className={`flex h-full w-full flex-col overflow-hidden rounded-2xl border ${borderClass} bg-white shadow-[0_2px_6px_rgba(0,0,0,0.06),0_18px_38px_-18px_rgba(67,56,202,0.28)] transition-colors duration-500`}
      >
        <header className="flex items-center gap-2 border-b border-neutral-100 bg-gradient-to-r from-indigo-50 to-sky-50 px-3 py-2">
          <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-sky-500 text-white shadow-sm">
            <MicIcon className="h-3 w-3" />
          </span>
          <span className="flex-1 truncate text-xs font-medium text-indigo-900">
            Audio{' '}
            <span className="text-indigo-500/70">·</span>{' '}
            {formatDuration(durationMs, status, startedAt)}
          </span>
          <StatusDot status={status} />
        </header>

        {/* Audio player + waveform glyph */}
        <div className="flex items-center gap-2 border-b border-neutral-100 bg-white px-3 py-2">
          <WaveformGlyph active={status === 'transcribing'} />
          {audioId ? (
            <audio
              src={`/api/audios/${audioId}`}
              controls
              preload="metadata"
              onPointerDown={stopEventPropagation}
              onClick={stopEventPropagation}
              className="ai-audio h-7 min-w-0 flex-1"
            />
          ) : (
            <span className="text-[11px] italic text-indigo-500/70">
              {status === 'error' ? 'No audio' : 'Uploading audio…'}
            </span>
          )}
        </div>

        {instruction && (
          <div className="border-b border-neutral-100 bg-indigo-50/40 px-3 py-1.5 text-[10.5px] text-indigo-800/80">
            <span className="font-semibold uppercase tracking-wider text-indigo-700/70">
              Instruction
            </span>{' '}
            <span className="italic">"{instruction}"</span>
          </div>
        )}

        <div className="flex-1 px-3 py-2 text-[13px] leading-snug text-neutral-800">
          {transcript ? (
            <div className="ai-md break-words">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{transcript}</ReactMarkdown>
              {status === 'transcribing' && <Caret />}
            </div>
          ) : status === 'transcribing' ? (
            <div className="flex items-center gap-2 text-xs text-indigo-500/80">
              <Spinner /> Transcribing…
            </div>
          ) : status === 'error' ? (
            <div className="text-xs text-red-600">
              {errorMessage ?? 'Transcription failed.'}
            </div>
          ) : (
            <div className="text-xs text-neutral-400">(empty)</div>
          )}
        </div>

        {status === 'done' && transcript && (
          <footer className="flex items-center justify-end gap-1 border-t border-neutral-100 bg-neutral-50 px-2 py-1">
            <button
              onPointerDown={stopEventPropagation}
              onClick={() => navigator.clipboard.writeText(transcript)}
              className="rounded px-2 py-1 text-[11px] font-medium text-neutral-600 hover:bg-neutral-200"
            >
              Copy
            </button>
          </footer>
        )}

        {status === 'error' && (
          <footer className="flex items-center justify-end gap-1 border-t border-neutral-100 bg-red-50 px-2 py-1">
            <button
              onPointerDown={stopEventPropagation}
              onClick={(e) => {
                e.stopPropagation()
                window.dispatchEvent(
                  new CustomEvent('ai-transcription:retry', {
                    detail: { shapeId: shape.id },
                  }),
                )
              }}
              className="rounded bg-white px-2 py-1 text-[11px] font-medium text-red-700 shadow-sm ring-1 ring-red-200 transition hover:bg-red-50"
            >
              Retry
            </button>
          </footer>
        )}
      </div>
    </HTMLContainer>
  )
}

function StatusDot({ status }: { status: AiTranscriptionStatus }) {
  const color =
    status === 'transcribing'
      ? 'bg-indigo-500 animate-pulse'
      : status === 'done'
      ? 'bg-emerald-500'
      : 'bg-red-500'
  return <span className={`h-2 w-2 flex-none rounded-full ${color}`} />
}

function Caret() {
  return (
    <span className="ml-0.5 inline-block h-3.5 w-1.5 -translate-y-px animate-pulse bg-indigo-500 align-middle" />
  )
}

function Spinner() {
  return (
    <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  )
}

function MicIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  )
}

function WaveformGlyph({ active }: { active: boolean }) {
  // 5 vertical bars — animate heights when actively transcribing.
  const heights = [10, 16, 22, 14, 8]
  return (
    <span
      className={`flex h-5 flex-none items-end gap-[2px] text-indigo-500 ${
        active ? 'animate-pulse' : ''
      }`}
      aria-hidden="true"
    >
      {heights.map((base, i) => (
        <span
          key={i}
          className="block w-[3px] rounded-sm bg-current"
          style={{
            height: `${base}px`,
            animation: active
              ? `ai-audio-bar 0.9s ease-in-out ${i * 0.12}s infinite alternate`
              : undefined,
          }}
        />
      ))}
    </span>
  )
}

function formatDuration(
  durationMs: number | null,
  status: AiTranscriptionStatus,
  startedAt: number | null,
): string {
  // While transcribing without a known duration, show the elapsed time so
  // the user has feedback that something's happening.
  if (durationMs != null) return formatMs(durationMs)
  if (status === 'transcribing' && startedAt != null) {
    return `${formatMs(Math.max(0, Date.now() - startedAt))} elapsed`
  }
  return '—'
}

function formatMs(ms: number): string {
  const total = Math.floor(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}
