import React from 'react'
import { renderToString } from 'react-dom/server'
import type { Editor } from 'tldraw'
import { describe, expect, it, vi } from 'vitest'
import { SlideshowControls } from './SlideshowControls'

describe('SlideshowControls', () => {
  it('renders outside tldraw UI providers during presentation mode', () => {
    const html = renderToString(
      <SlideshowControls
        editor={{} as Editor}
        isPresenting={true}
        currentFrameId={null}
        onStep={vi.fn()}
      />,
    )

    expect(html).toContain('No frames')
    expect(html).toContain('Previous slide')
    expect(html).toContain('Next slide')
  })
})
