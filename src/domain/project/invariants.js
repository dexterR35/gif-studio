import { StudioError } from '../errors/studio-error.js'

/**
 * Check layer/asset refs and graph acyclicity.
 * @param {object} project
 * @returns {{ ok: true } | { ok: false, errors: string[] }}
 */
export function checkProjectInvariants(project) {
  const errors = []
  if (!project || typeof project !== 'object') {
    return { ok: false, errors: ['project is not an object'] }
  }

  const layers = project.layers || {}
  const assets = project.assets || {}
  const rootLayerIds = project.rootLayerIds || []

  // Every root id exists
  for (const id of rootLayerIds) {
    if (!layers[id]) errors.push(`rootLayerIds references missing layer: ${id}`)
  }

  // No duplicate roots
  if (new Set(rootLayerIds).size !== rootLayerIds.length) {
    errors.push('rootLayerIds contains duplicates')
  }

  // Reachability + cycle detection via DFS on groups
  const visiting = new Set()
  const visited = new Set()

  function walk(id, path) {
    if (visiting.has(id)) {
      errors.push(`layer cycle detected: ${[...path, id].join(' → ')}`)
      return
    }
    if (visited.has(id)) return
    const layer = layers[id]
    if (!layer) {
      errors.push(`missing layer: ${id}`)
      return
    }
    visiting.add(id)
    if (layer.type === 'group') {
      const seenChildren = new Set()
      for (const childId of layer.childIds || []) {
        if (seenChildren.has(childId)) {
          errors.push(`group ${id} has duplicate child ${childId}`)
        }
        seenChildren.add(childId)
        walk(childId, [...path, id])
      }
    }
    visiting.delete(id)
    visited.add(id)
  }

  for (const id of rootLayerIds) walk(id, [])

  // Asset references
  for (const [id, layer] of Object.entries(layers)) {
    if (!layer) continue
    if (layer.type === 'raster') {
      if (!layer.assetId) errors.push(`raster layer ${id} missing assetId`)
      else if (!assets[layer.assetId]) {
        errors.push(`layer ${id} references missing asset ${layer.assetId}`)
      }
      if (layer.rollbackAssetId && !assets[layer.rollbackAssetId]) {
        errors.push(`layer ${id} references missing rollbackAssetId ${layer.rollbackAssetId}`)
      }
      if (layer.maskAssetId && !assets[layer.maskAssetId]) {
        errors.push(`layer ${id} references missing maskAssetId ${layer.maskAssetId}`)
      }
    }
    if (layer.type === 'text' && layer.fontAssetId && !assets[layer.fontAssetId]) {
      errors.push(`text layer ${id} references missing fontAssetId ${layer.fontAssetId}`)
    }
    if (layer.type === 'redaction' && layer.secure !== true) {
      errors.push(`redaction layer ${id} must have secure: true`)
    }
  }

  // Timeline targets
  const timeline = project.timeline || {}
  for (const trackId of timeline.trackOrder || []) {
    const track = timeline.tracks?.[trackId]
    if (!track) {
      errors.push(`trackOrder references missing track ${trackId}`)
      continue
    }
    const lid = track.target?.layerId
    if (lid && !layers[lid]) {
      errors.push(`track ${trackId} targets missing layer ${lid}`)
    }
    if (!Number.isInteger(timeline.durationUs) && timeline.durationUs != null) {
      // duration checked once below
    }
  }
  if (timeline.durationUs != null && !Number.isInteger(timeline.durationUs)) {
    errors.push('timeline.durationUs must be an integer (microseconds)')
  }

  // Orphan warning as soft error for strict mode
  for (const id of Object.keys(layers)) {
    if (!visited.has(id) && !rootLayerIds.includes(id)) {
      // Orphans that aren't reachable from roots — invalid for strict graph
      let parented = false
      for (const L of Object.values(layers)) {
        if (L?.type === 'group' && (L.childIds || []).includes(id)) {
          parented = true
          break
        }
      }
      if (!parented) errors.push(`orphan layer not in scene graph: ${id}`)
    }
  }

  return errors.length ? { ok: false, errors } : { ok: true }
}

/**
 * @param {object} project
 * @throws {StudioError}
 */
export function assertProjectInvariants(project) {
  const result = checkProjectInvariants(project)
  if (!result.ok) {
    throw new StudioError('PROJECT_VALIDATION_FAILED', 'Project invariants failed', {
      details: { errors: result.errors },
    })
  }
}
