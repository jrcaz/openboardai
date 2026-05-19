import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import type { AiContextShape } from '@openboard-ai/shared'

export function getOpenRouter(apiKey: string) {
  return createOpenRouter({
    apiKey,
    appName: process.env.OPENROUTER_APP_NAME ?? 'openboard-ai',
    appUrl: process.env.OPENROUTER_APP_URL ?? 'http://localhost:5173',
  })
}

// Hardcoded fallbacks when the client doesn't specify a model. All three are
// overridable per-request via the optional `model` field on Generate*Request.
export const DEFAULTS = {
  text: 'anthropic/claude-haiku-4.5',
  image: 'google/gemini-2.5-flash-image',
  video: 'google/veo-3.1-fast',
} as const

export const MODEL_ID = DEFAULTS.text

const BASE_PROMPT = `You are an AI thinking partner embedded inside an infinite-canvas whiteboard ("OpenBoard AI").
Your responses appear as cards on the canvas, so:
- Be concise. Aim for under 120 words unless the user explicitly asks for depth.
- Use markdown lists when enumerating ideas; bold key terms.
- Avoid hedging preambles. Get to the point in the first sentence.
- When the user provides selected shapes as context, those shapes ARE present on the canvas — never claim no selection exists. Treat them as the subject of the question and refer to their content directly.
- Shape types you may see: "ai-card" (a previous AI exchange — has both the prior prompt and prior response), "ai-image" (an AI-generated image with its prompt as caption), "ai-video" (an AI-generated video with its prompt as caption), "image" (a user-uploaded image), "geo"/"text"/"note" (user-authored shapes).
- When a selected shape is an "image" or "ai-image", its visual content is attached to your message as an inline image — describe what you actually see in it, do not say you can't view images.`

export function buildSystemPrompt(opts: {
  mode: 'prompt' | 'selection-qa' | 'expand'
  context?: { shapes: AiContextShape[] }
}): string {
  const lines = [BASE_PROMPT]

  if (opts.mode === 'expand') {
    lines.push(
      '',
      'MODE: expand. Generate exactly 4 short, distinct, complementary follow-up ideas based on the source.',
      'Format your reply as a markdown numbered list (1. 2. 3. 4.) with one short phrase per item — no extra commentary.',
    )
  } else if (opts.mode === 'selection-qa') {
    lines.push('', 'MODE: selection Q&A. The user has selected one or more shapes; answer in reference to them.')
  }

  const shapes = opts.context?.shapes ?? []
  if (shapes.length > 0) {
    lines.push('', `--- ${shapes.length} selected shape${shapes.length === 1 ? '' : 's'} on the canvas ---`)
    for (const s of shapes) {
      const text = s.text.trim().slice(0, 2000)
      lines.push('', `[${s.type}] id=${s.id}`, text || '(no text content)')
    }
    lines.push('', '--- end of selection ---')
  }

  return lines.join('\n')
}
