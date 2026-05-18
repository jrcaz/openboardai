interface Props {
  visible: boolean
  onToggle: () => void
}

export function ToolsToggle({ visible, onToggle }: Props) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={visible ? 'Hide tools & styles' : 'Show tools & styles'}
      aria-pressed={visible}
      aria-label={visible ? 'Hide drawing tools and style panel' : 'Show drawing tools and style panel'}
      className={`pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full border shadow-[0_4px_24px_-8px_rgba(0,0,0,0.18)] backdrop-blur transition ${
        visible
          ? 'border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100'
          : 'border-neutral-200 bg-white/95 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
      }`}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <line x1="4" y1="6" x2="11" y2="6" />
        <line x1="15" y1="6" x2="20" y2="6" />
        <line x1="4" y1="12" x2="7" y2="12" />
        <line x1="11" y1="12" x2="20" y2="12" />
        <line x1="4" y1="18" x2="14" y2="18" />
        <line x1="18" y1="18" x2="20" y2="18" />
        <circle cx="13" cy="6" r="1.6" fill="currentColor" />
        <circle cx="9" cy="12" r="1.6" fill="currentColor" />
        <circle cx="16" cy="18" r="1.6" fill="currentColor" />
      </svg>
    </button>
  )
}
