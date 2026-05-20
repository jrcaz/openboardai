import type { Modality, SubAgent } from '@openboard-ai/shared'

interface Match {
  agent: SubAgent
  /** Prompt text with the `/slug` prefix stripped. */
  strippedValue: string
}

/**
 * Detect a leading `/<slug>` token in the prompt. The token must be followed
 * by whitespace (or end-of-string). Returns the matched agent for the given
 * modality and the prompt with the token removed; returns null if nothing
 * matches.
 */
export function parseAgentSlash(
  value: string,
  agents: SubAgent[],
  modality: Modality,
): Match | null {
  const m = value.match(/^\/([a-z0-9-]{1,32})(\s+|$)/i)
  if (!m) return null
  const slug = m[1]!.toLowerCase()
  const agent = agents.find((a) => a.modality === modality && a.slug === slug)
  if (!agent) return null
  return { agent, strippedValue: value.slice(m[0].length) }
}
