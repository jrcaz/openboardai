import { useEffect, useState } from 'react'
import { type Editor, type TLFrameShape, type TLShapeId } from 'tldraw'
import { getPresentationFrames } from './slides'

interface Props {
  editor: Editor | null
  isPresenting: boolean
  currentFrameId: TLShapeId | null
  onStep: (delta: -1 | 1) => void
}

function ChevronIcon({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {direction === 'left' ? (
        <path d="M12 5 7 10l5 5" />
      ) : (
        <path d="m8 5 5 5-5 5" />
      )}
    </svg>
  )
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
      <button
        type="button"
        title="Previous slide (Left arrow)"
        aria-label="Previous slide"
        disabled={!hasSlides}
        onClick={() => onStep(-1)}
        className="flex h-8 w-8 items-center justify-center rounded-md text-neutral-700 transition hover:bg-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
      >
        <ChevronIcon direction="left" />
      </button>
      <div className="min-w-24 px-2 text-center text-[12px] font-medium text-neutral-700">
        {label}
      </div>
      <button
        type="button"
        title="Next slide (Right arrow)"
        disabled={!hasSlides}
        onClick={() => onStep(1)}
        className="flex h-8 items-center gap-1 rounded-md px-2 text-[12px] font-medium text-neutral-700 transition hover:bg-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
      >
        <span>Next</span>
        <ChevronIcon direction="right" />
      </button>
    </div>
  )
}
