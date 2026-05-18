import type { Editor, TLBaseShape, TLShapeId } from 'tldraw'

type AnyCustomShape = TLBaseShape<string, Record<string, unknown>>

export function createCustomShape<T extends AnyCustomShape>(
  editor: Editor,
  shape: {
    id: TLShapeId
    type: T['type']
    x?: number
    y?: number
    props: T['props']
  },
): void {
  ;(editor.createShape as (s: unknown) => unknown)(shape)
}

export function updateCustomShape<T extends AnyCustomShape>(
  editor: Editor,
  shape: {
    id: TLShapeId
    type: T['type']
    props: Partial<T['props']>
  },
): void {
  ;(editor.updateShape as (s: unknown) => unknown)(shape)
}
