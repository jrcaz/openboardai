import { type ReactNode, useEffect, useRef, useState } from 'react'
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
import { TitleField } from './TitleField'
import { EditPromptOverlay, PencilButton } from './EditPromptOverlay'
import { useIsReadonly } from './useIsReadonly'

export const AI_CARD_TYPE = 'ai-card' as const

export type AiCitation = {
  sourceId: string
  url: string
  title?: string
}

export type AiCardShape = TLBaseShape<
  typeof AI_CARD_TYPE,
  {
    w: number
    h: number
    prompt: string
    text: string
    status: 'pending' | 'streaming' | 'done' | 'error'
    sourceShapeIds: string[]
    citations?: AiCitation[]
    title: string | null
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
    citations: T.arrayOf(
      T.object({
        sourceId: T.string,
        url: T.string,
        title: T.string.optional(),
      }),
    ).optional(),
    title: T.string.nullable(),
  }

  override getDefaultProps(): AiCardShape['props'] {
    return {
      w: 320,
      h: 140,
      prompt: '',
      text: '',
      status: 'pending',
      sourceShapeIds: [],
      citations: [],
      title: null,
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
  const { prompt, text, status, w, h, title } = shape.props
  const citations = shape.props.citations ?? []
  const readonly = useIsReadonly()
  const cardRef = useRef<HTMLDivElement>(null)
  const [isHovered, setHovered] = useState(false)
  const [isEditing, setEditing] = useState(false)

  // Auto-grow shape height to fit rendered content. We never shrink — if the
  // user manually drags the resize handle larger, we leave it alone.
  useEffect(() => {
    if (isEditing) return
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
  }, [editor, shape.id, h, w, text, status, isEditing])

  const showPencil = status === 'done' && isHovered && !isEditing && !readonly

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
        className="relative h-full w-full"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <div
          ref={cardRef}
          className="flex h-full w-full flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08),0_8px_24px_-12px_rgba(0,0,0,0.18)]"
        >
          <header className="flex items-center gap-2 border-b border-neutral-100 bg-gradient-to-r from-yellow-50 to-amber-50 px-3 py-2">
            <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-amber-400 text-[10px] font-semibold text-amber-950">
              AI
            </span>
            <TitleField<AiCardShape>
              editor={editor}
              shapeId={shape.id}
              shapeType={AI_CARD_TYPE}
              title={title}
              prompt={prompt}
              emptyLabel={prompt || 'AI response'}
              placeholder="Add a title"
              displayClassName="flex-1 truncate text-xs font-medium text-neutral-700 cursor-text"
              inputClassName="flex-1 min-w-0 truncate rounded bg-white/80 px-1 py-0.5 text-xs font-medium text-neutral-800 outline-none ring-1 ring-amber-300 focus:ring-amber-500"
              readonly={readonly}
            />
            <StatusDot status={status} />
          </header>

          <div className="flex-1 px-3 py-2 text-[13px] leading-snug text-neutral-800">
            {text ? (
              <div
                className="ai-md cursor-text select-text break-words"
                style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
                onPointerDown={stopEventPropagation}
                onMouseDown={stopEventPropagation}
                onDoubleClick={stopEventPropagation}
              >
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                  {linkifyCitationMarkers(text, citations)}
                </ReactMarkdown>
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
            <footer className="flex items-center justify-between gap-2 border-t border-neutral-100 bg-neutral-50 px-2 py-1">
              <CitationList citations={citations} />
              <button
                onPointerDown={stopEventPropagation}
                onClick={() => navigator.clipboard.writeText(text)}
                className="shrink-0 rounded px-2 py-1 text-[11px] font-medium text-neutral-600 hover:bg-neutral-200"
              >
                Copy
              </button>
            </footer>
          )}
        </div>

        {showPencil && (
          <PencilButton
            accent="amber"
            onClick={() => setEditing(true)}
            className="absolute right-2 top-2 z-10"
          />
        )}

        {isEditing && (
          <EditPromptOverlay
            initialPrompt={prompt}
            accent="amber"
            onCancel={() => setEditing(false)}
            onSubmit={(newPrompt) => {
              setEditing(false)
              window.dispatchEvent(
                new CustomEvent('ai-card:edit', {
                  detail: { shapeId: shape.id, prompt: newPrompt },
                }),
              )
            }}
          />
        )}
      </div>
    </HTMLContainer>
  )
}

const markdownComponents = {
  a({ href, children }: { href?: string; children?: ReactNode }) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        onPointerDown={stopEventPropagation}
        onClick={stopEventPropagation}
      >
        {children}
      </a>
    )
  },
}

function CitationList({ citations }: { citations: AiCitation[] }) {
  if (citations.length === 0) return <span />

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
      <span className="shrink-0 text-[10.5px] font-medium text-neutral-500">Sources</span>
      <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
        {citations.map((citation, index) => {
          const label = citation.title?.trim() || domainFromUrl(citation.url) || `Source ${index + 1}`
          return (
            <a
              key={`${citation.sourceId}-${citation.url}`}
              href={citation.url}
              target="_blank"
              rel="noreferrer"
              title={label}
              onPointerDown={stopEventPropagation}
              onClick={stopEventPropagation}
              className="inline-flex h-5 max-w-[120px] shrink-0 items-center gap-1 rounded border border-amber-200 bg-white px-1.5 text-[10.5px] font-medium text-amber-800 hover:border-amber-300 hover:bg-amber-50"
            >
              <span className="text-amber-600">[{index + 1}]</span>
              <span className="truncate">{label}</span>
            </a>
          )
        })}
      </div>
    </div>
  )
}

function linkifyCitationMarkers(text: string, citations: AiCitation[]): string {
  if (citations.length === 0) return text
  return text.replace(/\[(\d+)\]/g, (marker, rawIndex: string) => {
    const index = Number(rawIndex)
    const citation = citations[index - 1]
    if (!citation) return marker
    return `[${index}](${escapeMarkdownUrl(citation.url)})`
  })
}

function escapeMarkdownUrl(url: string): string {
  return url.replace(/\)/g, '%29')
}

function domainFromUrl(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

function StatusDot({ status }: { status: AiCardShape['props']['status'] }) {
  const color =
    status === 'streaming'
      ? 'bg-amber-500 animate-pulse'
      : status === 'done'
      ? 'bg-emerald-500'
      : status === 'error'
      ? 'bg-red-500'
      : 'bg-neutral-300 animate-pulse'
  return <span className={`h-2 w-2 flex-none rounded-full ${color}`} />
}

function Caret() {
  return (
    <span className="ml-0.5 inline-block h-3.5 w-1.5 -translate-y-px animate-pulse bg-amber-500 align-middle" />
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
