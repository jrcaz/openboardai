import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { SubAgent, type Modality, type SubAgentMode } from '@openboard-ai/shared'
import {
  slugify,
  useSubAgents,
  type NewSubAgentInput,
} from './useSubAgents'

interface Props {
  onClose: () => void
}

type Draft = {
  name: string
  slug: string
  description: string
  modality: Modality
  systemPrompt: string
  model: string
  defaultMode: SubAgentMode | ''
  temperature: string
  maxTokens: string
  icon: string
  color: string
}

const EMPTY_DRAFT: Draft = {
  name: '',
  slug: '',
  description: '',
  modality: 'text',
  systemPrompt: '',
  model: '',
  defaultMode: '',
  temperature: '',
  maxTokens: '',
  icon: '',
  color: '',
}

function draftFromAgent(a: SubAgent): Draft {
  return {
    name: a.name,
    slug: a.slug,
    description: a.description ?? '',
    modality: a.modality,
    systemPrompt: a.systemPrompt,
    model: a.model ?? '',
    defaultMode: a.defaultMode ?? '',
    temperature: a.temperature == null ? '' : String(a.temperature),
    maxTokens: a.maxTokens == null ? '' : String(a.maxTokens),
    icon: a.icon ?? '',
    color: a.color ?? '',
  }
}

function buildInput(d: Draft): NewSubAgentInput | { error: string } {
  const name = d.name.trim()
  if (!name) return { error: 'Name is required.' }
  const slug = (d.slug.trim() || slugify(name)).toLowerCase()
  if (!/^[a-z0-9-]{1,32}$/.test(slug))
    return { error: 'Slug must be 1-32 chars: lowercase letters, digits, or dashes.' }
  const systemPrompt = d.systemPrompt.trim()
  if (!systemPrompt) return { error: 'System prompt is required.' }

  let temperature: number | undefined
  if (d.temperature.trim()) {
    const t = Number(d.temperature)
    if (!Number.isFinite(t) || t < 0 || t > 2)
      return { error: 'Temperature must be between 0 and 2.' }
    temperature = t
  }

  let maxTokens: number | undefined
  if (d.maxTokens.trim()) {
    const n = Number(d.maxTokens)
    if (!Number.isInteger(n) || n < 1 || n > 32000)
      return { error: 'Max tokens must be an integer between 1 and 32000.' }
    maxTokens = n
  }

  const input: NewSubAgentInput = {
    name,
    slug,
    modality: d.modality,
    systemPrompt,
    ...(d.description.trim() ? { description: d.description.trim() } : {}),
    ...(d.model.trim() ? { model: d.model.trim() } : {}),
    ...(d.defaultMode && d.modality === 'text' ? { defaultMode: d.defaultMode } : {}),
    ...(temperature != null ? { temperature } : {}),
    ...(maxTokens != null ? { maxTokens } : {}),
    ...(d.icon.trim() ? { icon: d.icon.trim() } : {}),
    ...(d.color.trim() ? { color: d.color.trim() } : {}),
  }

  const parsed = SubAgent.omit({ id: true, createdAt: true, updatedAt: true }).safeParse(input)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return { error: issue ? `${issue.path.join('.')}: ${issue.message}` : 'Invalid agent.' }
  }
  return parsed.data
}

export function SubAgentsDialog({ onClose }: Props) {
  const { agents, create, update, remove } = useSubAgents()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState<boolean>(agents.length === 0)
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const cardRef = useRef<HTMLDivElement | null>(null)
  const titleId = useId()

  // Auto-derive slug when name changes IF the user hasn't manually edited it.
  const slugManuallyEdited = useRef(false)

  const selected = useMemo(
    () => (selectedId ? agents.find((a) => a.id === selectedId) ?? null : null),
    [selectedId, agents],
  )

  // When a different agent is picked, seed the draft.
  useEffect(() => {
    if (isCreating) {
      setDraft(EMPTY_DRAFT)
      slugManuallyEdited.current = false
    } else if (selected) {
      setDraft(draftFromAgent(selected))
      slugManuallyEdited.current = true
    }
    setError(null)
    setConfirmDelete(false)
  }, [isCreating, selected])

  // Esc to close.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function onBackdropClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose()
  }

  function updateDraft<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((prev) => {
      const next = { ...prev, [key]: value }
      if (key === 'name' && !slugManuallyEdited.current) {
        next.slug = slugify(String(value))
      }
      if (key === 'slug') slugManuallyEdited.current = true
      return next
    })
    if (error) setError(null)
  }

  function onStartCreate() {
    setIsCreating(true)
    setSelectedId(null)
  }

  function onPick(id: string) {
    setIsCreating(false)
    setSelectedId(id)
  }

  function onSave() {
    const result = buildInput(draft)
    if ('error' in result) {
      setError(result.error)
      return
    }
    if (isCreating) {
      const created = create(result)
      setIsCreating(false)
      setSelectedId(created.id)
    } else if (selected) {
      update(selected.id, result)
    }
  }

  function onDelete() {
    if (!selected) return
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    remove(selected.id)
    setSelectedId(null)
    setIsCreating(agents.length <= 1)
    setConfirmDelete(false)
  }

  const isImage = draft.modality === 'image'
  const isVideo = draft.modality === 'video'
  const isText = draft.modality === 'text'

  return createPortal(
    <div
      onClick={onBackdropClick}
      className="pointer-events-auto fixed inset-0 z-[600] flex items-center justify-center bg-neutral-950/40 backdrop-blur-md p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div
        ref={cardRef}
        className="relative flex h-[640px] w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 z-10 rounded-md p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 transition"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M6 6l12 12M18 6l-12 12" />
          </svg>
        </button>

        {/* Left rail — list of agents */}
        <aside className="flex w-56 shrink-0 flex-col border-r border-neutral-200 bg-neutral-50/60">
          <div className="px-4 py-4">
            <h2 id={titleId} className="text-[14px] font-semibold text-neutral-900">
              Sub-agents
            </h2>
            <p className="mt-1 text-[11.5px] leading-snug text-neutral-500">
              Reusable personas with custom prompts & models.
            </p>
          </div>
          <div className="flex-1 overflow-y-auto px-2">
            {agents.length === 0 ? (
              <div className="px-2 py-2 text-[11.5px] text-neutral-500">
                No agents yet.
              </div>
            ) : (
              agents.map((a) => {
                const isActive = !isCreating && a.id === selectedId
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => onPick(a.id)}
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition ${
                      isActive
                        ? 'bg-white ring-1 ring-neutral-200 shadow-sm'
                        : 'hover:bg-white/70'
                    }`}
                  >
                    <span aria-hidden="true" className="w-5 shrink-0 text-center text-[14px] leading-none">
                      {a.icon || '·'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12.5px] font-medium text-neutral-800">
                        {a.name}
                      </div>
                      <div className="truncate text-[10.5px] text-neutral-500">
                        {a.modality} · /{a.slug}
                      </div>
                    </div>
                  </button>
                )
              })
            )}
          </div>
          <div className="border-t border-neutral-200 p-2">
            <button
              type="button"
              onClick={onStartCreate}
              className={`flex w-full items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[12px] font-medium transition ${
                isCreating
                  ? 'bg-neutral-900 text-white shadow-sm'
                  : 'bg-neutral-200/60 text-neutral-700 hover:bg-neutral-200'
              }`}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
              New agent
            </button>
          </div>
        </aside>

        {/* Right side — form */}
        <section className="flex flex-1 flex-col overflow-hidden">
          {!isCreating && !selected ? (
            <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
              <p className="text-[13.5px] text-neutral-600">
                Pick an agent on the left, or create a new one.
              </p>
              <button
                type="button"
                onClick={onStartCreate}
                className="mt-3 rounded-lg bg-neutral-900 px-3.5 py-2 text-[13px] font-medium text-white hover:bg-neutral-800 transition"
              >
                Create your first agent
              </button>
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto px-6 py-5">
                <div className="mb-4">
                  <h3 className="text-[15px] font-semibold text-neutral-900">
                    {isCreating ? 'New sub-agent' : `Edit "${selected?.name}"`}
                  </h3>
                  <p className="mt-1 text-[12px] text-neutral-500">
                    {isImage || isVideo
                      ? `For ${draft.modality} agents, the system prompt is prepended to the user's prompt as a template prefix.`
                      : 'Defines how the agent responds in text mode.'}
                  </p>
                </div>

                {/* Identity row: icon, name, slug */}
                <div className="grid grid-cols-12 gap-3">
                  <Field label="Icon" className="col-span-2">
                    <input
                      value={draft.icon}
                      onChange={(e) => updateDraft('icon', e.target.value.slice(0, 4))}
                      placeholder="🤖"
                      className={INPUT_CLS}
                      maxLength={4}
                    />
                  </Field>
                  <Field label="Name" className="col-span-5">
                    <input
                      value={draft.name}
                      onChange={(e) => updateDraft('name', e.target.value)}
                      placeholder="Marketing Copywriter"
                      className={INPUT_CLS}
                      maxLength={50}
                    />
                  </Field>
                  <Field label="Slug" hint="used for /slash invocation" className="col-span-5">
                    <input
                      value={draft.slug}
                      onChange={(e) => updateDraft('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                      placeholder="marketing-copy"
                      className={`${INPUT_CLS} font-mono`}
                      maxLength={32}
                    />
                  </Field>
                </div>

                <Field label="Description" hint="shown in the picker">
                  <input
                    value={draft.description}
                    onChange={(e) => updateDraft('description', e.target.value)}
                    placeholder="Punchy product copy with strong verbs."
                    className={INPUT_CLS}
                    maxLength={300}
                  />
                </Field>

                <div className="grid grid-cols-12 gap-3">
                  <Field label="Modality" className="col-span-4">
                    <select
                      value={draft.modality}
                      onChange={(e) => updateDraft('modality', e.target.value as Modality)}
                      className={INPUT_CLS}
                    >
                      <option value="text">Text</option>
                      <option value="image">Image</option>
                      <option value="video">Video</option>
                    </select>
                  </Field>
                  <Field label="Model override" hint="optional — falls back to picker default" className="col-span-8">
                    <input
                      value={draft.model}
                      onChange={(e) => updateDraft('model', e.target.value)}
                      placeholder="e.g. anthropic/claude-sonnet-4.6 (leave blank to use default)"
                      className={`${INPUT_CLS} font-mono`}
                      maxLength={200}
                    />
                    <p className="mt-1 text-[10.5px] text-neutral-400">
                      OpenRouter model id. Browse the catalog at{' '}
                      <a
                        href="https://openrouter.ai/models"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-amber-700 hover:underline"
                      >
                        openrouter.ai/models
                      </a>
                      . Leave blank to use whatever the global picker has set.
                    </p>
                  </Field>
                </div>

                <Field
                  label={
                    isText
                      ? 'System prompt'
                      : `Prompt template (prepended to ${draft.modality} prompts)`
                  }
                >
                  <textarea
                    value={draft.systemPrompt}
                    onChange={(e) => updateDraft('systemPrompt', e.target.value)}
                    placeholder={
                      isText
                        ? 'You are a punchy marketing copywriter. Respond with bold, scannable copy…'
                        : 'anime style, soft pastel colors, studio lighting, high detail'
                    }
                    className={`${INPUT_CLS} min-h-[120px] resize-y font-mono leading-relaxed`}
                    maxLength={8000}
                  />
                </Field>

                <div className="grid grid-cols-12 gap-3">
                  {isText && (
                    <Field label="Default mode" hint="auto-applied when this agent is active" className="col-span-4">
                      <select
                        value={draft.defaultMode}
                        onChange={(e) => updateDraft('defaultMode', e.target.value as Draft['defaultMode'])}
                        className={INPUT_CLS}
                      >
                        <option value="">— None —</option>
                        <option value="prompt">Prompt</option>
                        <option value="selection-qa">Selection Q&amp;A</option>
                        <option value="expand">Expand (4 cards)</option>
                      </select>
                    </Field>
                  )}
                  <Field
                    label="Temperature"
                    hint="0–2 (blank = model default)"
                    className={isText ? 'col-span-4' : 'col-span-6'}
                  >
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="2"
                      value={draft.temperature}
                      onChange={(e) => updateDraft('temperature', e.target.value)}
                      placeholder="0.7"
                      className={INPUT_CLS}
                    />
                  </Field>
                  <Field
                    label="Max tokens"
                    hint="1–32000 (blank = model default)"
                    className={isText ? 'col-span-4' : 'col-span-6'}
                  >
                    <input
                      type="number"
                      step="1"
                      min="1"
                      max="32000"
                      value={draft.maxTokens}
                      onChange={(e) => updateDraft('maxTokens', e.target.value)}
                      placeholder="1024"
                      className={INPUT_CLS}
                    />
                  </Field>
                </div>

                {error && (
                  <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-[12.5px] text-red-700">
                    {error}
                  </div>
                )}
              </div>

              {/* Sticky footer */}
              <footer className="flex items-center justify-between gap-2 border-t border-neutral-200 bg-white px-6 py-3">
                <div>
                  {!isCreating && selected && (
                    <button
                      type="button"
                      onClick={onDelete}
                      className={`text-[12.5px] font-medium transition ${
                        confirmDelete
                          ? 'rounded-md bg-red-600 px-3 py-1.5 text-white hover:bg-red-700'
                          : 'text-neutral-500 hover:text-red-600'
                      }`}
                    >
                      {confirmDelete ? 'Click again to confirm delete' : 'Delete agent'}
                    </button>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-lg px-3.5 py-2 text-[13px] font-medium text-neutral-600 hover:bg-neutral-100 transition"
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={onSave}
                    className="rounded-lg bg-gradient-to-r from-amber-400 to-orange-400 px-4 py-2 text-[13px] font-semibold text-neutral-900 shadow-sm transition hover:from-amber-500 hover:to-orange-500"
                  >
                    {isCreating ? 'Create agent' : 'Save changes'}
                  </button>
                </div>
              </footer>
            </>
          )}
        </section>
      </div>
    </div>,
    document.body,
  )
}

const INPUT_CLS =
  'w-full rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-[12.5px] text-neutral-900 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-200 placeholder:text-neutral-400'

function Field({
  label,
  hint,
  children,
  className = '',
}: {
  label: string
  hint?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={`mt-3 ${className}`}>
      <label className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
        {label}
        {hint && (
          <span className="font-normal normal-case tracking-normal text-neutral-400">— {hint}</span>
        )}
      </label>
      {children}
    </div>
  )
}
