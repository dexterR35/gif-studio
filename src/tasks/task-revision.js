/**
 * Source revision helpers for stale-result guards.
 * Revisions are opaque comparable values (number, string, or { id, version }).
 */

/**
 * @param {unknown} a
 * @param {unknown} b
 * @returns {boolean}
 */
export function revisionsEqual(a, b) {
  if (a === b) return true
  if (a == null || b == null) return false
  if (typeof a === 'object' && typeof b === 'object') {
    const aid = a.id ?? a.assetId ?? a.revision
    const bid = b.id ?? b.assetId ?? b.revision
    const av = a.version ?? a.rev ?? a.n
    const bv = b.version ?? b.rev ?? b.n
    if (aid != null && bid != null && av != null && bv != null) {
      return String(aid) === String(bid) && String(av) === String(bv)
    }
    try {
      return JSON.stringify(a) === JSON.stringify(b)
    } catch {
      return false
    }
  }
  return String(a) === String(b)
}

/**
 * @param {unknown} expected
 * @param {unknown} current
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function assertRevisionMatch(expected, current) {
  if (revisionsEqual(expected, current)) return { ok: true }
  return {
    ok: false,
    reason: `sourceRevision mismatch: expected ${formatRevision(expected)}, got ${formatRevision(current)}`,
  }
}

/**
 * @param {unknown} rev
 * @returns {string}
 */
export function formatRevision(rev) {
  if (rev == null) return 'null'
  if (typeof rev === 'object') {
    try {
      return JSON.stringify(rev)
    } catch {
      return String(rev)
    }
  }
  return String(rev)
}
