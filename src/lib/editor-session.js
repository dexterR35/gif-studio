/**
 * Runtime editor session shape — arrays + settings for Konva / StudioProvider.
 * Not persisted; durable document is always Project V2 (`schemaVersion: 2`).
 */
import { EFFECT_DEFAULTS, INITIAL, SYSTEM_FONTS } from './presets'

export const IMAGE_EDITS_DEFAULT = {
  rotation: 0, flipX: false, flipY: false,
  brightness: 100, contrast: 100, saturation: 100,
  blur: 0, hue: 0, grayscale: 0, sepia: 0,
}

export const CENSOR_DEFAULT = {
  enabled: false, x: 25, y: 25, w: 30, h: 20, pixelSize: 14,
}

export const PARALLAX_DEFAULT = {
  enabled: false, direction: 'Horizontal', strength: 6, speed: 1,
}

/** Empty editor session (no image loaded). */
export function createEmptyEditorSession() {
  return {
    id: null,
    name: 'Untitled',
    createdAt: null,
    updatedAt: null,
    source: null,
    settings: { ...INITIAL, motionEffects: [] },
    elements: [],
    overlays: [],
    textLayers: [],
    enhancedLayer: null,
    gifEffects: { ...EFFECT_DEFAULTS },
    imageEdits: { ...IMAGE_EDITS_DEFAULT },
    censor: { ...CENSOR_DEFAULT },
    parallax: { ...PARALLAX_DEFAULT },
    keyframes: [],
    fontOptions: [...SYSTEM_FONTS],
  }
}

/** Legacy saved-file shape for import tests only (`schemaVersion: 1`). */
export function createLegacyImportFixture(overrides = {}) {
  return { schemaVersion: 1, ...createEmptyEditorSession(), ...overrides }
}
