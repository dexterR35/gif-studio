/**
 * Build a UI-facing layer list from Project V2 document order (front = end of rootLayerIds).
 * Maps back to legacy V1 entity kinds for existing StudioProvider actions.
 */

import { flattenLayerOrder } from './layer-order.js'

/**
 * @param {object | null | undefined} projectV2
 * @param {{
 *   elements?: object[],
 *   overlays?: object[],
 *   textLayers?: object[],
 *   enhancedLayer?: object | null,
 * }} v1
 * @returns {Array<{
 *   id: string,
 *   v2Type: string,
 *   legacyKind: 'element'|'overlay'|'text'|'background'|'enhanced'|'pixelate'|'redaction'|'other',
 *   legacyId: string | null,
 *   name: string,
 *   visible: boolean,
 *   locked: boolean,
 *   subtitle: string,
 *   legacyEntity: object | null,
 * }>}
 */
export function buildUnifiedLayerList(projectV2, v1 = {}) {
  if (!projectV2 || projectV2.schemaVersion !== 2) return []

  const layers = projectV2.layers || {}
  const order = flattenLayerOrder(projectV2.rootLayerIds || [], layers)
  // Front of stack at top of panel (reverse of document bottom→top composite order)
  const frontFirst = [...order].reverse()

  const elementsById = Object.fromEntries((v1.elements || []).map((e) => [e.id, e]))
  const overlaysById = Object.fromEntries((v1.overlays || []).map((o) => [o.id, o]))
  const textById = Object.fromEntries((v1.textLayers || []).map((t) => [t.id, t]))

  return frontFirst.map((id) => {
    const layer = layers[id]
    if (!layer) {
      return {
        id,
        v2Type: 'missing',
        legacyKind: 'other',
        legacyId: null,
        name: id,
        visible: true,
        locked: false,
        subtitle: 'Missing',
        legacyEntity: null,
      }
    }

    const name = layer.name || id
    const visible = layer.visible !== false
    const locked = Boolean(layer.locked)

    if (layer.type === 'text') {
      const legacyId = id.replace(/^layer-text-/, '') || id
      const entity = textById[legacyId] || textById[id] || null
      return {
        id,
        v2Type: 'text',
        legacyKind: 'text',
        legacyId: entity?.id || legacyId,
        name: entity?.text || name,
        visible: entity ? entity.visible !== false : visible,
        locked: entity ? Boolean(entity.locked) : locked,
        subtitle: 'Text',
        legacyEntity: entity,
      }
    }

    if (layer.type === 'pixelate') {
      return {
        id,
        v2Type: 'pixelate',
        legacyKind: 'pixelate',
        legacyId: id,
        name,
        visible,
        locked,
        subtitle: 'Pixelate',
        legacyEntity: null,
      }
    }

    if (layer.type === 'redaction') {
      return {
        id,
        v2Type: 'redaction',
        legacyKind: 'redaction',
        legacyId: id,
        name,
        visible,
        locked,
        subtitle: 'Secure redact',
        legacyEntity: null,
      }
    }

    if (layer.type === 'raster') {
      if (id === 'layer-background' || layer.name === 'Background') {
        return {
          id,
          v2Type: 'raster',
          legacyKind: 'background',
          legacyId: null,
          name: 'Background',
          visible,
          locked,
          subtitle: locked ? 'Locked' : 'Base image',
          legacyEntity: null,
        }
      }
      if (layer.rollbackAssetId || /enhanced/i.test(layer.name || '')) {
        return {
          id,
          v2Type: 'raster',
          legacyKind: 'enhanced',
          legacyId: null,
          name: v1.enhancedLayer?.name || name || 'Enhanced',
          visible: v1.enhancedLayer ? v1.enhancedLayer.visible !== false : visible,
          locked,
          subtitle: v1.enhancedLayer
            ? `${v1.enhancedLayer.width}×${v1.enhancedLayer.height}`
            : 'Enhanced',
          legacyEntity: v1.enhancedLayer || null,
        }
      }

      // Cutout / element — migrate uses layer-element-<id> or similar
      const elId = id.replace(/^layer-element-/, '').replace(/^layer-/, '')
      const entity = elementsById[elId] || elementsById[id] || null
      if (entity) {
        return {
          id,
          v2Type: 'raster',
          legacyKind: 'element',
          legacyId: entity.id,
          name: entity.name || name,
          visible: entity.visible !== false,
          locked: Boolean(entity.locked),
          subtitle: entity.motion || 'None',
          legacyEntity: entity,
        }
      }

      const overlayId = id.replace(/^layer-overlay-/, '')
      const overlay = overlaysById[overlayId] || overlaysById[id] || null
      if (overlay) {
        return {
          id,
          v2Type: 'raster',
          legacyKind: 'overlay',
          legacyId: overlay.id,
          name: overlay.name || name,
          visible: overlay.visible !== false,
          locked: false,
          subtitle: 'Image',
          legacyEntity: overlay,
        }
      }

      return {
        id,
        v2Type: 'raster',
        legacyKind: 'other',
        legacyId: null,
        name,
        visible,
        locked,
        subtitle: 'Raster',
        legacyEntity: null,
      }
    }

    return {
      id,
      v2Type: layer.type || 'other',
      legacyKind: 'other',
      legacyId: null,
      name,
      visible,
      locked,
      subtitle: String(layer.type || 'Layer'),
      legacyEntity: null,
    }
  })
}
