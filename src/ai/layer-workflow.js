/**
 * Run background removal and upscale as one per-layer workflow.
 *
 * The callbacks intentionally own all editor state and bitmap conversion. This
 * helper only guarantees ordering and passes the exact removal result to the
 * upscale step, so consumers never have to rely on an asynchronous React state
 * update between the two operations.
 *
 * @template TRemoved
 * @template TEnhanced
 * @param {{
 *   scale?: number,
 *   signal?: AbortSignal,
 *   removeBackground: (options: { signal?: AbortSignal }) => Promise<TRemoved>,
 *   upscale: (options: { source: TRemoved, scale: number, signal?: AbortSignal }) => Promise<TEnhanced>,
 * }} options
 * @returns {Promise<{ removed: TRemoved, enhanced: TEnhanced }>}
 */
export async function runBackgroundRemovalUpscaleWorkflow({
  scale = 2,
  signal,
  removeBackground,
  upscale,
} = {}) {
  if (typeof removeBackground !== 'function') {
    throw new TypeError('removeBackground must be a function')
  }
  if (typeof upscale !== 'function') {
    throw new TypeError('upscale must be a function')
  }

  const normalizedScale = Number(scale)
  if (!Number.isInteger(normalizedScale) || ![2, 4].includes(normalizedScale)) {
    throw new Error('Upscale scale must be 2 or 4.')
  }

  const removed = await removeBackground({ signal })
  const enhanced = await upscale({
    source: removed,
    scale: normalizedScale,
    signal,
  })

  return { removed, enhanced }
}
