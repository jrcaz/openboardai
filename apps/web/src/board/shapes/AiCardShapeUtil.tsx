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

export const AI_CARD_TYPE = 'ai-card' as const

export type AiCardShape = TLBaseShape<
  typeof AI_CARD_TYPE,
  {
    w: number
    h: number
    prompt: string
    text: string
    status: 'pending' | 'streaming' | 'done' | 'error'
    sourceShapeIds: string[]
  }
>

// @ts-expect-error tldraw 4.5+ narrowed TLBaseBoxShape to a closed union of built-in shapes; custom shape types are no longer accepted as generic args.
export class AiCardShapeUtil extends BaseBoxShapeUtil<AiCardShape> {
  static override type = AI_CARD_TYPE
  static override props: RecordProps<AiCardShape> = {
    w: T.number,
    h: T.number,
    prompt: T.string,
    text: T.string,
    status: T.literalEnum('pending', 'streaming', 'done', 'error'),
    sourceShapeIds: T.arrayOf(T.string),
  }

  override getDefaultProps(): AiCardShape['props'] {
    return {
      w: 320,
      h: 140,
      prompt: '',
      text: '',
      status: 'pending',
      sourceShapeIds: [],
    }
  }

  override canResize() {
    return true
  }

  override component(shape: AiCardShape) {
    return <AiCardComponent shape={shape} editor={this.editor} />
  }

  override indicator(shape: AiCardShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={12} ry={12} />
  }
}

function AiCardComponent({ shape, editor }: { shape: AiCardShape; editor: Editor }) {
  const { prompt, text, status, w, h } = shape.props
  const cardRef = useRef<HTMLDivElement>(null)

  // Auto-grow shape height to fit rendered content. We never shrink — if the
  // user manually drags the resize handle larger, we leave it alone.
  useEffect(() => {
    const el = cardRef.current
    if (!el) return
    let raf = 0
    const measure = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const measured = Math.ceil(el.scrollHeight)
        if (measured > h + 1) {
          updateCustomShape<AiCardShape>(editor, {
            id: shape.id,
            type: AI_CARD_TYPE,
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
  }, [editor, shape.id, h, w, text, status])

  return (
    <HTMLContainer
      id={shape.id}
      style={{
        pointerEvents: 'all',
        width: w,
        height: h,
      }}
    >
      <div
        ref={cardRef}
        className="flex h-full w-full flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08),0_8px_24px_-12px_rgba(0,0,0,0.18)]"
      >
        <header className="flex items-center gap-2 border-b border-neutral-100 bg-gradient-to-r from-violet-50 to-sky-50 px-3 py-2">
          <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-violet-600 text-[10px] font-semibold text-white">
            AI
          </span>
          <span
            className="flex-1 truncate text-xs font-medium text-neutral-700"
            title={prompt}
          >
            {prompt || 'AI response'}
          </span>
          <StatusDot status={status} />
        </header>

        <div className="flex-1 px-3 py-2 text-[13px] leading-snug text-neutral-800">
          {text ? (
            <div className="ai-md break-words">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
              {status === 'streaming' && <Caret />}
            </div>
          ) : status === 'pending' || status === 'streaming' ? (
            <div className="flex items-center gap-2 text-xs text-neutral-400">
              <Spinner /> thinking…
            </div>
          ) : status === 'error' ? (
            <div className="text-xs text-red-600">Generation failed.</div>
          ) : (
            <div className="text-xs text-neutral-400">(empty)</div>
          )}
        </div>

        {status === 'done' && text && (
          <footer className="flex items-center justify-end gap-1 border-t border-neutral-100 bg-neutral-50 px-2 py-1">
            <button
              onPointerDown={stopEventPropagation}
              onClick={() => navigator.clipboard.writeText(text)}
              className="rounded px-2 py-1 text-[11px] font-medium text-neutral-600 hover:bg-neutral-200"
            >
              Copy
            </button>
            <button
              onPointerDown={stopEventPropagation}
              onClick={() => {
                window.dispatchEvent(
                  new CustomEvent('ai-card:expand', { detail: { shapeId: shape.id } }),
                )
              }}
              className="rounded bg-violet-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-violet-700"
            >
              Expand
            </button>
          </footer>
        )}
      </div>
    </HTMLContainer>
  )
}

function StatusDot({ status }: { status: AiCardShape['props']['status'] }) {
  const color =
    status === 'streaming'
      ? 'bg-violet-500 animate-pulse'
      : status === 'done'
      ? 'bg-emerald-500'
      : status === 'error'
      ? 'bg-red-500'
      : 'bg-neutral-300 animate-pulse'
  return <span className={`h-2 w-2 flex-none rounded-full ${color}`} />
}

function Caret() {
  return (
    <span className="ml-0.5 inline-block h-3.5 w-1.5 -translate-y-px animate-pulse bg-violet-500 align-middle" />
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
