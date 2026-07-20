/**
 * Stable fingerprint / revision string for stale-result guards.
 */

/**
 * Stable JSON stringify with sorted object keys.
 * @param {unknown} value
 * @returns {string}
 */
export function stableStringify(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(',')}]`
  }
  const keys = Object.keys(value).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`
}

/**
 * FNV-1a 64-bit-ish hex fingerprint (two 32-bit halves).
 * @param {string} str
 * @returns {string}
 */
export function fingerprintString(str) {
  let h1 = 0x811c9dc5
  let h2 = 0x811c9dc5 ^ 0x9e3779b9
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i)
    h1 ^= c
    h1 = Math.imul(h1, 0x01000193)
    h2 ^= c
    h2 = Math.imul(h2, 0x01000193)
  }
  return `${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`
}

/**
 * Project revision hash — excludes volatile metadata timestamps if desired.
 * @param {object} project
 * @param {{ includeTimestamps?: boolean }} [opts]
 * @returns {string}
 */
export function projectRevision(project, opts = {}) {
  if (!project || typeof project !== 'object') return 'empty'
  const clone = structuredClone
    ? structuredClone(project)
    : JSON.parse(JSON.stringify(project))
  if (!opts.includeTimestamps && clone.metadata) {
    delete clone.metadata.updatedAt
    delete clone.metadata.createdAt
  }
  return fingerprintString(stableStringify(clone))
}
