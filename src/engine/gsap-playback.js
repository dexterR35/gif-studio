/**
 * GSAP-driven playback / scrub for the studio timeline.
 */
import gsap from 'gsap'

let tween = null

export function playTimeline({
  duration,
  onUpdate,
  onComplete,
  from = 0,
  paused = false,
} = {}) {
  stopTimeline()
  const state = { t: 0 }
  tween = gsap.fromTo(
    state,
    { t: 0 },
    {
      t: 1,
      duration: Math.max(0.05, Number(duration) || 1),
      ease: 'none',
      paused,
      repeat: -1,
      onUpdate: () => onUpdate?.(state.t),
      onComplete: () => onComplete?.(1),
    },
  )
  const start = Math.max(0, Math.min(1, Number(from) || 0))
  if (start > 0) tween.progress(start)
  return tween
}

export function scrubTimeline(t) {
  if (!tween) return
  tween.progress(Math.max(0, Math.min(1, t)))
}

export function pauseTimeline() {
  tween?.pause()
}

export function resumeTimeline() {
  tween?.resume()
}

export function stopTimeline() {
  if (tween) {
    tween.kill()
    tween = null
  }
}

export { sampleKeyframes } from '../lib/keyframes'

