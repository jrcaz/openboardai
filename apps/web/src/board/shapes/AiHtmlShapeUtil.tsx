import { useEffect, useRef, useState } from 'react'
import {
  BaseBoxShapeUtil,
  HTMLContainer,
  type RecordProps,
  T,
  type TLBaseShape,
  stopEventPropagation,
  useEditor,
  useValue,
} from 'tldraw'

export const AI_HTML_TYPE = 'ai-html' as const

export type AiHtmlStatus = 'generating' | 'done' | 'error'

export type AiHtmlShape = TLBaseShape<
  typeof AI_HTML_TYPE,
  {
    w: number
    h: number
    title: string
    prompt: string | null
    source: 'ai' | 'upload'
    status: AiHtmlStatus
    htmlId: string | null
    errorMessage: string | null
  }
>

// @ts-expect-error tldraw 4.5+ narrowed TLBaseBoxShape to a closed union of built-in shapes; custom shape types are no longer accepted as generic args.
export class AiHtmlShapeUtil extends BaseBoxShapeUtil<AiHtmlShape> {
  static override type = AI_HTML_TYPE
  static override props: RecordProps<AiHtmlShape> = {
    w: T.number,
    h: T.number,
    title: T.string,
    prompt: T.string.nullable(),
    source: T.literalEnum('ai', 'upload'),
    status: T.literalEnum('generating', 'done', 'error'),
    htmlId: T.string.nullable(),
    errorMessage: T.string.nullable(),
  }

  override getDefaultProps(): AiHtmlShape['props'] {
    return {
      w: 600,
      h: 400,
      title: 'Untitled',
      prompt: null,
      source: 'ai',
      status: 'generating',
      htmlId: null,
      errorMessage: null,
    }
  }

  override canResize() {
    return true
  }

  override component(shape: AiHtmlShape) {
    return <AiHtmlComponent shape={shape} />
  }

  override indicator(shape: AiHtmlShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={14} ry={14} />
  }
}

function AiHtmlComponent({ shape }: { shape: AiHtmlShape }) {
  const editor = useEditor()
  const { w, h, title, prompt, source, status, htmlId, errorMessage } = shape.props

  // "Interacting" means pointer events route into the iframe so the user can
  // click buttons, scroll, etc. inside the embedded doc. Default off so the
  // shape can be selected/dragged on the canvas.
  const [isInteracting, setInteracting] = useState(false)

  // Selecting the shape implies the user wants to manipulate it on the canvas
  // — drop interact mode whenever this shape leaves the selection.
  const isSelected = useValue(
    'ai-html-selected',
    () => editor.getOnlySelectedShapeId() === shape.id,
    [editor, shape.id],
  )
  useEffect(() => {
    if (!isSelected && isInteracting) setInteracting(false)
  }, [isSelected, isInteracting])

  // Esc exits interact mode.
  const containerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!isInteracting) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setInteracting(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isInteracting])

  const borderClass =
    status === 'generating'
      ? 'border-violet-300'
      : status === 'error'
      ? 'border-red-300'
      : isInteracting
      ? 'border-violet-400 ring-2 ring-violet-200'
      : 'border-neutral-200'

  return (
    <HTMLContainer
      id={shape.id}
      style={{ pointerEvents: 'all', width: w, height: h }}
    >
      <div
        ref={containerRef}
        className={`relative flex h-full w-full flex-col overflow-hidden rounded-2xl border ${borderClass} bg-white shadow-[0_2px_6px_rgba(0,0,0,0.06),0_18px_38px_-18px_rgba(76,29,149,0.28)] transition-colors duration-300`}
      >
        <HeaderBar
          title={title}
          source={source}
          status={status}
          htmlId={htmlId}
          isInteracting={isInteracting}
          onToggleInteract={() => setInteracting((v) => !v)}
        />

        <div className="relative flex-1">
          {status === 'done' && htmlId && (
            <iframe
              key={htmlId}
              src={`/api/htmls/${htmlId}`}
              title={title}
              sandbox="allow-scripts"
              referrerPolicy="no-referrer"
              loading="lazy"
              className="absolute inset-0 h-full w-full border-0 bg-white"
              style={{ pointerEvents: isInteracting ? 'auto' : 'none' }}
            />
          )}

          {status === 'done' && htmlId && !isInteracting && (
            <div
              className="absolute inset-0 cursor-pointer"
              onPointerDown={stopEventPropagation}
              onDoubleClick={(e) => {
                e.stopPropagation()
                setInteracting(true)
              }}
              title="Double-click to interact"
            />
          )}

          {status === 'generating' && <GeneratingLayer prompt={prompt} />}

          {status === 'error' && (
            <ErrorLayer
              prompt={prompt}
              message={errorMessage}
              shapeId={shape.id}
              source={source}
            />
          )}
        </div>
      </div>
    </HTMLContainer>
  )
}

function HeaderBar({
  title,
  source,
  status,
  htmlId,
  isInteracting,
  onToggleInteract,
}: {
  title: string
  source: 'ai' | 'upload'
  status: AiHtmlStatus
  htmlId: string | null
  isInteracting: boolean
  onToggleInteract: () => void
}) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-2 border-b border-neutral-100 bg-gradient-to-b from-white to-neutral-50/60 px-2.5 py-1.5">
      <div className="flex min-w-0 items-center gap-1.5">
        <span
          className={`inline-flex h-4 items-center rounded-full px-1.5 text-[9.5px] font-semibold uppercase tracking-wider ${
            source === 'ai'
              ? 'bg-violet-100 text-violet-700'
              : 'bg-neutral-100 text-neutral-600'
          }`}
        >
          {source === 'ai' ? 'AI HTML' : 'HTML'}
        </span>
        <span
          className="truncate text-[11.5px] font-medium text-neutral-700"
          title={title}
        >
          {title}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {status === 'done' && htmlId && (
          <>
            <button
              onPointerDown={stopEventPropagation}
              onClick={(e) => {
                e.stopPropagation()
                onToggleInteract()
              }}
              className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition ${
                isInteracting
                  ? 'bg-violet-600 text-white hover:bg-violet-700'
                  : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
              }`}
              title={
                isInteracting
                  ? 'Stop interacting (Esc)'
                  : 'Interact with the widget'
              }
            >
              {isInteracting ? 'Interacting' : 'Interact'}
            </button>
            <a
              href={`/api/htmls/${htmlId}`}
              target="_blank"
              rel="noreferrer noopener"
              onPointerDown={stopEventPropagation}
              onClick={(e) => e.stopPropagation()}
              className="flex h-5 w-5 items-center justify-center rounded text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800"
              title="Open in new tab"
            >
              <svg
                className="h-3 w-3"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M14 3h7v7" />
                <path d="M10 14L21 3" />
                <path d="M21 14v7H3V3h7" />
              </svg>
            </a>
          </>
        )}
      </div>
    </div>
  )
}

function GeneratingLayer({ prompt }: { prompt: string | null }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 overflow-hidden bg-gradient-to-br from-violet-50 via-indigo-50 to-violet-50">
      <div className="pointer-events-none absolute -inset-1/2 animate-ai-image-shimmer bg-gradient-to-br from-transparent via-white/55 to-transparent" />
      <div className="relative z-10 flex flex-col items-center gap-2.5">
        <div className="animate-ai-image-float relative flex h-12 w-12 items-center justify-center rounded-2xl bg-white/70 shadow-[0_4px_18px_-6px_rgba(139,92,246,0.45)] backdrop-blur-sm">
          <CodeSparkleIcon className="h-6 w-6 text-violet-600" />
          <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-violet-400 shadow-[0_0_0_3px_rgba(255,255,255,0.85)] animate-ping" />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-700">
            Building
          </span>
          <span className="flex items-end gap-[3px] pl-0.5">
            <Dot delay="0ms" />
            <Dot delay="160ms" />
            <Dot delay="320ms" />
          </span>
        </div>
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
  source,
}: {
  prompt: string | null
  message: string | null
  shapeId: string
  source: 'ai' | 'upload'
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
        <p className="text-xs font-semibold text-red-700">
          {source === 'ai' ? 'Couldn’t generate HTML' : 'Couldn’t load HTML'}
        </p>
        {message && (
          <p
            className="line-clamp-3 text-[10.5px] text-red-600/80"
            title={message}
          >
            {message}
          </p>
        )}
      </div>
      {source === 'ai' && prompt && (
        <button
          onPointerDown={stopEventPropagation}
          onClick={(e) => {
            e.stopPropagation()
            window.dispatchEvent(
              new CustomEvent('ai-html:retry', {
                detail: { shapeId, prompt },
              }),
            )
          }}
          className="rounded-full bg-white px-3 py-1 text-[11px] font-medium text-red-700 shadow-sm ring-1 ring-red-200 transition hover:bg-red-50"
        >
          Retry
        </button>
      )}
    </div>
  )
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="block h-1.5 w-1.5 rounded-full bg-violet-500 animate-ai-image-dot"
      style={{ animationDelay: delay }}
    />
  )
}

function CodeSparkleIcon({ className }: { className?: string }) {
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
      <path d="M8 7l-4 5 4 5" />
      <path d="M16 7l4 5-4 5" />
      <path d="M14 4l-4 16" />
    </svg>
  )
}
