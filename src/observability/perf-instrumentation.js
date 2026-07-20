/**
 * Dev-only performance instrumentation (Phase 0).
 * Enable with VITE_STUDIO_PERF=1
 */

const enabled =
  typeof import.meta !== 'undefined' &&
  import.meta.env &&
  (import.meta.env.VITE_STUDIO_PERF === '1' || import.meta.env.VITE_STUDIO_PERF === 'true')

/** @type {{ previewMs: number[], decodeMs: number[], exportMs: number[], objectUrls: number, workers: number, cacheBytes: number, droppedFrames: number }} */
const state = {
  previewMs: [],
  decodeMs: [],
  exportMs: [],
  objectUrls: 0,
  workers: 0,
  cacheBytes: 0,
  droppedFrames: 0,
}

const MAX_SAMPLES = 240

function push(arr, value) {
  arr.push(value)
  if (arr.length > MAX_SAMPLES) arr.shift()
}

export function isPerfEnabled() {
  return Boolean(enabled)
}

export function recordPreviewFrame(durationMs) {
  if (!enabled) return
  push(state.previewMs, durationMs)
  if (durationMs > 33.5) state.droppedFrames += 1
}

export function recordDecode(durationMs) {
  if (!enabled) return
  push(state.decodeMs, durationMs)
}

export function recordExportPhase(name, durationMs) {
  if (!enabled) return
  push(state.exportMs, durationMs)
  if (typeof console !== 'undefined' && console.debug) {
    console.debug(`[studio-perf] export:${name}`, durationMs.toFixed(1), 'ms')
  }
}

export function trackObjectUrl(delta = 1) {
  if (!enabled) return
  state.objectUrls = Math.max(0, state.objectUrls + delta)
}

export function setCacheBytes(bytes) {
  if (!enabled) return
  state.cacheBytes = bytes
}

export function setActiveWorkers(count) {
  if (!enabled) return
  state.workers = count
}

export function getPerfSnapshot() {
  const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0)
  return {
    enabled: Boolean(enabled),
    previewAvgMs: avg(state.previewMs),
    decodeAvgMs: avg(state.decodeMs),
    exportAvgMs: avg(state.exportMs),
    droppedFrames: state.droppedFrames,
    objectUrls: state.objectUrls,
    workers: state.workers,
    cacheBytes: state.cacheBytes,
    samples: {
      preview: state.previewMs.length,
      decode: state.decodeMs.length,
      export: state.exportMs.length,
    },
  }
}

export function resetPerf() {
  state.previewMs.length = 0
  state.decodeMs.length = 0
  state.exportMs.length = 0
  state.objectUrls = 0
  state.workers = 0
  state.cacheBytes = 0
  state.droppedFrames = 0
}
