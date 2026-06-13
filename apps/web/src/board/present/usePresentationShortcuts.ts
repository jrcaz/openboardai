import { useEffect } from 'react'
import type { Editor } from 'tldraw'

interface Args {
  editor: Editor | null
  isPresenting: boolean
  enterPresentation: () => void
  exitPresentation: () => void
  stepPresentation: (delta: -1 | 1) => void
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (target.isContentEditable) return true
  return false
}

export function usePresentationShortcuts({
  editor,
  isPresenting,
  enterPresentation,
  exitPresentation,
  stepPresentation,
}: Args) {
  useEffect(() => {
    if (!editor) return

    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return

      if (e.key === 'Escape') {
        if (isPresenting) {
          exitPresentation()
          // Don't preventDefault — tldraw's own Esc behavior (deselect) is fine to also fire.
        }
        return
      }

      if (isTypingTarget(e.target)) return

      if (isPresenting && (e.key === 'ArrowRight' || e.key === 'PageDown')) {
        e.preventDefault()
        stepPresentation(1)
        return
      }
      if (isPresenting && (e.key === 'ArrowLeft' || e.key === 'PageUp')) {
        e.preventDefault()
        stepPresentation(-1)
        return
      }

      const k = e.key.toLowerCase()
      if (k === 'l') {
        e.preventDefault()
        const cur = editor!.getCurrentToolId()
        editor!.setCurrentTool(cur === 'laser' ? 'select' : 'laser')
      } else if (k === 'p') {
        e.preventDefault()
        if (isPresenting) exitPresentation()
        else enterPresentation()
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editor, enterPresentation, exitPresentation, isPresenting, stepPresentation])
}
