import { clampTime, mapLoopTime } from './time.js'
import { applyProceduralModifiers } from './procedural-motion.js'

/**
 * Linear interpolate between keyframes at timeUs.
 * @param {Array<{ timeUs: number, value: number }>} keyframes
 * @param {number} timeUs
 * @returns {number|undefined}
 */
export function sampleKeyframes(keyframes, timeUs) {
  if (!Array.isArray(keyframes) || keyframes.length === 0) return undefined
  const sorted = [...keyframes].sort((a, b) => a.timeUs - b.timeUs)
  const t = timeUs
  if (t <= sorted[0].timeUs) return Number(sorted[0].value)
  const last = sorted[sorted.length - 1]
  if (t >= last.timeUs) return Number(last.value)
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]
    const b = sorted[i + 1]
    if (t >= a.timeUs && t <= b.timeUs) {
      const span = b.timeUs - a.timeUs || 1
      const u = (t - a.timeUs) / span
      return Number(a.value) + (Number(b.value) - Number(a.value)) * u
    }
  }
  return Number(last.value)
}

/**
 * Apply track precedence for one property:
 * static → absolute → multiply → additive/procedural.
 *
 * @param {number} staticValue
 * @param {Array<object>} tracks tracks targeting this property
 * @param {number} timeUs mapped timeline time
 * @param {{ projectSeed: string, clipId: string, frameIndex: number }} seedCtx
 * @returns {number}
 */
export function applyTrackPrecedence(staticValue, tracks, timeUs, seedCtx) {
  let value = Number(staticValue)
  if (!Number.isFinite(value)) value = 0

  const list = Array.isArray(tracks) ? tracks : []
  const absolute = list.filter((tr) => tr.mode === 'absolute')
  const multiply = list.filter((tr) => tr.mode === 'multiply')
  const additive = list.filter((tr) => tr.mode === 'additive')

  if (absolute.length > 0) {
    const sampled = sampleKeyframes(absolute[0].keyframes, timeUs)
    if (sampled !== undefined) value = sampled
  }

  for (const tr of multiply) {
    const sampled = sampleKeyframes(tr.keyframes, timeUs)
    if (sampled !== undefined) value *= sampled
  }

  for (const tr of additive) {
    const sampled = sampleKeyframes(tr.keyframes, timeUs)
    if (sampled !== undefined) value += sampled
    if (tr.modifiers?.length) {
      const modOut = applyProceduralModifiers(
        { x: 0, y: 0, scaleX: 1, scaleY: 1, rotationDeg: 0, opacity: 1 },
        tr.modifiers,
        { ...seedCtx, timeUs },
      )
      const prop = tr.target?.property
      if (prop === 'x') value += modOut.x
      else if (prop === 'y') value += modOut.y
      else if (prop === 'rotationDeg') value += modOut.rotationDeg
      else if (prop === 'scaleX') value *= modOut.scaleX
      else if (prop === 'scaleY') value *= modOut.scaleY
      else if (prop === 'opacity') value *= modOut.opacity
    }
  }

  return value
}

/**
 * Evaluate all tracks for a layer into a property bag.
 *
 * @param {object} layer
 * @param {object} timeline
 * @param {number} timeUs
 * @param {{ projectSeed: string, frameIndex?: number }} ctx
 */
export function evaluateLayerTracks(layer, timeline, timeUs, ctx) {
  const durationUs = timeline?.durationUs ?? 0
  const mapped = mapLoopTime(timeUs, durationUs, timeline?.loopMode || 'once')
  const clamped = clampTime(mapped, durationUs)
  const transform = layer.transform || {
    x: 0, y: 0, scaleX: 1, scaleY: 1, rotationDeg: 0, anchorX: 0.5, anchorY: 0.5,
  }

  const trackIds = layer.animationTrackIds || []
  const tracks = trackIds
    .map((id) => timeline?.tracks?.[id])
    .filter(Boolean)

  const byProp = new Map()
  for (const tr of tracks) {
    const prop = tr.target?.property
    if (!prop) continue
    if (!byProp.has(prop)) byProp.set(prop, [])
    byProp.get(prop).push(tr)
  }

  const seedCtx = {
    projectSeed: ctx.projectSeed || '0',
    clipId: layer.id,
    frameIndex: ctx.frameIndex ?? 0,
  }

  const props = {
    x: transform.x,
    y: transform.y,
    scaleX: transform.scaleX,
    scaleY: transform.scaleY,
    rotationDeg: transform.rotationDeg,
    opacity: layer.opacity ?? 1,
  }

  for (const [prop, propTracks] of byProp) {
    if (prop in props) {
      props[prop] = applyTrackPrecedence(props[prop], propTracks, clamped, seedCtx)
    }
  }

  // Layer-level cutout / motion modifiers (default None)
  if (layer.cutoutMotion && layer.cutoutMotion !== 'None') {
    const mod = applyProceduralModifiers(props, [{
      id: `cutout:${layer.cutoutMotion}`,
      type: layer.cutoutMotion,
      amplitude: 6,
      speed: 1,
    }], { ...seedCtx, timeUs: clamped })
    Object.assign(props, mod)
  }

  return {
    timeUs: clamped,
    transform: {
      ...transform,
      x: props.x,
      y: props.y,
      scaleX: props.scaleX,
      scaleY: props.scaleY,
      rotationDeg: props.rotationDeg,
    },
    opacity: props.opacity,
  }
}
