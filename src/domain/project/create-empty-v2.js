function newId(prefix) {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`
  }
  return `${prefix}-${Date.now().toString(36)}`
}

/**
 * Create an empty ProjectDocumentV2 (schemaVersion 2).
 * @param {{ name?: string, width?: number, height?: number, appVersion?: string }} [opts]
 */
export function createEmptyProjectV2(opts = {}) {
  const now = new Date().toISOString()
  const id = opts.id || newId('project')
  const width = opts.width ?? 480
  const height = opts.height ?? 300

  return {
    schemaVersion: 2,
    id,
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
    exportSettings: {
      format: 'png',
      reducePalette: false,
      transparent: Boolean(opts.transparent),
    },
    extensions: {},
  }
}
