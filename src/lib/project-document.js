/**
 * Studio project document — durable format is always Project V2.
 */
import { createEmptyProjectV2 } from '../domain/project/create-empty-v2.js'
import { cloneV1Snapshot } from '../domain/project/migrate-v1-to-v2.js'
export { migrateV1ToV2 } from '../domain/project/migrate-v1-to-v2.js'
export { createEmptyProjectV2 } from '../domain/project/create-empty-v2.js'
export { createEmptyEditorSession, createLegacyImportFixture, IMAGE_EDITS_DEFAULT, CENSOR_DEFAULT, PARALLAX_DEFAULT } from './editor-session.js'

export const PROJECT_SCHEMA_VERSION = 2

/**
 * Serialize durable project for save/export.
 */
export function serializeProject(project, { includeBlobs = false } = {}) {
  const doc = project?.schemaVersion === 2
    ? project
    : createEmptyProjectV2({
        name: project?.metadata?.name || project?.name,
        width: project?.canvas?.width || project?.settings?.width,
        height: project?.canvas?.height || project?.settings?.height,
      })

  let clone
  try {
    clone = typeof structuredClone === 'function'
      ? structuredClone(doc)
      : JSON.parse(JSON.stringify(doc))
  } catch {
    clone = cloneV1Snapshot(doc)
  }

  const updatedAt = new Date().toISOString()
  clone.metadata = {
    ...clone.metadata,
    updatedAt,
    createdAt: clone.metadata?.createdAt || updatedAt,
  }

  if (!includeBlobs && clone.extensions?.editorSession?.source?.url?.startsWith?.('blob:')) {
    clone.extensions.editorSession.source = {
      ...clone.extensions.editorSession.source,
      url: null,
    }
  }

  return clone
}

/**
 * Parse saved JSON. Returns V2 as-is, or legacy import shape for migrate-on-load.
 */
export function projectFromJson(raw) {
  if (!raw || typeof raw !== 'object') return createEmptyProjectV2()
  if (raw.schemaVersion === 2) return raw
  // Legacy import document — handled by loadProjectPair → migrateV1ToV2
  return raw
}
