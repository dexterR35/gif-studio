/**
 * Export service — prefer POST /api/export when apiAvailable;
 * fallback gifenc / ffmpeg labeled offline (never silent).
 */
import { runExportPreflight } from './export-preflight.js'
import { resolveRoute } from '../tasks/routing-policy.js'

/**
 * @param {{
 *   apiAvailable: boolean,
 *   preflightInput: Parameters<typeof runExportPreflight>[0],
 *   exportViaApi?: (ctx: object) => Promise<{ blob: Blob, encoder: string, offline?: boolean }>,
 *   exportViaGifenc?: (ctx: object) => Promise<{ blob: Blob, encoder: string, offline?: boolean }>,
 *   exportViaFfmpeg?: (ctx: object) => Promise<{ blob: Blob, encoder: string, offline?: boolean }>,
 *   userApprovedOffline?: boolean,
 *   preferFfmpegOffline?: boolean,
 *   signal?: AbortSignal,
 * }} options
 */
export async function exportGif(options) {
  const preflight = runExportPreflight(options.preflightInput || {})
  if (!preflight.ok) {
    const err = new Error(preflight.errors.map((e) => e.message).join('; '))
    err.code = 'PREFLIGHT_FAILED'
    err.preflight = preflight
    throw err
  }

  const route = resolveRoute({
    kind: 'export',
    qualityTier: 'best',
    apiAvailable: options.apiAvailable,
    engineAvailable: true,
    allowBrowserFallback: true,
    userApprovedFallback: Boolean(options.userApprovedOffline),
  })

  if (route.target === 'unavailable') {
    const err = new Error(route.reason)
    err.code = route.requiresApproval ? 'FALLBACK_REQUIRES_APPROVAL' : 'EXPORT_UNAVAILABLE'
    err.route = route
    err.preflight = preflight
    throw err
  }

  if (route.target === 'local-backend') {
    if (typeof options.exportViaApi !== 'function') {
      const err = new Error('Local backend export handler missing')
      err.code = 'EXPORT_HANDLER_MISSING'
      throw err
    }
    const result = await options.exportViaApi({
      signal: options.signal,
      preflight,
      route,
    })
    return {
      ...result,
      encoder: result.encoder || 'api-export',
      offline: false,
      degraded: false,
      route,
      preflight,
    }
  }

  // Offline / degraded path — explicitly labeled.
  const offlineHandler = options.preferFfmpegOffline
    ? options.exportViaFfmpeg
    : options.exportViaGifenc
  const alt = options.preferFfmpegOffline
    ? options.exportViaGifenc
    : options.exportViaFfmpeg
  const handler = typeof offlineHandler === 'function'
    ? offlineHandler
    : alt

  if (typeof handler !== 'function') {
    const err = new Error('No offline export encoder available')
    err.code = 'OFFLINE_ENCODER_MISSING'
    err.route = route
    throw err
  }

  const result = await handler({
    signal: options.signal,
    preflight,
    route,
  })
  const encoder = result.encoder
    || (options.preferFfmpegOffline ? 'ffmpeg-wasm-offline' : 'gifenc-offline')
  return {
    ...result,
    encoder,
    offline: true,
    degraded: true,
    route,
    preflight,
    label: `offline:${encoder}`,
  }
}

/**
 * Convenience: POST /api/export with FormData (caller supplies form builder).
 */
export async function postApiExport(formData, { signal, fetchImpl = fetch } = {}) {
  const res = await fetchImpl('/api/export', { method: 'POST', body: formData, signal })
  if (!res.ok) {
    const text = await res.text()
    const err = new Error(text || `Export failed (${res.status})`)
    err.status = res.status
    throw err
  }
  const blob = await res.blob()
  return {
    blob,
    encoder: res.headers.get('X-GIF-Encoder') || 'api-export',
    offline: false,
  }
}
