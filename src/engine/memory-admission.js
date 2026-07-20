/**
 * Memory admission control — estimate and reject before full GIF decode.
 */

/** Default soft budget for decoded RGBA frames (bytes). */
export const DEFAULT_DECODE_BUDGET_BYTES = 256 * 1024 * 1024

/** Hard ceiling on frame count before decode. */
export const DEFAULT_MAX_FRAMES = 240

/** Hard ceiling on a single dimension. */
export const DEFAULT_MAX_DIMENSION = 5000

/**
 * Estimate peak bytes to hold `frameCount` full RGBA canvases.
 * @param {{ width: number, height: number, frameCount: number, bytesPerPixel?: number }} dims
 */
export function estimateDecodeBytes({ width, height, frameCount, bytesPerPixel = 4 }) {
  const w = Math.max(0, Number(width) || 0)
  const h = Math.max(0, Number(height) || 0)
  const n = Math.max(0, Number(frameCount) || 0)
  const frameBytes = w * h * bytesPerPixel
  // Peak ≈ all frames + one composite working buffer + safety margin
  return Math.ceil(frameBytes * n + frameBytes * 2 + frameBytes * 0.1)
}

/**
 * Decide whether a decode may proceed.
 *
 * @param {{
 *   width: number,
 *   height: number,
 *   frameCount: number,
 *   sourceBytes?: number,
 *   budgetBytes?: number,
 *   maxFrames?: number,
 *   maxDimension?: number,
 * }} input
 * @returns {{
 *   admitted: boolean,
 *   estimatedBytes: number,
 *   reason?: string,
 *   code?: string,
 * }}
 */
export function admitDecode(input) {
  const width = Number(input.width) || 0
  const height = Number(input.height) || 0
  const frameCount = Number(input.frameCount) || 0
  const budget = input.budgetBytes ?? DEFAULT_DECODE_BUDGET_BYTES
  const maxFrames = input.maxFrames ?? DEFAULT_MAX_FRAMES
  const maxDimension = input.maxDimension ?? DEFAULT_MAX_DIMENSION

  if (width <= 0 || height <= 0) {
    return {
      admitted: false,
      estimatedBytes: 0,
      code: 'INVALID_DIMENSIONS',
      reason: 'GIF has invalid dimensions',
    }
  }
  if (width > maxDimension || height > maxDimension) {
    return {
      admitted: false,
      estimatedBytes: estimateDecodeBytes({ width, height, frameCount }),
      code: 'DIMENSION_LIMIT',
      reason: `Dimension ${width}×${height} exceeds limit ${maxDimension}`,
    }
  }
  if (frameCount > maxFrames) {
    return {
      admitted: false,
      estimatedBytes: estimateDecodeBytes({ width, height, frameCount }),
      code: 'FRAME_LIMIT',
      reason: `Frame count ${frameCount} exceeds limit ${maxFrames}`,
    }
  }

  const estimatedBytes = estimateDecodeBytes({ width, height, frameCount })

  // Decompression-bomb heuristic before generic budget (tiny file → huge pixels).
  if (input.sourceBytes != null && input.sourceBytes > 0) {
    const ratio = estimatedBytes / input.sourceBytes
    if (ratio > 200 && estimatedBytes > 32 * 1024 * 1024) {
      return {
        admitted: false,
        estimatedBytes,
        code: 'DECOMPRESSION_BOMB',
        reason: `Suspicious expansion ratio ${ratio.toFixed(1)}×`,
      }
    }
  }

  if (estimatedBytes > budget) {
    return {
      admitted: false,
      estimatedBytes,
      code: 'MEMORY_BUDGET',
      reason: `Estimated decode ${estimatedBytes} bytes exceeds budget ${budget}`,
    }
  }

  return { admitted: true, estimatedBytes }
}
