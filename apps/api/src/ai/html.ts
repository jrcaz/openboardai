import { generateText } from 'ai'
import { and, eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import sanitizeHtml from 'sanitize-html'
import { db, schema } from '../db/client.js'

// Cap AI-generated HTML at ~200 KB serialized — protects DB and the iframe
// renderer from runaway outputs.
const MAX_AI_HTML_BYTES = 200_000
const MAX_UPLOAD_HTML_BYTES = 2_000_000

const HTML_SYSTEM_PROMPT = `You generate a SINGLE self-contained HTML document for embedding inside an iframe with sandbox="allow-scripts".

STRICT RULES:
- Return ONLY the HTML source, starting with <!DOCTYPE html> and ending with </html>. NO markdown code fences. NO commentary. NO explanation.
- Everything must be inlined: <style> and <script> blocks only. NO external <link>, <script src>, <img src> pointing to remote hosts (data: URLs are fine).
- The iframe sandbox blocks: parent.* access, localStorage, cookies, top-navigation, form submission. Do NOT rely on any of those.
- Target a 600x400 viewport unless the user specifies otherwise. Use width: 100%; height: 100%; on body and set margin: 0.
- Prefer terse, readable layout. Use system-font stack. Avoid heavy libraries; if you need a chart, write a small inline SVG or canvas script.
- No network requests, no fetch(), no XHR.`

const HTML_EDIT_SYSTEM_PROMPT = `${HTML_SYSTEM_PROMPT}
- You are editing an existing HTML document. Preserve the parts that are not relevant to the requested change.
- Return the full updated HTML document, not a patch or explanation.`

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  // Whitelist a generous set of tags so charts/tables/svg/canvas work.
  allowedTags: false, // disables tag filtering — we rely on the iframe sandbox for safety
  allowedAttributes: false, // disables attr filtering — same reason
  allowVulnerableTags: true,
  // But explicitly strip the few constructs that bypass sandbox / mislead users.
  disallowedTagsMode: 'discard',
  exclusiveFilter: (frame) => {
    if (frame.tag === 'iframe') return true
    if (frame.tag === 'object') return true
    if (frame.tag === 'embed') return true
    if (frame.tag === 'meta') {
      const equiv = (frame.attribs?.['http-equiv'] ?? '').toLowerCase()
      if (equiv === 'refresh') return true
    }
    return false
  },
  // Allow inline scripts/styles — the iframe sandbox isolates them.
  allowedSchemes: ['http', 'https', 'data', 'blob', 'mailto'],
  allowedSchemesByTag: {
    a: ['http', 'https', 'mailto'],
    img: ['http', 'https', 'data', 'blob'],
  },
  allowedSchemesAppliedToAttributes: ['href', 'src', 'action'],
  allowProtocolRelative: false,
  parser: { lowerCaseTags: false },
}

/**
 * Strip ```html ... ``` fences the model sometimes wraps output in, even when
 * told not to.
 */
function stripCodeFences(s: string): string {
  const trimmed = s.trim()
  const fence = trimmed.match(/^```(?:html|HTML)?\s*\n?([\s\S]*?)\n?```\s*$/)
  return fence ? fence[1]!.trim() : trimmed
}

export function sanitizeHtmlDoc(raw: string): string {
  const stripped = stripCodeFences(raw)
  return sanitizeHtml(stripped, SANITIZE_OPTIONS)
}

interface GenerateAndPersistArgs {
  openrouter: ReturnType<
    typeof import('@openrouter/ai-sdk-provider').createOpenRouter
  >
  boardId: string
  prompt: string
  title?: string
  model: string
  resultShapeId?: string | null
}

export async function generateAndPersistHtml({
  openrouter,
  boardId,
  prompt,
  title,
  model,
  resultShapeId,
}: GenerateAndPersistArgs): Promise<{
  htmlId: string
  title: string
  byteSize: number
}> {
  const { text } = await generateText({
    model: openrouter.chat(model),
    system: HTML_SYSTEM_PROMPT,
    prompt,
  })

  const sanitized = sanitizeHtmlDoc(text)
  if (!/<html[\s>]/i.test(sanitized)) {
    throw new Error(
      'Model did not return a complete HTML document. Try a more specific prompt.',
    )
  }

  const bytes = Buffer.from(sanitized, 'utf-8')
  if (bytes.byteLength > MAX_AI_HTML_BYTES) {
    throw new Error(
      `Generated HTML is too large (${bytes.byteLength} bytes, max ${MAX_AI_HTML_BYTES}).`,
    )
  }

  const id = nanoid(12)
  const resolvedTitle = (title ?? prompt).trim().slice(0, 120) || 'Untitled'

  await db.insert(schema.aiHtmls).values({
    id,
    boardId,
    title: resolvedTitle,
    prompt,
    source: 'ai',
    model,
    byteSize: bytes.byteLength,
    bytes,
    resultShapeId: resultShapeId ?? null,
  })

  return { htmlId: id, title: resolvedTitle, byteSize: bytes.byteLength }
}

export async function editAndPersistHtml({
  openrouter,
  boardId,
  htmlId,
  prompt,
  title,
  model,
  resultShapeId,
}: GenerateAndPersistArgs & { htmlId: string }): Promise<{
  htmlId: string
  title: string
  byteSize: number
}> {
  const [existing] = await db
    .select({
      title: schema.aiHtmls.title,
      bytes: schema.aiHtmls.bytes,
    })
    .from(schema.aiHtmls)
    .where(and(eq(schema.aiHtmls.id, htmlId), eq(schema.aiHtmls.boardId, boardId)))
    .limit(1)

  if (!existing) {
    throw new Error('HTML widget not found.')
  }

  const currentHtml = (existing.bytes as Buffer).toString('utf-8')
  const { text } = await generateText({
    model: openrouter.chat(model),
    system: HTML_EDIT_SYSTEM_PROMPT,
    prompt:
      `Edit the existing HTML document according to this request:\n${prompt}\n\n` +
      `Existing HTML document:\n${currentHtml}`,
  })

  const sanitized = sanitizeHtmlDoc(text)
  if (!/<html[\s>]/i.test(sanitized)) {
    throw new Error(
      'Model did not return a complete HTML document. Try a more specific prompt.',
    )
  }

  const bytes = Buffer.from(sanitized, 'utf-8')
  if (bytes.byteLength > MAX_AI_HTML_BYTES) {
    throw new Error(
      `Edited HTML is too large (${bytes.byteLength} bytes, max ${MAX_AI_HTML_BYTES}).`,
    )
  }

  const resolvedTitle = (title ?? existing.title ?? prompt).trim().slice(0, 120) || 'Untitled'

  await db
    .update(schema.aiHtmls)
    .set({
      title: resolvedTitle,
      prompt,
      source: 'ai',
      model,
      byteSize: bytes.byteLength,
      bytes,
      resultShapeId: resultShapeId ?? null,
    })
    .where(and(eq(schema.aiHtmls.id, htmlId), eq(schema.aiHtmls.boardId, boardId)))

  return { htmlId, title: resolvedTitle, byteSize: bytes.byteLength }
}

export async function persistUploadedHtml({
  boardId,
  title,
  html,
}: {
  boardId: string
  title: string
  html: string
}): Promise<{ htmlId: string; title: string; byteSize: number }> {
  const sanitized = sanitizeHtmlDoc(html)
  const bytes = Buffer.from(sanitized, 'utf-8')
  if (bytes.byteLength > MAX_UPLOAD_HTML_BYTES) {
    throw new Error(
      `HTML upload is too large (${bytes.byteLength} bytes, max ${MAX_UPLOAD_HTML_BYTES}).`,
    )
  }

  const id = nanoid(12)
  const resolvedTitle = title.trim().slice(0, 200) || 'Untitled'

  await db.insert(schema.aiHtmls).values({
    id,
    boardId,
    title: resolvedTitle,
    prompt: null,
    source: 'upload',
    model: null,
    byteSize: bytes.byteLength,
    bytes,
    resultShapeId: null,
  })

  return { htmlId: id, title: resolvedTitle, byteSize: bytes.byteLength }
}
