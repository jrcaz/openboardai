import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { ApiKeySummary, CreatedApiKey } from '@openboard-ai/shared'
import { api } from '../lib/api'
import { relativeTime } from '../lib/relativeTime'

function lastUsedLabel(iso: string | null): string {
  return iso ? `last used ${relativeTime(iso)}` : 'never used'
}

export function AgentKeysSection() {
  const [keys, setKeys] = useState<ApiKeySummary[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [justCreated, setJustCreated] = useState<CreatedApiKey | null>(null)
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null)
  const [revokeError, setRevokeError] = useState<{ id: string; message: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const nameInputRef = useRef<HTMLInputElement | null>(null)
  const autoFocusedRef = useRef(false)
  const inputId = useId()

  const refresh = useCallback(async () => {
    try {
      const rows = await api.listApiKeys()
      setKeys(rows)
    } catch (err) {
      setLoadError((err as Error).message)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (autoFocusedRef.current) return
    if (keys && keys.length === 0 && !justCreated) {
      autoFocusedRef.current = true
      nameInputRef.current?.focus()
    }
  }, [keys, justCreated])

  async function onCreate(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || creating) return
    setCreating(true)
    setCreateError(null)
    try {
      const created = await api.createApiKey(trimmed)
      setJustCreated(created)
      setName('')
      setCopied(false)
      await refresh()
    } catch (err) {
      setCreateError((err as Error).message)
    } finally {
      setCreating(false)
    }
  }

  async function onRevoke(id: string) {
    setRevokingId(id)
    setRevokeError(null)
    try {
      await api.revokeApiKey(id)
      setConfirmRevokeId(null)
      await refresh()
    } catch (err) {
      setRevokeError({ id, message: (err as Error).message })
    } finally {
      setRevokingId(null)
    }
  }

  function copyPlaintext(text: string) {
    void navigator.clipboard.writeText(text).catch(() => {})
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://your.host'
  const isEmpty = keys !== null && keys.length === 0

  return (
    <div>
      <header className="mb-6">
        <h2 className="text-[18px] font-semibold tracking-tight text-neutral-900">
          Agent access keys
        </h2>
        <p className="mt-1.5 max-w-2xl text-[13.5px] leading-relaxed text-neutral-600">
          Let external AI agents (Claude Desktop, Cursor, custom scripts) read your boards and
          add new content to them. Each key acts as you — keep it secret.
        </p>
      </header>

      {justCreated && (
        <div
          className="lp-fade-up mb-6 overflow-hidden rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50/60 p-4"
          style={{ animationDuration: '0.22s' }}
        >
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-amber-800">
            <ShieldIcon />
            Copy this key now — you won't see it again
          </div>
          <div className="mt-2.5 flex items-center gap-2">
            <code className="flex-1 break-all rounded-md bg-white px-2.5 py-1.5 font-mono text-[12px] text-neutral-900 ring-1 ring-amber-200">
              {justCreated.plaintext}
            </code>
            <button
              type="button"
              onClick={() => copyPlaintext(justCreated.plaintext)}
              className="inline-flex min-w-[78px] items-center justify-center gap-1.5 rounded-md bg-neutral-900 px-2.5 py-1.5 text-[12px] font-medium text-white transition hover:bg-neutral-800 active:scale-[0.97]"
            >
              {copied ? (
                <>
                  <CheckIcon />
                  Copied
                </>
              ) : (
                <>
                  <CopyIcon />
                  Copy
                </>
              )}
            </button>
          </div>
          <p className="mt-3 text-[12px] text-neutral-700">
            See{' '}
            <a
              href="#connect"
              onClick={(e) => {
                e.preventDefault()
                document
                  .getElementById('connect')
                  ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }}
              className="font-medium text-amber-900 underline-offset-2 hover:underline"
            >
              Connect your agent
            </a>{' '}
            below for ready-to-paste snippets.
          </p>
          <button
            type="button"
            onClick={() => setJustCreated(null)}
            className="mt-3 text-[12px] font-medium text-amber-900 transition hover:underline"
          >
            I've saved the key — dismiss
          </button>
        </div>
      )}

      <form onSubmit={onCreate} className="mb-5 flex gap-2">
        <input
          ref={nameInputRef}
          id={inputId}
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            if (createError) setCreateError(null)
          }}
          placeholder="e.g. claude-desktop"
          maxLength={80}
          disabled={creating}
          aria-label="Key name"
          className="flex-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-[13px] text-neutral-900 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-200 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={creating || name.trim().length === 0}
          className="rounded-lg bg-gradient-to-r from-amber-400 to-orange-400 px-4 py-2 text-[13px] font-semibold text-neutral-900 shadow-sm transition hover:from-amber-500 hover:to-orange-500 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:from-amber-400 disabled:hover:to-orange-400"
        >
          {creating ? 'Creating…' : 'Create key'}
        </button>
      </form>
      {createError && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">
          {createError}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-neutral-200">
        <div className="border-b border-neutral-200 bg-neutral-50/60 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
          Active keys
        </div>
        {loadError && <div className="px-4 py-3 text-[13px] text-red-700">{loadError}</div>}
        {keys === null && !loadError && (
          <div className="px-4 py-8 text-center text-[13px] text-neutral-400">Loading…</div>
        )}
        {isEmpty && (
          <div className="flex flex-col items-center px-4 py-10 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-amber-100 to-orange-100 text-amber-700">
              <KeyIcon size={22} />
            </div>
            <div className="text-[13.5px] font-semibold text-neutral-800">No keys yet</div>
            <div className="mt-1 max-w-xs text-[12.5px] leading-relaxed text-neutral-500">
              Name a key above and create one to give an external agent access to your boards.
            </div>
          </div>
        )}
        {keys && keys.length > 0 && (
          <ul className="divide-y divide-neutral-100">
            {keys.map((k) => {
              const confirming = confirmRevokeId === k.id
              const revoking = revokingId === k.id
              return (
                <li key={k.id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium text-neutral-900">
                        {k.name}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-neutral-500">
                        <code className="font-mono text-neutral-600">{k.prefix}…</code>
                        <span aria-hidden="true">·</span>
                        <span>created {relativeTime(k.createdAt)}</span>
                        <span aria-hidden="true">·</span>
                        <span>{lastUsedLabel(k.lastUsedAt)}</span>
                      </div>
                    </div>
                    {!confirming && (
                      <button
                        type="button"
                        onClick={() => setConfirmRevokeId(k.id)}
                        className="rounded-md border border-neutral-200 px-2.5 py-1 text-[12px] font-medium text-neutral-700 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700"
                      >
                        Revoke
                      </button>
                    )}
                  </div>
                  {confirming && (
                    <div
                      className="lp-fade-up mt-2.5 rounded-lg border border-red-200 bg-red-50/70 px-3 py-2"
                      style={{ animationDuration: '0.16s' }}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-[12.5px] text-red-800">
                          Revoke this key? Any agent using it will lose access immediately.
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setConfirmRevokeId(null)
                              setRevokeError(null)
                            }}
                            disabled={revoking}
                            className="rounded-md px-2.5 py-1 text-[12px] font-medium text-neutral-700 transition hover:bg-white disabled:opacity-50"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => onRevoke(k.id)}
                            disabled={revoking}
                            className="rounded-md bg-red-600 px-2.5 py-1 text-[12px] font-medium text-white transition hover:bg-red-700 active:scale-[0.97] disabled:opacity-60"
                          >
                            {revoking ? 'Revoking…' : 'Revoke'}
                          </button>
                        </div>
                      </div>
                      {revokeError?.id === k.id && (
                        <div className="mt-2 text-[11.5px] text-red-700">
                          Couldn't revoke: {revokeError.message}
                        </div>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <ConnectGuide origin={origin} />

      <p className="mt-5 text-[11.5px] leading-relaxed text-neutral-500">
        Keys are stored hashed — we never store the plaintext. AI generation tools require the
        caller to also send their OpenRouter key as{' '}
        <code className="font-mono">X-OpenRouter-Key</code>.
      </p>
    </div>
  )
}

type ClientTab =
  | 'claude-code'
  | 'claude-desktop'
  | 'codex'
  | 'cursor'
  | 'inspector'
  | 'rest'

const TABS: { id: ClientTab; label: string; sub: string }[] = [
  { id: 'claude-code', label: 'Claude Code', sub: 'MCP' },
  { id: 'claude-desktop', label: 'Claude Desktop', sub: 'MCP' },
  { id: 'codex', label: 'Codex CLI', sub: 'MCP' },
  { id: 'cursor', label: 'Cursor', sub: 'MCP' },
  { id: 'inspector', label: 'MCP Inspector', sub: 'Debug' },
  { id: 'rest', label: 'REST API', sub: 'curl' },
]

const MCP_TOOLS: { name: string; summary: string }[] = [
  { name: 'list_boards', summary: 'List every board you own, newest first.' },
  { name: 'read_board', summary: 'Read a board’s contents as a flat list of items.' },
  { name: 'add_text_to_board', summary: 'Add a sticky note or text shape at a position.' },
  { name: 'move_board_items', summary: 'Move existing board items to new positions.' },
  { name: 'generate_on_board', summary: 'Generate text, image, or HTML and drop it on a board. Needs OpenRouter key.' },
]

function ConnectGuide({ origin }: { origin: string }) {
  const [tab, setTab] = useState<ClientTab>('claude-code')
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const mcpUrl = `${origin}/api/mcp`
  const restUrl = `${origin}/api/agent/v1/boards`

  function onTabKeyDown(e: React.KeyboardEvent) {
    const order = TABS.map((t) => t.id)
    const i = order.indexOf(tab)
    let next: ClientTab | null = null
    if (e.key === 'ArrowRight') next = order[(i + 1) % order.length]!
    else if (e.key === 'ArrowLeft') next = order[(i - 1 + order.length) % order.length]!
    else if (e.key === 'Home') next = order[0]!
    else if (e.key === 'End') next = order[order.length - 1]!
    if (next) {
      e.preventDefault()
      setTab(next)
      tabRefs.current[next]?.focus()
    }
  }

  return (
    <section id="connect" className="mt-7 scroll-mt-24">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-semibold tracking-tight text-neutral-900">
            Connect your agent
          </h3>
          <p className="mt-1 text-[12.5px] leading-relaxed text-neutral-600">
            Pick a client and paste the snippet. Replace{' '}
            <code className="rounded bg-neutral-100 px-1 py-0.5 font-mono text-[11.5px]">YOUR_KEY</code>{' '}
            with a key from the list above.
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <nav
          role="tablist"
          aria-label="Client integration"
          onKeyDown={onTabKeyDown}
          className="flex gap-0.5 overflow-x-auto border-b border-neutral-200 bg-neutral-50/60 px-2 pt-2"
        >
          {TABS.map((t) => {
            const isActive = tab === t.id
            return (
              <button
                key={t.id}
                id={`connect-tab-${t.id}`}
                ref={(el) => {
                  tabRefs.current[t.id] = el
                }}
                role="tab"
                type="button"
                aria-selected={isActive}
                aria-controls="connect-tab-panel"
                tabIndex={isActive ? 0 : -1}
                onClick={() => setTab(t.id)}
                className={[
                  'relative -mb-px shrink-0 rounded-t-md border-b-[2px] px-3 py-2 text-[12.5px] font-medium transition',
                  isActive
                    ? 'border-amber-500 bg-white text-neutral-900'
                    : 'border-transparent text-neutral-500 hover:bg-white/60 hover:text-neutral-800',
                ].join(' ')}
              >
                <span>{t.label}</span>
                <span
                  className={[
                    'ml-1.5 rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider',
                    isActive ? 'bg-amber-50 text-amber-700' : 'bg-neutral-100 text-neutral-500',
                  ].join(' ')}
                >
                  {t.sub}
                </span>
              </button>
            )
          })}
        </nav>

        <div className="p-4 sm:p-5">
          <div
            key={tab}
            id="connect-tab-panel"
            role="tabpanel"
            aria-labelledby={`connect-tab-${tab}`}
            className="lp-fade-up"
            style={{ animationDuration: '0.18s' }}
          >
            {tab === 'claude-code' && <ClaudeCodePanel mcpUrl={mcpUrl} />}
            {tab === 'claude-desktop' && <ClaudeDesktopPanel mcpUrl={mcpUrl} />}
            {tab === 'codex' && <CodexPanel mcpUrl={mcpUrl} />}
            {tab === 'cursor' && <CursorPanel mcpUrl={mcpUrl} />}
            {tab === 'inspector' && <InspectorPanel mcpUrl={mcpUrl} />}
            {tab === 'rest' && <RestPanel restUrl={restUrl} />}
          </div>
        </div>
      </div>

      <div className="mt-5">
        <h4 className="text-[12.5px] font-semibold text-neutral-800">Available MCP tools</h4>
        <ul className="mt-2 grid gap-2 sm:grid-cols-2">
          {MCP_TOOLS.map((t) => (
            <li
              key={t.name}
              className="rounded-lg border border-neutral-200 bg-white px-3 py-2.5"
            >
              <code className="block font-mono text-[12px] font-semibold text-neutral-900">
                {t.name}
              </code>
              <div className="mt-0.5 text-[12px] leading-relaxed text-neutral-600">
                {t.summary}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function ClaudeCodePanel({ mcpUrl }: { mcpUrl: string }) {
  const cli = `claude mcp add --transport http openboard-ai ${mcpUrl} \\
  --header "Authorization: Bearer YOUR_KEY" \\
  --header "X-OpenRouter-Key: sk-or-v1-..."`
  const jsonSnippet = `{
  "mcpServers": {
    "openboard-ai": {
      "type": "http",
      "url": "${mcpUrl}",
      "headers": {
        "Authorization": "Bearer YOUR_KEY",
        "X-OpenRouter-Key": "sk-or-v1-..."
      }
    }
  }
}`
  return (
    <div className="space-y-2.5">
      <Step n={1}>
        Add the server with the CLI — pick <Mono>--scope user</Mono> to enable it
        everywhere, or <Mono>--scope project</Mono> to share it via a repo’s{' '}
        <Mono>.mcp.json</Mono>:
      </Step>
      <CodeBlock code={cli} />
      <Step n={2}>
        Or drop the same entry into <Mono>.mcp.json</Mono> (project) or your user-scope{' '}
        <Mono>~/.claude.json</Mono>:
      </Step>
      <CodeBlock code={jsonSnippet} />
      <Step n={3}>
        In Claude Code, run <Mono>/mcp</Mono> to confirm <Mono>openboard-ai</Mono>{' '}
        is connected. Then ask: <em>“list my OpenBoard boards”</em>.
      </Step>
      <Hint>
        Manage it later with <Mono>claude mcp list</Mono>,{' '}
        <Mono>claude mcp get openboard-ai</Mono>, or <Mono>claude mcp remove openboard-ai</Mono>.
      </Hint>
    </div>
  )
}

function ClaudeDesktopPanel({ mcpUrl }: { mcpUrl: string }) {
  const snippet = `{
  "mcpServers": {
    "openboard-ai": {
      "transport": {
        "type": "streamable-http",
        "url": "${mcpUrl}"
      },
      "headers": {
        "Authorization": "Bearer YOUR_KEY",
        "X-OpenRouter-Key": "sk-or-v1-..."
      }
    }
  }
}`
  return (
    <div className="space-y-2.5">
      <Step n={1}>
        Open <Mono>~/Library/Application Support/Claude/claude_desktop_config.json</Mono>{' '}
        (macOS) or <Mono>%APPDATA%\Claude\claude_desktop_config.json</Mono> (Windows).
      </Step>
      <Step n={2}>
        Add OpenBoard AI to your <Mono>mcpServers</Mono>:
      </Step>
      <CodeBlock code={snippet} />
      <Step n={3}>
        Quit and reopen Claude Desktop. Ask:{' '}
        <em>"List my OpenBoard boards"</em> or{' '}
        <em>"Add a sticky note to board &lt;id&gt; saying hello"</em>.
      </Step>
      <Hint>
        <Mono>X-OpenRouter-Key</Mono> is only required if you want Claude to call{' '}
        <Mono>generate_on_board</Mono>. Omit it otherwise.
      </Hint>
    </div>
  )
}

function CodexPanel({ mcpUrl }: { mcpUrl: string }) {
  const exportCmd = `export OPENBOARD_TOKEN="YOUR_KEY"`
  const cli = `codex mcp add openboard-ai --url ${mcpUrl} \\
  --bearer-token-env-var OPENBOARD_TOKEN`
  const toml = `[mcp_servers.openboard-ai]
url = "${mcpUrl}"
bearer_token_env_var = "OPENBOARD_TOKEN"
http_headers = { "X-OpenRouter-Key" = "sk-or-v1-..." }`
  return (
    <div className="space-y-2.5">
      <Step n={1}>
        Export your key as an env var so Codex can read it without storing the secret
        in <Mono>config.toml</Mono>:
      </Step>
      <CodeBlock code={exportCmd} />
      <Step n={2}>
        Register the server. <Mono>codex mcp add</Mono> writes to{' '}
        <Mono>~/.codex/config.toml</Mono> automatically:
      </Step>
      <CodeBlock code={cli} />
      <Step n={3}>
        To also send your OpenRouter key (needed for <Mono>generate_on_board</Mono>),
        open <Mono>~/.codex/config.toml</Mono> and extend the entry with{' '}
        <Mono>http_headers</Mono>:
      </Step>
      <CodeBlock code={toml} />
      <Step n={4}>
        Verify with <Mono>codex mcp list</Mono>, then start a Codex session and ask:{' '}
        <em>“list my OpenBoard boards”</em>.
      </Step>
      <Hint>
        Codex CLI’s <Mono>--header</Mono> flag doesn’t exist yet — custom headers like{' '}
        <Mono>X-OpenRouter-Key</Mono> must be added to <Mono>config.toml</Mono> by hand.
      </Hint>
    </div>
  )
}

function CursorPanel({ mcpUrl }: { mcpUrl: string }) {
  const snippet = `{
  "mcpServers": {
    "openboard-ai": {
      "url": "${mcpUrl}",
      "headers": {
        "Authorization": "Bearer YOUR_KEY",
        "X-OpenRouter-Key": "sk-or-v1-..."
      }
    }
  }
}`
  return (
    <div className="space-y-2.5">
      <Step n={1}>
        Open <Mono>Cursor Settings → Tools &amp; MCP → New MCP Server</Mono>, or edit{' '}
        <Mono>~/.cursor/mcp.json</Mono> directly.
      </Step>
      <Step n={2}>Paste the config and save:</Step>
      <CodeBlock code={snippet} />
      <Step n={3}>
        Open the agent panel — <Mono>openboard-ai</Mono> tools appear under the MCP toggle.
      </Step>
    </div>
  )
}

function InspectorPanel({ mcpUrl }: { mcpUrl: string }) {
  return (
    <div className="space-y-2.5">
      <Step n={1}>
        Run the official inspector — no install needed:
      </Step>
      <CodeBlock code="npx @modelcontextprotocol/inspector" />
      <Step n={2}>
        Set <Mono>Transport</Mono> to <Mono>Streamable HTTP</Mono> and{' '}
        <Mono>URL</Mono> to:
      </Step>
      <CodeBlock code={mcpUrl} />
      <Step n={3}>
        Add a request header <Mono>Authorization: Bearer YOUR_KEY</Mono>,
        click <Mono>Connect</Mono>, then explore <Mono>Tools → List</Mono>{' '}
        and invoke each one.
      </Step>
      <Hint>
        Great for debugging — every tool call shows its request and response.
      </Hint>
    </div>
  )
}

function RestPanel({ restUrl }: { restUrl: string }) {
  const listCmd = `curl -H "Authorization: Bearer YOUR_KEY" \\
  ${restUrl}`
  const addCmd = `curl -X POST -H "Authorization: Bearer YOUR_KEY" \\
  -H "content-type: application/json" \\
  -d '{"kind":"note","text":"hello from curl","color":"yellow"}' \\
  ${restUrl}/<board-id>/items`
  const moveCmd = `curl -X POST -H "Authorization: Bearer YOUR_KEY" \\
  -H "content-type: application/json" \\
  -d '{"moves":[{"id":"shape:abc","x":420,"y":180}]}' \\
  ${restUrl}/<board-id>/items/move`
  return (
    <div className="space-y-3">
      <div>
        <div className="mb-1 text-[11.5px] font-semibold uppercase tracking-wider text-neutral-500">
          List your boards
        </div>
        <CodeBlock code={listCmd} />
      </div>
      <div>
        <div className="mb-1 text-[11.5px] font-semibold uppercase tracking-wider text-neutral-500">
          Add a sticky note
        </div>
        <CodeBlock code={addCmd} />
      </div>
      <div>
        <div className="mb-1 text-[11.5px] font-semibold uppercase tracking-wider text-neutral-500">
          Move an item
        </div>
        <CodeBlock code={moveCmd} />
      </div>
      <Hint>
        For <Mono>POST /boards/:id/generate</Mono>, also send{' '}
        <Mono>X-OpenRouter-Key: sk-or-v1-...</Mono> — keys are never stored server-side.
      </Hint>
    </div>
  )
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 text-[12.5px] leading-relaxed text-neutral-700">
      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[10px] font-semibold text-amber-800">
        {n}
      </span>
      <span className="min-w-0 flex-1">{children}</span>
    </div>
  )
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-neutral-200 bg-neutral-50/70 px-2.5 py-1.5 text-[11.5px] leading-relaxed text-neutral-600">
      <span className="font-semibold text-neutral-700">Tip:</span> {children}
    </div>
  )
}

function Mono({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-neutral-100 px-1 py-0.5 font-mono text-[11px] text-neutral-800">
      {children}
    </code>
  )
}

function CodeBlock({ code }: { code: string }) {
  const [done, setDone] = useState(false)
  function onCopy() {
    void navigator.clipboard.writeText(code).catch(() => {})
    setDone(true)
    window.setTimeout(() => setDone(false), 1400)
  }
  return (
    <div className="group relative overflow-hidden rounded-lg bg-neutral-900 text-neutral-100">
      <pre className="overflow-x-auto px-3.5 py-3 font-mono text-[12px] leading-relaxed">
        <code>{code}</code>
      </pre>
      <button
        type="button"
        onClick={onCopy}
        aria-label="Copy snippet"
        className={[
          'absolute right-2 top-2 inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition',
          done
            ? 'bg-emerald-500/20 text-emerald-300'
            : 'bg-white/10 text-neutral-200 opacity-0 hover:bg-white/15 group-hover:opacity-100 focus-visible:opacity-100',
        ].join(' ')}
      >
        {done ? (
          <>
            <CheckIcon /> Copied
          </>
        ) : (
          <>
            <CopyIcon /> Copy
          </>
        )}
      </button>
    </div>
  )
}

function ShieldIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6l8-4z" />
    </svg>
  )
}

function CopyIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 012-2h10" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12.5l4.5 4.5L19 7" />
    </svg>
  )
}

function KeyIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
    </svg>
  )
}
