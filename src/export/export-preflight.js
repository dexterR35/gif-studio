/**
 * Export preflight — validate before allocating encode buffers.
 */

export const GIF_MAX_COLORS = 256
export const DEFAULT_MAX_EXPORT_FRAMES = 240
export const DEFAULT_MAX_DURATION_MS = 120_000
export const DEFAULT_EXPORT_MEMORY_BUDGET = 512 * 1024 * 1024

/**
 * @param {{
 *   width?: number,
 *   height?: number,
 *   frameCount?: number,
 *   durationMs?: number,
 *   fps?: number,
 *   delays?: number[],
 *   fonts?: Array<{ family: string, available?: boolean }>,
 *   format?: string,
 *   memoryBudgetBytes?: number,
 *   maxFrames?: number,
 *   maxDurationMs?: number,
 * }} input
 * @returns {{
 *   ok: boolean,
 *   errors: Array<{ code: string, message: string }>,
 *   warnings: Array<{ code: string, message: string }>,
 *   estimates: { frameCount: number, durationMs: number, memoryBytes: number },
 * }}
 */
export function runExportPreflight(input = {}) {
  const errors = []
  const warnings = []
  const width = Number(input.width) || 0
  const height = Number(input.height) || 0
  const fps = Number(input.fps) || 24
  let frameCount = Number(input.frameCount) || 0
  let durationMs = Number(input.durationMs) || 0

  if (Array.isArray(input.delays) && input.delays.length) {
    frameCount = input.delays.length
    durationMs = input.delays.reduce((sum, d) => sum + Math.max(0, Number(d) || 0), 0)
  } else if (!durationMs && frameCount && fps > 0) {
    durationMs = (frameCount / fps) * 1000
  } else if (!frameCount && durationMs && fps > 0) {
    frameCount = Math.max(1, Math.round((durationMs / 1000) * fps))
  }

  const maxFrames = input.maxFrames ?? DEFAULT_MAX_EXPORT_FRAMES
  const maxDuration = input.maxDurationMs ?? DEFAULT_MAX_DURATION_MS
  const budget = input.memoryBudgetBytes ?? DEFAULT_EXPORT_MEMORY_BUDGET

  if (width <= 0 || height <= 0) {
    errors.push({ code: 'INVALID_SIZE', message: 'Export width/height must be positive' })
  }
  if (frameCount <= 0) {
    errors.push({ code: 'NO_FRAMES', message: 'Export has no frames' })
  }
  if (frameCount > maxFrames) {
    errors.push({
      code: 'FRAME_LIMIT',
      message: `Frame count ${frameCount} exceeds limit ${maxFrames}`,
    })
  }
  if (durationMs > maxDuration) {
    errors.push({
      code: 'DURATION_LIMIT',
      message: `Duration ${durationMs}ms exceeds limit ${maxDuration}ms`,
    })
  }

  const memoryBytes = Math.ceil(width * height * 4 * Math.max(1, frameCount) * 1.25)
  if (memoryBytes > budget) {
    errors.push({
      code: 'MEMORY_BUDGET',
      message: `Estimated export memory ${memoryBytes} exceeds budget ${budget}`,
    })
  }

  const fonts = Array.isArray(input.fonts) ? input.fonts : []
  for (const font of fonts) {
    if (font && font.available === false) {
      errors.push({
        code: 'MISSING_FONT',
        message: `Font not available for export: ${font.family || 'unknown'}`,
      })
    }
  }

  const format = (input.format || 'gif').toLowerCase()
  if (format === 'gif') {
    warnings.push({
      code: 'GIF_PALETTE_LIMIT',
      message: `GIF honesty: output is limited to ≤${GIF_MAX_COLORS} colors (indexed palette); soft alpha becomes hard transparency.`,
    })
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    estimates: { frameCount, durationMs, memoryBytes },
  }
}
