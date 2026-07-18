/** Photoshop-style liquify + zoom clips keyed to GIF duration (seconds). */

import { PRIMARY_ACCENT } from './colors.js'

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
  Zoom: PRIMARY_ACCENT,
  /** Fallback for named base presets on the M lane */
  Base: '#a1a1aa',
}

/** Soft cinematic defaults — subtle strength, long fades, gentle travel. */
const CLIP_PRESETS = {
  Bloat: { amount: 16, radius: 30, fadeIn: 32, fadeOut: 32, cycles: 1, animate: 'Pulse' },
  Pucker: { amount: 14, radius: 28, fadeIn: 32, fadeOut: 32, cycles: 1, animate: 'Pulse' },
  Twirl: { amount: 12, radius: 26, fadeIn: 30, fadeOut: 30, cycles: 0.75, animate: 'Spin' },
  Push: { amount: 14, radius: 32, fadeIn: 30, fadeOut: 30, cycles: 1, animate: 'Hold' },
  Swirl: { amount: 10, radius: 34, fadeIn: 34, fadeOut: 34, cycles: 0.75, animate: 'Spin' },
  Wave: { amount: 12, radius: 50, fadeIn: 36, fadeOut: 36, cycles: 1.25, animate: 'Hold' },
  Zoom: { amount: 7, radius: 50, fadeIn: 38, fadeOut: 38, cycles: 1, animate: 'Pulse' },
}

function smoothstep(t) {
  const x = Math.max(0, Math.min(1, t))
  return x * x * (3 - 2 * x)
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

/** Locked content-layer track ids on the timeline (`layer:element:123`). */
export function layerTrackId(kind, id) {
  return `layer:${kind}:${id}`
}

export function parseLayerTrackId(value) {
  if (typeof value !== 'string' || !value.startsWith('layer:')) return null
  const parts = value.split(':')
  if (parts.length < 3) return null
  const kind = parts[1]
  const id = parts.slice(2).join(':')
  if (!kind || !id) return null
  const numeric = Number(id)
  return { kind, id: Number.isFinite(numeric) && String(numeric) === id ? numeric : id }
}

export function isLayerTrackId(value) {
  return Boolean(parseLayerTrackId(value))
}

export function defaultAnimateForType(type) {
  return CLIP_PRESETS[type]?.animate || 'Hold'
}

export function createMotionEffect(type = 'Bloat', duration = 10, track = 0) {
  const span = Math.max(0.4, Number(duration) || 10)
  const mid = span / 2
  // Slightly longer window so motion reads as a soft beat, not a punch.
  const half = span * 0.28
  const preset = CLIP_PRESETS[type] || CLIP_PRESETS.Bloat
  return {
    id: Date.now() + Math.floor(Math.random() * 1000),
    type,
    track: Math.max(0, Math.min(MAX_MOTION_EFFECTS - 1, track)),
    in: Math.max(0, +(mid - half).toFixed(2)),
    out: Math.min(span, +(mid + half).toFixed(2)),
    amount: preset.amount,
    radius: preset.radius,
    x: 50,
    y: 50,
    angle: 0,
    fadeIn: preset.fadeIn,
    fadeOut: preset.fadeOut,
    animate: preset.animate,
    cycles: preset.cycles,
  }
}

/**
 * Smooth envelope for a clip at time `t` (seconds).
 * Uses smoothstep fades so strength eases in/out instead of snapping.
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
  if (fadeIn > 0 && local < fadeIn) weight = smoothstep(local / fadeIn)
  else if (fadeOut > 0 && local > 1 - fadeOut) weight = smoothstep((1 - local) / fadeOut)
  // Soft ceiling — UI amount 100 maps to a composed, not extreme, effect.
  const softAmount = (Math.max(0, Number(clip.amount) || 0) / 100) * 0.72
  return weight * softAmount
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
  const cycles = Math.max(0.25, Number(clip.cycles) || (clip.type === 'Wave' ? 1.25 : 1))
  const phase = local * cycles
  const turn = phase * Math.PI * 2
  const eased = smoothstep(local)
  const cx0 = Number(clip.x) || 50
  const cy0 = Number(clip.y) || 50
  // Keep travel near the anchor — subtle pan, not full-frame sweeps.
  const travel = 16
  let x = cx0
  let y = cy0
  let amount = strength * 100
  let angle = Number(clip.angle) || 0
  let wavePhase = turn

  switch (mode) {
    case 'Left → Right':
      x = lerp(cx0 - travel, cx0 + travel, eased)
      y = cy0
      break
    case 'Right → Left':
      x = lerp(cx0 + travel, cx0 - travel, eased)
      y = cy0
      break
    case 'Top → Bottom':
      x = cx0
      y = lerp(cy0 - travel, cy0 + travel, eased)
      break
    case 'Bottom → Top':
      x = cx0
      y = lerp(cy0 + travel, cy0 - travel, eased)
      break
    case 'Orbit': {
      const r = Math.max(4, Math.min(14, (Number(clip.radius) || 30) * 0.28))
      x = cx0 + Math.cos(turn) * r
      y = cy0 + Math.sin(turn) * r
      break
    }
    case 'Pulse':
      // Gentle breath — never fully collapses to zero.
      amount = strength * 100 * (0.55 + 0.45 * (0.5 + 0.5 * Math.sin(turn)))
      break
    case 'Random': {
      const steps = Math.max(2, Math.ceil(cycles * 3))
      const seg = local * steps
      const i = Math.min(steps - 1, Math.floor(seg))
      const f = smoothstep(seg - i)
      const jitter = 12
      const x0 = cx0 + (clipNoise(clip, i * 2) - 0.5) * 2 * jitter
      const y0 = cy0 + (clipNoise(clip, i * 2 + 1) - 0.5) * 2 * jitter
      const x1 = cx0 + (clipNoise(clip, (i + 1) * 2) - 0.5) * 2 * jitter
      const y1 = cy0 + (clipNoise(clip, (i + 1) * 2 + 1) - 0.5) * 2 * jitter
      x = lerp(x0, x1, f)
      y = lerp(y0, y1, f)
      break
    }
    case 'Spin':
      // One soft turn per cycle instead of a full frantic spin.
      angle = (Number(clip.angle) || 0) + phase * 180
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
      zoomScale = 1 + (strength * (0.2 + 0.35 * (0.5 + 0.5 * Math.sin(turn))))
    } else if (mode === 'Hold') {
      zoomScale = 1 + strength * 0.55
    } else {
      zoomScale = 1 + strength * (0.15 + 0.4 * eased)
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
      const preset = CLIP_PRESETS[clip.type] || CLIP_PRESETS.Bloat
      return {
        ...clip,
        track,
        in: +start.toFixed(2),
        out: +end.toFixed(2),
        animate: clip.animate || preset.animate,
        cycles: Math.max(0.25, Number(clip.cycles) || preset.cycles),
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
