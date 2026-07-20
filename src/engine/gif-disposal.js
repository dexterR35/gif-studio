/**
 * GIF disposal method helpers (Netscape / GIF89a).
 *
 * Disposal codes:
 *   0 — unspecified / no action (treat like leave in place for compositing)
 *   1 — do not dispose (leave frame in place)
 *   2 — restore to background (clear frame rect)
 *   3 — restore to previous (restore buffer captured before this frame drew)
 *
 * Note: disposal 3 requires a saved previous full-canvas buffer. When that
 * buffer is unavailable, callers should fall back to leave-in-place (1)
 * and document the limitation rather than inventing pixels.
 */

export const DISPOSAL_NONE = 0
export const DISPOSAL_LEAVE = 1
export const DISPOSAL_BACKGROUND = 2
export const DISPOSAL_PREVIOUS = 3

/**
 * @param {number|undefined|null} code
 * @returns {0|1|2|3}
 */
export function normalizeDisposal(code) {
  const n = Number(code)
  if (n === 1 || n === 2 || n === 3) return n
  return 0
}

/**
 * Whether this disposal clears the frame rectangle to transparent/background.
 * @param {number} code
 */
export function clearsFrameRect(code) {
  return normalizeDisposal(code) === DISPOSAL_BACKGROUND
}

/**
 * Whether this disposal needs a restore-previous snapshot.
 * Documented: 3 is restore-previous when buffer available.
 * @param {number} code
 */
export function needsPreviousBuffer(code) {
  return normalizeDisposal(code) === DISPOSAL_PREVIOUS
}

/**
 * Apply disposal after a frame has been composited onto `ctx`.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {{
 *   disposalType: number,
 *   left: number,
 *   top: number,
 *   width: number,
 *   height: number,
 *   previousImageData?: ImageData|null,
 * }} opts
 * @returns {{ restoredPrevious: boolean, clearedRect: boolean }}
 */
export function applyDisposal(ctx, opts) {
  const disposal = normalizeDisposal(opts.disposalType)
  if (disposal === DISPOSAL_BACKGROUND) {
    ctx.clearRect(opts.left, opts.top, opts.width, opts.height)
    return { restoredPrevious: false, clearedRect: true }
  }
  if (disposal === DISPOSAL_PREVIOUS) {
    if (opts.previousImageData) {
      ctx.putImageData(opts.previousImageData, 0, 0)
      return { restoredPrevious: true, clearedRect: false }
    }
    // Buffer unavailable — leave canvas as-is (documented fallback).
    return { restoredPrevious: false, clearedRect: false }
  }
  // 0 and 1: leave in place
  return { restoredPrevious: false, clearedRect: false }
}

/**
 * Capture full canvas state for disposal=3 restore-previous.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} width
 * @param {number} height
 * @returns {ImageData}
 */
export function capturePreviousBuffer(ctx, width, height) {
  return ctx.getImageData(0, 0, width, height)
}
