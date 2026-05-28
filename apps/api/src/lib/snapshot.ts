import { nanoid } from 'nanoid'
import { and, eq } from 'drizzle-orm'
import { db, schema } from '../db/client.js'

// ---------------------------------------------------------------------------
// Server-side tldraw snapshot construction.
//
// Browsers create shapes via `editor.createShape`. For headless agent writes we
// have to merge records directly into the persisted snapshot JSON. The format
// produced by tldraw's `getSnapshot` (and persisted by BoardEditor) is:
//
//   { document: { store: { [recordId]: record, ... }, schema: {...} }, session: {...} }
//
// We treat the snapshot as opaque except for the `document.store` record map.
// All shape construction is intentionally minimal — only `text` and `note`
// shapes, plus the project's four custom AI shapes, all of which share the
// same `BaseBoxShape` structure (x, y, rotation, index, parentId, isLocked,
// opacity, meta + a type-specific `props` bag).
// ---------------------------------------------------------------------------

export type Json = Record<string, unknown>
export type StoreMap = Record<string, Json>

export interface ParsedSnapshot {
  raw: Json // the entire stored snapshot, with `document.store` referenced into `store`
  store: StoreMap
  pageId: string
}

export interface BuiltShape {
  id: string
  record: Json
}

// ProseMirror "doc" wrapping a single paragraph — matches what tldraw's
// toRichText() emits for plain text input. Used by text/note shapes.
function richText(text: string): Json {
  const trimmed = text.replace(/\r\n/g, '\n')
  // Preserve blank lines as separate paragraphs; otherwise a single paragraph.
  const paragraphs = trimmed.split('\n')
  return {
    type: 'doc',
    content: paragraphs.map((p) =>
      p.length === 0
        ? { type: 'paragraph' }
        : {
            type: 'paragraph',
            content: [{ type: 'text', text: p }],
          },
    ),
  }
}

// Fractional indices — tldraw orders sibling shapes by these. We don't need
// strict ordering across agent writes; appending a unique trailing index keeps
// records valid and roughly chronological. The base32 alphabet matches what
// the `tldraw` package uses for `IndexKey` strings.
const INDEX_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUV'
function nextIndex(store: StoreMap, parentId: string): string {
  let maxIndex = 'a0'
  for (const rec of Object.values(store)) {
    if ((rec as Json).typeName !== 'shape') continue
    if ((rec as Json).parentId !== parentId) continue
    const idx = (rec as Json).index as string | undefined
    if (typeof idx === 'string' && idx > maxIndex) maxIndex = idx
  }
  // Append a random char beyond the current max so the new index sorts after
  // every existing sibling without colliding with concurrent appends.
  const suffix = INDEX_ALPHABET[Math.floor(Math.random() * INDEX_ALPHABET.length)]!
  return `${maxIndex}${suffix}`
}

/**
 * Parses a board's persisted snapshot, bootstrapping a fresh one if missing.
 * Returns a *mutable* view: callers can write into `store` and pass `raw` back
 * to `persistSnapshot` to write the whole thing back.
 */
export function parseSnapshot(stored: Json | null | undefined): ParsedSnapshot {
  // Bootstrap an empty snapshot. The `schema` field is intentionally omitted —
  // tldraw's `loadSnapshot` accepts a snapshot without a schema and uses the
  // current editor schema (with migration). This avoids hard-coding schema
  // version numbers that we'd have to update in lockstep with tldraw upgrades.
  if (!stored || typeof stored !== 'object' || Object.keys(stored).length === 0) {
    const pageId = `page:${nanoid(10)}`
    const store: StoreMap = {
      'document:document': {
        id: 'document:document',
        typeName: 'document',
        gridSize: 10,
        name: '',
        meta: {},
      },
      [pageId]: {
        id: pageId,
        typeName: 'page',
        name: 'Page 1',
        index: 'a1',
        meta: {},
      },
    }
    const raw: Json = { document: { store } }
    return { raw, store, pageId }
  }

  // Modern persisted shape: { document: { store, schema }, session }.
  const doc = (stored as Json).document
  if (doc && typeof doc === 'object' && (doc as Json).store) {
    const store = (doc as Json).store as StoreMap
    const pageId = findPageId(store) ?? bootstrapPage(store)
    return { raw: stored as Json, store, pageId }
  }

  // Legacy / direct shape: { store, schema } at top level.
  if ((stored as Json).store && typeof (stored as Json).store === 'object') {
    const store = (stored as Json).store as StoreMap
    const pageId = findPageId(store) ?? bootstrapPage(store)
    return { raw: stored as Json, store, pageId }
  }

  // Unknown shape — wrap whatever's there inside a fresh document so we don't
  // lose data, but agent writes will start a fresh page.
  const pageId = `page:${nanoid(10)}`
  const store: StoreMap = {
    [pageId]: { id: pageId, typeName: 'page', name: 'Page 1', index: 'a1', meta: {} },
  }
  return { raw: { document: { store } }, store, pageId }
}

function findPageId(store: StoreMap): string | null {
  let firstPage: { id: string; index: string } | null = null
  for (const rec of Object.values(store)) {
    if ((rec as Json).typeName !== 'page') continue
    const id = (rec as Json).id as string
    const index = ((rec as Json).index as string) ?? 'a1'
    if (!firstPage || index < firstPage.index) firstPage = { id, index }
  }
  return firstPage?.id ?? null
}

function bootstrapPage(store: StoreMap): string {
  const pageId = `page:${nanoid(10)}`
  store[pageId] = {
    id: pageId,
    typeName: 'page',
    name: 'Page 1',
    index: 'a1',
    meta: {},
  }
  return pageId
}

// ---------------------------------------------------------------------------
// Shape builders. Each returns { id, record } — the record is ready to drop
// into `parseSnapshot(...).store`.
// ---------------------------------------------------------------------------

interface CommonShapeOpts {
  x?: number
  y?: number
}

function shapeShell(
  id: string,
  pageId: string,
  store: StoreMap,
  type: string,
  x: number,
  y: number,
  props: Json,
): Json {
  return {
    id,
    typeName: 'shape',
    type,
    x,
    y,
    rotation: 0,
    index: nextIndex(store, pageId),
    parentId: pageId,
    isLocked: false,
    opacity: 1,
    props,
    meta: {},
  }
}

const TLDRAW_COLORS = [
  'black', 'grey', 'light-violet', 'violet', 'blue', 'light-blue',
  'yellow', 'orange', 'green', 'light-green', 'light-red', 'red',
  'white',
] as const
export type TldrawColor = (typeof TLDRAW_COLORS)[number]
function normalizeColor(c: string | undefined, fallback: TldrawColor): TldrawColor {
  if (!c) return fallback
  return (TLDRAW_COLORS as readonly string[]).includes(c) ? (c as TldrawColor) : fallback
}

export function buildTextShape(
  store: StoreMap,
  pageId: string,
  opts: CommonShapeOpts & { text: string; color?: string; w?: number },
): BuiltShape {
  const id = `shape:${nanoid(10)}`
  // tldraw's text shape carries `richText` (ProseMirror doc), an autoSize flag,
  // size/font/color tokens, and a width when autoSize is false. Defaults match
  // what `editor.createShape({ type: 'text' })` produces in the browser.
  const props: Json = {
    color: normalizeColor(opts.color, 'black'),
    size: 'm',
    w: opts.w ?? 220,
    font: 'draw',
    textAlign: 'start',
    autoSize: true,
    scale: 1,
    richText: richText(opts.text),
  }
  return {
    id,
    record: shapeShell(id, pageId, store, 'text', opts.x ?? 0, opts.y ?? 0, props),
  }
}

export function buildNoteShape(
  store: StoreMap,
  pageId: string,
  opts: CommonShapeOpts & { text: string; color?: string },
): BuiltShape {
  const id = `shape:${nanoid(10)}`
  // Sticky notes default to yellow and have a fixed 200x200 footprint in
  // tldraw v4 (size is implicit, not in props). The structure mirrors what
  // `editor.createShape({ type: 'note' })` produces.
  const props: Json = {
    color: normalizeColor(opts.color, 'yellow'),
    size: 'm',
    font: 'draw',
    fontSizeAdjustment: 0,
    align: 'middle',
    verticalAlign: 'middle',
    growY: 0,
    url: '',
    scale: 1,
    labelColor: 'black',
    richText: richText(opts.text),
  }
  return {
    id,
    record: shapeShell(id, pageId, store, 'note', opts.x ?? 0, opts.y ?? 0, props),
  }
}

// ----- AI custom shapes (server-side mirrors of the props defined in
// apps/web/src/board/shapes/Ai*ShapeUtil.tsx). Status is always 'done' for
// agent-injected shapes since generation completed before we wrote the record.

export function buildAiCardShape(
  store: StoreMap,
  pageId: string,
  opts: CommonShapeOpts & { prompt: string; text: string; title?: string | null },
): BuiltShape {
  const id = `shape:${nanoid(10)}`
  const props: Json = {
    w: 320,
    h: 200,
    prompt: opts.prompt,
    text: opts.text,
    status: 'done',
    sourceShapeIds: [],
    title: opts.title ?? null,
  }
  return {
    id,
    record: shapeShell(id, pageId, store, 'ai-card', opts.x ?? 0, opts.y ?? 0, props),
  }
}

export function buildAiImageShape(
  store: StoreMap,
  pageId: string,
  opts: CommonShapeOpts & {
    prompt: string
    imageId: string
    mediaType: string
    aspect: '1:1' | '16:9' | '9:16'
    title?: string | null
  },
): BuiltShape {
  const id = `shape:${nanoid(10)}`
  const dims = opts.aspect === '16:9'
    ? { w: 480, h: 270 }
    : opts.aspect === '9:16'
    ? { w: 270, h: 480 }
    : { w: 360, h: 360 }
  const props: Json = {
    w: dims.w,
    h: dims.h,
    prompt: opts.prompt,
    status: 'done',
    imageId: opts.imageId,
    mediaType: opts.mediaType,
    aspect: opts.aspect,
    errorMessage: null,
    title: opts.title ?? null,
  }
  return {
    id,
    record: shapeShell(id, pageId, store, 'ai-image', opts.x ?? 0, opts.y ?? 0, props),
  }
}

export function buildAiHtmlShape(
  store: StoreMap,
  pageId: string,
  opts: CommonShapeOpts & {
    title: string
    prompt: string | null
    htmlId: string
    source?: 'ai' | 'upload'
  },
): BuiltShape {
  const id = `shape:${nanoid(10)}`
  const props: Json = {
    w: 600,
    h: 400,
    title: opts.title,
    prompt: opts.prompt,
    source: opts.source ?? 'ai',
    status: 'done',
    htmlId: opts.htmlId,
    errorMessage: null,
  }
  return {
    id,
    record: shapeShell(id, pageId, store, 'ai-html', opts.x ?? 0, opts.y ?? 0, props),
  }
}

// ---------------------------------------------------------------------------
// Persistence — atomic read-modify-write inside a single transaction. Ownership
// is re-checked inside the txn so a board can't be hijacked by a concurrent
// owner change. Callers receive `null` if the board doesn't exist or isn't
// owned by `userId`.
// ---------------------------------------------------------------------------

export async function mergeAndPersist(
  boardId: string,
  userId: string,
  mutator: (parsed: ParsedSnapshot) => BuiltShape[] | Promise<BuiltShape[]>,
): Promise<{ shapeIds: string[] } | null> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ id: schema.boards.id, snapshot: schema.boards.snapshot })
      .from(schema.boards)
      .where(and(eq(schema.boards.id, boardId), eq(schema.boards.userId, userId)))
      .limit(1)
    if (!row) return null

    const parsed = parseSnapshot(row.snapshot)
    const built = await mutator(parsed)
    for (const b of built) {
      parsed.store[b.id] = b.record
    }
    await tx
      .update(schema.boards)
      .set({ snapshot: parsed.raw, updatedAt: new Date() })
      .where(eq(schema.boards.id, boardId))
    return { shapeIds: built.map((b) => b.id) }
  })
}

// Read-only walk of a snapshot's shape records, returned as an agent-friendly
// flat list. The text extractor mirrors the client-side `extractShapeText` in
// apps/web/src/board/ai/canvas.ts, minus the Editor dependency.
export interface AgentItem {
  id: string
  type: string
  text: string
  x: number
  y: number
  w?: number
  h?: number
}

function extractText(rec: Json): string {
  const type = rec.type as string
  const props = (rec.props as Json) ?? {}
  if (type === 'ai-card') {
    const parts: string[] = []
    if (typeof props.prompt === 'string' && props.prompt) parts.push(`Prompt: ${props.prompt}`)
    if (typeof props.text === 'string' && props.text) parts.push(props.text)
    return parts.join('\n\n')
  }
  if (type === 'ai-image') {
    const p = typeof props.prompt === 'string' ? props.prompt : ''
    return p ? `[AI image — prompt: "${p}"]` : '[AI image]'
  }
  if (type === 'ai-video') {
    const p = typeof props.prompt === 'string' ? props.prompt : ''
    return p ? `[AI video — prompt: "${p}"]` : '[AI video]'
  }
  if (type === 'ai-html') {
    const title = typeof props.title === 'string' ? props.title : 'Untitled'
    const p = typeof props.prompt === 'string' ? props.prompt : null
    return p ? `[AI HTML widget "${title}" — prompt: "${p}"]` : `[AI HTML widget "${title}"]`
  }
  if (typeof props.text === 'string') return props.text
  const rich = props.richText as Json | undefined
  if (rich) return plainTextFromRichText(rich)
  return ''
}

function plainTextFromRichText(doc: Json): string {
  const out: string[] = []
  const walk = (node: Json | unknown) => {
    if (!node || typeof node !== 'object') return
    const n = node as Json
    if (n.type === 'text' && typeof n.text === 'string') out.push(n.text)
    const children = n.content as unknown
    if (Array.isArray(children)) {
      for (const child of children) walk(child)
      if (n.type === 'paragraph') out.push('\n')
    }
  }
  walk(doc)
  return out.join('').replace(/\n+$/, '')
}

export function listItems(snapshot: Json | null | undefined): AgentItem[] {
  const { store } = parseSnapshot(snapshot)
  const out: AgentItem[] = []
  for (const rec of Object.values(store)) {
    if ((rec as Json).typeName !== 'shape') continue
    const r = rec as Json
    const props = (r.props as Json) ?? {}
    out.push({
      id: r.id as string,
      type: r.type as string,
      text: extractText(r),
      x: typeof r.x === 'number' ? r.x : 0,
      y: typeof r.y === 'number' ? r.y : 0,
      ...(typeof props.w === 'number' ? { w: props.w } : {}),
      ...(typeof props.h === 'number' ? { h: props.h } : {}),
    })
  }
  return out
}
