/**
 * Privacy-safe product analytics (Phase 12).
 * Emits event name + numeric/safe enums only. Never logs pixels, prompts,
 * full text layer content, user-path file paths, or blob URLs.
 */

/** Fields that must never appear in analytics payloads. */
export const ANALYTICS_DENYLIST = Object.freeze([
  'pixels',
  'pixelData',
  'imageData',
  'bitmap',
  'prompt',
  'text',
  'textContent',
  'layerText',
  'content',
  'filePath',
  'path',
  'filepath',
  'blobUrl',
  'blobURL',
  'objectUrl',
  'objectURL',
  'url',
  'dataUrl',
  'dataURL',
  'base64',
  'username',
  'home',
  'userHome',
])

const DENYLIST_SET = new Set(ANALYTICS_DENYLIST.map((k) => k.toLowerCase()))

/** Allowed product event names. */
export const PRODUCT_EVENTS = Object.freeze({
  IMPORT_COMMITTED: 'import_committed',
  CUTOUT_APPLIED: 'cutout_applied',
  EXPORT_SUCCEEDED: 'export_succeeded',
  TIMELINE_EDIT_COMMITTED: 'timeline_edit_committed',
})

/** @type {Array<{ name: string, props: Record<string, string|number|boolean>, ts: number }>} */
const buffer = []
const MAX_BUFFER = 200

/** @type {((evt: { name: string, props: Record<string, string|number|boolean>, ts: number }) => void) | null} */
let sink = null

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function looksLikeBlobOrDataUrl(value) {
  if (typeof value !== 'string') return false
  const v = value.trim().toLowerCase()
  return v.startsWith('blob:') || v.startsWith('data:') || v.includes('/users/') || v.includes('/home/')
}

/**
 * Strip denylisted keys and unsafe values. Only keep string/number/boolean enums.
 * @param {Record<string, unknown>} [props]
 * @returns {Record<string, string|number|boolean>}
 */
export function sanitizeAnalyticsProps(props = {}) {
  /** @type {Record<string, string|number|boolean>} */
  const out = {}
  if (!props || typeof props !== 'object') return out

  for (const [key, value] of Object.entries(props)) {
    const lower = key.toLowerCase()
    if (DENYLIST_SET.has(lower)) continue
    if (lower.includes('prompt') || lower.includes('pixel') || lower.includes('blob')) continue
    if (value == null) continue
    const t = typeof value
    if (t === 'number' && Number.isFinite(value)) {
      out[key] = value
      continue
    }
    if (t === 'boolean') {
      out[key] = value
      continue
    }
    if (t === 'string') {
      if (looksLikeBlobOrDataUrl(value)) continue
      // Safe enums / short tokens only (no free-form prose)
      if (value.length > 64) continue
      if (/[\r\n]/.test(value)) continue
      out[key] = value
    }
    // Drop objects, arrays, functions
  }
  return out
}

/**
 * @param {(evt: { name: string, props: Record<string, string|number|boolean>, ts: number }) => void} [fn]
 */
export function setAnalyticsSink(fn) {
  sink = typeof fn === 'function' ? fn : null
}

export function clearAnalyticsBuffer() {
  buffer.length = 0
}

/** @returns {ReadonlyArray<{ name: string, props: Record<string, string|number|boolean>, ts: number }>} */
export function getAnalyticsBuffer() {
  return buffer.slice()
}

/**
 * @param {string} name
 * @param {Record<string, unknown>} [props]
 */
export function trackProductEvent(name, props = {}) {
  if (!name || typeof name !== 'string') return
  const evt = {
    name,
    props: sanitizeAnalyticsProps(props),
    ts: Date.now(),
  }
  buffer.push(evt)
  if (buffer.length > MAX_BUFFER) buffer.shift()
  if (sink) {
    try {
      sink(evt)
    } catch {
      /* ignore sink errors */
    }
  }
}

export function trackImportCommitted(props = {}) {
  trackProductEvent(PRODUCT_EVENTS.IMPORT_COMMITTED, props)
}

export function trackCutoutApplied(props = {}) {
  trackProductEvent(PRODUCT_EVENTS.CUTOUT_APPLIED, props)
}

export function trackExportSucceeded(props = {}) {
  trackProductEvent(PRODUCT_EVENTS.EXPORT_SUCCEEDED, props)
}

export function trackTimelineEditCommitted(props = {}) {
  trackProductEvent(PRODUCT_EVENTS.TIMELINE_EDIT_COMMITTED, props)
}
