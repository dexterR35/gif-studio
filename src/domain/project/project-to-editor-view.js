/**
 * Project V2 → runtime editor session (arrays + settings for Konva / StudioProvider).
 */

import { createEmptyEditorSession } from '../../lib/editor-session.js'
import { TEXT_DEFAULT } from '../../lib/presets.js'
import { flattenLayerOrder } from '../layers/layer-order.js'

function scalePercent(value, fallback = 100) {
  if (value == null || !Number.isFinite(Number(value))) return fallback
  const n = Number(value)
  return n > 0 && n <= 4 ? Math.round(n * 100) : Math.round(n)
}

function opacityPercent(value) {
  if (value == null || !Number.isFinite(Number(value))) return 100
  const n = Number(value)
  return n <= 1 ? Math.round(n * 100) : Math.round(n)
}

function isBackgroundLayer(id, layer) {
  return id === 'layer-background' || layer?.name === 'Background'
}

function isEnhancedLayer(layer) {
  return Boolean(layer?.rollbackAssetId) || /enhanced/i.test(layer?.name || '')
}

function isOverlayLayer(layer) {
  return layer?.mediaMapping?.kind === 'overlay' || layer?.mediaMapping?.layerKind === 'overlay'
    || /^Overlay/i.test(layer?.name || '')
}

/**
 * @param {object} layer
 */
export function layerToCutoutElement(layer) {
  const mm = layer.mediaMapping || {}
  const t = layer.transform || {}
  const sourceRect = mm.sourceRect || {
    x: mm.x != null ? Number(mm.x) : Number(t.x) || 0,
    y: mm.y != null ? Number(mm.y) : Number(t.y) || 0,
    w: mm.w != null ? Number(mm.w) : 0,
    h: mm.h != null ? Number(mm.h) : 0,
  }
  return {
    id: layer.id,
    name: layer.name || 'Cutout',
    x: mm.x != null ? Number(mm.x) : Number(t.x) || 0,
    y: mm.y != null ? Number(mm.y) : Number(t.y) || 0,
    w: mm.w != null ? Number(mm.w) : 0,
    h: mm.h != null ? Number(mm.h) : 0,
    sourceRect: {
      x: Number(sourceRect.x) || 0,
      y: Number(sourceRect.y) || 0,
      w: Number(sourceRect.w) || 0,
      h: Number(sourceRect.h) || 0,
    },
    rotation: Number(t.rotationDeg) || 0,
    scaleX: scalePercent(t.scaleX, 100),
    scaleY: scalePercent(t.scaleY, 100),
    flipX: Boolean(t.flipX),
    flipY: Boolean(t.flipY),
    opacity: opacityPercent(layer.opacity),
    anchorX: mm.anchorX != null ? Number(mm.anchorX) : Math.round((Number(t.anchorX) || 0.5) * 100),
    anchorY: mm.anchorY != null ? Number(mm.anchorY) : Math.round((Number(t.anchorY) || 0.5) * 100),
    visible: layer.visible !== false,
    locked: Boolean(layer.locked),
    cutoutMode: mm.cutoutMode,
    engine: mm.engine,
    smart: mm.smart,
  }
}

/**
 * @param {object | null | undefined} project
 * @param {{
 *   previousEditor?: object | null,
 *   registry?: { attachToElements?: Function, attachToOverlays?: Function, getOverlay?: Function } | null,
 * }} [opts]
 */
export function projectToEditorView(project, opts = {}) {
  const empty = createEmptyEditorSession()
  const previous = opts.previousEditor && typeof opts.previousEditor === 'object'
    ? opts.previousEditor
    : empty

  if (!project || project.schemaVersion !== 2) {
    return previous
  }

  const layers = project.layers || {}
  const order = flattenLayerOrder(project.rootLayerIds || [], layers)

  const elements = []
  const overlays = []
  const textLayers = []
  let enhancedLayer = previous.enhancedLayer || null

  for (const id of order) {
    const layer = layers[id]
    if (!layer) continue

    if (layer.type === 'text') {
      const t = layer.transform || {}
      const style = layer.style || {}
      textLayers.push({
        ...TEXT_DEFAULT,
        id: layer.id,
        name: layer.name || 'Text',
        text: String(layer.text ?? ''),
        font: style.font || 'Arial',
        size: Number(style.size) || 72,
        weight: Number(style.weight) || 700,
        italic: Boolean(style.italic),
        align: style.align || 'center',
        color: style.color || '#ffffff',
        strokeColor: style.strokeColor || '#000000',
        strokeWidth: Number(style.strokeWidth) || 0,
        letterSpacing: Number(style.letterSpacing) || 0,
        lineHeight: Number(style.lineHeight) || 1.1,
        boxWidth: style.boxWidth != null ? Number(style.boxWidth) : null,
        shadowColor: style.shadowColor || '#000000',
        shadowBlur: Number(style.shadowBlur) || 0,
        shadowX: Number(style.shadowX) || 0,
        shadowY: Number(style.shadowY) || 0,
        decoration: style.decoration || 'None',
        casing: style.casing || 'As typed',
        x: Number(t.x) || 50,
        y: Number(t.y) || 50,
        scaleX: scalePercent(t.scaleX, 100),
        scaleY: scalePercent(t.scaleY, 100),
        rotation: Number(t.rotationDeg) || 0,
        flipX: Boolean(t.flipX),
        flipY: Boolean(t.flipY),
        opacity: opacityPercent(layer.opacity),
        visible: layer.visible !== false,
        locked: Boolean(layer.locked),
        blendMode: layer.blendMode || 'source-over',
      })
      continue
    }

    // Drop legacy pixelate / censor layers — feature removed.
    if (layer.type === 'pixelate') continue

    if (layer.type !== 'raster') continue

    if (isBackgroundLayer(id, layer)) continue

    if (isEnhancedLayer(layer)) {
      enhancedLayer = previous.enhancedLayer || {
        name: layer.name || 'Enhanced',
        visible: layer.visible !== false,
        width: undefined,
        height: undefined,
      }
      continue
    }

    if (isOverlayLayer(layer)) {
      const t = layer.transform || {}
      const mm = layer.mediaMapping || {}
      const prev = (previous.overlays || []).find((o) => o.id === layer.id)
      const runtime = opts.registry?.getOverlay?.(layer.id)
      overlays.push({
        id: layer.id,
        name: layer.name || 'Overlay',
        url: runtime?.url || prev?.url || mm.url || null,
        image: runtime?.image || prev?.image,
        x: mm.x != null ? Number(mm.x) : Number(t.x) || 0,
        y: mm.y != null ? Number(mm.y) : Number(t.y) || 0,
        scale: mm.scale != null ? Number(mm.scale) : scalePercent(t.scaleX, 100),
        width: mm.width != null ? Number(mm.width) : 30,
        scaleX: scalePercent(t.scaleX, 100),
        scaleY: scalePercent(t.scaleY, 100),
        rotation: Number(t.rotationDeg) || 0,
        flipX: Boolean(t.flipX),
        flipY: Boolean(t.flipY),
        anchorX: Math.round((Number(t.anchorX) || 0.5) * 100),
        anchorY: Math.round((Number(t.anchorY) || 0.5) * 100),
        opacity: opacityPercent(layer.opacity),
        visible: layer.visible !== false,
        locked: Boolean(layer.locked),
      })
      continue
    }

    elements.push(layerToCutoutElement(layer))
  }

  const canvas = project.canvas || {}
  const exportSettings = project.exportSettings || {}
  const legacySettings = project.extensions?.legacySettings || {}
  const previousSettings = previous.settings || {}

  const settings = {
    ...empty.settings,
    width: Number(canvas.width) || previousSettings.width || 480,
    height: Number(canvas.height) || previousSettings.height || 300,
    fit: legacySettings.fit || previousSettings.fit || empty.settings.fit,
    scale: Number(legacySettings.scale ?? previousSettings.scale ?? 100),
    x: Number(legacySettings.x ?? previousSettings.x ?? 0),
    y: Number(legacySettings.y ?? previousSettings.y ?? 0),
    rotation: Number(legacySettings.rotation ?? previousSettings.rotation ?? 0),
    opacity: Number(legacySettings.opacity ?? previousSettings.opacity ?? 100),
    anchorX: Number(legacySettings.anchorX ?? previousSettings.anchorX ?? 50),
    anchorY: Number(legacySettings.anchorY ?? previousSettings.anchorY ?? 50),
    imageFilters: legacySettings.imageFilters || previousSettings.imageFilters || [],
    reducePalette: Boolean(exportSettings.reducePalette ?? previousSettings.reducePalette),
    transparent: Boolean(
      exportSettings.transparent ?? (canvas.background?.kind === 'transparent'),
    ),
    background: canvas.background?.kind === 'solid'
      ? (canvas.background.color || '#111114')
      : (previousSettings.background || '#111114'),
  }

  let projectedElements = elements
  if (opts.registry?.attachToElements) {
    projectedElements = opts.registry.attachToElements(elements)
  } else {
    const prevById = Object.fromEntries((previous.elements || []).map((e) => [e.id, e]))
    projectedElements = elements.map((el) => {
      const prev = prevById[el.id]
      if (!prev) return el
      return {
        ...el,
        bitmap: prev.bitmap,
        sourceBitmap: prev.sourceBitmap,
        maskCanvas: prev.maskCanvas,
        cleanup: prev.cleanup,
      }
    })
  }

  const prevOverlaysById = Object.fromEntries((previous.overlays || []).map((o) => [o.id, o]))
  let mergedOverlays = overlays.map((ov) => {
    const prev = prevOverlaysById[ov.id]
    return prev ? { ...prev, ...ov, url: ov.url || prev.url, image: ov.image || prev.image } : ov
  })
  if (opts.registry?.attachToOverlays) {
    mergedOverlays = opts.registry.attachToOverlays(mergedOverlays)
  }

  return {
    ...empty,
    ...previous,
    id: project.id || previous.id,
    name: project.metadata?.name || previous.name || 'Untitled',
    createdAt: project.metadata?.createdAt || previous.createdAt,
    updatedAt: project.metadata?.updatedAt || previous.updatedAt,
    settings,
    source: previous.source || null,
    elements: projectedElements,
    overlays: mergedOverlays,
    textLayers,
    enhancedLayer,
    fontOptions: project.extensions?.legacyFontOptions || previous.fontOptions || empty.fontOptions,
  }
}
