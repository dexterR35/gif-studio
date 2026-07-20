/**
 * Deterministic hash RNG for procedural motion.
 * No ambient Math.random — seed = hash(projectSeed, clipId, frameIndex).
 */

/**
 * FNV-1a 32-bit hash of a string.
 * @param {string} str
 * @returns {number} unsigned 32-bit
 */
export function hashString(str) {
  let h = 0x811c9dc5
  const s = String(str)
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/**
 * Combine projectSeed, clipId, frameIndex into a stable uint32 seed.
 * @param {string} projectSeed
 * @param {string} clipId
 * @param {number} frameIndex
 * @returns {number}
 */
export function hashSeed(projectSeed, clipId, frameIndex) {
  const fi = Number.isFinite(Number(frameIndex)) ? Math.trunc(Number(frameIndex)) : 0
  return hashString(`${projectSeed}\0${clipId}\0${fi}`)
}

/**
 * Mulberry32 PRNG from a uint32 seed. Returns [0, 1).
 * @param {number} seed
 * @returns {() => number}
 */
export function createSeededRng(seed) {
  let state = (seed >>> 0) || 1
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * One-shot float in [0, 1) for (projectSeed, clipId, frameIndex).
 * @param {string} projectSeed
 * @param {string} clipId
 * @param {number} frameIndex
 * @returns {number}
 */
export function seededUnit(projectSeed, clipId, frameIndex) {
  return createSeededRng(hashSeed(projectSeed, clipId, frameIndex))()
}

/**
 * Deterministic float in [min, max).
 * @param {string} projectSeed
 * @param {string} clipId
 * @param {number} frameIndex
 * @param {number} min
 * @param {number} max
 */
export function seededRange(projectSeed, clipId, frameIndex, min, max) {
  const u = seededUnit(projectSeed, clipId, frameIndex)
  return min + u * (max - min)
}
