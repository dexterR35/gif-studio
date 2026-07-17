/** Photoshop-style liquify + zoom clips keyed to GIF duration (seconds). */

export const MAX_MOTION_EFFECTS = 3

/** Stable id for the locked base-motion lane (mirrors Motion dropdown). */
export const BASE_MOTION_ID = 'base-motion'

export const MOTION_EFFECT_TYPES = [
  'Bloat',
  'Pucker',
  'Twirl',
  'Push',
  'Swirl',
  'Wave',
  'Zoom',
]

/** How the effect evolves between In and Out (continuous animation). */
export const ANIMATE_MODES = [
  'Hold',
  'Left → Right',
  'Right → Left',
  'Top → Bottom',
  'Bottom → Top',
  'Orbit',
  'Pulse',
  'Random',
  'Spin',
]

export const MOTION_EFFECT_COLORS = {
  Bloat: '#7dd3fc',
  Pucker: '#c4b5fd',
  Twirl: '#f9a8d4',
  Push: '#86efac',
  Swirl: '#fcd34d',
  Wave: '#67e8f9',
  Zoom: '#d8ff3e',
  /** Fallback for named base presets on the M lane */
  Base: '#a1a1aa',
}

/** Virtual locked clip for the Motion dropdown — display only; not in motionEffects. */
export function getBaseMotionClip(settings) {
  const duration = Math.max(0.1, Number(settings?.duration) || 1)
  const preset = settings?.preset || 'Still'
  return {
    id: BASE_MOTION_ID,
    kind: 'base',
    locked: true,
    type: preset,
    track: -1,
    in: 0,
    out: duration,
    amount: settings?.amplitude ?? 0,
    label: preset,
  }
}

export function isBaseMotionClip(clipOrId) {
  if (clipOrId == null) return false
  if (typeof clipOrId === 'string' || typeof clipOrId === 'number') {
    return clipOrId === BASE_MOTION_ID
  }
  return clipOrId.id === BASE_MOTION_ID || clipOrId.kind === 'base'
}

export function defaultAnimateForType(type) {
  if (type === 'Wave') return 'Left → Right'
  if (type === 'Zoom') return 'Pulse'
  if (type === 'Twirl' || type === 'Swirl') return 'Spin'
  return 'Left → Right'
}

export function createMotionEffect(type = 'Bloat', duration = 10, track = 0) {
  const span = Math.max(0.4, Number(duration) || 10)
  const mid = span / 2
  return {
    id: Date.now() + Math.floor(Math.random() * 1000),
    type,
    track: Math.max(0, Math.min(MAX_MOTION_EFFECTS - 1, track)),
    in: Math.max(0, +(mid - span * 0.25).toFixed(2)),
    out: Math.min(span, +(mid + span * 0.25).toFixed(2)),
    amount: type === 'Zoom' ? 18 : 42,
    radius: 42,
    x: 50,
    y: 50,
    angle: 0,
    fadeIn: 15,
    fadeOut: 15,
    /** Continuous motion across in→out */
    animate: defaultAnimateForType(type),
    /** How many animation cycles inside the clip window */
    cycles: type === 'Wave' ? 3 : type === 'Zoom' ? 2 : 1,
  }
}

/**
 * Smooth envelope for a clip at time `t` (seconds).
 * Returns 0 outside [in, out]; peaks at `amount` with fade in/out % of the clip span.
 */
export function sampleClipStrength(clip, t) {
  const start = Number(clip.in) || 0
  const end = Number(clip.out) || 0
  if (end <= start || t < start || t > end) return 0
  const span = end - start
  const local = (t - start) / span
  const fadeIn = Math.max(0, Math.min(50, Number(clip.fadeIn) || 0)) / 100
  const fadeOut = Math.max(0, Math.min(50, Number(clip.fadeOut) || 0)) / 100
  let weight = 1
  if (fadeIn > 0 && local < fadeIn) weight = local / fadeIn
  else if (fadeOut > 0 && local > 1 - fadeOut) weight = (1 - local) / fadeOut
  return weight * (Math.max(0, Number(clip.amount) || 0) / 100)
}

/** Progress 0→1 inside the clip window, or null if inactive. */
export function sampleClipLocal(clip, t) {
  const start = Number(clip.in) || 0
  const end = Number(clip.out) || 0
  if (end <= start || t < start || t > end) return null
  return (t - start) / (end - start)
}

/** Deterministic 0–1 noise from clip id + sample index. */
function clipNoise(clip, i) {
  const seed = Number(clip.id) || 1
  const n = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453
  return n - Math.floor(n)
}

function lerp(a, b, t) {
  return a + (b - a) * t
}

/**
 * Resolve animated center / amount / angle / wave phase for continuous in→out motion.
 */
export function sampleAnimatedParams(clip, t) {
  const local = sampleClipLocal(clip, t)
  if (local == null) return null
  const strength = sampleClipStrength(clip, t)
  if (strength <= 0) return null

  const mode = clip.animate || defaultAnimateForType(clip.type)
  const cycles = Math.max(0.25, Number(clip.cycles) || (clip.type === 'Wave' ? 3 : 1))
  const phase = local * cycles
  const turn = phase * Math.PI * 2
  const cx0 = Number(clip.x) || 50
  const cy0 = Number(clip.y) || 50
  let x = cx0
  let y = cy0
  let amount = strength * 100
  let angle = Number(clip.angle) || 0
  let wavePhase = turn

  switch (mode) {
    case 'Left → Right':
      x = lerp(8, 92, local)
      y = cy0
      break
    case 'Right → Left':
      x = lerp(92, 8, local)
      y = cy0
      break
    case 'Top → Bottom':
      x = cx0
      y = lerp(8, 92, local)
      break
    case 'Bottom → Top':
      x = cx0
      y = lerp(92, 8, local)
      break
    case 'Orbit': {
      const r = Math.max(8, Math.min(40, (Number(clip.radius) || 42) * 0.55))
      x = cx0 + Math.cos(turn) * r
      y = cy0 + Math.sin(turn) * r
      break
    }
    case 'Pulse':
      amount = strength * 100 * (0.3 + 0.7 * (0.5 + 0.5 * Math.sin(turn)))
      break
    case 'Random': {
      const steps = Math.max(2, Math.ceil(cycles * 4))
      const seg = local * steps
      const i = Math.min(steps - 1, Math.floor(seg))
      const f = seg - i
      const x0 = 12 + clipNoise(clip, i * 2) * 76
      const y0 = 12 + clipNoise(clip, i * 2 + 1) * 76
      const x1 = 12 + clipNoise(clip, (i + 1) * 2) * 76
      const y1 = 12 + clipNoise(clip, (i + 1) * 2 + 1) * 76
      const ease = f * f * (3 - 2 * f)
      x = lerp(x0, x1, ease)
      y = lerp(y0, y1, ease)
      break
    }
    case 'Spin':
      angle = (Number(clip.angle) || 0) + phase * 360
      break
    case 'Hold':
    default:
      break
  }

  // Waves always scroll so the warp keeps moving even on Hold.
  if (clip.type === 'Wave') {
    wavePhase = mode === 'Hold'
      ? local * Math.max(1, cycles) * Math.PI * 2
      : turn
  }

  let zoomScale = 1
  if (clip.type === 'Zoom') {
    if (mode === 'Pulse') {
      zoomScale = 1 + (strength * (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(turn))))
    } else if (mode === 'Hold') {
      zoomScale = 1 + strength
    } else {
      zoomScale = 1 + strength * (0.25 + 0.75 * local)
    }
  }

  return {
    type: clip.type,
    amount: Math.max(0, Math.min(100, amount)),
    x: Math.max(0, Math.min(100, x)),
    y: Math.max(0, Math.min(100, y)),
    radius: clip.radius ?? 50,
    angle: ((angle % 360) + 360) % 360,
    phase: wavePhase,
    zoomScale,
    local,
  }
}

/** Active liquify/distort samples at time `t` (seconds). Zoom is handled separately. */
export function sampleDistortions(clips, t) {
  if (!clips?.length) return []
  return clips
    .filter((clip) => clip.type !== 'Zoom' && !isBaseMotionClip(clip))
    .map((clip) => {
      const animated = sampleAnimatedParams(clip, t)
      if (!animated) return null
      return {
        type: animated.type,
        amount: animated.amount,
        x: animated.x,
        y: animated.y,
        radius: animated.radius,
        angle: animated.angle,
        phase: animated.phase,
      }
    })
    .filter(Boolean)
}

/** Multiplicative zoom scale from Zoom clips at time `t`. */
export function sampleZoomScale(clips, t) {
  if (!clips?.length) return 1
  let scale = 1
  for (const clip of clips) {
    if (clip.type !== 'Zoom' || isBaseMotionClip(clip)) continue
    const animated = sampleAnimatedParams(clip, t)
    if (animated) scale *= animated.zoomScale
  }
  return scale
}

export function clampMotionEffects(clips, duration) {
  const max = Math.max(0.1, Number(duration) || 10)
  const used = new Set()
  return (clips || [])
    .filter((clip) => !isBaseMotionClip(clip))
    .slice(0, MAX_MOTION_EFFECTS)
    .map((clip, index) => {
      let start = Math.max(0, Math.min(max, Number(clip.in) || 0))
      let end = Math.max(0, Math.min(max, Number(clip.out) || 0))
      if (end < start) [start, end] = [end, start]
      if (end - start < 0.05) end = Math.min(max, start + 0.05)
      let track = Number.isFinite(clip.track) ? clip.track : index
      track = Math.max(0, Math.min(MAX_MOTION_EFFECTS - 1, track))
      if (used.has(track)) {
        track = 0
        while (used.has(track) && track < MAX_MOTION_EFFECTS) track += 1
      }
      used.add(track)
      return {
        ...clip,
        track,
        in: +start.toFixed(2),
        out: +end.toFixed(2),
        animate: clip.animate || defaultAnimateForType(clip.type),
        cycles: Math.max(0.25, Number(clip.cycles) || 1),
      }
    })
}

/** Move a clip while keeping its length; clamp inside [0, duration]. */
export function moveClipWindow(clip, deltaSec, duration) {
  const max = Math.max(0.1, Number(duration) || 10)
  const span = Math.max(0.05, (Number(clip.out) || 0) - (Number(clip.in) || 0))
  let start = (Number(clip.in) || 0) + deltaSec
  start = Math.max(0, Math.min(max - span, start))
  return { in: +start.toFixed(2), out: +(start + span).toFixed(2) }
}
