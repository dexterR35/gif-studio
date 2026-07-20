import { describe, expect, it, vi } from 'vitest'
import {
  createGifFrameCache,
  estimateFrameBytes,
} from '../../src/engine/gif-frame-cache.js'
import {
  normalizeDisposal,
  clearsFrameRect,
  needsPreviousBuffer,
  applyDisposal,
  DISPOSAL_BACKGROUND,
  DISPOSAL_PREVIOUS,
} from '../../src/engine/gif-disposal.js'
import { admitDecode, estimateDecodeBytes } from '../../src/engine/memory-admission.js'

describe('gif-frame-cache', () => {
  it('estimates RGBA bytes', () => {
    expect(estimateFrameBytes({ width: 10, height: 20 })).toBe(800)
    expect(estimateFrameBytes({ estimatedBytes: 42 })).toBe(42)
  })

  it('evicts LRU by byte budget and disposes values', () => {
    const disposed = []
    const cache = createGifFrameCache({ maxBytes: 1000, maxEntries: 10 })
    cache.set(0, {
      width: 10,
      height: 10,
      dispose: () => disposed.push(0),
    })
    cache.set(1, {
      width: 10,
      height: 10,
      dispose: () => disposed.push(1),
    })
    // Each ~400 bytes; adding a third ~400 pushes over 1000 → evict key 0
    cache.set(2, {
      width: 10,
      height: 10,
      dispose: () => disposed.push(2),
    })
    expect(cache.has(0)).toBe(false)
    expect(cache.has(1)).toBe(true)
    expect(cache.has(2)).toBe(true)
    expect(disposed).toContain(0)

    cache.get(1) // touch 1 → 2 becomes oldest
    cache.set(3, { width: 10, height: 10, dispose: () => disposed.push(3) })
    expect(cache.has(2)).toBe(false)
    expect(cache.has(1)).toBe(true)

    cache.dispose()
    expect(cache.size).toBe(0)
    expect(cache.totalBytes).toBe(0)
  })
})

describe('gif-disposal', () => {
  it('normalizes and classifies disposal codes', () => {
    expect(normalizeDisposal(undefined)).toBe(0)
    expect(normalizeDisposal(2)).toBe(DISPOSAL_BACKGROUND)
    expect(clearsFrameRect(2)).toBe(true)
    expect(needsPreviousBuffer(3)).toBe(true)
    expect(needsPreviousBuffer(1)).toBe(false)
  })

  it('applies disposal 2 clear and disposal 3 restore when buffer available', () => {
    const clearRect = vi.fn()
    const putImageData = vi.fn()
    const ctx = { clearRect, putImageData }

    applyDisposal(ctx, {
      disposalType: 2,
      left: 1,
      top: 2,
      width: 3,
      height: 4,
    })
    expect(clearRect).toHaveBeenCalledWith(1, 2, 3, 4)

    const prev = { data: new Uint8ClampedArray(4) }
    const r = applyDisposal(ctx, {
      disposalType: DISPOSAL_PREVIOUS,
      left: 0,
      top: 0,
      width: 1,
      height: 1,
      previousImageData: prev,
    })
    expect(r.restoredPrevious).toBe(true)
    expect(putImageData).toHaveBeenCalledWith(prev, 0, 0)

    const r2 = applyDisposal(ctx, {
      disposalType: 3,
      left: 0,
      top: 0,
      width: 1,
      height: 1,
      previousImageData: null,
    })
    expect(r2.restoredPrevious).toBe(false)
  })
})

describe('memory-admission', () => {
  it('admits small decodes and rejects bombs / oversize', () => {
    const ok = admitDecode({ width: 100, height: 100, frameCount: 10 })
    expect(ok.admitted).toBe(true)
    expect(ok.estimatedBytes).toBe(estimateDecodeBytes({ width: 100, height: 100, frameCount: 10 }))

    const frames = admitDecode({ width: 100, height: 100, frameCount: 500, maxFrames: 240 })
    expect(frames.admitted).toBe(false)
    expect(frames.code).toBe('FRAME_LIMIT')

    const bomb = admitDecode({
      width: 4000,
      height: 4000,
      frameCount: 50,
      sourceBytes: 100,
      budgetBytes: 512 * 1024 * 1024,
    })
    expect(bomb.admitted).toBe(false)
    expect(bomb.code).toBe('DECOMPRESSION_BOMB')
  })
})
