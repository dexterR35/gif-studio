/** @typedef {'UNSUPPORTED_FORMAT'|'INVALID_MEDIA'|'DECODE_LIMIT_EXCEEDED'|'PROJECT_VALIDATION_FAILED'|'PROJECT_MIGRATION_FAILED'|'ASSET_MISSING'|'FONT_MISSING'|'MODEL_UNAVAILABLE'|'MODEL_OUT_OF_MEMORY'|'TASK_CANCELLED'|'STALE_RESULT_DISCARDED'|'EXPORT_MEMORY_BUDGET_EXCEEDED'|'ENCODER_UNAVAILABLE'|'EXPORT_RENDER_FAILED'|'EXPORT_ENCODE_FAILED'|'UNAUTHORIZED'|'RATE_LIMITED'|'INTERNAL_ERROR'} StudioErrorCode */

export const STUDIO_ERROR_CODES = Object.freeze([
  'UNSUPPORTED_FORMAT',
  'INVALID_MEDIA',
  'DECODE_LIMIT_EXCEEDED',
  'PROJECT_VALIDATION_FAILED',
  'PROJECT_MIGRATION_FAILED',
  'ASSET_MISSING',
  'FONT_MISSING',
  'MODEL_UNAVAILABLE',
  'MODEL_OUT_OF_MEMORY',
  'TASK_CANCELLED',
  'STALE_RESULT_DISCARDED',
  'EXPORT_MEMORY_BUDGET_EXCEEDED',
  'ENCODER_UNAVAILABLE',
  'EXPORT_RENDER_FAILED',
  'EXPORT_ENCODE_FAILED',
  'UNAUTHORIZED',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
])

export class StudioError extends Error {
  /**
   * @param {StudioErrorCode} code
   * @param {string} message safe, actionable user message
   * @param {{ cause?: unknown, details?: Record<string, unknown> }} [opts]
   */
  constructor(code, message, opts = {}) {
    super(message, opts.cause !== undefined ? { cause: opts.cause } : undefined)
    this.name = 'StudioError'
    this.code = code
    this.details = opts.details ?? null
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
    }
  }
}

/**
 * @param {StudioErrorCode} code
 * @param {string} message
 * @param {{ cause?: unknown, details?: Record<string, unknown> }} [opts]
 */
export function studioError(code, message, opts) {
  return new StudioError(code, message, opts)
}
