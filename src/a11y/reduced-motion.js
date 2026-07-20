/**
 * prefers-reduced-motion helpers (Phase 13).
 */

/**
 * @returns {boolean}
 */
export function prefersReducedMotion() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false
  }
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

/**
 * Subscribe to changes. Returns unsubscribe.
 * @param {(reduced: boolean) => void} listener
 * @returns {() => void}
 */
export function onReducedMotionChange(listener) {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => {}
  }
  const mql = window.matchMedia('(prefers-reduced-motion: reduce)')
  const handler = () => listener(mql.matches)
  if (typeof mql.addEventListener === 'function') {
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }
  // Safari legacy
  mql.addListener(handler)
  return () => mql.removeListener(handler)
}
