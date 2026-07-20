/**
 * Technical metrics — counters and timers (Phase 12).
 * Optional request-id correlation when provided by API / TaskManager.
 */

/** @type {Map<string, number>} */
const counters = new Map()

/** @type {Map<string, number[]>} */
const timers = new Map()

/** @type {string | null} */
let currentRequestId = null

const MAX_TIMER_SAMPLES = 120

/**
 * @param {string | null | undefined} requestId
 */
export function setTelemetryRequestId(requestId) {
  currentRequestId = requestId == null || requestId === '' ? null : String(requestId)
}

export function getTelemetryRequestId() {
  return currentRequestId
}

/**
 * @param {string} name
 * @param {number} [delta]
 * @param {{ requestId?: string }} [opts]
 */
export function incrementCounter(name, delta = 1, opts = {}) {
  if (!name) return
  const key = name
  counters.set(key, (counters.get(key) || 0) + delta)
  const rid = opts.requestId ?? currentRequestId
  if (rid && typeof console !== 'undefined' && console.debug) {
    console.debug(`[telemetry] counter:${name}`, delta, { requestId: rid })
  }
}

/**
 * @param {string} name
 * @param {number} durationMs
 * @param {{ requestId?: string }} [opts]
 */
export function recordTimer(name, durationMs, opts = {}) {
  if (!name || !Number.isFinite(durationMs)) return
  let arr = timers.get(name)
  if (!arr) {
    arr = []
    timers.set(name, arr)
  }
  arr.push(durationMs)
  if (arr.length > MAX_TIMER_SAMPLES) arr.shift()
  const rid = opts.requestId ?? currentRequestId
  if (rid && typeof console !== 'undefined' && console.debug) {
    console.debug(`[telemetry] timer:${name}`, durationMs.toFixed(1), 'ms', { requestId: rid })
  }
}

/**
 * @param {string} name
 * @param {() => (void | Promise<void>)} fn
 * @param {{ requestId?: string }} [opts]
 */
export async function timeAsync(name, fn, opts = {}) {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now()
  try {
    return await fn()
  } finally {
    const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now()
    recordTimer(name, t1 - t0, opts)
  }
}

/**
 * @returns {{
 *   requestId: string | null,
 *   counters: Record<string, number>,
 *   timers: Record<string, { count: number, avgMs: number, lastMs: number }>,
 * }}
 */
export function getTelemetrySnapshot() {
  /** @type {Record<string, number>} */
  const c = {}
  for (const [k, v] of counters) c[k] = v

  /** @type {Record<string, { count: number, avgMs: number, lastMs: number }>} */
  const t = {}
  for (const [k, samples] of timers) {
    const count = samples.length
    const sum = samples.reduce((a, b) => a + b, 0)
    t[k] = {
      count,
      avgMs: count ? sum / count : 0,
      lastMs: count ? samples[count - 1] : 0,
    }
  }

  return { requestId: currentRequestId, counters: c, timers: t }
}

export function resetTelemetry() {
  counters.clear()
  timers.clear()
  currentRequestId = null
}
