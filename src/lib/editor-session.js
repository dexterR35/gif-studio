/**
 * Runtime editor session shape — arrays + settings for Konva / StudioProvider.
 * Not persisted; durable document is always Project V2 (`schemaVersion: 2`).
 */
import { INITIAL, SYSTEM_FONTS } from './presets'

/** Base-image geometric transforms (flip / rotate). Color filters live nowhere — Effects tab removed. */
export const IMAGE_EDITS_DEFAULT = {
  rotation: 0, flipX: false, flipY: false,
}

/** Empty editor session (no image loaded). */
export function createEmptyEditorSession() {
  return {
    id: null,
    name: 'Untitled',
    createdAt: null,
    updatedAt: null,
    source: null,
    settings: { ...INITIAL },
    elements: [],
    overlays: [],
    textLayers: [],
    enhancedLayer: null,
    imageEdits: { ...IMAGE_EDITS_DEFAULT },
    fontOptions: [...SYSTEM_FONTS],
  }
}

/** Legacy saved-file shape for import tests only (`schemaVersion: 1`). */
export function createLegacyImportFixture(overrides = {}) {
  return { schemaVersion: 1, ...createEmptyEditorSession(), ...overrides }
}
