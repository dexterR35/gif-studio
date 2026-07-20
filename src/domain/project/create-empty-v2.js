import { defaultCutoutMotion } from '../timeline/procedural-motion.js'

function newId(prefix) {
  // Deterministic-enough for empty docs; callers may replace.
  // Avoid Math.random in domain evaluators — creation may use crypto when available.
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`
  }
  return `${prefix}-${Date.now().toString(36)}`
}

/**
 * Create an empty ProjectDocumentV2 (schemaVersion 2).
 * @param {{ name?: string, width?: number, height?: number, projectSeed?: string, appVersion?: string }} [opts]
 */
export function createEmptyProjectV2(opts = {}) {
  const now = new Date().toISOString()
  const id = opts.id || newId('project')
  const projectSeed = opts.projectSeed || newId('seed')
  const width = opts.width ?? 480
  const height = opts.height ?? 300
  const durationUs = opts.durationUs ?? 10_000_000

  return {
    schemaVersion: 2,
    id,
    projectSeed,
    metadata: {
      name: opts.name || 'Untitled',
      createdAt: now,
      updatedAt: now,
      appVersion: opts.appVersion || '1.0.0',
    },
    canvas: {
      width,
      height,
      background: opts.transparent
        ? { kind: 'transparent' }
        : { kind: 'solid', color: opts.backgroundColor || '#111114' },
      colorSpace: 'srgb',
    },
    assets: {},
    rootLayerIds: [],
    layers: {},
    timeline: {
      durationUs,
      loopMode: 'loop',
      tracks: {},
      trackOrder: [],
    },
    exportSettings: {
      format: 'gif',
      fps: 24,
      quality: 'High quality',
      loop: 0,
      paletteSize: 256,
      dither: true,
      disposal: 2,
      transparent: Boolean(opts.transparent),
    },
    extensions: {
      cutoutMotionDefault: defaultCutoutMotion(),
    },
  }
}
