/**
 * Lightweight local spans for debug (Phase 12).
 * Console and/or in-memory; no PII in span names or attributes.
 */

/** @type {Array<{ id: string, name: string, startMs: number, endMs: number | null, attrs: Record<string, string|number|boolean>, status: string }>} */
const spans = []
const MAX_SPANS = 100
let seq = 0

/** @type {boolean} */
let consoleEnabled =
  typeof import.meta !== 'undefined' &&
  import.meta.env &&
  (import.meta.env.VITE_STUDIO_TRACE === '1' || import.meta.env.VITE_STUDIO_TRACE === 'true')

/**
 * @param {boolean} on
 */
export function setTracingConsole(on) {
  consoleEnabled = Boolean(on)
}

/**
 * Strip anything that looks like PII from span attributes.
 * @param {Record<string, unknown>} [attrs]
 * @returns {Record<string, string|number|boolean>}
 */
function safeAttrs(attrs = {}) {
  /** @type {Record<string, string|number|boolean>} */
  const out = {}
  for (const [k, v] of Object.entries(attrs || {})) {
    const lower = k.toLowerCase()
    if (
      lower.includes('prompt') ||
      lower.includes('pixel') ||
      lower.includes('path') ||
      lower.includes('text') ||
      lower.includes('url') ||
      lower.includes('blob') ||
      lower.includes('user')
    ) {
      continue
    }
    const t = typeof v
    if (t === 'number' && Number.isFinite(v)) out[k] = v
    else if (t === 'boolean') out[k] = v
    else if (t === 'string' && v.length <= 64 && !v.startsWith('blob:') && !v.startsWith('data:')) {
      out[k] = v
    }
  }
  return out
}

/**
 * @param {string} name
 * @param {Record<string, unknown>} [attrs]
 * @returns {{ id: string, end: (status?: string, endAttrs?: Record<string, unknown>) => void }}
 */
export function startSpan(name, attrs = {}) {
  const id = `span-${++seq}`
  const startMs = typeof performance !== 'undefined' ? performance.now() : Date.now()
  const record = {
    id,
    name: String(name || 'unnamed'),
    startMs,
    endMs: null,
    attrs: safeAttrs(attrs),
    status: 'open',
  }
  spans.push(record)
  if (spans.length > MAX_SPANS) spans.shift()

  if (consoleEnabled && typeof console !== 'undefined' && console.debug) {
    console.debug(`[trace] start ${record.name}`, record.attrs)
  }

  return {
    id,
    end(status = 'ok', endAttrs = {}) {
      record.endMs = typeof performance !== 'undefined' ? performance.now() : Date.now()
      record.status = String(status || 'ok')
      Object.assign(record.attrs, safeAttrs(endAttrs))
      const durationMs = record.endMs - record.startMs
      if (consoleEnabled && typeof console !== 'undefined' && console.debug) {
        console.debug(`[trace] end ${record.name}`, durationMs.toFixed(1), 'ms', record.status, record.attrs)
      }
    },
  }
}

/** @returns {ReadonlyArray<object>} */
export function getOpenSpans() {
  return spans.filter((s) => s.endMs == null)
}

/** @returns {ReadonlyArray<object>} */
export function getSpanHistory() {
  return spans.slice()
}

export function clearSpans() {
  spans.length = 0
  seq = 0
}
