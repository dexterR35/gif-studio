/**
 * Patch Project V2 from editor cutout / overlay / text arrays (authoritative write path).
 * Each apply* preserves other layer kinds already on V2.
 */

import { defaultCutoutMotion } from '../timeline/procedural-motion.js'

function identityTransform(overrides = {}) {
  return {
    x: 0,
    y: 0,
    scaleX: 1,
    scaleY: 1,
    rotationDeg: 0,
    anchorX: 0.5,
    anchorY: 0.5,
    flipX: false,
    flipY: false,
    ...overrides,
  }
}

function opacity01(value) {
  if (value == null) return 1
  const n = Number(value)
  if (!Number.isFinite(n)) return 1
  return n > 1 ? n / 100 : n
}

function ensureAsset(assets, layer) {
  const assetId = layer.assetId
  if (!assetId || assets[assetId]) return assets
  return {
    ...assets,
    [assetId]: {
      id: assetId,
      kind: 'image',
      mimeType: 'image/png',
      checksumSha256: 'pending',
      byteLength: 0,
      storageKey: `session:${assetId}`,
    },
  }
}

function stamp(projectV2, layers, assets, rootLayerIds) {
  return {
    ...projectV2,
    layers,
    assets,
    rootLayerIds,
    metadata: {
      ...projectV2.metadata,
      updatedAt: new Date().toISOString(),
    },
  }
}

/**
 * Rebuild rootLayerIds for one managed kind without scrambling other kinds.
 * @param {object} projectV2
 * @param {Record<string, object>} layers
 * @param {string[]} nextIds
 * @param {(layer: object) => boolean} isManaged
 * @param {'element'|'overlay'|'text'} kind
 */
function rebuildRoots(projectV2, layers, nextIds, isManaged, kind) {
  const prev = Array.isArray(projectV2.rootLayerIds) ? projectV2.rootLayerIds : []
  const without = []
  let insertAt = -1
  for (const id of prev) {
    const layer = layers[id]
    if (!layer) continue
    if (isManaged(layer)) {
      if (insertAt < 0) insertAt = without.length
      continue
    }
    without.push(id)
  }

  if (insertAt < 0) {
    const bg = without.indexOf('layer-background')
    if (kind === 'element') {
      insertAt = bg >= 0 ? bg + 1 : 0
    } else if (kind === 'overlay') {
      let last = bg >= 0 ? bg : -1
      without.forEach((id, i) => {
        if (isElementLayer(layers[id])) last = i
      })
      insertAt = last + 1
    } else if (kind === 'text') {
      let last = bg >= 0 ? bg : -1
      without.forEach((id, i) => {
        if (isElementLayer(layers[id]) || isOverlayLayer(layers[id])) last = i
      })
      insertAt = last + 1
    } else {
      insertAt = without.length
    }
  }

  const managed = nextIds.filter((id) => layers[id])
  const rootLayerIds = [
    ...without.slice(0, insertAt),
    ...managed,
    ...without.slice(insertAt),
  ]

  const seen = new Set()
  const deduped = []
  for (const id of rootLayerIds) {
    if (seen.has(id) || !layers[id]) continue
    seen.add(id)
    deduped.push(id)
  }
  for (const id of Object.keys(layers)) {
    if (!seen.has(id)) {
      seen.add(id)
      deduped.push(id)
    }
  }
  return deduped
}

export function isElementLayer(layer) {
  if (!layer || layer.type !== 'raster') return false
  if (layer.id === 'layer-background') return false
  if (layer.rollbackAssetId) return false
  if (layer.mediaMapping?.legacyKind === 'overlay') return false
  if (layer.mediaMapping?.legacyKind === 'element') return true
  if (layer.mediaMapping?.kind === 'cutout-rect') return true
  if (layer.mediaMapping?.legacyKind === 'enhanced') return false
  return !String(layer.name || '').match(/^Overlay/i)
}

export function isOverlayLayer(layer) {
  if (!layer || layer.type !== 'raster') return false
  if (layer.id === 'layer-background') return false
  if (layer.rollbackAssetId) return false
  if (layer.mediaMapping?.legacyKind === 'overlay') return true
  if (layer.mediaMapping?.kind === 'overlay') return true
  return /^Overlay/i.test(layer.name || '')
}

export function isTextLayer(layer) {
  return Boolean(layer && layer.type === 'text')
}

/**
 * @param {object} el
 * @param {object} [prevLayer]
 */
export function elementToV2Layer(el, prevLayer = null) {
  const id = el.id
  const assetId = prevLayer?.assetId || `asset-${id}`
  const anchorX = el.anchorX != null ? Number(el.anchorX) / 100 : (prevLayer?.transform?.anchorX ?? 0.5)
  const anchorY = el.anchorY != null ? Number(el.anchorY) / 100 : (prevLayer?.transform?.anchorY ?? 0.5)

  return {
    ...(prevLayer || {}),
    id,
    name: el.name || prevLayer?.name || 'Cutout',
    visible: el.visible !== false,
    locked: Boolean(el.locked),
    opacity: opacity01(el.opacity),
    blendMode: prevLayer?.blendMode || 'source-over',
    transform: identityTransform({
      x: Number(el.x) || 0,
      y: Number(el.y) || 0,
      scaleX: (Number(el.scaleX) || 100) / 100,
      scaleY: (Number(el.scaleY) || 100) / 100,
      rotationDeg: Number(el.rotation) || 0,
      anchorX,
      anchorY,
      flipX: Boolean(el.flipX),
      flipY: Boolean(el.flipY),
    }),
    effects: prevLayer?.effects || [],
    animationTrackIds: prevLayer?.animationTrackIds || [],
    type: 'raster',
    assetId,
    cutoutMotion: el.motion || prevLayer?.cutoutMotion || defaultCutoutMotion(),
    mediaMapping: {
      kind: 'cutout-rect',
      legacyKind: 'element',
      x: Number(el.x) || 0,
      y: Number(el.y) || 0,
      w: Number(el.w) || 0,
      h: Number(el.h) || 0,
      amplitude: el.amplitude != null ? Number(el.amplitude) : 5,
      speed: el.speed != null ? Number(el.speed) : 1,
      depth: el.depth != null ? Number(el.depth) : 50,
      anchorX: el.anchorX != null ? Number(el.anchorX) : 50,
      anchorY: el.anchorY != null ? Number(el.anchorY) : 50,
      cutoutMode: el.cutoutMode,
      engine: el.engine,
      smart: el.smart,
      poseJoints: el.poseJoints || null,
    },
  }
}

/**
 * @param {object} ov
 * @param {object} [prevLayer]
 */
export function overlayToV2Layer(ov, prevLayer = null) {
  const id = ov.id
  const assetId = prevLayer?.assetId || `asset-${id}`
  const scale = ov.scale != null ? Number(ov.scale) : 100
  return {
    ...(prevLayer || {}),
    id,
    name: ov.name || prevLayer?.name || 'Overlay',
    visible: ov.visible !== false,
    locked: Boolean(ov.locked),
    opacity: opacity01(ov.opacity),
    blendMode: prevLayer?.blendMode || 'source-over',
    transform: identityTransform({
      x: Number(ov.x) || 0,
      y: Number(ov.y) || 0,
      scaleX: scale / 100,
      scaleY: scale / 100,
      rotationDeg: Number(ov.rotation) || 0,
    }),
    effects: prevLayer?.effects || [],
    animationTrackIds: prevLayer?.animationTrackIds || [],
    type: 'raster',
    assetId,
    mediaMapping: {
      kind: 'overlay',
      legacyKind: 'overlay',
      x: Number(ov.x) || 0,
      y: Number(ov.y) || 0,
      scale,
      // Durable URL only when not a blob session URL
      url: ov.url && !String(ov.url).startsWith('blob:') ? ov.url : null,
    },
  }
}

/**
 * @param {object} tl
 * @param {object} [prevLayer]
 */
export function textToV2Layer(tl, prevLayer = null) {
  const id = tl.id
  return {
    ...(prevLayer || {}),
    id,
    name: tl.name || prevLayer?.name || 'Text',
    visible: tl.visible !== false,
    locked: Boolean(tl.locked),
    opacity: opacity01(tl.opacity),
    blendMode: tl.blendMode || prevLayer?.blendMode || 'source-over',
    transform: identityTransform({
      x: Number(tl.x) || 50,
      y: Number(tl.y) || 50,
      scaleX: (Number(tl.scaleX) || 100) / 100,
      scaleY: (Number(tl.scaleY) || 100) / 100,
      rotationDeg: Number(tl.rotation) || 0,
      flipX: Boolean(tl.flipX),
      flipY: Boolean(tl.flipY),
    }),
    effects: prevLayer?.effects || [],
    animationTrackIds: prevLayer?.animationTrackIds || [],
    type: 'text',
    text: String(tl.text ?? ''),
    style: {
      font: tl.font || 'Arial',
      size: Number(tl.size) || 72,
      weight: Number(tl.weight) || 700,
      italic: Boolean(tl.italic),
      align: tl.align || 'center',
      color: tl.color || '#ffffff',
      strokeColor: tl.strokeColor || '#000000',
      strokeWidth: Number(tl.strokeWidth) || 0,
      letterSpacing: Number(tl.letterSpacing) || 0,
      lineHeight: Number(tl.lineHeight) || 1.1,
    },
  }
}

/**
 * @param {object | null} projectV2
 * @param {object[]} elements
 */
export function applyElementsToProjectV2(projectV2, elements) {
  if (!projectV2 || projectV2.schemaVersion !== 2) return projectV2

  const layers = { ...(projectV2.layers || {}) }
  let assets = { ...(projectV2.assets || {}) }
  const nextIds = (elements || []).map((el) => el?.id).filter(Boolean)
  const nextSet = new Set(nextIds)

  for (const [id, layer] of Object.entries(layers)) {
    if (isElementLayer(layer) && !nextSet.has(id)) delete layers[id]
  }

  for (const el of elements || []) {
    if (!el?.id) continue
    const layer = elementToV2Layer(el, layers[el.id] || null)
    layers[el.id] = layer
    assets = ensureAsset(assets, layer)
  }

  return stamp(
    projectV2,
    layers,
    assets,
    rebuildRoots(projectV2, layers, nextIds, isElementLayer, 'element'),
  )
}

/**
 * @param {object | null} projectV2
 * @param {object[]} overlays
 */
export function applyOverlaysToProjectV2(projectV2, overlays) {
  if (!projectV2 || projectV2.schemaVersion !== 2) return projectV2

  const layers = { ...(projectV2.layers || {}) }
  let assets = { ...(projectV2.assets || {}) }
  const nextIds = (overlays || []).map((ov) => ov?.id).filter(Boolean)
  const nextSet = new Set(nextIds)

  for (const [id, layer] of Object.entries(layers)) {
    if (isOverlayLayer(layer) && !nextSet.has(id)) delete layers[id]
  }

  for (const ov of overlays || []) {
    if (!ov?.id) continue
    const layer = overlayToV2Layer(ov, layers[ov.id] || null)
    layers[ov.id] = layer
    assets = ensureAsset(assets, layer)
  }

  return stamp(
    projectV2,
    layers,
    assets,
    rebuildRoots(projectV2, layers, nextIds, isOverlayLayer, 'overlay'),
  )
}

/**
 * @param {object | null} projectV2
 * @param {object[]} textLayers
 */
export function applyTextLayersToProjectV2(projectV2, textLayers) {
  if (!projectV2 || projectV2.schemaVersion !== 2) return projectV2

  const layers = { ...(projectV2.layers || {}) }
  const assets = { ...(projectV2.assets || {}) }
  const nextIds = (textLayers || []).map((tl) => tl?.id).filter(Boolean)
  const nextSet = new Set(nextIds)

  for (const [id, layer] of Object.entries(layers)) {
    if (isTextLayer(layer) && !nextSet.has(id)) delete layers[id]
  }

  for (const tl of textLayers || []) {
    if (!tl?.id) continue
    layers[tl.id] = textToV2Layer(tl, layers[tl.id] || null)
  }

  return stamp(
    projectV2,
    layers,
    assets,
    rebuildRoots(projectV2, layers, nextIds, isTextLayer, 'text'),
  )
}
