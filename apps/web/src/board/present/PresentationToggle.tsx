import type { Editor } from 'tldraw'

interface Props {
  editor: Editor | null
  isPresenting: boolean
  onEnter: () => void
  onExit: () => void
}

export function PresentationToggle({ editor, isPresenting, onEnter, onExit }: Props) {
  if (!editor) return null

  function togglePresent() {
    if (isPresenting) onExit()
    else onEnter()
  }

  return (
    <div className="flex">
      <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-neutral-200 bg-white/95 p-1 shadow-[0_4px_24px_-8px_rgba(0,0,0,0.18)] backdrop-blur">
        <button
          type="button"
          onClick={togglePresent}
          title={isPresenting ? 'Exit presentation (Esc)' : 'Enter presentation mode (P)'}
          aria-pressed={isPresenting}
          className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium transition ${
            isPresenting
              ? 'bg-emerald-50 text-emerald-700'
              : 'text-neutral-600 hover:bg-neutral-100'
          }`}
        >
          <span
            className={`inline-block h-1.5 w-1.5 rounded-full ${
              isPresenting
                ? 'animate-ai-image-dot bg-emerald-500'
                : 'bg-neutral-400'
            }`}
          />
          {isPresenting ? 'Exit (Esc)' : 'Present'}
        </button>
      </div>
    </div>
  )
}
