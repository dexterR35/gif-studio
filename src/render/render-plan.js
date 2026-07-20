import { RENDER_PASS_KINDS } from './eval-order.js'

/**
 * @typedef {object} RenderPass
 * @property {string} kind
 * @property {string} [layerId]
 * @property {object} [payload]
 */

/**
 * @typedef {object} RenderPlan
 * @property {number} timeUs
 * @property {string} projectSeed
 * @property {number} frameIndex
 * @property {{ width: number, height: number, background: object, colorSpace: string }} canvas
 * @property {RenderPass[]} passes
 * @property {string[]} evalOrder
 */

/**
 * @param {Partial<RenderPlan>} partial
 * @returns {RenderPlan}
 */
export function createRenderPlan(partial = {}) {
  return {
    timeUs: partial.timeUs ?? 0,
    projectSeed: partial.projectSeed ?? '0',
    frameIndex: partial.frameIndex ?? 0,
    canvas: partial.canvas ?? {
      width: 1,
      height: 1,
      background: { kind: 'transparent' },
      colorSpace: 'srgb',
    },
    passes: Array.isArray(partial.passes) ? partial.passes : [],
    evalOrder: Array.isArray(partial.evalOrder) ? partial.evalOrder : [...RENDER_PASS_KINDS],
  }
}

/**
 * @param {RenderPlan} plan
 * @param {RenderPass} pass
 */
export function appendPass(plan, pass) {
  return {
    ...plan,
    passes: [...plan.passes, pass],
  }
}

/**
 * Index of the first redaction pass, or -1.
 * @param {RenderPlan} plan
 */
export function firstRedactionPassIndex(plan) {
  return (plan.passes || []).findIndex((p) => p.kind === 'redaction')
}

/**
 * True when every redaction pass is after all non-redaction scene passes
 * (background/layer/adjustment/pixelate), ignoring trailing export-convert.
 * @param {RenderPlan} plan
 */
export function assertRedactionLast(plan) {
  const passes = plan.passes || []
  let seenRedaction = false
  for (const p of passes) {
    if (p.kind === 'redaction') {
      seenRedaction = true
      continue
    }
    if (p.kind === 'export-convert') continue
    if (seenRedaction) return false
  }
  return true
}
