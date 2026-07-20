import { describe, it, expect } from 'vitest'
import {
  hashSeed,
  createSeededRng,
  seededUnit,
} from '../../src/domain/timeline/seeded-random.js'

describe('seeded-random', () => {
  it('same seed → same sequence', () => {
    const seed = hashSeed('project-a', 'clip-1', 42)
    const a = createSeededRng(seed)
    const b = createSeededRng(seed)
    const seqA = [a(), a(), a(), a(), a()]
    const seqB = [b(), b(), b(), b(), b()]
    expect(seqA).toEqual(seqB)
  })

  it('different frameIndex changes unit', () => {
    const u0 = seededUnit('p', 'c', 0)
    const u1 = seededUnit('p', 'c', 1)
    expect(u0).not.toBe(u1)
    expect(u0).toBeGreaterThanOrEqual(0)
    expect(u0).toBeLessThan(1)
  })

  it('hash(projectSeed, clipId, frameIndex) is stable', () => {
    expect(hashSeed('s', 'c', 3)).toBe(hashSeed('s', 'c', 3))
    expect(hashSeed('s', 'c', 3)).not.toBe(hashSeed('s', 'c', 4))
  })
})
