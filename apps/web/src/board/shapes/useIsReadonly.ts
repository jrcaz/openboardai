import { useEditor, useValue } from 'tldraw'

// Tracks tldraw's read-only instance state so shape components can hide their
// editing affordances (pencil, retry, title editing) on the public viewer.
export function useIsReadonly(): boolean {
  const editor = useEditor()
  return useValue('is-readonly', () => editor.getInstanceState().isReadonly, [editor])
}
