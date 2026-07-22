/**
 * Konva motion recipes — Tweens (one-shot) + Animations (loops).
 * @see https://konvajs.org/docs/tweens/Tween_Linear.html
 * @see https://konvajs.org/docs/animations/Create_an_Animation.html
 */
import Konva from 'konva'

/** Preset names shown on the Motion page. */
export const MOTION_PRESET_NAMES = [
  'Still',
  'Zoom in',
  'Zoom out',
  'Ken Burns',
  'Spin & zoom',
  'Fade in',
  'Float',
  'Drift',
  'Bounce',
  'Pulse',
  'Spin',
  'Wobble',
  'Orbit',
]

const LOOP_PRESETS = new Set(['Float', 'Drift', 'Bounce', 'Pulse', 'Spin', 'Wobble', 'Orbit'])

export function isLoopPreset(name) {
  return LOOP_PRESETS.has(name)
}

/**
 * Snapshot rest pose from a Konva node.
 */
export function captureNodeRest(node) {
  if (!node) return null
  return {
    x: node.x(),
    y: node.y(),
    scaleX: node.scaleX(),
    scaleY: node.scaleY(),
    rotation: node.rotation(),
    opacity: node.opacity(),
  }
}

function restoreRest(node, rest) {
  if (!node || !rest) return
  node.setAttrs({
    x: rest.x,
    y: rest.y,
    scaleX: rest.scaleX,
    scaleY: rest.scaleY,
    rotation: rest.rotation,
    opacity: rest.opacity,
  })
}

/**
 * Apply a motion sample at normalized time t ∈ [0,1] (or looping via timeMs).
 * Mutates the node in place — used for scrub + export frame seek.
 *
 * @param {import('konva/lib/Node').Node} node
 * @param {object} rest
 * @param {{ preset: string, amplitude?: number, speed?: number, duration?: number }} opts
 * @param {number} tNorm 0..1 timeline progress
 */
export function seekMotion(node, rest, opts, tNorm) {
  if (!node || !rest) return
  const preset = opts.preset || 'Still'
  const amp = Math.max(0, Number(opts.amplitude) || 0)
  const speed = Math.max(0.1, Number(opts.speed) || 1)
  const duration = Math.max(0.05, Number(opts.duration) || 1)
  const rawT = Math.max(0, Math.min(1, tNorm))
  restoreRest(node, rest)

  if (preset === 'Still' || !preset) return

  if (isLoopPreset(preset)) {
    const phase = rawT * Math.PI * 2 * speed
    const ax = amp
    if (preset === 'Float') node.y(rest.y - Math.sin(phase) * ax)
    if (preset === 'Drift') node.x(rest.x + Math.sin(phase) * ax)
    if (preset === 'Bounce') node.y(rest.y - Math.abs(Math.sin(phase)) * ax)
    if (preset === 'Pulse') {
      const s = 1 + Math.sin(phase) * (amp / 100)
      node.scaleX(rest.scaleX * s)
      node.scaleY(rest.scaleY * s)
    }
    if (preset === 'Spin') node.rotation(rest.rotation + (phase * 180) / Math.PI)
    if (preset === 'Wobble') node.rotation(rest.rotation + Math.sin(phase) * amp)
    if (preset === 'Orbit') {
      node.x(rest.x + Math.cos(phase) * ax)
      node.y(rest.y + Math.sin(phase) * ax)
    }
    return
  }

  // One-shot: ease to end over timeline (speed finishes earlier)
  let u = Math.min(1, rawT * speed)
  u = u * u * (3 - 2 * u) // smoothstep
  const a = amp

  if (preset === 'Zoom in') {
    const s = 1 + (a / 100) * u
    node.scaleX(rest.scaleX * s)
    node.scaleY(rest.scaleY * s)
  } else if (preset === 'Zoom out') {
    const s = (1 + a / 100) * (1 - u) + 1 * u
    node.scaleX(rest.scaleX * s)
    node.scaleY(rest.scaleY * s)
  } else if (preset === 'Ken Burns') {
    const pan = a * 0.35
    const s0 = 1 + (a * 0.08) / 100
    const s1 = 1 + a / 100
    const s = s0 + (s1 - s0) * u
    node.scaleX(rest.scaleX * s)
    node.scaleY(rest.scaleY * s)
    node.x(rest.x + (-pan + pan * 2 * u))
    node.y(rest.y + (pan * 0.55 - pan * 1.1 * u))
  } else if (preset === 'Spin & zoom') {
    const s0 = Math.max(0.4, 1 - a / 100)
    const s1 = 1 + a / 100
    const s = s0 + (s1 - s0) * u
    node.scaleX(rest.scaleX * s)
    node.scaleY(rest.scaleY * s)
    node.rotation(rest.rotation + (-a + a * 2 * u))
    node.opacity(rest.opacity * (Math.max(0, 1 - (a * 3.5) / 100) + (1 - Math.max(0, 1 - (a * 3.5) / 100)) * u))
  } else if (preset === 'Fade in') {
    node.opacity(rest.opacity * u)
  }

  void duration
}

/**
 * Live Konva.Animation for loop presets (docs Create Animation).
 * Returns { anim, stop } — call stop() to restore rest.
 */
export function startLoopAnimation(node, rest, opts, onFrame) {
  if (!node || !rest) return { anim: null, stop: () => {} }
  const preset = opts.preset || 'Still'
  if (!isLoopPreset(preset)) return { anim: null, stop: () => {} }

  const speed = Math.max(0.1, Number(opts.speed) || 1)
  const duration = Math.max(0.05, Number(opts.duration) || 1)
  const anim = new Konva.Animation((frame) => {
    const tNorm = ((frame.time / 1000) * speed / duration) % 1
    seekMotion(node, rest, opts, tNorm)
    onFrame?.(tNorm)
  }, node.getLayer())

  anim.start()
  return {
    anim,
    stop: () => {
      anim.stop()
      restoreRest(node, rest)
      node.getLayer()?.batchDraw()
    },
  }
}

/**
 * One-shot Konva.Tween (docs Tween Linear).
 */
export function startTweenMotion(node, rest, opts, onFinish) {
  if (!node || !rest) return { tween: null, stop: () => {} }
  const preset = opts.preset || 'Still'
  if (isLoopPreset(preset) || preset === 'Still') {
    return { tween: null, stop: () => {} }
  }

  seekMotion(node, rest, { ...opts, speed: 1 }, 0)
  seekMotion(node, rest, { ...opts, speed: 1 }, 1)
  const endAttrs = {
    x: node.x(),
    y: node.y(),
    scaleX: node.scaleX(),
    scaleY: node.scaleY(),
    rotation: node.rotation(),
    opacity: node.opacity(),
  }
  restoreRest(node, rest)

  const duration = Math.max(0.05, Number(opts.duration) || 1) / Math.max(0.1, Number(opts.speed) || 1)
  const tween = new Konva.Tween({
    node,
    duration,
    easing: Konva.Easings.EaseInOut,
    ...endAttrs,
    onFinish: () => onFinish?.(),
  })
  tween.play()
  return {
    tween,
    stop: () => {
      tween.destroy()
      restoreRest(node, rest)
      node.getLayer()?.batchDraw()
    },
  }
}
