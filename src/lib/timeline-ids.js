/** Stable timeline track ids (base motion lane + content layers). */

import { PRIMARY_ACCENT } from './colors.js'

/** Stable id for the locked base-motion lane (mirrors Motion dropdown). */
export const BASE_MOTION_ID = 'base-motion'

export const BASE_MOTION_COLOR = '#a1a1aa'

/** Accent for zoom / motion UI chips that are not liquify. */
export const MOTION_UI_ACCENT = PRIMARY_ACCENT

/** Virtual locked clip for the Motion dropdown — display only. */
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

/** Shift a clip window by deltaSec, clamped to [0, duration]. */
export function moveClipWindow(clip, deltaSec, duration) {
  const span = Math.max(0.05, (Number(clip.out) || 0) - (Number(clip.in) || 0))
  const max = Math.max(0.1, Number(duration) || 1)
  let nextIn = (Number(clip.in) || 0) + deltaSec
  let nextOut = nextIn + span
  if (nextIn < 0) {
    nextIn = 0
    nextOut = span
  }
  if (nextOut > max) {
    nextOut = max
    nextIn = Math.max(0, max - span)
  }
  return { in: +nextIn.toFixed(2), out: +nextOut.toFixed(2) }
}
