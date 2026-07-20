/**
 * Polite / assertive live-region announcers for DOM (Phase 13).
 */

export const LIVE_REGION_POLITE_ID = 'gif-studio-live-polite'
export const LIVE_REGION_ASSERTIVE_ID = 'gif-studio-live-assertive'

/**
 * Ensure polite + assertive live regions exist under `root` (or document.body).
 * @param {ParentNode | null} [root]
 * @returns {{ polite: HTMLElement, assertive: HTMLElement } | null}
 */
export function ensureLiveRegions(root) {
  if (typeof document === 'undefined') return null
  const parent = root || document.body
  if (!parent) return null

  let polite = document.getElementById(LIVE_REGION_POLITE_ID)
  if (!polite) {
    polite = document.createElement('div')
    polite.id = LIVE_REGION_POLITE_ID
    polite.setAttribute('role', 'status')
    polite.setAttribute('aria-live', 'polite')
    polite.setAttribute('aria-atomic', 'true')
    polite.className = 'sr-only'
    parent.appendChild(polite)
  }

  let assertive = document.getElementById(LIVE_REGION_ASSERTIVE_ID)
  if (!assertive) {
    assertive = document.createElement('div')
    assertive.id = LIVE_REGION_ASSERTIVE_ID
    assertive.setAttribute('role', 'alert')
    assertive.setAttribute('aria-live', 'assertive')
    assertive.setAttribute('aria-atomic', 'true')
    assertive.className = 'sr-only'
    parent.appendChild(assertive)
  }

  return { polite, assertive }
}

/**
 * @param {string} message
 * @param {'polite' | 'assertive'} [priority]
 */
export function announce(message, priority = 'polite') {
  if (typeof document === 'undefined') return
  const regions = ensureLiveRegions()
  if (!regions) return
  const el = priority === 'assertive' ? regions.assertive : regions.polite
  const text = String(message || '').trim()
  // Clear then set so identical consecutive messages are announced
  el.textContent = ''
  if (!text) return
  // Microtask / rAF-friendly: browsers often ignore same-tick updates
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => {
      el.textContent = text
    })
  } else {
    el.textContent = text
  }
}

export function announcePolite(message) {
  announce(message, 'polite')
}

export function announceAssertive(message) {
  announce(message, 'assertive')
}
