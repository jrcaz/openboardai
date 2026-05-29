import { useEffect, useRef, useState } from 'react'
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
  useValue,
} from 'tldraw'
import { updateCustomShape } from './customShape'

export const MARKDOWN_TYPE = 'markdown' as const

export type MarkdownShape = TLBaseShape<
  typeof MARKDOWN_TYPE,
  {
    w: number
    h: number
    title: string
    text: string
  }
>

// @ts-expect-error tldraw 4.5+ narrowed TLBaseBoxShape to a closed union of built-in shapes; custom shape types are no longer accepted as generic args.
export class MarkdownShapeUtil extends BaseBoxShapeUtil<MarkdownShape> {
  static override type = MARKDOWN_TYPE
  static override props: RecordProps<MarkdownShape> = {
    w: T.number,
    h: T.number,
    title: T.string,
    text: T.string,
  }

  override getDefaultProps(): MarkdownShape['props'] {
    return {
      w: 480,
      h: 360,
      title: 'Untitled',
      text: '',
    }
  }

  override canResize() {
    return true
  }

  override component(shape: MarkdownShape) {
    return <MarkdownComponent shape={shape} editor={this.editor} />
  }

  override indicator(shape: MarkdownShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={12} ry={12} />
  }
}

function MarkdownComponent({ shape, editor }: { shape: MarkdownShape; editor: Editor }) {
  const { w, h, title, text } = shape.props
  const [isEditing, setEditing] = useState(false)
  const [draft, setDraft] = useState(text)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const [isTitleEditing, setTitleEditing] = useState(false)
  const [titleDraft, setTitleDraft] = useState(title)
  const titleInputRef = useRef<HTMLInputElement>(null)

  // Keep the draft in sync with the persisted text whenever we're not editing
  // (e.g. undo/redo, or another client changing it).
  useEffect(() => {
    if (!isEditing) setDraft(text)
  }, [text, isEditing])

  useEffect(() => {
    if (!isTitleEditing) setTitleDraft(title)
  }, [title, isTitleEditing])

  // Focus the textarea and drop the caret at the end on entering edit mode.
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      const el = textareaRef.current
      el.focus()
      el.selectionStart = el.selectionEnd = el.value.length
    }
  }, [isEditing])

  // Focus the title input and select its contents so a rename can be typed
  // straight over the old value.
  useEffect(() => {
    if (isTitleEditing && titleInputRef.current) {
      titleInputRef.current.focus()
      titleInputRef.current.select()
    }
  }, [isTitleEditing])

  const commit = () => {
    if (draft !== text) {
      updateCustomShape<MarkdownShape>(editor, {
        id: shape.id,
        type: MARKDOWN_TYPE,
        props: { text: draft },
      })
    }
    setEditing(false)
  }

  const cancel = () => {
    setDraft(text)
    setEditing(false)
  }

  const commitTitle = () => {
    // Fall back to the existing title when the draft is blank so the header
    // never renders empty.
    const next = titleDraft.trim()
    if (next && next !== title) {
      updateCustomShape<MarkdownShape>(editor, {
        id: shape.id,
        type: MARKDOWN_TYPE,
        props: { title: next },
      })
    } else if (!next) {
      setTitleDraft(title)
    }
    setTitleEditing(false)
  }

  const cancelTitle = () => {
    setTitleDraft(title)
    setTitleEditing(false)
  }

  // Selecting away from the shape while editing should save, not silently drop
  // the in-flight edit. commit()/commitTitle() are idempotent so a blur +
  // deselect double-fire is harmless.
  const isSelected = useValue(
    'markdown-selected',
    () => editor.getOnlySelectedShapeId() === shape.id,
    [editor, shape.id],
  )
  useEffect(() => {
    if (isSelected) return
    if (isEditing) commit()
    if (isTitleEditing) commitTitle()
  }, [isSelected])

  return (
    <HTMLContainer id={shape.id} style={{ pointerEvents: 'all', width: w, height: h }}>
      <div className="flex h-full w-full flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08),0_8px_24px_-12px_rgba(0,0,0,0.18)]">
        <header className="flex shrink-0 items-center gap-2 border-b border-neutral-100 bg-gradient-to-r from-sky-50 to-indigo-50 px-3 py-2">
          <span className="inline-flex h-4 items-center rounded-full bg-sky-100 px-1.5 text-[9.5px] font-semibold uppercase tracking-wider text-sky-700">
            MD
          </span>
          {isTitleEditing ? (
            <input
              ref={titleInputRef}
              value={titleDraft}
              spellCheck={false}
              onPointerDown={stopEventPropagation}
              onMouseDown={stopEventPropagation}
              onDoubleClick={stopEventPropagation}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => {
                e.stopPropagation()
                if (e.key === 'Escape') {
                  e.preventDefault()
                  cancelTitle()
                } else if (e.key === 'Enter') {
                  e.preventDefault()
                  commitTitle()
                }
              }}
              className="min-w-0 flex-1 bg-transparent text-xs font-medium text-neutral-700 outline-none"
            />
          ) : (
            <span
              className="flex-1 cursor-text truncate text-xs font-medium text-neutral-700"
              title={title}
              onPointerDown={stopEventPropagation}
              onMouseDown={stopEventPropagation}
              onDoubleClick={(e) => {
                e.stopPropagation()
                editor.select(shape.id)
                setTitleEditing(true)
              }}
            >
              {title}
            </span>
          )}
        </header>

        {isEditing ? (
          <textarea
            ref={textareaRef}
            value={draft}
            spellCheck={false}
            onPointerDown={stopEventPropagation}
            onMouseDown={stopEventPropagation}
            onDoubleClick={stopEventPropagation}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Escape') {
                e.preventDefault()
                cancel()
              } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                commit()
              }
            }}
            className="md-shape-textarea flex-1"
          />
        ) : (
          <div
            className="ai-md flex-1 overflow-auto break-words px-3 py-2 text-[13px] leading-snug text-neutral-800"
            onPointerDown={stopEventPropagation}
            onMouseDown={stopEventPropagation}
            onWheel={(e) => e.stopPropagation()}
            onDoubleClick={(e) => {
              e.stopPropagation()
              editor.select(shape.id)
              setEditing(true)
            }}
          >
            {text ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
            ) : (
              <span className="text-xs italic text-neutral-400">
                (empty — double-click to edit)
              </span>
            )}
          </div>
        )}
      </div>
    </HTMLContainer>
  )
}
