import { seededUnit } from './seeded-random.js'

/**
 * Apply seeded procedural modifiers. Deterministic for identical inputs.
 *
 * @param {{ x?: number, y?: number, scaleX?: number, scaleY?: number, rotationDeg?: number, opacity?: number }} base
 * @param {Array<{ id: string, type: string, amplitude?: number, speed?: number, phase?: number }>} modifiers
 * @param {{ projectSeed: string, clipId: string, frameIndex: number, timeUs: number }} ctx
 */
export function applyProceduralModifiers(base, modifiers, ctx) {
  const out = {
    x: Number(base.x) || 0,
    y: Number(base.y) || 0,
    scaleX: Number.isFinite(base.scaleX) ? base.scaleX : 1,
    scaleY: Number.isFinite(base.scaleY) ? base.scaleY : 1,
    rotationDeg: Number(base.rotationDeg) || 0,
    opacity: Number.isFinite(base.opacity) ? base.opacity : 1,
  }

  if (!Array.isArray(modifiers) || modifiers.length === 0) return out

  const tSec = (Number(ctx.timeUs) || 0) / 1_000_000
  const { projectSeed, clipId, frameIndex } = ctx

  for (const mod of modifiers) {
    if (!mod || !mod.type || mod.type === 'None') continue
    const amp = Number.isFinite(mod.amplitude) ? Number(mod.amplitude) : 1
    const speed = Number.isFinite(mod.speed) ? Number(mod.speed) : 1
    const phase = Number.isFinite(mod.phase) ? Number(mod.phase) : 0
    const clipKey = `${clipId}:${mod.id || mod.type}`
    const noise = seededUnit(projectSeed, clipKey, frameIndex)
    const omega = tSec * speed * Math.PI * 2 + phase

    switch (mod.type) {
      case 'Float':
        out.y += Math.sin(omega) * amp
        break
      case 'Drift':
        out.x += Math.sin(omega) * amp
        out.y += Math.cos(omega * 0.7) * amp * 0.5
        break
      case 'Bounce':
        out.y += Math.abs(Math.sin(omega)) * amp
        break
      case 'Pulse': {
        const p = 1 + Math.sin(omega) * amp * 0.01
        out.scaleX *= p
        out.scaleY *= p
        break
      }
      case 'Spin':
        out.rotationDeg += (tSec * speed * 60 + noise) % 360
        break
      case 'Wobble':
        out.rotationDeg += Math.sin(omega) * amp
        break
      case 'Orbit': {
        out.x += Math.cos(omega) * amp
        out.y += Math.sin(omega) * amp
        break
      }
      case 'Noise':
        out.x += (noise * 2 - 1) * amp
        out.y += (seededUnit(projectSeed, `${clipKey}:y`, frameIndex) * 2 - 1) * amp
        break
      default:
        break
    }
  }

  return out
}

/**
 * Default cutout motion per MEGA overlay: None.
 * @returns {'None'}
 */
export function defaultCutoutMotion() {
  return 'None'
}
