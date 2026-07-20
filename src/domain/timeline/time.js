/** Canonical project time helpers — integer microseconds. */

/**
 * @param {number} ms
 * @returns {number} integer microseconds
 */
export function msToUs(ms) {
  const n = Number(ms)
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 1000)
}

/**
 * @param {number} us
 * @returns {number} milliseconds (may be fractional)
 */
export function usToMs(us) {
  const n = Number(us)
  if (!Number.isFinite(n)) return 0
  return n / 1000
}

/**
 * Clamp timeUs into [0, durationUs].
 * @param {number} timeUs
 * @param {number} durationUs
 * @returns {number}
 */
export function clampTime(timeUs, durationUs) {
  const t = Number.isFinite(Number(timeUs)) ? Math.trunc(Number(timeUs)) : 0
  const d = Number.isFinite(Number(durationUs)) ? Math.max(0, Math.trunc(Number(durationUs))) : 0
  if (t < 0) return 0
  if (t > d) return d
  return t
}

/**
 * Map absolute time into looped / ping-pong media time.
 * @param {number} timeUs
 * @param {number} durationUs
 * @param {'once'|'loop'|'ping-pong'} loopMode
 * @returns {number}
 */
export function mapLoopTime(timeUs, durationUs, loopMode = 'once') {
  const d = Math.max(0, Math.trunc(Number(durationUs) || 0))
  if (d <= 0) return 0
  let t = Math.trunc(Number(timeUs) || 0)
  if (loopMode === 'once') return clampTime(t, d)
  if (loopMode === 'loop') {
    t = ((t % d) + d) % d
    return t
  }
  // ping-pong: 0..d..0
  const cycle = d * 2
  let m = ((t % cycle) + cycle) % cycle
  if (m > d) m = cycle - m
  return m
}
