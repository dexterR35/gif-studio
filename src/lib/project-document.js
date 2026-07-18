/**
 * Versioned studio project document — no bundled demo assets.
 * Session starts empty; user upload / import fills source + layers.
 */
import { EFFECT_DEFAULTS, INITIAL, SYSTEM_FONTS } from './presets'

export const PROJECT_SCHEMA_VERSION = 1

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

/** Empty project — mirrors desktop “no image selected”. */
export function createEmptyProject() {
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: null,
    name: 'Untitled',
    createdAt: null,
    updatedAt: null,
    source: null,
    settings: { ...INITIAL, motionEffects: [] },
    elements: [],
    overlays: [],
    textLayers: [],
    /** Upscaled underlay — never replaces source; drawn under Background. */
    enhancedLayer: null,
    gifEffects: { ...EFFECT_DEFAULTS },
    imageEdits: { ...IMAGE_EDITS_DEFAULT },
    censor: { ...CENSOR_DEFAULT },
    parallax: { ...PARALLAX_DEFAULT },
    keyframes: [],
    fontOptions: [...SYSTEM_FONTS],
  }
}

export function serializeProject(project, { includeBlobs = false } = {}) {
  const clone = structuredClone({
    ...project,
    updatedAt: new Date().toISOString(),
    createdAt: project.createdAt || new Date().toISOString(),
  })
  if (!includeBlobs) {
    if (clone.source?.url?.startsWith('blob:')) {
      clone.source = { ...clone.source, url: null, pendingUpload: true }
    }
    for (const layer of clone.elements || []) {
      if (layer.url?.startsWith('blob:')) layer.url = null
      if (layer.cleanupUrl?.startsWith('blob:')) layer.cleanupUrl = null
    }
    for (const overlay of clone.overlays || []) {
      if (overlay.url?.startsWith('blob:')) overlay.url = null
    }
    if (clone.enhancedLayer?.url?.startsWith('blob:')) {
      clone.enhancedLayer = { ...clone.enhancedLayer, url: null, pendingUpload: true }
    }
  }
  return clone
}

export function projectFromJson(raw) {
  const empty = createEmptyProject()
  if (!raw || typeof raw !== 'object') return empty
  return {
    ...empty,
    ...raw,
    settings: { ...empty.settings, ...(raw.settings || {}) },
    gifEffects: { ...empty.gifEffects, ...(raw.gifEffects || {}) },
    imageEdits: { ...empty.imageEdits, ...(raw.imageEdits || {}) },
    censor: { ...empty.censor, ...(raw.censor || {}) },
    parallax: { ...empty.parallax, ...(raw.parallax || {}) },
    elements: Array.isArray(raw.elements) ? raw.elements : [],
    overlays: Array.isArray(raw.overlays) ? raw.overlays : [],
    textLayers: Array.isArray(raw.textLayers) ? raw.textLayers : [],
    enhancedLayer: raw.enhancedLayer && typeof raw.enhancedLayer === 'object' ? raw.enhancedLayer : null,
    keyframes: Array.isArray(raw.keyframes) ? raw.keyframes : [],
    fontOptions: Array.isArray(raw.fontOptions) ? raw.fontOptions : empty.fontOptions,
  }
}
