/**
 * Conservative memory admission checks before decode / AI / export.
 */

export const DEFAULT_MEMORY_BUDGET = Object.freeze({
  maxHeapBytes: 512 * 1024 * 1024,
  maxDecodedFrameCacheBytes: 128 * 1024 * 1024,
  safetyMarginBytes: 32 * 1024 * 1024,
})

/**
 * Estimate peak bytes for an operation.
 * @param {{
 *   sourceCompressedBytes?: number,
 *   frameDecodeWorkingSet?: number,
 *   decodedFrameCacheBudget?: number,
 *   activeSourceFrames?: number,
 *   layerMaskAndDepthBuffers?: number,
 *   effectIntermediateBuffers?: number,
 *   previewBackBuffers?: number,
 *   exportBackBuffers?: number,
 *   encoderWorkingSet?: number,
 *   modelWorkingSet?: number,
 *   temporaryTransferCopies?: number,
 *   safetyMargin?: number,
 * }} parts
 * @returns {number}
 */
export function estimatePeakBytes(parts = {}) {
  const keys = [
    'sourceCompressedBytes',
    'frameDecodeWorkingSet',
    'decodedFrameCacheBudget',
    'activeSourceFrames',
    'layerMaskAndDepthBuffers',
    'effectIntermediateBuffers',
    'previewBackBuffers',
    'exportBackBuffers',
    'encoderWorkingSet',
    'modelWorkingSet',
    'temporaryTransferCopies',
    'safetyMargin',
  ]
  let sum = 0
  for (const k of keys) {
    const v = Number(parts[k]) || 0
    sum += Math.max(0, v)
  }
  return Math.ceil(sum)
}

/**
 * @param {number} estimatedPeakBytes
 * @param {{ maxHeapBytes?: number, currentlyUsedBytes?: number, safetyMarginBytes?: number }} [budget]
 * @returns {{ admitted: boolean, estimatedPeakBytes: number, remainingBytes: number, reason?: string }}
 */
export function checkMemoryAdmission(estimatedPeakBytes, budget = {}) {
  const maxHeap = budget.maxHeapBytes ?? DEFAULT_MEMORY_BUDGET.maxHeapBytes
  const used = budget.currentlyUsedBytes ?? 0
  const safety = budget.safetyMarginBytes ?? DEFAULT_MEMORY_BUDGET.safetyMarginBytes
  const peak = Math.max(0, Number(estimatedPeakBytes) || 0)
  const remaining = maxHeap - used - safety
  if (peak > remaining) {
    return {
      admitted: false,
      estimatedPeakBytes: peak,
      remainingBytes: Math.max(0, remaining),
      reason: 'EXPORT_MEMORY_BUDGET_EXCEEDED',
    }
  }
  return {
    admitted: true,
    estimatedPeakBytes: peak,
    remainingBytes: remaining,
  }
}

/**
 * Rough RGBA buffer estimate (not a full peak model).
 * @param {number} width
 * @param {number} height
 * @param {number} [frames]
 */
export function estimateRgbaBytes(width, height, frames = 1) {
  const w = Math.max(0, Number(width) || 0)
  const h = Math.max(0, Number(height) || 0)
  const f = Math.max(1, Number(frames) || 1)
  return w * h * 4 * f
}
