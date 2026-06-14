import type { Editor, TLFrameShape, TLShapeId } from 'tldraw'

export function getPresentationFrames(editor: Editor): TLFrameShape[] {
  return editor
    .getCurrentPageShapesInReadingOrder()
    .filter((shape): shape is TLFrameShape => shape.type === 'frame')
}

export function findInitialPresentationFrame(editor: Editor, frames: TLFrameShape[]) {
  if (frames.length === 0) return null

  const selected = editor.getSelectedShapes().find((shape) => shape.type === 'frame')
  if (selected) return selected as TLFrameShape

  const viewport = editor.getViewportPageBounds()
  const viewportCenter = { x: viewport.midX, y: viewport.midY }
  let closest = frames[0]
  let closestDistance = Number.POSITIVE_INFINITY

  for (const frame of frames) {
    const bounds = editor.getShapePageBounds(frame.id)
    if (!bounds) continue
    const dx = bounds.midX - viewportCenter.x
    const dy = bounds.midY - viewportCenter.y
    const distance = dx * dx + dy * dy
    if (distance < closestDistance) {
      closest = frame
      closestDistance = distance
    }
  }

  return closest
}

export function moveToPresentationFrame(editor: Editor, frameId: TLShapeId) {
  const bounds = editor.getShapePageBounds(frameId)
  if (!bounds) return false

  editor.stopCameraAnimation()
  editor.selectNone()
  editor.zoomToBounds(bounds, { inset: 64, animation: { duration: 320 } })
  return true
}

