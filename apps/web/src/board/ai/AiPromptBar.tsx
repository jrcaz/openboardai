import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Editor, TLShape, TLShapeId } from 'tldraw'
import type { AudioMediaType, ImageAspect, VideoAspect } from '@openboard-ai/shared'
import { useAiAudioGenerate } from './useAiAudioGenerate'
import { useAiGenerate } from './useAiGenerate'
import { useAiImageGenerate } from './useAiImageGenerate'
import { useAiVideoGenerate } from './useAiVideoGenerate'
import { ModelPicker } from './ModelPicker'

interface Props {
  boardId: string
  editor: Editor | null
}

type Mode = 'text' | 'image' | 'video' | 'audio'

// Candidates the browser's MediaRecorder might support. First match wins.
// Chrome/Firefox: webm/opus. Safari: mp4. Filter on isTypeSupported.
const RECORDER_MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
] as const

const AUDIO_FAMILY_TO_SERVER: Record<string, AudioMediaType> = {
  'audio/webm': 'audio/webm',
  'audio/ogg': 'audio/ogg',
  'audio/mp4': 'audio/mp4',
  'audio/aac': 'audio/aac',
  'audio/mpeg': 'audio/mpeg',
  'audio/mp3': 'audio/mpeg',
  'audio/wav': 'audio/wav',
  'audio/wave': 'audio/wav',
  'audio/x-wav': 'audio/x-wav',
  'audio/flac': 'audio/flac',
  'audio/x-flac': 'audio/flac',
}

// 25 MB matches the server-side cap in shared/schemas.ts. We check on the
// client too so uploads are rejected before the base64 round-trip.
const MAX_AUDIO_BYTES = 25 * 1024 * 1024

const ASPECTS: { value: ImageAspect; label: string; icon: 'square' | 'wide' | 'tall' }[] = [
  { value: '1:1', label: 'Square', icon: 'square' },
  { value: '16:9', label: 'Wide', icon: 'wide' },
  { value: '9:16', label: 'Tall', icon: 'tall' },
]

const VIDEO_ASPECTS: { value: VideoAspect; label: string; icon: 'wide' | 'tall' }[] = [
  { value: '16:9', label: 'Wide', icon: 'wide' },
  { value: '9:16', label: 'Tall', icon: 'tall' },
]

export function AiPromptBar({ boardId, editor }: Props) {
  const { generate } = useAiGenerate(boardId, editor)
  const generateImage = useAiImageGenerate(boardId, editor)
  const generateVideo = useAiVideoGenerate(boardId, editor)
  const generateTranscription = useAiAudioGenerate(boardId, editor)

  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [selection, setSelection] = useState<TLShape[]>([])
  const [mode, setMode] = useState<Mode>('text')
  const [aspect, setAspect] = useState<ImageAspect>('1:1')
  const [videoAspect, setVideoAspect] = useState<VideoAspect>('16:9')
  const [generateAudio, setGenerateAudio] = useState(true)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Audio mode state
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | null>(null)
  const [audioMediaType, setAudioMediaType] = useState<AudioMediaType>('audio/webm')
  const [audioDurationMs, setAudioDurationMs] = useState<number>(0)
  const [audioInstruction, setAudioInstruction] = useState('')
  const [recording, setRecording] = useState(false)
  const [recordingTick, setRecordingTick] = useState(0)
  const [audioError, setAudioError] = useState<string | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const recordStartRef = useRef<number>(0)
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

  // Reset preview + revoke the object URL whenever the blob changes or unmounts.
  useEffect(() => {
    if (!audioBlob) {
      setAudioPreviewUrl(null)
      return
    }
    const url = URL.createObjectURL(audioBlob)
    setAudioPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [audioBlob])

  // Tick a re-render once per second while recording so the live timer updates.
  useEffect(() => {
    if (!recording) return
    const id = window.setInterval(() => setRecordingTick((t) => t + 1), 1000)
    return () => window.clearInterval(id)
  }, [recording])

  const stopRecording = useCallback(() => {
    const rec = mediaRecorderRef.current
    if (rec && rec.state === 'recording') {
      // Let `onstop` handle blob assembly + tear-down so the UI stays on the
      // "recording" state until the bytes are actually ready to play back.
      rec.stop()
      return
    }
    // Stream cleanup path used when no active recorder exists (mode switch
    // before recording started, or unmount during teardown).
    const stream = mediaStreamRef.current
    if (stream) stream.getTracks().forEach((t) => t.stop())
    mediaStreamRef.current = null
    mediaRecorderRef.current = null
    setRecording(false)
  }, [])

  // Stop recording / clear blob if the user switches away from audio mode.
  useEffect(() => {
    if (mode !== 'audio') {
      stopRecording()
      setAudioBlob(null)
      setAudioDurationMs(0)
      setAudioError(null)
    }
  }, [mode, stopRecording])

  // Stop recording on unmount — leaving a getUserMedia track open keeps the
  // mic indicator on in the browser and is a privacy concern.
  useEffect(() => {
    return () => {
      stopRecording()
    }
  }, [stopRecording])

  // Listen for "Retry" requests from AI transcription error footer. The audio
  // bytes were persisted up-front, so we can re-fetch them by audioId.
  useEffect(() => {
    if (!editor) return
    async function handleRetry(e: Event) {
      const detail = (e as CustomEvent<{ shapeId: string }>).detail
      if (!detail?.shapeId) return
      const shape = editor!.getShape(detail.shapeId as TLShapeId) as
        | {
            props: {
              audioId?: string | null
              mediaType?: string | null
              durationMs?: number | null
              instruction?: string
            }
          }
        | undefined
      const audioId = shape?.props.audioId
      if (!audioId) return
      try {
        const res = await fetch(`/api/audios/${audioId}`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const blob = await res.blob()
        const mt = (shape?.props.mediaType ?? blob.type) as AudioMediaType
        await generateTranscription({
          audioBlob: blob,
          mediaType: AUDIO_FAMILY_TO_SERVER[normalizeMime(mt)] ?? 'audio/webm',
          durationMs: shape?.props.durationMs ?? undefined,
          instruction: shape?.props.instruction || undefined,
          reuseShapeId: detail.shapeId as TLShapeId,
        })
      } catch (err) {
        console.error('[ai] transcription retry failed', err)
      }
    }
    window.addEventListener('ai-transcription:retry', handleRetry)
    return () => window.removeEventListener('ai-transcription:retry', handleRetry)
  }, [editor, generateTranscription])

  async function startRecording() {
    setAudioError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaStreamRef.current = stream
      const mime = pickSupportedMime()
      const rec = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream)
      const chunks: BlobPart[] = []
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data)
      }
      rec.onstop = () => {
        const recMime = rec.mimeType || 'audio/webm'
        const blob = new Blob(chunks, { type: recMime })
        if (blob.size > MAX_AUDIO_BYTES) {
          setAudioError(
            `Recording is ${(blob.size / 1024 / 1024).toFixed(1)} MB — max is 25 MB. Try a shorter clip.`,
          )
          setAudioBlob(null)
        } else {
          setAudioBlob(blob)
          setAudioMediaType(
            AUDIO_FAMILY_TO_SERVER[normalizeMime(recMime)] ?? 'audio/webm',
          )
          setAudioDurationMs(Math.max(0, Date.now() - recordStartRef.current))
        }
        stream.getTracks().forEach((t) => t.stop())
        mediaStreamRef.current = null
        mediaRecorderRef.current = null
        setRecording(false)
      }
      recordStartRef.current = Date.now()
      rec.start()
      mediaRecorderRef.current = rec
      setRecording(true)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Microphone unavailable'
      // Friendlier copy for the most common case (permission denied).
      setAudioError(
        /not allowed|denied|permission/i.test(message)
          ? 'Microphone access denied. Check browser permissions and try again.'
          : message,
      )
      const stream = mediaStreamRef.current
      if (stream) stream.getTracks().forEach((t) => t.stop())
      mediaStreamRef.current = null
      setRecording(false)
    }
  }

  function discardRecording() {
    setAudioBlob(null)
    setAudioDurationMs(0)
    setAudioError(null)
  }

  async function onFilePicked(file: File | undefined) {
    if (!file) return
    setAudioError(null)
    if (file.size === 0) {
      setAudioError('That file is empty.')
      return
    }
    if (file.size > MAX_AUDIO_BYTES) {
      setAudioError(
        `File is ${(file.size / 1024 / 1024).toFixed(1)} MB — max is 25 MB.`,
      )
      return
    }
    const family = normalizeMime(file.type || 'audio/mpeg')
    const mapped = AUDIO_FAMILY_TO_SERVER[family]
    if (!mapped) {
      setAudioError(`Unsupported audio format: ${file.type || 'unknown'}`)
      return
    }
    setAudioBlob(file)
    setAudioMediaType(mapped)
    setAudioDurationMs(0) // unknown until decoded; the shape will hide it
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // In video mode with exactly one selected ai-image, treat it as source frame.
  const sourceImageId = useMemo(() => {
    if (mode !== 'video') return undefined
    if (selection.length !== 1) return undefined
    const sel = selection[0] as { type: string; props: { imageId?: string | null } }
    if (sel.type !== 'ai-image') return undefined
    return sel.props.imageId ?? undefined
  }, [mode, selection])

  const useSelection = mode !== 'audio' && selection.length > 0
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
    if (busy || !editor) return
    if (mode === 'audio') {
      if (!audioBlob) return
      setBusy(true)
      try {
        await generateTranscription({
          audioBlob,
          mediaType: audioMediaType,
          ...(audioDurationMs > 0 ? { durationMs: audioDurationMs } : {}),
          ...(audioInstruction.trim() ? { instruction: audioInstruction.trim() } : {}),
        })
        setAudioBlob(null)
        setAudioDurationMs(0)
        setAudioInstruction('')
      } finally {
        setBusy(false)
      }
      return
    }
    if (!value.trim()) return
    const prompt = value
    setValue('')
    setBusy(true)
    try {
      if (mode === 'image') {
        await generateImage({
          prompt,
          aspect,
          contextShapes: useSelection ? selection : [],
          connectArrows: useSelection,
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
        })
      } else {
        await generate({
          prompt,
          mode: useSelection ? 'selection-qa' : 'prompt',
          contextShapes: useSelection ? selection : [],
          connectArrows: useSelection,
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
            <ModelPicker modality={mode} />
          </div>
        </div>

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

        {mode === 'audio' ? (
          <AudioPanel
            blob={audioBlob}
            previewUrl={audioPreviewUrl}
            recording={recording}
            recordingElapsedMs={recording ? Date.now() - recordStartRef.current : 0}
            durationMs={audioDurationMs}
            instruction={audioInstruction}
            onInstructionChange={setAudioInstruction}
            error={audioError}
            busy={busy}
            onStart={startRecording}
            onStop={stopRecording}
            onDiscard={discardRecording}
            onSubmit={submit}
            onPickFile={() => fileInputRef.current?.click()}
            fileInputRef={fileInputRef}
            onFileChange={onFilePicked}
            // Force the timer to re-render every tick while recording.
            recordingTick={recordingTick}
          />
        ) : (
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
        )}
      </div>
    </div>
  )
}

function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  return (
    <div className="inline-flex items-center rounded-full bg-neutral-100 p-0.5 text-[11px] font-medium">
      <button
        onClick={() => onChange('text')}
        className={`flex items-center gap-1 rounded-full px-2 py-1 transition ${
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
        className={`flex items-center gap-1 rounded-full px-2 py-1 transition ${
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
        className={`flex items-center gap-1 rounded-full px-2 py-1 transition ${
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
      <button
        onClick={() => onChange('audio')}
        className={`flex items-center gap-1 rounded-full px-2 py-1 transition ${
          mode === 'audio'
            ? 'bg-white text-indigo-700 shadow-sm'
            : 'text-neutral-500 hover:text-neutral-700'
        }`}
      >
        <svg
          className="h-3 w-3"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="9" y="3" width="6" height="11" rx="3" />
          <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
        </svg>
        Audio
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

interface AudioPanelProps {
  blob: Blob | null
  previewUrl: string | null
  recording: boolean
  recordingElapsedMs: number
  durationMs: number
  instruction: string
  onInstructionChange: (v: string) => void
  error: string | null
  busy: boolean
  onStart: () => void
  onStop: () => void
  onDiscard: () => void
  onSubmit: () => void
  onPickFile: () => void
  fileInputRef: React.RefObject<HTMLInputElement | null>
  onFileChange: (file: File | undefined) => void
  // Re-render trigger for the live timer — value isn't read.
  recordingTick: number
}

function AudioPanel({
  blob,
  previewUrl,
  recording,
  recordingElapsedMs,
  durationMs,
  instruction,
  onInstructionChange,
  error,
  busy,
  onStart,
  onStop,
  onDiscard,
  onSubmit,
  onPickFile,
  fileInputRef,
  onFileChange,
}: AudioPanelProps) {
  return (
    <div className="flex flex-col gap-1.5 px-1 pb-1">
      <div className="flex items-center gap-2">
        {!blob && !recording && (
          <>
            <button
              onClick={onStart}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-indigo-500 to-sky-500 px-3.5 py-1.5 text-sm font-medium text-white shadow-sm transition hover:from-indigo-600 hover:to-sky-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="flex h-2 w-2 rounded-full bg-white" />
              Record
            </button>
            <button
              onClick={onPickFile}
              disabled={busy}
              className="text-[11px] text-neutral-500 underline-offset-2 transition hover:text-indigo-700 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
            >
              or upload audio file
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={(e) => onFileChange(e.target.files?.[0])}
            />
            <span className="ml-auto text-[10.5px] text-neutral-400">
              Speak directly · max 25 MB
            </span>
          </>
        )}

        {recording && (
          <>
            <span className="flex items-center gap-1.5 text-[12px] font-medium text-red-600">
              <span className="block h-2 w-2 rounded-full bg-red-500 animate-pulse" />
              Recording {formatElapsed(recordingElapsedMs)}
            </span>
            <button
              onClick={onStop}
              className="rounded-full bg-red-500 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-red-600"
            >
              Stop
            </button>
            <span className="ml-auto text-[10.5px] text-neutral-400">
              Click stop when finished
            </span>
          </>
        )}

        {blob && !recording && (
          <>
            <audio
              src={previewUrl ?? undefined}
              controls
              preload="metadata"
              className="ai-audio h-8 min-w-0 flex-1"
            />
            {durationMs > 0 && (
              <span className="shrink-0 text-[10.5px] text-neutral-500">
                {formatElapsed(durationMs)}
              </span>
            )}
            <button
              onClick={onDiscard}
              disabled={busy}
              className="shrink-0 text-[11px] text-neutral-500 transition hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
              title="Discard recording"
            >
              Discard
            </button>
            <button
              onClick={onSubmit}
              disabled={busy}
              className="shrink-0 rounded-lg bg-gradient-to-r from-indigo-500 to-sky-500 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:from-indigo-600 hover:to-sky-600 disabled:cursor-not-allowed disabled:bg-neutral-300 disabled:text-neutral-500 disabled:from-neutral-300 disabled:to-neutral-300"
            >
              <span className="flex items-center gap-1.5">
                <svg
                  className="h-3.5 w-3.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="9" y="3" width="6" height="11" rx="3" />
                  <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
                </svg>
                {busy ? 'Transcribing…' : 'Transcribe'}
              </span>
            </button>
          </>
        )}
      </div>

      {blob && !recording && (
        <input
          type="text"
          value={instruction}
          onChange={(e) => onInstructionChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              onSubmit()
            }
          }}
          disabled={busy}
          placeholder='Optional instruction — e.g. "translate to English", "summarize as bullets"'
          maxLength={500}
          className="w-full rounded-lg border-0 bg-transparent px-2 py-1.5 text-[12px] text-neutral-700 placeholder:text-neutral-400 focus:outline-none disabled:opacity-50"
        />
      )}

      {error && (
        <p className="px-2 text-[11px] text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

// Audio helpers ---------------------------------------------------------

function pickSupportedMime(): string {
  if (typeof MediaRecorder === 'undefined') return ''
  for (const m of RECORDER_MIME_CANDIDATES) {
    try {
      if (MediaRecorder.isTypeSupported(m)) return m
    } catch {
      // Some browsers throw on certain inputs — skip and try the next.
    }
  }
  return ''
}

/** Strip `;codecs=...` / charset params and lowercase the family. */
function normalizeMime(mime: string): string {
  const head = mime.split(';')[0]?.trim().toLowerCase() ?? ''
  return head
}

function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}
