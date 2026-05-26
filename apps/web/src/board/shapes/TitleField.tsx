import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  type Editor,
  stopEventPropagation,
  type TLBaseShape,
  type TLShapeId,
} from 'tldraw'
import { updateCustomShape } from './customShape'

const MAX_TITLE_LENGTH = 80

type WithTitle = TLBaseShape<string, { title: string | null } & Record<string, unknown>>

export function TitleField<T extends WithTitle>({
  editor,
  shapeId,
  shapeType,
  title,
  prompt,
  emptyLabel,
  placeholder = 'Title',
  displayClassName,
  inputClassName,
  onEditingChange,
}: {
  editor: Editor
  shapeId: TLShapeId
  shapeType: T['type']
  title: string | null
  prompt: string
  emptyLabel?: ReactNode
  placeholder?: string
  displayClassName?: string
  inputClassName?: string
  onEditingChange?: (editing: boolean) => void
}) {
  const [editing, setEditingState] = useState(false)
  const setEditing = (next: boolean) => {
    setEditingState(next)
    onEditingChange?.(next)
  }
  const [draft, setDraft] = useState(title ?? '')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  useEffect(() => {
    if (!editing) setDraft(title ?? '')
  }, [title, editing])

  const save = () => {
    const trimmed = draft.trim().slice(0, MAX_TITLE_LENGTH)
    const next = trimmed || null
    if (next !== (title ?? null)) {
      updateCustomShape<T>(editor, {
        id: shapeId,
        type: shapeType,
        props: { title: next } as Partial<T['props']>,
      })
    }
    setEditing(false)
  }

  const cancel = () => {
    setDraft(title ?? '')
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        maxLength={MAX_TITLE_LENGTH}
        placeholder={placeholder}
        spellCheck={false}
        onPointerDown={stopEventPropagation}
        onMouseDown={stopEventPropagation}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Enter') {
            e.preventDefault()
            save()
          } else if (e.key === 'Escape') {
            e.preventDefault()
            cancel()
          }
        }}
        className={inputClassName}
      />
    )
  }

  const hasTitle = !!title && title.trim().length > 0
  return (
    <span
      className={displayClassName}
      title={hasTitle ? prompt || undefined : undefined}
      onPointerDown={stopEventPropagation}
      onMouseDown={stopEventPropagation}
      onDoubleClick={(e) => {
        e.stopPropagation()
        setEditing(true)
      }}
    >
      {hasTitle ? title : (emptyLabel ?? prompt)}
    </span>
  )
}
