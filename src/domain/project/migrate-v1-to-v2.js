import { StudioError } from '../errors/studio-error.js'
import { migrateLayersFromV1 } from '../layers/migrate-layers.js'
import { createEmptyProjectV2 } from './create-empty-v2.js'
import { validateProjectV2 } from './validate-project.js'

/** Runtime-only fields on V1 cutouts — not structuredClone-able (HTMLCanvasElement, etc.). */
const RUNTIME_LAYER_KEYS = new Set([
  'bitmap',
  'sourceBitmap',
  'maskCanvas',
  'cleanup',
  'image',
  'imageElement',
  'canvas',
])

function isNonCloneableHostObject(value) {
  if (value == null || typeof value !== 'object') return false
  if (typeof HTMLCanvasElement !== 'undefined' && value instanceof HTMLCanvasElement) return true
  if (typeof ImageBitmap !== 'undefined' && value instanceof ImageBitmap) return true
  if (typeof HTMLImageElement !== 'undefined' && value instanceof HTMLImageElement) return true
  if (typeof ImageData !== 'undefined' && value instanceof ImageData) return true
  return false
}

/**
 * Strip live bitmaps/canvases from a V1 tree (not a deep freeze).
 * @param {unknown} value
 * @returns {unknown}
 */
function stripRuntimeFields(value) {
  if (value == null || typeof value !== 'object') return value
  if (isNonCloneableHostObject(value)) return null
  if (Array.isArray(value)) return value.map((item) => stripRuntimeFields(item))

  const out = {}
  for (const [key, child] of Object.entries(value)) {
    if (RUNTIME_LAYER_KEYS.has(key)) continue
    if (isNonCloneableHostObject(child)) continue
    out[key] = stripRuntimeFields(child)
  }
  return out
}

/**
 * Deep-clone a V1 document for migration backup, stripping live bitmaps/canvases.
 * Live V1 still keeps canvases for Konva; V2 only needs metadata + layer order.
 *
 * @param {unknown} value
 * @returns {unknown}
 */
export function cloneV1Snapshot(value) {
  const stripped = stripRuntimeFields(value)
  try {
    return typeof structuredClone === 'function'
      ? structuredClone(stripped)
      : JSON.parse(JSON.stringify(stripped))
  } catch {
    return stripped
  }
}

/**
 * Pure V1 → V2 migration.
 * Retains an immutable backup of the original document in the return value.
 *
 * Enhanced layers become replace assets with a rollback reference.
 *
 * @param {object} v1
 * @returns {{
 *   project: object,
 *   backup: object,
 *   warnings: string[],
 *   notes: string[],
 * }}
 */
export function migrateV1ToV2(v1) {
  if (!v1 || typeof v1 !== 'object') {
    throw new StudioError('PROJECT_MIGRATION_FAILED', 'Cannot migrate: input is not an object')
  }

  const schemaVersion = v1.schemaVersion ?? 1
  if (schemaVersion === 2) {
    const backup = cloneV1Snapshot(v1)
    return {
      project: v1,
      backup,
      warnings: [],
      notes: ['Document already schemaVersion 2; no migration applied.'],
    }
  }
  if (schemaVersion !== 1) {
    throw new StudioError(
      'PROJECT_MIGRATION_FAILED',
      `Unsupported schemaVersion: ${schemaVersion}`,
      { details: { schemaVersion } },
    )
  }

  const backup = cloneV1Snapshot(v1)
  const warnings = []
  const notes = [
    'V1 backup retained; do not overwrite original until migrated project is saved successfully.',
    'enhancedLayer migrated as replace+rollback (not underlay).',
    'Blob URLs are not copied into V2 assets.',
  ]

  // Reject blob URLs in durable form
  if (v1.source?.url?.startsWith?.('blob:')) {
    warnings.push('source.url was a blob URL and was not copied; asset may need re-import')
  }

  const settings = v1.settings || {}
  const empty = createEmptyProjectV2({
    name: v1.name || 'Untitled',
    width: Number(settings.width) || 480,
    height: Number(settings.height) || 300,
    transparent: Boolean(settings.transparent),
    backgroundColor: settings.background || '#111114',
    id: v1.id || undefined,
  })

  const { layers, rootLayerIds, assets } = migrateLayersFromV1(v1)

  const project = {
    ...empty,
    id: typeof v1.id === 'string' && v1.id ? v1.id : empty.id,
    metadata: {
      ...empty.metadata,
      name: v1.name || empty.metadata.name,
      createdAt: v1.createdAt || empty.metadata.createdAt,
      updatedAt: v1.updatedAt || empty.metadata.updatedAt,
    },
    canvas: {
      ...empty.canvas,
      width: Number(settings.width) || empty.canvas.width,
      height: Number(settings.height) || empty.canvas.height,
      background: settings.transparent
        ? { kind: 'transparent' }
        : { kind: 'solid', color: settings.background || '#111114' },
    },
    assets,
    layers,
    rootLayerIds,
    exportSettings: {
      format: 'png',
      reducePalette: Boolean(settings.reducePalette),
      transparent: Boolean(settings.transparent),
    },
    extensions: {
      ...(empty.extensions || {}),
      migratedFrom: 1,
      legacyFontOptions: Array.isArray(v1.fontOptions) ? v1.fontOptions : undefined,
      legacySettings: {
        fit: settings.fit,
        scale: Number(settings.scale ?? 100),
        x: Number(settings.x ?? 0),
        y: Number(settings.y ?? 0),
        rotation: Number(settings.rotation ?? 0),
        opacity: Number(settings.opacity ?? 100),
        anchorX: Number(settings.anchorX ?? 50),
        anchorY: Number(settings.anchorY ?? 50),
        imageFilters: Array.isArray(settings.imageFilters) ? settings.imageFilters : [],
      },
    },
  }

  const validated = validateProjectV2(project)
  if (!validated.ok) {
    throw new StudioError('PROJECT_MIGRATION_FAILED', 'Migrated project failed validation', {
      details: { errors: validated.errors, warnings },
    })
  }

  return { project: validated.project, backup, warnings, notes }
}
