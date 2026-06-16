import { describe, expect, it } from 'vitest'
import { publicBoardAssetBase } from './assetBase'

describe('publicBoardAssetBase', () => {
  it('scopes public asset URLs to the share token', () => {
    expect(`${publicBoardAssetBase('share-token')}/htmls/html-id`).toBe(
      '/api/public/boards/share-token/htmls/html-id',
    )
  })

  it('encodes token path segments', () => {
    expect(publicBoardAssetBase('token/with spaces')).toBe(
      '/api/public/boards/token%2Fwith%20spaces',
    )
  })
})
