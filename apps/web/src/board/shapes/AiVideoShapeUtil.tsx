import { useEffect, useRef, useState } from 'react'
import {
  BaseBoxShapeUtil,
  HTMLContainer,
  type RecordProps,
  T,
  type TLBaseShape,
  stopEventPropagation,
} from 'tldraw'

export const AI_VIDEO_TYPE = 'ai-video' as const

export type AiVideoStatus = 'generating' | 'done' | 'error'

export type AiVideoShape = TLBaseShape<
  typeof AI_VIDEO_TYPE,
  {
    w: number
    h: number
    prompt: string
    status: AiVideoStatus
    videoId: string | null
    mediaType: string | null
    aspect: '16:9' | '9:16'
    hasAudio: boolean
    /** Optional id of the source ai-image used as the first frame (image-to-video). */
    sourceImageId: string | null
    errorMessage: string | null
    /** Epoch ms when generation began — used by the elapsed timer. */
    startedAt: number | null
  }
>

export class AiVideoShapeUtil extends BaseBoxShapeUtil<AiVideoShape> {
  static override type = AI_VIDEO_TYPE
  static override props: RecordProps<AiVideoShape> = {
    w: T.number,
    h: T.number,
    prompt: T.string,
    status: T.literalEnum('generating', 'done', 'error'),
    videoId: T.string.nullable(),
    mediaType: T.string.nullable(),
    aspect: T.literalEnum('16:9', '9:16'),
    hasAudio: T.boolean,
    sourceImageId: T.string.nullable(),
    errorMessage: T.string.nullable(),
    startedAt: T.number.nullable(),
  }

  override getDefaultProps(): AiVideoShape['props'] {
    return {
      w: 480,
      h: 270,
      prompt: '',
      status: 'generating',
      videoId: null,
      mediaType: null,
      aspect: '16:9',
      hasAudio: true,
      sourceImageId: null,
      errorMessage: null,
      startedAt: null,
    }
  }

  override canResize() {
    return true
  }

  override component(shape: AiVideoShape) {
    return <AiVideoComponent shape={shape} />
  }

  override indicator(shape: AiVideoShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={14} ry={14} />
  }
}

function AiVideoComponent({ shape }: { shape: AiVideoShape }) {
  const { w, h, prompt, status, videoId, hasAudio, errorMessage, startedAt } =
    shape.props
  const [videoLoaded, setVideoLoaded] = useState(false)
  const [muted, setMuted] = useState(true)
  const videoRef = useRef<HTMLVideoElement>(null)

  const borderClass =
    status === 'generating'
      ? 'border-violet-300'
      : status === 'error'
      ? 'border-red-300'
      : 'border-neutral-200'

  return (
    <HTMLContainer
      id={shape.id}
      style={{ pointerEvents: 'all', width: w, height: h }}
    >
      <div
        className={`relative h-full w-full overflow-hidden rounded-2xl border ${borderClass} bg-black shadow-[0_2px_6px_rgba(0,0,0,0.06),0_18px_38px_-18px_rgba(60,40,140,0.28)] transition-colors duration-500`}
      >
        {status !== 'generating' && videoId && (
          <video
            ref={videoRef}
            src={`/api/videos/${videoId}`}
            autoPlay
            loop
            muted={muted}
            playsInline
            preload="metadata"
            onLoadedData={() => setVideoLoaded(true)}
            className={`absolute inset-0 h-full w-full select-none object-cover transition-opacity duration-500 ${
              videoLoaded ? 'opacity-100' : 'opacity-0'
            }`}
          />
        )}

        {status === 'generating' && (
          <FilmingLayer prompt={prompt} startedAt={startedAt} />
        )}

        {status === 'error' && (
          <ErrorLayer prompt={prompt} message={errorMessage} shapeId={shape.id} />
        )}

        {/* Mute / unmute pill — only for done state with audio. */}
        {status === 'done' && videoLoaded && hasAudio && (
          <button
            onPointerDown={stopEventPropagation}
            onClick={(e) => {
              e.stopPropagation()
              setMuted((m) => !m)
            }}
            className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white shadow-sm backdrop-blur-sm transition hover:bg-black/75"
            title={muted ? 'Unmute' : 'Mute'}
          >
            {muted ? <MutedIcon className="h-3.5 w-3.5" /> : <SoundIcon className="h-3.5 w-3.5" />}
          </button>
        )}

        {/* Prompt caption shown after video loads (small, bottom-left). */}
        {status === 'done' && videoLoaded && prompt && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 via-black/20 to-transparent px-3 py-2.5">
            <p
              className="line-clamp-2 text-[11px] font-medium leading-snug text-white/95 drop-shadow"
              title={prompt}
            >
              {prompt}
            </p>
          </div>
        )}
      </div>
    </HTMLContainer>
  )
}

function FilmingLayer({
  prompt,
  startedAt,
}: {
  prompt: string
  startedAt: number | null
}) {
  const elapsed = useElapsed(startedAt)

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 overflow-hidden bg-gradient-to-br from-violet-50 via-fuchsia-50 to-sky-50 animate-ai-image-pulse-soft">
      {/* Diagonal shimmer sweep */}
      <div
        className="pointer-events-none absolute -inset-1/2 animate-ai-image-shimmer bg-gradient-to-br from-transparent via-white/55 to-transparent"
        style={{ filter: 'blur(8px)' }}
      />

      {/* Decorative filmstrip silhouette */}
      <div className="pointer-events-none absolute inset-x-6 top-4 flex flex-col gap-1 opacity-30">
        <div className="h-1 rounded-sm bg-violet-300" />
        <div className="h-1 rounded-sm bg-violet-200" />
        <div className="h-1 rounded-sm bg-violet-100" />
      </div>

      {/* Center icon stack */}
      <div className="relative z-10 flex flex-col items-center gap-2.5">
        <div className="animate-ai-image-float relative flex h-12 w-12 items-center justify-center rounded-2xl bg-white/75 shadow-[0_4px_18px_-6px_rgba(124,58,237,0.45)] backdrop-blur-sm">
          <ClapperboardIcon className="h-6 w-6 text-violet-600" />
          <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-fuchsia-500 shadow-[0_0_0_3px_rgba(255,255,255,0.85)] animate-ping" />
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-700">
            Filming
          </span>
          <span className="flex items-end gap-[3px] pl-0.5">
            <Dot delay="0ms" />
            <Dot delay="160ms" />
            <Dot delay="320ms" />
          </span>
        </div>

        <span
          className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-medium text-violet-700 shadow-sm ring-1 ring-violet-100"
          title="Veo videos usually arrive in 1–3 min."
        >
          {formatElapsed(elapsed)}
        </span>
      </div>

      {prompt && (
        <p
          className="relative z-10 max-w-[80%] truncate text-center text-[11px] italic text-violet-900/60"
          title={prompt}
        >
          “{prompt}”
        </p>
      )}
    </div>
  )
}

function ErrorLayer({
  prompt,
  message,
  shapeId,
}: {
  prompt: string
  message: string | null
  shapeId: string
}) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-red-50 to-rose-50 px-4 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/80 shadow-sm">
        <svg
          className="h-5 w-5 text-red-500"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v4M12 16h.01" />
        </svg>
      </div>
      <div className="space-y-0.5">
        <p className="text-xs font-semibold text-red-700">Couldn’t generate video</p>
        {message && (
          <p className="line-clamp-2 text-[10.5px] text-red-600/80" title={message}>
            {message}
          </p>
        )}
      </div>
      <button
        onPointerDown={stopEventPropagation}
        onClick={(e) => {
          e.stopPropagation()
          window.dispatchEvent(
            new CustomEvent('ai-video:retry', { detail: { shapeId, prompt } }),
          )
        }}
        className="rounded-full bg-white px-3 py-1 text-[11px] font-medium text-red-700 shadow-sm ring-1 ring-red-200 transition hover:bg-red-50"
      >
        Retry
      </button>
    </div>
  )
}

function useElapsed(startedAt: number | null): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (startedAt == null) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [startedAt])
  if (startedAt == null) return 0
  return Math.max(0, now - startedAt)
}

function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="block h-1.5 w-1.5 rounded-full bg-violet-600 animate-ai-image-dot"
      style={{ animationDelay: delay }}
    />
  )
}

function ClapperboardIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 9h18v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9z" />
      <path d="M3 9l2-4 4 1-2 4M9 6l4 1-2 4M15 7l4 1-2 4" />
    </svg>
  )
}

function SoundIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M11 5L6 9H3v6h3l5 4V5z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />
    </svg>
  )
}

function MutedIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M11 5L6 9H3v6h3l5 4V5z" />
      <path d="M16 9l5 6M21 9l-5 6" />
    </svg>
  )
}
