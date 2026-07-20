/**
 * rootLayerIds traversal helpers for the unified scene graph.
 */

/**
 * Depth-first flatten of layer IDs (document/composite order).
 * Groups expand to children; redaction layers are included where they appear.
 *
 * @param {string[]} rootLayerIds
 * @param {Record<string, object>} layers
 * @returns {string[]}
 */
export function flattenLayerOrder(rootLayerIds, layers) {
  const out = []
  const visited = new Set()

  function walk(ids) {
    for (const id of ids || []) {
      if (visited.has(id)) continue
      visited.add(id)
      const layer = layers?.[id]
      if (!layer) continue
      if (layer.type === 'group' && Array.isArray(layer.childIds)) {
        walk(layer.childIds)
      } else {
        out.push(id)
      }
    }
  }

  walk(rootLayerIds)
  return out
}

/**
 * Partition flattened order into normal layers vs secure redaction (last pass).
 * @param {string[]} rootLayerIds
 * @param {Record<string, object>} layers
 * @returns {{ sceneIds: string[], redactionIds: string[] }}
 */
export function partitionRedactionLast(rootLayerIds, layers) {
  const flat = flattenLayerOrder(rootLayerIds, layers)
  const sceneIds = []
  const redactionIds = []
  for (const id of flat) {
    const layer = layers[id]
    if (layer?.type === 'redaction' && layer.secure === true) {
      redactionIds.push(id)
    } else {
      sceneIds.push(id)
    }
  }
  return { sceneIds, redactionIds }
}

/**
 * @param {string[]} rootLayerIds
 * @param {Record<string, object>} layers
 * @returns {string[]}
 */
export function collectAllLayerIds(rootLayerIds, layers) {
  const ids = new Set()
  function walk(list) {
    for (const id of list || []) {
      if (ids.has(id)) continue
      ids.add(id)
      const layer = layers?.[id]
      if (layer?.type === 'group' && Array.isArray(layer.childIds)) {
        walk(layer.childIds)
      }
    }
  }
  walk(rootLayerIds)
  // Also include orphan keys for diagnostics (caller may filter)
  for (const id of Object.keys(layers || {})) ids.add(id)
  return [...ids]
}

/**
 * Index of a layer in document composite order, or -1.
 * @param {string} layerId
 * @param {string[]} rootLayerIds
 * @param {Record<string, object>} layers
 */
export function layerZIndex(layerId, rootLayerIds, layers) {
  return flattenLayerOrder(rootLayerIds, layers).indexOf(layerId)
}

/**
 * Move layerId to a new index within rootLayerIds (non-grouped roots only).
 * @param {string[]} rootLayerIds
 * @param {string} layerId
 * @param {number} toIndex
 * @returns {string[]}
 */
export function reorderRootLayers(rootLayerIds, layerId, toIndex) {
  const next = [...(rootLayerIds || [])]
  const from = next.indexOf(layerId)
  if (from < 0) return next
  next.splice(from, 1)
  const clamped = Math.max(0, Math.min(next.length, toIndex))
  next.splice(clamped, 0, layerId)
  return next
}
