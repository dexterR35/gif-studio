import { unifyEffectNodes } from '../effects/effect-nodes.js'
import { defaultCutoutMotion } from '../timeline/procedural-motion.js'
import { msToUs } from '../timeline/time.js'

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

function visualCommon(id, name, extras = {}) {
  return {
    id,
    name,
    visible: extras.visible !== false,
    locked: Boolean(extras.locked),
    opacity: extras.opacity ?? 1,
    blendMode: extras.blendMode || 'source-over',
    transform: extras.transform || identityTransform(),
    effects: extras.effects || [],
    animationTrackIds: extras.animationTrackIds || [],
  }
}

/**
 * Migrate V1 elements / overlays / textLayers (+ optional source, censor, enhanced)
 * into layers map + rootLayerIds.
 *
 * Enhanced (MEGA): replace semantics — if enhancedLayer exists, background uses
 * enhanced assetId and rollbackAssetId points at original source asset.
 *
 * @param {object} v1
 * @param {{ assets?: Record<string, object> }} [ctx]
 * @returns {{ layers: Record<string, object>, rootLayerIds: string[], assets: Record<string, object> }}
 */
export function migrateLayersFromV1(v1, ctx = {}) {
  const layers = {}
  const rootLayerIds = []
  const assets = { ...(ctx.assets || {}) }
  let assetSeq = Object.keys(assets).length

  function ensureAssetFromUrl(url, kind, meta = {}) {
    if (!url || String(url).startsWith('blob:')) {
      return null
    }
    assetSeq += 1
    const id = meta.id || `asset-migrated-${assetSeq}`
    if (!assets[id]) {
      assets[id] = {
        id,
        kind: kind || 'image',
        mimeType: meta.mimeType || 'application/octet-stream',
        checksumSha256: meta.checksumSha256 || 'pending',
        byteLength: meta.byteLength ?? 0,
        width: meta.width,
        height: meta.height,
        frameCount: meta.frameCount,
        durationUs: meta.durationUs,
        storageKey: meta.storageKey || `migrated:${id}`,
      }
    }
    return id
  }

  // Background / source
  const source = v1?.source
  let sourceAssetId = null
  if (source && typeof source === 'object') {
    sourceAssetId = ensureAssetFromUrl(source.url || source.storageKey, source.animated ? 'animated-image' : 'image', {
      id: 'asset-source',
      mimeType: source.mimeType || (source.animated ? 'image/gif' : 'image/png'),
      width: source.width,
      height: source.height,
      frameCount: source.frameCount,
      durationUs: source.durationUs ?? (source.duration != null ? msToUs(source.duration * 1000) : undefined),
      storageKey: source.storageKey || 'migrated:source',
      checksumSha256: source.checksumSha256 || 'pending',
      byteLength: source.byteLength ?? 0,
    })
    // Blob / session imports have no durable URL — still need a Background layer in V2.
    if (!sourceAssetId) {
      sourceAssetId = 'asset-source'
      assets[sourceAssetId] = {
        id: sourceAssetId,
        kind: source.animated || source.kind === 'gif' ? 'animated-image' : 'image',
        mimeType: source.mimeType || (source.kind === 'gif' ? 'image/gif' : 'image/png'),
        checksumSha256: source.checksumSha256 || 'pending',
        byteLength: source.byteLength ?? 0,
        width: source.width,
        height: source.height,
        frameCount: source.frameCount,
        durationUs: source.durationUs ?? (source.duration != null ? msToUs(source.duration * 1000) : undefined),
        storageKey: source.storageKey || 'session:source',
      }
    }
  }

  // MEGA: enhanced = replace + rollback (not underlay)
  let activeAssetId = sourceAssetId
  let rollbackAssetId = undefined
  const enhanced = v1?.enhancedLayer
  if (enhanced && typeof enhanced === 'object') {
    const enhancedId = ensureAssetFromUrl(enhanced.url || enhanced.storageKey, 'image', {
      id: 'asset-enhanced',
      mimeType: enhanced.mimeType || 'image/png',
      width: enhanced.width,
      height: enhanced.height,
      storageKey: enhanced.storageKey || 'migrated:enhanced',
      checksumSha256: enhanced.checksumSha256 || 'pending',
      byteLength: enhanced.byteLength ?? 0,
    }) || 'asset-enhanced'
    if (!assets[enhancedId] && enhanced.storageKey) {
      assets[enhancedId] = {
        id: enhancedId,
        kind: 'image',
        mimeType: enhanced.mimeType || 'image/png',
        checksumSha256: enhanced.checksumSha256 || 'pending',
        byteLength: enhanced.byteLength ?? 0,
        width: enhanced.width,
        height: enhanced.height,
        storageKey: enhanced.storageKey,
        provenance: {
          sourceAssetIds: sourceAssetId ? [sourceAssetId] : [],
          operation: 'upscale',
          parametersHash: 'migrated',
          createdAt: new Date(0).toISOString(),
        },
      }
    }
    if (sourceAssetId) rollbackAssetId = sourceAssetId
    activeAssetId = enhancedId
  }

  const globalEffects = unifyEffectNodes(v1?.imageEdits, v1?.gifEffects)

  if (activeAssetId) {
    const bgId = 'layer-background'
    layers[bgId] = {
      ...visualCommon(bgId, 'Background', {
        locked: true,
        effects: globalEffects,
        transform: identityTransform({
          flipX: Boolean(v1?.imageEdits?.flipX),
          flipY: Boolean(v1?.imageEdits?.flipY),
        }),
      }),
      type: 'raster',
      assetId: activeAssetId,
      ...(rollbackAssetId ? { rollbackAssetId } : {}),
      cutoutMotion: defaultCutoutMotion(),
    }
    rootLayerIds.push(bgId)
  }

  // Cutout / sticker elements
  for (const el of v1?.elements || []) {
    if (!el || typeof el !== 'object') continue
    const id = el.id || `layer-element-${rootLayerIds.length + 1}`
    const assetId = ensureAssetFromUrl(el.url || el.cleanupUrl, 'image', {
      id: `asset-${id}`,
      storageKey: el.storageKey || `migrated:${id}`,
    }) || `asset-${id}`
    if (!assets[assetId]) {
      assets[assetId] = {
        id: assetId,
        kind: 'image',
        mimeType: 'image/png',
        checksumSha256: 'pending',
        byteLength: 0,
        storageKey: el.storageKey || `migrated:${id}`,
      }
    }
    layers[id] = {
      ...visualCommon(id, el.name || 'Cutout', {
        visible: el.visible !== false,
        locked: Boolean(el.locked),
        opacity: el.opacity != null ? Number(el.opacity) / (Number(el.opacity) > 1 ? 100 : 1) : 1,
        transform: identityTransform({
          x: Number(el.x) || 0,
          y: Number(el.y) || 0,
          scaleX: (Number(el.scaleX) || 100) / 100,
          scaleY: (Number(el.scaleY) || 100) / 100,
          rotationDeg: Number(el.rotation) || 0,
          flipX: Boolean(el.flipX),
          flipY: Boolean(el.flipY),
          anchorX: el.anchorX != null ? Number(el.anchorX) / 100 : 0.5,
          anchorY: el.anchorY != null ? Number(el.anchorY) / 100 : 0.5,
        }),
      }),
      type: 'raster',
      assetId,
      cutoutMotion: el.motion || defaultCutoutMotion(),
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
        effects: el.effects || null,
      },
    }
    rootLayerIds.push(id)
  }

  // Overlays
  for (const ov of v1?.overlays || []) {
    if (!ov || typeof ov !== 'object') continue
    const id = ov.id || `layer-overlay-${rootLayerIds.length + 1}`
    const assetId = ensureAssetFromUrl(ov.url, 'image', {
      id: `asset-${id}`,
      storageKey: ov.storageKey || `migrated:${id}`,
    }) || `asset-${id}`
    if (!assets[assetId]) {
      assets[assetId] = {
        id: assetId,
        kind: 'image',
        mimeType: 'image/png',
        checksumSha256: 'pending',
        byteLength: 0,
        storageKey: ov.storageKey || `migrated:${id}`,
      }
    }
    layers[id] = {
      ...visualCommon(id, ov.name || 'Overlay', {
        visible: ov.visible !== false,
        locked: Boolean(ov.locked),
        opacity: ov.opacity != null ? Number(ov.opacity) / (Number(ov.opacity) > 1 ? 100 : 1) : 1,
        transform: identityTransform({
          x: Number(ov.x) || 0,
          y: Number(ov.y) || 0,
          scaleX: (Number(ov.scale) || 100) / 100,
          scaleY: (Number(ov.scale) || 100) / 100,
          rotationDeg: Number(ov.rotation) || 0,
        }),
      }),
      type: 'raster',
      assetId,
      mediaMapping: {
        kind: 'overlay',
        legacyKind: 'overlay',
        x: Number(ov.x) || 0,
        y: Number(ov.y) || 0,
        scale: Number(ov.scale) || 100,
        url: ov.url && !String(ov.url).startsWith('blob:') ? ov.url : null,
      },
    }
    rootLayerIds.push(id)
  }

  // Text layers
  for (const tl of v1?.textLayers || []) {
    if (!tl || typeof tl !== 'object') continue
    const id = tl.id || `layer-text-${rootLayerIds.length + 1}`
    layers[id] = {
      ...visualCommon(id, tl.name || 'Text', {
        visible: tl.visible !== false,
        locked: Boolean(tl.locked),
        opacity: tl.opacity != null ? Number(tl.opacity) / (Number(tl.opacity) > 1 ? 100 : 1) : 1,
        blendMode: tl.blendMode || 'source-over',
        transform: identityTransform({
          x: Number(tl.x) || 50,
          y: Number(tl.y) || 50,
          scaleX: (Number(tl.scaleX) || 100) / 100,
          scaleY: (Number(tl.scaleY) || 100) / 100,
          rotationDeg: Number(tl.rotation) || 0,
          flipX: Boolean(tl.flipX),
          flipY: Boolean(tl.flipY),
        }),
      }),
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
    rootLayerIds.push(id)
  }

  // censor → pixelate (not secure redaction)
  const censor = v1?.censor
  if (censor?.enabled) {
    const id = 'layer-pixelate-censor'
    layers[id] = {
      ...visualCommon(id, 'Pixelate', { locked: false }),
      type: 'pixelate',
      region: {
        kind: 'rect',
        x: Number(censor.x) || 0,
        y: Number(censor.y) || 0,
        w: Number(censor.w) || 10,
        h: Number(censor.h) || 10,
      },
      pixelSize: Number(censor.pixelSize) || 14,
    }
    rootLayerIds.push(id)
  }

  return { layers, rootLayerIds, assets }
}
