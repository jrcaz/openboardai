import { useState } from 'react'
import {
  BaseBoxShapeUtil,
  HTMLContainer,
  type RecordProps,
  T,
  type TLBaseShape,
  stopEventPropagation,
} from 'tldraw'

export const AI_IMAGE_TYPE = 'ai-image' as const

export type AiImageStatus = 'generating' | 'done' | 'error'

export type AiImageShape = TLBaseShape<
  typeof AI_IMAGE_TYPE,
  {
    w: number
    h: number
    prompt: string
    status: AiImageStatus
    imageId: string | null
    mediaType: string | null
    aspect: '1:1' | '16:9' | '9:16'
    errorMessage: string | null
  }
>

// @ts-expect-error tldraw 4.5+ narrowed TLBaseBoxShape to a closed union of built-in shapes; custom shape types are no longer accepted as generic args.
export class AiImageShapeUtil extends BaseBoxShapeUtil<AiImageShape> {
  static override type = AI_IMAGE_TYPE
  static override props: RecordProps<AiImageShape> = {
    w: T.number,
    h: T.number,
    prompt: T.string,
    status: T.literalEnum('generating', 'done', 'error'),
    imageId: T.string.nullable(),
    mediaType: T.string.nullable(),
    aspect: T.literalEnum('1:1', '16:9', '9:16'),
    errorMessage: T.string.nullable(),
  }

  override getDefaultProps(): AiImageShape['props'] {
    return {
      w: 360,
      h: 360,
      prompt: '',
      status: 'generating',
      imageId: null,
      mediaType: null,
      aspect: '1:1',
      errorMessage: null,
    }
  }

  override canResize() {
    return true
  }

  override component(shape: AiImageShape) {
    return <AiImageComponent shape={shape} />
  }

  override indicator(shape: AiImageShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={14} ry={14} />
  }
}

function AiImageComponent({ shape }: { shape: AiImageShape }) {
  const { w, h, prompt, status, imageId, errorMessage } = shape.props
  const [imgLoaded, setImgLoaded] = useState(false)

  const borderClass =
    status === 'generating'
      ? 'border-orange-300'
      : status === 'error'
      ? 'border-red-300'
      : 'border-neutral-200'

  return (
    <HTMLContainer
      id={shape.id}
      style={{ pointerEvents: 'all', width: w, height: h }}
    >
      <div
        className={`relative h-full w-full overflow-hidden rounded-2xl border ${borderClass} bg-white shadow-[0_2px_6px_rgba(0,0,0,0.06),0_18px_38px_-18px_rgba(120,53,15,0.28)] transition-colors duration-500`}
      >
        {/* The image — fades in once loaded. Always mounted in done/error so swap is seamless. */}
        {status !== 'generating' && imageId && (
          <img
            src={`/api/images/${imageId}`}
            alt={prompt}
            draggable={false}
            onLoad={() => setImgLoaded(true)}
            className={`absolute inset-0 h-full w-full select-none object-cover transition-opacity duration-500 ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}
          />
        )}

        {/* Loading layer — fades out when done. */}
        {status === 'generating' && <GeneratingLayer prompt={prompt} />}

        {status === 'error' && (
          <ErrorLayer prompt={prompt} message={errorMessage} shapeId={shape.id} />
        )}

        {/* Subtle prompt caption shown after image loads (small, bottom-left). */}
        {status === 'done' && imgLoaded && prompt && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 via-black/15 to-transparent px-3 py-2.5">
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

function GeneratingLayer({ prompt }: { prompt: string }) {
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center gap-3 overflow-hidden bg-gradient-to-br from-orange-50 via-amber-50 to-orange-50 animate-ai-image-pulse-soft"
    >
      {/* Diagonal shimmer sweep */}
      <div
        className="pointer-events-none absolute -inset-1/2 animate-ai-image-shimmer bg-gradient-to-br from-transparent via-white/55 to-transparent"
        style={{ filter: 'blur(8px)' }}
      />

      {/* Center icon stack */}
      <div className="relative z-10 flex flex-col items-center gap-2.5">
        <div className="animate-ai-image-float relative flex h-12 w-12 items-center justify-center rounded-2xl bg-white/70 shadow-[0_4px_18px_-6px_rgba(249,115,22,0.45)] backdrop-blur-sm">
          <PaintbrushSparkleIcon className="h-6 w-6 text-orange-600" />
          <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-orange-400 shadow-[0_0_0_3px_rgba(255,255,255,0.85)] animate-ping" />
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-orange-700">
            Painting
          </span>
          <span className="flex items-end gap-[3px] pl-0.5">
            <Dot delay="0ms" />
            <Dot delay="160ms" />
            <Dot delay="320ms" />
          </span>
        </div>
      </div>

      {/* Prompt caption — truncated */}
      {prompt && (
        <p
          className="relative z-10 max-w-[80%] truncate text-center text-[11px] italic text-orange-900/60"
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
    <div
      className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-red-50 to-rose-50 px-4 text-center"
    >
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
        <p className="text-xs font-semibold text-red-700">Couldn’t generate image</p>
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
            new CustomEvent('ai-image:retry', { detail: { shapeId, prompt } }),
          )
        }}
        className="rounded-full bg-white px-3 py-1 text-[11px] font-medium text-red-700 shadow-sm ring-1 ring-red-200 transition hover:bg-red-50"
      >
        Retry
      </button>
    </div>
  )
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="block h-1.5 w-1.5 rounded-full bg-orange-500 animate-ai-image-dot"
      style={{ animationDelay: delay }}
    />
  )
}

function PaintbrushSparkleIcon({ className }: { className?: string }) {
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
      <path d="M14.5 4.5l5 5L9 20l-5 1 1-5 9.5-11.5z" />
      <path d="M13 6l5 5" />
      <path d="M19 3l.6 1.4L21 5l-1.4.6L19 7l-.6-1.4L17 5l1.4-.6L19 3z" fill="currentColor" stroke="none" />
    </svg>
  )
}
