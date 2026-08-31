/**
 * AI routing — local-backend-first for Best quality.
 * Browser ONNX is degraded/offline only. NEVER silently swap engines.
 */

/**
 * @typedef {'local-backend'|'browser-onnx'|'unavailable'} RouteTarget
 */

/**
 * @param {{
 *   qualityTier?: 'fast'|'balanced'|'best',
 *   kind: string,
 *   apiAvailable?: boolean,
 *   engineAvailable?: boolean,
 *   preferOffline?: boolean,
 *   allowBrowserFallback?: boolean,
 *   userApprovedFallback?: boolean,
 * }} input
 * @returns {{
 *   target: RouteTarget,
 *   engineLabel: string,
 *   degraded: boolean,
 *   requiresApproval: boolean,
 *   reason: string,
 * }}
 */
export function resolveRoute(input) {
  const kind = input.kind || 'unknown'
  const tier = input.qualityTier || 'balanced'
  const api = Boolean(input.apiAvailable)
  const engineOk = input.engineAvailable !== false
  const isBest = tier === 'best'

  if (isBest) {
    if (api && engineOk) {
      return {
        target: 'local-backend',
        engineLabel: 'local-python-api',
        degraded: false,
        requiresApproval: false,
        reason: 'Best quality routes to local Python backend',
      }
    }
    if (input.preferOffline || input.allowBrowserFallback) {
      if (!input.userApprovedFallback) {
        return {
          target: 'unavailable',
          engineLabel: 'none',
          degraded: true,
          requiresApproval: true,
          reason: 'Local backend unavailable; browser/offline fallback needs explicit approval (no silent swap)',
        }
      }
      return {
        target: 'browser-onnx',
        engineLabel: 'browser-onnx',
        degraded: true,
        requiresApproval: false,
        reason: 'User-approved degraded offline/browser path',
      }
    }
    return {
      target: 'unavailable',
      engineLabel: 'none',
      degraded: true,
      requiresApproval: false,
      reason: 'Local backend required for Best quality; unavailable',
    }
  }

  // Fast / balanced may use browser when API is down, but still never silently.
  if (api && engineOk) {
    return {
      target: 'local-backend',
      engineLabel: 'local-python-api',
      degraded: false,
      requiresApproval: false,
      reason: 'Local backend preferred when available',
    }
  }

  if (input.allowBrowserFallback) {
    if (!input.userApprovedFallback && api === false) {
      return {
        target: 'unavailable',
        engineLabel: 'none',
        degraded: true,
        requiresApproval: true,
        reason: 'Switching to browser ONNX requires approval when local backend is down',
      }
    }
    return {
      target: 'browser-onnx',
      engineLabel: 'browser-onnx',
      degraded: true,
      requiresApproval: false,
      reason: 'Degraded browser ONNX path',
    }
  }

  return {
    target: 'unavailable',
    engineLabel: 'none',
    degraded: true,
    requiresApproval: false,
    reason: 'No approved route',
  }
}

/**
 * Assert a planned route was not silently replaced.
 * @param {ReturnType<typeof resolveRoute>} planned
 * @param {RouteTarget} actual
 */
export function assertNoSilentSwap(planned, actual) {
  if (planned.target === actual) {
    return { ok: true }
  }
  return {
    ok: false,
    reason: `Engine swap blocked: planned ${planned.target}, got ${actual}. Never silent swap.`,
  }
}
