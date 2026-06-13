import { useEffect, useState } from 'react'
import {
  TldrawUiButton,
  TldrawUiButtonIcon,
  TldrawUiButtonLabel,
  type Editor,
  type TLFrameShape,
  type TLShapeId,
} from 'tldraw'
import { getPresentationFrames } from './slides'

interface Props {
  editor: Editor | null
  isPresenting: boolean
  currentFrameId: TLShapeId | null
  onStep: (delta: -1 | 1) => void
}

export function SlideshowControls({ editor, isPresenting, currentFrameId, onStep }: Props) {
  const [frames, setFrames] = useState<TLFrameShape[]>([])

  useEffect(() => {
    if (!editor || !isPresenting) {
      setFrames([])
      return
    }
    const update = () => setFrames(getPresentationFrames(editor))
    update()
    return editor.store.listen(update, { source: 'all', scope: 'document' })
  }, [editor, isPresenting])

  if (!editor || !isPresenting) return null

  const currentIndex = currentFrameId
    ? frames.findIndex((frame) => frame.id === currentFrameId)
    : -1
  const hasSlides = frames.length > 0
  const label = hasSlides
    ? `Slide ${currentIndex >= 0 ? currentIndex + 1 : 1} of ${frames.length}`
    : 'No frames'

  return (
    <div className="pointer-events-auto absolute bottom-5 left-1/2 z-[540] flex max-w-[calc(100vw-1rem)] -translate-x-1/2 items-center gap-1 rounded-lg border border-neutral-200 bg-white/95 p-1 shadow-[0_4px_24px_-8px_rgba(0,0,0,0.22)] backdrop-blur">
      <TldrawUiButton
        type="normal"
        title="Previous slide (Left arrow)"
        disabled={!hasSlides}
        onClick={() => onStep(-1)}
      >
        <TldrawUiButtonIcon icon="chevron-left" />
      </TldrawUiButton>
      <div className="min-w-24 px-2 text-center text-[12px] font-medium text-neutral-700">
        {label}
      </div>
      <TldrawUiButton
        type="normal"
        title="Next slide (Right arrow)"
        disabled={!hasSlides}
        onClick={() => onStep(1)}
      >
        <TldrawUiButtonLabel>Next</TldrawUiButtonLabel>
        <TldrawUiButtonIcon icon="chevron-right" />
      </TldrawUiButton>
    </div>
  )
}

