import { useEffect, useMemo, useRef, useState } from 'react'
import type { Editor, TLShape, TLShapeId } from 'tldraw'
import type { ImageAspect, Modality, VideoAspect } from '@openboard-ai/shared'
import { useAiGenerate } from './useAiGenerate'
import { useAiHtmlGenerate } from './useAiHtmlGenerate'
import { useAiImageGenerate } from './useAiImageGenerate'
import { useAiVideoGenerate } from './useAiVideoGenerate'
import { importHtmlFile } from './useAiHtmlImport'
import { ModelPicker } from './ModelPicker'
import { AgentPicker } from './AgentPicker'
import { parseAgentSlash } from './parseAgentSlash'
import { useSubAgents } from '../../settings/useSubAgents'

interface Props {
  boardId: string
  editor: Editor | null
  onOpenAgents: () => void
}

type Mode = 'text' | 'image' | 'video'

const ASPECTS: { value: ImageAspect; label: string; icon: 'square' | 'wide' | 'tall' }[] = [
  { value: '1:1', label: 'Square', icon: 'square' },
  { value: '16:9', label: 'Wide', icon: 'wide' },
  { value: '9:16', label: 'Tall', icon: 'tall' },
]

const VIDEO_ASPECTS: { value: VideoAspect; label: string; icon: 'wide' | 'tall' }[] = [
  { value: '16:9', label: 'Wide', icon: 'wide' },
  { value: '9:16', label: 'Tall', icon: 'tall' },
]

export function AiPromptBar({ boardId, editor, onOpenAgents }: Props) {
  const { generate } = useAiGenerate(boardId, editor)
  const generateImage = useAiImageGenerate(boardId, editor)
  const generateVideo = useAiVideoGenerate(boardId, editor)
  const generateHtml = useAiHtmlGenerate(boardId, editor)
  const { agents, activeAgent } = useSubAgents()

  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [selection, setSelection] = useState<TLShape[]>([])
  const [mode, setMode] = useState<Mode>('text')
  const [aspect, setAspect] = useState<ImageAspect>('1:1')
  const [videoAspect, setVideoAspect] = useState<VideoAspect>('16:9')
  const [generateAudio, setGenerateAudio] = useState(true)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!editor) return
    const update = () => setSelection(editor.getSelectedShapes())
    update()
    return editor.store.listen(update, { source: 'user' })
  }, [editor])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Listen for "Expand" requests from AI card footer.
  useEffect(() => {
    if (!editor) return
    async function handleExpand(e: Event) {
      const detail = (e as CustomEvent<{ shapeId: string }>).detail
      const shape = editor!.getShape(detail.shapeId as never)
      if (!shape) return
      const { extractAndExpand } = await import('./expand')
      await extractAndExpand(editor!, boardId, shape)
    }
    window.addEventListener('ai-card:expand', handleExpand)
    return () => window.removeEventListener('ai-card:expand', handleExpand)
  }, [editor, boardId])

  // Listen for "Retry" requests from AI image error footer.
  useEffect(() => {
    if (!editor) return
    async function handleRetry(e: Event) {
      const detail = (e as CustomEvent<{ shapeId: string; prompt: string }>).detail
      if (!detail?.shapeId || !detail.prompt) return
      const shape = editor!.getShape(detail.shapeId as TLShapeId) as
        | { props: { aspect?: ImageAspect } }
        | undefined
      const reuseAspect = shape?.props.aspect ?? aspect
      await generateImage({
        prompt: detail.prompt,
        aspect: reuseAspect,
        reuseShapeId: detail.shapeId as TLShapeId,
      })
    }
    window.addEventListener('ai-image:retry', handleRetry)
    return () => window.removeEventListener('ai-image:retry', handleRetry)
  }, [editor, generateImage, aspect])

  // Listen for "Retry" requests from AI html error footer.
  useEffect(() => {
    if (!editor) return
    async function handleRetry(e: Event) {
      const detail = (e as CustomEvent<{ shapeId: string; prompt: string }>).detail
      if (!detail?.shapeId || !detail.prompt) return
      await generateHtml({
        prompt: detail.prompt,
        reuseShapeId: detail.shapeId as TLShapeId,
      })
    }
    window.addEventListener('ai-html:retry', handleRetry)
    return () => window.removeEventListener('ai-html:retry', handleRetry)
  }, [editor, generateHtml])

  // Listen for "Retry" requests from AI video error footer.
  useEffect(() => {
    if (!editor) return
    async function handleRetry(e: Event) {
      const detail = (e as CustomEvent<{ shapeId: string; prompt: string }>).detail
      if (!detail?.shapeId || !detail.prompt) return
      const shape = editor!.getShape(detail.shapeId as TLShapeId) as
        | {
            props: {
              aspect?: VideoAspect
              hasAudio?: boolean
              sourceImageId?: string | null
            }
          }
        | undefined
      const reuseAspect = shape?.props.aspect ?? videoAspect
      const reuseAudio = shape?.props.hasAudio ?? generateAudio
      const reuseSource = shape?.props.sourceImageId ?? undefined
      await generateVideo({
        prompt: detail.prompt,
        aspect: reuseAspect,
        generateAudio: reuseAudio,
        sourceImageId: reuseSource,
        reuseShapeId: detail.shapeId as TLShapeId,
      })
    }
    window.addEventListener('ai-video:retry', handleRetry)
    return () => window.removeEventListener('ai-video:retry', handleRetry)
  }, [editor, generateVideo, videoAspect, generateAudio])

  // Resolve the active agent for the current mode. Slash-command wins over picker.
  const modality: Modality = mode
  const slashMatch = useMemo(
    () => parseAgentSlash(value, agents, modality),
    [value, agents, modality],
  )
  const pickerAgent = activeAgent(modality)
  const effectiveAgent = slashMatch?.agent ?? pickerAgent

  // In video mode with exactly one selected ai-image, treat it as source frame.
  const sourceImageId = useMemo(() => {
    if (mode !== 'video') return undefined
    if (selection.length !== 1) return undefined
    const sel = selection[0] as { type: string; props: { imageId?: string | null } }
    if (sel.type !== 'ai-image') return undefined
    return sel.props.imageId ?? undefined
  }, [mode, selection])

  const useSelection = selection.length > 0
  const placeholder =
    mode === 'image'
      ? useSelection
        ? `Describe an image based on ${selection.length} selected shape${selection.length === 1 ? '' : 's'}…`
        : 'Describe the image you want to create…'
      : mode === 'video'
      ? sourceImageId
        ? 'Describe how to animate the selected image…'
        : 'Describe the video you want…'
      : useSelection
      ? `Ask about ${selection.length} selected shape${selection.length === 1 ? '' : 's'}…`
      : 'Ask the AI to add to your board…  (⌘K)'

  async function submit() {
    if (busy || !value.trim() || !editor) return
    // If a slash-command matched, strip the `/slug ` prefix from the prompt.
    const prompt = slashMatch ? slashMatch.strippedValue : value
    if (!prompt.trim()) return
    const agent = effectiveAgent
    setValue('')
    setBusy(true)
    try {
      if (mode === 'image') {
        await generateImage({
          prompt,
          aspect,
          contextShapes: useSelection ? selection : [],
          connectArrows: useSelection,
          agent,
        })
      } else if (mode === 'video') {
        await generateVideo({
          prompt,
          aspect: videoAspect,
          generateAudio,
          sourceImageId,
          // Always draw arrows from selected sources when present (mirrors image flow).
          contextShapes: useSelection ? selection : [],
          connectArrows: useSelection,
          agent,
        })
      } else {
        // Text mode: selection always wins (forces selection-qa); otherwise the
        // agent's defaultMode snaps the mode if set, falling back to 'prompt'.
        const textMode = useSelection
          ? 'selection-qa'
          : agent?.defaultMode ?? 'prompt'
        await generate({
          prompt,
          mode: textMode,
          contextShapes: useSelection ? selection : [],
          connectArrows: useSelection,
          agent,
        })
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-50 flex justify-center pb-20">
      <div className="pointer-events-auto flex w-[min(720px,90vw)] flex-col gap-2 rounded-2xl border border-neutral-200 bg-white/95 p-2 shadow-[0_4px_24px_-8px_rgba(0,0,0,0.18)] backdrop-blur">
        {/* Top strip: Mode toggle + (selection or aspect chips) + model picker */}
        <div className="flex items-center justify-between gap-2 px-1 pt-0.5">
          <ModeToggle mode={mode} onChange={setMode} />

          <div className="flex items-center gap-1.5">
            {mode === 'image' ? (
              <AspectPicker value={aspect} onChange={setAspect} />
            ) : mode === 'video' ? (
              <>
                <VideoAspectPicker value={videoAspect} onChange={setVideoAspect} />
                <AudioToggle value={generateAudio} onChange={setGenerateAudio} />
              </>
            ) : useSelection ? (
              <span className="flex items-center gap-1.5 text-[11px] font-medium text-amber-700">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                {selection.length} selected
              </span>
            ) : null}
            <ImportHtmlButton
              disabled={!editor}
              onPick={() => fileInputRef.current?.click()}
            />
            <AgentPicker modality={modality} onManage={onOpenAgents} />
            <ModelPicker modality={mode} />
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".html,.htm,text/html"
          multiple
          className="hidden"
          onChange={async (e) => {
            const files = e.target.files
            if (!files || !editor) return
            for (const f of Array.from(files)) {
              await importHtmlFile(editor, f, { boardId })
            }
            // Reset so the same file can be re-selected later.
            e.target.value = ''
          }}
        />

        {slashMatch && (
          <div className="flex items-center gap-1.5 px-1 text-[11px] font-medium text-amber-700">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            <span aria-hidden="true">{slashMatch.agent.icon || '✨'}</span>
            Invoking <span className="font-semibold">{slashMatch.agent.name}</span>
            <span className="text-neutral-400">— /{slashMatch.agent.slug}</span>
          </div>
        )}

        {/* Selection chip when in image mode (separate so toggle row stays clean) */}
        {mode === 'image' && useSelection && (
          <div className="flex items-center gap-1.5 px-1 text-[11px] font-medium text-orange-700">
            <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
            Using {selection.length} selected shape{selection.length === 1 ? '' : 's'} as context
          </div>
        )}

        {/* Source image / selection chip in video mode */}
        {mode === 'video' && (sourceImageId || useSelection) && (
          <div className="flex items-center gap-1.5 px-1 text-[11px] font-medium text-amber-900">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-700" />
            {sourceImageId
              ? 'Animating selected image as first frame'
              : `Using ${selection.length} selected shape${selection.length === 1 ? '' : 's'} as context`}
          </div>
        )}

        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                submit()
              }
            }}
            rows={1}
            placeholder={placeholder}
            disabled={busy}
            className="max-h-40 min-h-[36px] flex-1 resize-none rounded-lg border-0 bg-transparent px-2 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 focus:outline-none disabled:opacity-50"
          />
          <button
            onClick={submit}
            disabled={busy || !value.trim()}
            className={`shrink-0 rounded-lg px-3 py-2 text-sm font-medium shadow-sm transition disabled:cursor-not-allowed disabled:bg-neutral-300 disabled:text-neutral-500 ${
              mode === 'image'
                ? 'bg-gradient-to-r from-orange-300 to-orange-400 text-neutral-900 hover:from-orange-400 hover:to-orange-500'
                : mode === 'video'
                ? 'bg-gradient-to-r from-amber-600 to-amber-800 text-white hover:from-amber-700 hover:to-amber-900'
                : 'bg-amber-400 text-neutral-900 hover:bg-amber-500'
            }`}
          >
            <span className="flex items-center gap-1.5">
              {mode === 'image' && (
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2l1.6 4.4L18 8l-4.4 1.6L12 14l-1.6-4.4L6 8l4.4-1.6L12 2z" />
                </svg>
              )}
              {mode === 'video' && (
                <svg
                  className="h-3.5 w-3.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 9h18v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9z" />
                  <path d="M3 9l2-4 4 1-2 4M9 6l4 1-2 4M15 7l4 1-2 4" />
                </svg>
              )}
              {busy
                ? mode === 'image'
                  ? 'Painting…'
                  : mode === 'video'
                  ? 'Filming…'
                  : 'Sending…'
                : mode === 'image'
                ? 'Create'
                : mode === 'video'
                ? 'Film'
                : 'Send'}
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}

function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  return (
    <div className="inline-flex items-center rounded-full bg-neutral-100 p-0.5 text-[11px] font-medium">
      <button
        onClick={() => onChange('text')}
        className={`flex items-center gap-1 rounded-full px-2.5 py-1 transition ${
          mode === 'text'
            ? 'bg-white text-amber-700 shadow-sm'
            : 'text-neutral-500 hover:text-neutral-700'
        }`}
      >
        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
          <path d="M5 7h14M5 12h10M5 17h7" />
        </svg>
        Text
      </button>
      <button
        onClick={() => onChange('image')}
        className={`flex items-center gap-1 rounded-full px-2.5 py-1 transition ${
          mode === 'image'
            ? 'bg-white text-orange-700 shadow-sm'
            : 'text-neutral-500 hover:text-neutral-700'
        }`}
      >
        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <circle cx="9" cy="10" r="2" />
          <path d="M21 16l-5-5-9 9" />
        </svg>
        Image
      </button>
      <button
        onClick={() => onChange('video')}
        className={`flex items-center gap-1 rounded-full px-2.5 py-1 transition ${
          mode === 'video'
            ? 'bg-white text-amber-900 shadow-sm'
            : 'text-neutral-500 hover:text-neutral-700'
        }`}
      >
        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9h18v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9z" />
          <path d="M3 9l2-4 4 1-2 4M9 6l4 1-2 4M15 7l4 1-2 4" />
        </svg>
        Video
      </button>
    </div>
  )
}

function VideoAspectPicker({
  value,
  onChange,
}: {
  value: VideoAspect
  onChange: (a: VideoAspect) => void
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full bg-neutral-50 p-0.5 text-[10.5px] font-medium ring-1 ring-neutral-200/60">
      {VIDEO_ASPECTS.map((a) => {
        const active = a.value === value
        return (
          <button
            key={a.value}
            onClick={() => onChange(a.value)}
            title={`${a.label} (${a.value})`}
            className={`flex items-center gap-1 rounded-full px-2 py-0.5 transition ${
              active
                ? 'bg-white text-amber-900 shadow-sm ring-1 ring-amber-200'
                : 'text-neutral-500 hover:text-neutral-700'
            }`}
          >
            <AspectIcon kind={a.icon} className="h-2.5 w-2.5" />
            {a.label}
          </button>
        )
      })}
    </div>
  )
}

function AudioToggle({
  value,
  onChange,
}: {
  value: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      onClick={() => onChange(!value)}
      title={value ? 'Audio on' : 'Audio off'}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-medium ring-1 transition ${
        value
          ? 'bg-white text-amber-900 ring-amber-300 shadow-sm'
          : 'bg-neutral-50 text-neutral-500 ring-neutral-200/60 hover:text-neutral-700'
      }`}
    >
      <svg
        className="h-2.5 w-2.5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M11 5L6 9H3v6h3l5 4V5z" />
        {value ? (
          <path d="M15.5 8.5a5 5 0 0 1 0 7" />
        ) : (
          <path d="M16 9l5 6M21 9l-5 6" />
        )}
      </svg>
      {value ? 'Audio' : 'Mute'}
    </button>
  )
}

function AspectPicker({
  value,
  onChange,
}: {
  value: ImageAspect
  onChange: (a: ImageAspect) => void
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full bg-neutral-50 p-0.5 text-[10.5px] font-medium ring-1 ring-neutral-200/60">
      {ASPECTS.map((a) => {
        const active = a.value === value
        return (
          <button
            key={a.value}
            onClick={() => onChange(a.value)}
            title={`${a.label} (${a.value})`}
            className={`flex items-center gap-1 rounded-full px-2 py-0.5 transition ${
              active
                ? 'bg-white text-orange-700 shadow-sm ring-1 ring-orange-100'
                : 'text-neutral-500 hover:text-neutral-700'
            }`}
          >
            <AspectIcon kind={a.icon} className="h-2.5 w-2.5" />
            {a.label}
          </button>
        )
      })}
    </div>
  )
}

function ImportHtmlButton({
  disabled,
  onPick,
}: {
  disabled: boolean
  onPick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onPick}
      title="Import an HTML file onto the canvas"
      className="inline-flex items-center gap-1 rounded-full bg-neutral-50 px-2 py-0.5 text-[10.5px] font-medium text-neutral-600 ring-1 ring-neutral-200/60 transition hover:bg-white hover:text-violet-700 hover:ring-violet-200 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <svg
        className="h-2.5 w-2.5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M8 7l-4 5 4 5" />
        <path d="M16 7l4 5-4 5" />
        <path d="M14 4l-4 16" />
      </svg>
      Import HTML
    </button>
  )
}

function AspectIcon({
  kind,
  className,
}: {
  kind: 'square' | 'wide' | 'tall'
  className?: string
}) {
  const dims =
    kind === 'square'
      ? { x: 5, y: 5, w: 14, h: 14 }
      : kind === 'wide'
      ? { x: 3, y: 7, w: 18, h: 10 }
      : { x: 7, y: 3, w: 10, h: 18 }
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <rect x={dims.x} y={dims.y} width={dims.w} height={dims.h} rx="2" />
    </svg>
  )
}
