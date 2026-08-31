export { StudioError, STUDIO_ERROR_CODES, studioError } from './errors/studio-error.js'
export {
  setFeatureFlags,
  resetFeatureFlags,
  isFeatureEnabled,
  getFeatureFlags,
} from './feature-flags.js'
export { createEmptyProjectV2 } from './project/create-empty-v2.js'
export { validateProjectV2, assertValidProjectV2, ProjectV2Zod } from './project/validate-project.js'
export { migrateV1ToV2, cloneV1Snapshot } from './project/migrate-v1-to-v2.js'
export { checkProjectInvariants, assertProjectInvariants } from './project/invariants.js'
export { projectRevision, fingerprintString, stableStringify } from './project/revision.js'
export {
  flattenLayerOrder,
  partitionRedactionLast,
  collectAllLayerIds,
  layerZIndex,
  reorderRootLayers,
} from './layers/layer-order.js'
export { migrateLayersFromV1 } from './layers/migrate-layers.js'
export { applyElementsToProjectV2, applyOverlaysToProjectV2, applyTextLayersToProjectV2, elementToV2Layer, overlayToV2Layer, textToV2Layer } from './layers/apply-elements-to-v2.js'
export { buildUnifiedLayerList } from './layers/unified-layer-list.js'
export { projectToEditorView, layerToCutoutElement } from './project/project-to-editor-view.js'
