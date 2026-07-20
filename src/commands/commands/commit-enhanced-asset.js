/**
 * Commit upscale/enhance: replace layer.assetId, keep original in rollbackAssetId.
 * MEGA overlay — not an invisible underlay.
 */

/**
 * @param {{
 *   layerId: string,
 *   enhancedAssetId: string,
 *   enhancedAsset?: object,
 * }} args
 */
export function createCommitEnhancedAssetCommand(args) {
  const { layerId, enhancedAssetId, enhancedAsset } = args

  return {
    id: `commit-enhanced:${layerId}`,
    label: 'Commit enhanced asset',
    /**
     * @param {object} document
     */
    execute(document) {
      const layer = document.layers?.[layerId]
      if (!layer || layer.type !== 'raster') {
        return {
          document,
          inverse: createRestoreRollbackAssetCommand({ layerId }),
        }
      }

      const previousAssetId = layer.assetId
      const previousRollback = layer.rollbackAssetId
      const assets = { ...document.assets }
      if (enhancedAsset) {
        assets[enhancedAssetId] = {
          ...enhancedAsset,
          id: enhancedAssetId,
          provenance: {
            sourceAssetIds: previousAssetId ? [previousAssetId] : [],
            operation: 'upscale',
            parametersHash: enhancedAsset.provenance?.parametersHash || 'commit',
            createdAt: enhancedAsset.provenance?.createdAt || new Date().toISOString(),
            ...(enhancedAsset.provenance || {}),
          },
        }
      }

      const nextLayer = {
        ...layer,
        assetId: enhancedAssetId,
        rollbackAssetId: previousAssetId,
      }

      const nextDoc = {
        ...document,
        assets,
        layers: { ...document.layers, [layerId]: nextLayer },
        metadata: {
          ...document.metadata,
          updatedAt: new Date().toISOString(),
        },
      }

      return {
        document: nextDoc,
        inverse: createRestoreRollbackAssetCommand({
          layerId,
          restoreAssetId: previousAssetId,
          restoreRollbackAssetId: previousRollback,
          removeAssetId: enhancedAsset ? enhancedAssetId : null,
        }),
        assetRefDelta: {
          retain: [enhancedAssetId, previousAssetId].filter(Boolean),
          release: [],
        },
      }
    },
  }
}

/**
 * Inverse: restore assetId from rollback (or explicit restore ids).
 * @param {{
 *   layerId: string,
 *   restoreAssetId?: string,
 *   restoreRollbackAssetId?: string,
 *   removeAssetId?: string|null,
 * }} args
 */
export function createRestoreRollbackAssetCommand(args) {
  const { layerId, restoreAssetId, restoreRollbackAssetId, removeAssetId } = args

  return {
    id: `restore-rollback:${layerId}`,
    label: 'Rollback enhanced asset',
    /**
     * @param {object} document
     */
    execute(document) {
      const layer = document.layers?.[layerId]
      if (!layer || layer.type !== 'raster') {
        return {
          document,
          inverse: createCommitEnhancedAssetCommand({
            layerId,
            enhancedAssetId: layer?.assetId || '',
          }),
        }
      }

      const currentAssetId = layer.assetId
      const fromRollback = restoreAssetId ?? layer.rollbackAssetId
      if (!fromRollback) {
        return {
          document,
          inverse: createCommitEnhancedAssetCommand({
            layerId,
            enhancedAssetId: currentAssetId,
          }),
        }
      }

      const assets = { ...document.assets }
      if (removeAssetId && assets[removeAssetId]) {
        delete assets[removeAssetId]
      }

      const nextLayer = { ...layer, assetId: fromRollback }
      if (restoreRollbackAssetId !== undefined) {
        if (restoreRollbackAssetId) nextLayer.rollbackAssetId = restoreRollbackAssetId
        else delete nextLayer.rollbackAssetId
      } else {
        delete nextLayer.rollbackAssetId
      }

      const nextDoc = {
        ...document,
        assets,
        layers: { ...document.layers, [layerId]: nextLayer },
        metadata: {
          ...document.metadata,
          updatedAt: new Date().toISOString(),
        },
      }

      return {
        document: nextDoc,
        inverse: createCommitEnhancedAssetCommand({
          layerId,
          enhancedAssetId: currentAssetId,
          enhancedAsset: document.assets?.[currentAssetId],
        }),
      }
    },
  }
}
