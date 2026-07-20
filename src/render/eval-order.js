/**
 * Documented scene evaluation order.
 * Secure redaction is always last among compositing passes.
 */

export const EVAL_ORDER_STEPS = Object.freeze([
  'map-loop',
  'resolve-source-frame',
  'static-layer-properties',
  'absolute-tracks',
  'multiply-tracks',
  'additive-tracks-procedural',
  'parallax',
  'pose-mesh-warp',
  'per-layer-effects',
  'composite-by-layer-order',
  'global-adjustment-effects',
  'secure-redaction-last',
  'export-color-palette',
])

/** Index of the secure redaction pass — must be after composite. */
export const REDACTION_STEP_INDEX = EVAL_ORDER_STEPS.indexOf('secure-redaction-last')

/**
 * @param {string} step
 * @returns {number}
 */
export function evalStepIndex(step) {
  return EVAL_ORDER_STEPS.indexOf(step)
}

/**
 * Assert redaction runs after a given step.
 * @param {string} step
 */
export function isBeforeRedaction(step) {
  const i = evalStepIndex(step)
  return i >= 0 && i < REDACTION_STEP_INDEX
}

/**
 * Pass kinds used in a RenderPlan, in evaluation order.
 */
export const RENDER_PASS_KINDS = Object.freeze([
  'background',
  'layer',
  'adjustment',
  'pixelate',
  'redaction',
  'export-convert',
])
