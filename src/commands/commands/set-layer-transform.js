/**
 * Example command: set a layer's transform (coalesces during drag).
 */

/**
 * @param {{ layerId: string, transform: object, coalesceKey?: string }} args
 */
export function createSetLayerTransformCommand(args) {
  const { layerId, transform, coalesceKey } = args
  return {
    id: `set-layer-transform:${layerId}`,
    label: 'Set layer transform',
    coalesceKey: coalesceKey || `transform:${layerId}`,
    /**
     * @param {object} document
     */
    execute(document) {
      const layer = document.layers?.[layerId]
      if (!layer) {
        return {
          document,
          inverse: createSetLayerTransformCommand({ layerId, transform: {}, coalesceKey }),
        }
      }
      const prev = { ...(layer.transform || {}) }
      const nextLayers = {
        ...document.layers,
        [layerId]: {
          ...layer,
          transform: { ...prev, ...transform },
        },
      }
      const nextDoc = {
        ...document,
        layers: nextLayers,
        metadata: {
          ...document.metadata,
          updatedAt: new Date().toISOString(),
        },
      }
      return {
        document: nextDoc,
        inverse: createSetLayerTransformCommand({
          layerId,
          transform: prev,
          coalesceKey,
        }),
      }
    },
  }
}
