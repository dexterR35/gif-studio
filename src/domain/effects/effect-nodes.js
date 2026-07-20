/**
 * Unify legacy imageEdits / gifEffects into ordered EffectNode lists.
 */

let _seq = 0
function nextEffectId(prefix = 'fx') {
  _seq += 1
  return `${prefix}-${_seq}`
}

/**
 * @param {string} type
 * @param {Record<string, unknown>} params
 * @param {{ id?: string, enabled?: boolean, version?: number }} [opts]
 */
export function createEffectNode(type, params = {}, opts = {}) {
  return {
    id: opts.id || nextEffectId(type),
    type,
    enabled: opts.enabled !== false,
    version: opts.version ?? 1,
    params: { ...params },
  }
}

/**
 * Convert V1 imageEdits bag → effect nodes (order preserved).
 * @param {Record<string, unknown>|null|undefined} imageEdits
 * @returns {object[]}
 */
export function imageEditsToEffectNodes(imageEdits) {
  if (!imageEdits || typeof imageEdits !== 'object') return []
  const nodes = []
  const ie = imageEdits

  if (ie.rotation) {
    nodes.push(createEffectNode('rotate', { degrees: Number(ie.rotation) || 0 }))
  }
  if (ie.flipX || ie.flipY) {
    nodes.push(createEffectNode('flip', { x: Boolean(ie.flipX), y: Boolean(ie.flipY) }))
  }
  if (ie.brightness != null && Number(ie.brightness) !== 100) {
    nodes.push(createEffectNode('brightness', { amount: Number(ie.brightness) }))
  }
  if (ie.contrast != null && Number(ie.contrast) !== 100) {
    nodes.push(createEffectNode('contrast', { amount: Number(ie.contrast) }))
  }
  if (ie.saturation != null && Number(ie.saturation) !== 100) {
    nodes.push(createEffectNode('saturation', { amount: Number(ie.saturation) }))
  }
  if (ie.blur) {
    nodes.push(createEffectNode('blur', { radius: Number(ie.blur) || 0 }))
  }
  if (ie.hue) {
    nodes.push(createEffectNode('hue', { degrees: Number(ie.hue) || 0 }))
  }
  if (ie.grayscale) {
    nodes.push(createEffectNode('grayscale', { amount: Number(ie.grayscale) || 0 }))
  }
  if (ie.sepia) {
    nodes.push(createEffectNode('sepia', { amount: Number(ie.sepia) || 0 }))
  }
  return nodes
}

/**
 * Convert V1 gifEffects bag → effect nodes.
 * @param {Record<string, unknown>|null|undefined} gifEffects
 * @returns {object[]}
 */
export function gifEffectsToEffectNodes(gifEffects) {
  if (!gifEffects || typeof gifEffects !== 'object') return []
  const ge = gifEffects
  const nodes = []

  if (ge.hue) nodes.push(createEffectNode('hue', { degrees: Number(ge.hue) || 0 }))
  if (ge.saturation != null && Number(ge.saturation) !== 100) {
    nodes.push(createEffectNode('saturation', { amount: Number(ge.saturation) }))
  }
  if (ge.brightness) {
    nodes.push(createEffectNode('brightness', { amount: Number(ge.brightness) }))
  }
  if (ge.contrast) {
    nodes.push(createEffectNode('contrast', { amount: Number(ge.contrast) }))
  }
  if (ge.blur) nodes.push(createEffectNode('blur', { radius: Number(ge.blur) || 0 }))
  if (ge.sharpen) nodes.push(createEffectNode('sharpen', { amount: Number(ge.sharpen) || 0 }))
  if (ge.invert) nodes.push(createEffectNode('invert', { amount: Number(ge.invert) || 0 }))
  if (ge.tint) {
    nodes.push(createEffectNode('tint', {
      color: ge.tintColor || '#ff6b6b',
      amount: Number(ge.tint) || 0,
    }))
  }
  if (ge.posterize) {
    nodes.push(createEffectNode('posterize', { levels: Number(ge.posterize) || 0 }))
  }
  if (ge.distortion && ge.distortion !== 'None') {
    nodes.push(createEffectNode('distortion', {
      kind: ge.distortion,
      amount: Number(ge.distortionAmount) || 0,
      x: Number(ge.distortX) || 50,
      y: Number(ge.distortY) || 50,
      radius: Number(ge.distortRadius) || 50,
      angle: Number(ge.distortAngle) || 0,
    }))
  }
  return nodes
}

/**
 * Merge imageEdits + gifEffects into one ordered node list (image edits first).
 * @param {Record<string, unknown>|null|undefined} imageEdits
 * @param {Record<string, unknown>|null|undefined} gifEffects
 */
export function unifyEffectNodes(imageEdits, gifEffects) {
  return [
    ...imageEditsToEffectNodes(imageEdits),
    ...gifEffectsToEffectNodes(gifEffects),
  ]
}

/**
 * @param {object[]} nodes
 * @returns {object[]}
 */
export function enabledEffectNodes(nodes) {
  return (Array.isArray(nodes) ? nodes : []).filter((n) => n && n.enabled !== false)
}
