/**
 * Helpers for in-app local model download / install.
 */

/** Families that matter for “SAM missing” UX (ignore gated SAM3 / FILM slots). */
const CORE_FAMILIES = [
  'sam2',
  'grounding_dino',
  'yolo',
  'depth',
  'upscale',
  'interpolate',
]

/**
 * @param {Record<string, unknown>|null|undefined} models
 * @returns {{ missing: number, total: number, labels: string[] }}
 */
export function summarizeMissingModels(models) {
  if (!models || typeof models !== 'object') {
    return { missing: 0, total: 0, labels: [] }
  }
  const labels = []
  let missing = 0
  let total = 0
  const seen = new Set()

  for (const family of CORE_FAMILIES) {
    const list = models[family]
    if (!Array.isArray(list)) continue
    for (const entry of list) {
      if (!entry || typeof entry !== 'object') continue
      // Skip always-ready fallbacks like bicubic / opencv-telea.
      if (entry.id === 'bicubic' || entry.id === 'opencv-telea') continue
      total += 1
      if (entry.ready === false) {
        missing += 1
        const label = String(entry.label || entry.id || family)
        if (!seen.has(label)) {
          seen.add(label)
          labels.push(label)
        }
      }
    }
  }

  return { missing, total, labels }
}

/**
 * @param {Record<string, unknown>|null|undefined} capabilities
 */
export function coreModelsMissing(capabilities) {
  if (!capabilities?.api) return false
  if (capabilities.sam2 === false) return true
  const summary = summarizeMissingModels(capabilities.models)
  return summary.missing > 0
}

/**
 * Poll install status until terminal, then resolve.
 * @param {{
 *   intervalMs?: number,
 *   onProgress?: (status: Record<string, unknown>) => void,
 *   signal?: AbortSignal,
 *   getStatus?: () => Promise<{ data: Record<string, unknown> }>,
 * }} [options]
 */
export async function pollModelsInstall(options = {}) {
  const intervalMs = options.intervalMs ?? 1200
  const getStatus = options.getStatus
  if (!getStatus) throw new Error('getStatus required')

  while (true) {
    if (options.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError')
    }
    const { data } = await getStatus()
    options.onProgress?.(data)
    if (data.status === 'succeeded' || data.status === 'failed' || data.status === 'idle') {
      return data
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
}
