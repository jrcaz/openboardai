import { useEffect, useRef, useState } from 'react'
import type { Editor } from 'tldraw'

interface Props {
  editor: Editor | null
}

export function LaserCursor({ editor }: Props) {
  const [active, setActive] = useState(false)
  const dotRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number | null>(null)
  const pendingRef = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    if (!editor) return
    const update = () => setActive(editor.getCurrentToolId() === 'laser')
    update()
    return editor.store.listen(update, { source: 'user' })
  }, [editor])

  useEffect(() => {
    if (!active) return

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return
      pendingRef.current = { x: e.clientX, y: e.clientY }
      if (rafRef.current != null) return
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null
        const p = pendingRef.current
        const el = dotRef.current
        if (!p || !el) return
        el.style.transform = `translate3d(${p.x}px, ${p.y}px, 0) translate(-50%, -50%)`
        el.style.opacity = '1'
      })
    }
    const onLeave = () => {
      const el = dotRef.current
      if (el) el.style.opacity = '0'
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerleave', onLeave)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerleave', onLeave)
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [active])

  if (!active) return null

  return (
    <div
      ref={dotRef}
      className="laser-cursor"
      style={{ opacity: 0 }}
      aria-hidden="true"
    />
  )
}
