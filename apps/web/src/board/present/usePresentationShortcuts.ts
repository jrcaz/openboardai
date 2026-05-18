import { useEffect } from 'react'
import type { Editor } from 'tldraw'

interface Args {
  editor: Editor | null
  isPresenting: boolean
  setIsPresenting: (next: boolean) => void
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (target.isContentEditable) return true
  return false
}

export function usePresentationShortcuts({ editor, isPresenting, setIsPresenting }: Args) {
  useEffect(() => {
    if (!editor) return

    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return

      if (e.key === 'Escape') {
        if (isPresenting) {
          setIsPresenting(false)
          editor!.setCurrentTool('select')
          // Don't preventDefault — tldraw's own Esc behavior (deselect) is fine to also fire.
        }
        return
      }

      if (isTypingTarget(e.target)) return

      const k = e.key.toLowerCase()
      if (k === 'l') {
        e.preventDefault()
        const cur = editor!.getCurrentToolId()
        editor!.setCurrentTool(cur === 'laser' ? 'select' : 'laser')
      } else if (k === 'p') {
        e.preventDefault()
        const next = !isPresenting
        setIsPresenting(next)
        editor!.setCurrentTool(next ? 'laser' : 'select')
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editor, isPresenting, setIsPresenting])
}
