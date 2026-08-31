import { describe, expect, it } from 'vitest'
import { alphaMaskRgba, visibleMaskRgba } from '../../src/lib/mask-pixels.js'

describe('editable mask pixel conversion', () => {
  it('stores bitmap transparency in mask alpha', () => {
    const result = alphaMaskRgba(new Uint8ClampedArray([
      12, 24, 48, 0,
      8, 16, 32, 128,
    ]))
    expect([...result]).toEqual([
      255, 255, 255, 0,
      255, 255, 255, 128,
    ])
  })

  it('moves opaque grayscale coverage into alpha', () => {
    const result = visibleMaskRgba(new Uint8ClampedArray([
      0, 0, 0, 255,
      255, 255, 255, 255,
    ]))
    expect([...result]).toEqual([
      255, 255, 255, 0,
      255, 255, 255, 255,
    ])
  })

  it('retains genuinely alpha-only masks', () => {
    const result = visibleMaskRgba(new Uint8ClampedArray([
      0, 0, 0, 0,
      0, 0, 0, 192,
    ]))
    expect(result[3]).toBe(0)
    expect(result[7]).toBe(192)
  })
})
