import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TLAsset } from 'tldraw'
import {
  createBoardAssetStore,
  createReadonlyBoardAssetStore,
  fileToBase64,
  parseOpenBoardAssetSrc,
  resolveOpenBoardAssetSrc,
  toOpenBoardAssetSrc,
} from './boardAssetStore'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('boardAssetStore', () => {
  it('encodes and resolves durable OpenBoard asset references', () => {
    const src = toOpenBoardAssetSrc('image', 'img:abc 123')

    expect(parseOpenBoardAssetSrc(src)).toEqual({ kind: 'image', id: 'img:abc 123' })
    expect(resolveOpenBoardAssetSrc(src)).toBe('/api/images/img%3Aabc%20123')
    expect(resolveOpenBoardAssetSrc(src, '/api/public')).toBe(
      '/api/public/images/img%3Aabc%20123',
    )
    expect(resolveOpenBoardAssetSrc('data:image/png;base64,abc')).toBe(
      'data:image/png;base64,abc',
    )
  })

  it('converts files to base64 upload payloads', async () => {
    const file = new File(['hello'], 'hello.txt', { type: 'text/plain' })

    await expect(fileToBase64(file)).resolves.toBe('aGVsbG8=')
  })

  it('uploads image assets through the board-scoped image API', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)

    const asset = {
      type: 'image',
      props: {
        h: 20,
        mimeType: 'image/png',
        name: 'sample.png',
        src: null,
        w: 30,
      },
    } as TLAsset
    const file = new File(['abc'], 'sample.png', { type: 'image/png' })

    const result = await createBoardAssetStore('board-1').upload(asset, file)

    expect(parseOpenBoardAssetSrc(result.src)).toMatchObject({ kind: 'image' })
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/images/upload',
      expect.objectContaining({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
      }),
    )

    const [, init] = fetchMock.mock.calls[0]!
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body).toMatchObject({
      boardId: 'board-1',
      bytesBase64: 'YWJj',
      mediaType: 'image/png',
      model: 'upload',
      prompt: 'sample.png',
      resultShapeId: null,
      width: 30,
      height: 20,
    })
    expect(body.id).toHaveLength(12)
  })

  it('resolves stored asset references in read-only viewers', () => {
    const src = toOpenBoardAssetSrc('image', 'img-1')
    const asset = { type: 'image', props: { src } } as TLAsset

    expect(createReadonlyBoardAssetStore('/api/public').resolve?.(asset, {} as never)).toBe(
      '/api/public/images/img-1',
    )
  })
})
