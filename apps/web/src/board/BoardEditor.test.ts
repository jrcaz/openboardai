import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('BoardEditor', () => {
  it('does not render provider-bound tldraw UI buttons outside the Tldraw tree', () => {
    const source = readFileSync(new URL('./BoardEditor.tsx', import.meta.url), 'utf8')

    expect(source).not.toContain('TldrawUiButton')
    expect(source).not.toContain('TldrawUiButtonIcon')
    expect(source).not.toContain('TldrawUiButtonLabel')
  })
})
