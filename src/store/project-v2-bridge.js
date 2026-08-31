/**
 * Project store bridge — durable document is always Project V2.
 * `editor` is a derived session view for Konva / StudioProvider.
 * Legacy saved files (schemaVersion 1) are migrated once on load.
 */

import { createEmptyProjectV2, migrateV1ToV2 } from '../domain/index.js'
import {
  applyElementsToProjectV2,
  applyOverlaysToProjectV2,
  applyTextLayersToProjectV2,
} from '../domain/layers/apply-elements-to-v2.js'
import { projectToEditorView } from '../domain/project/project-to-editor-view.js'
import { createEmptyEditorSession } from '../lib/editor-session.js'
import { layerBitmapRegistry } from '../runtime/layer-bitmap-registry.js'

export {
  projectToEditorView,
  applyElementsToProjectV2,
  applyOverlaysToProjectV2,
  applyTextLayersToProjectV2,
}

/**
 * @param {object | null | undefined} project
 * @param {object | null | undefined} [previousEditor]
 */
export function buildEditorView(project, previousEditor = null) {
  const previous = previousEditor && typeof previousEditor === 'object'
    ? previousEditor
    : createEmptyEditorSession()
  return projectToEditorView(project, {
    previousEditor: previous,
    registry: layerBitmapRegistry,
  })
}

/**
 * @param {object} project
 * @param {object} editor
 */
export function applyEditorSessionToV2(project, editor) {
  if (!project || project.schemaVersion !== 2) return project
  const settings = editor?.settings || {}
  const width = Number(settings.width) || project.canvas?.width || 480
  const height = Number(settings.height) || project.canvas?.height || 300

  return {
    ...project,
    id: editor?.id || project.id,
    metadata: {
      ...project.metadata,
      name: editor?.name || project.metadata?.name || 'Untitled',
      updatedAt: new Date().toISOString(),
      createdAt: editor?.createdAt || project.metadata?.createdAt,
    },
    canvas: {
      ...project.canvas,
      width,
      height,
      background: settings.transparent
        ? { kind: 'transparent' }
        : { kind: 'solid', color: settings.background || '#111114' },
    },
    exportSettings: {
      format: 'png',
      reducePalette: Boolean(settings.reducePalette),
      transparent: Boolean(settings.transparent),
    },
    extensions: {
      ...(project.extensions || {}),
      legacyFontOptions: editor?.fontOptions,
      legacySettings: {
        fit: settings.fit,
        scale: Number(settings.scale) || 100,
        x: Number(settings.x) || 0,
        y: Number(settings.y) || 0,
        rotation: Number(settings.rotation) || 0,
        opacity: Number(settings.opacity) || 100,
        anchorX: Number(settings.anchorX) || 50,
        anchorY: Number(settings.anchorY) || 50,
        imageFilters: settings.imageFilters || [],
      },
      editorSession: {
        source: editor?.source
          ? {
              name: editor.source.name,
              kind: 'image',
              width: editor.source.width,
              height: editor.source.height,
              mimeType: editor.source.mimeType,
              storageKey: editor.source.storageKey,
              url: editor.source.url && !String(editor.source.url).startsWith('blob:')
                ? editor.source.url
                : null,
            }
          : null,
        imageEdits: editor?.imageEdits || null,
        enhancedLayer: editor?.enhancedLayer
          ? {
              name: editor.enhancedLayer.name,
              width: editor.enhancedLayer.width,
              height: editor.enhancedLayer.height,
              visible: editor.enhancedLayer.visible,
              storageKey: editor.enhancedLayer.storageKey,
            }
          : null,
      },
    },
  }
}

function withSessionFromExtensions(editor, project) {
  const session = project?.extensions?.editorSession || {}
  return {
    ...editor,
    source: editor.source ?? session.source ?? null,
    imageEdits: editor.imageEdits ?? session.imageEdits ?? editor.imageEdits,
    enhancedLayer: editor.enhancedLayer ?? session.enhancedLayer ?? null,
    fontOptions: editor.fontOptions || project?.extensions?.legacyFontOptions || editor.fontOptions,
  }
}

export function getActiveProjectDocument(state) {
  if (state?.project?.schemaVersion === 2) return state.project
  return createEmptyProjectV2()
}

function ensureProject(state) {
  return state.project?.schemaVersion === 2 ? state.project : createEmptyProjectV2()
}

function emptyPair() {
  const project = createEmptyProjectV2()
  const editor = buildEditorView(project)
  return { project, editor }
}

export function commitElements(state, updater) {
  const prev = state.editor?.elements || []
  const next = typeof updater === 'function' ? updater(prev) : updater
  const list = Array.isArray(next) ? next : prev

  layerBitmapRegistry.syncFromElements(list)
  const withBitmaps = layerBitmapRegistry.attachToElements(list)

  let project = ensureProject(state)
  project = applyElementsToProjectV2(project, withBitmaps)
  project = applyEditorSessionToV2(project, { ...state.editor, elements: withBitmaps })

  const editor = withSessionFromExtensions(
    buildEditorView(project, { ...state.editor, elements: withBitmaps }),
    project,
  )

  return { project, editor }
}

export function commitOverlays(state, updater) {
  const prev = state.editor?.overlays || []
  const next = typeof updater === 'function' ? updater(prev) : updater
  const list = Array.isArray(next) ? next : prev

  layerBitmapRegistry.syncFromOverlays(list)
  const withRuntime = layerBitmapRegistry.attachToOverlays(list)

  let project = ensureProject(state)
  project = applyOverlaysToProjectV2(project, withRuntime)
  project = applyEditorSessionToV2(project, { ...state.editor, overlays: withRuntime })

  const editor = withSessionFromExtensions(
    buildEditorView(project, { ...state.editor, overlays: withRuntime }),
    project,
  )

  return { project, editor }
}

export function commitTextLayers(state, updater) {
  const prev = state.editor?.textLayers || []
  const next = typeof updater === 'function' ? updater(prev) : updater
  const list = Array.isArray(next) ? next : prev

  let project = ensureProject(state)
  project = applyTextLayersToProjectV2(project, list)
  project = applyEditorSessionToV2(project, { ...state.editor, textLayers: list })

  const editor = withSessionFromExtensions(
    buildEditorView(project, { ...state.editor, textLayers: list }),
    project,
  )

  return { project, editor }
}

export function commitEditorPatch(state, editorPatch) {
  const editor = { ...state.editor, ...editorPatch, updatedAt: new Date().toISOString() }
  let project = ensureProject(state)

  if (editorPatch.elements) {
    layerBitmapRegistry.syncFromElements(editor.elements)
    project = applyElementsToProjectV2(project, layerBitmapRegistry.attachToElements(editor.elements))
  }
  if (editorPatch.overlays) {
    layerBitmapRegistry.syncFromOverlays(editor.overlays)
    project = applyOverlaysToProjectV2(project, layerBitmapRegistry.attachToOverlays(editor.overlays))
  }
  if (editorPatch.textLayers) {
    project = applyTextLayersToProjectV2(project, editor.textLayers)
  }

  if (editorPatch.source !== undefined || editorPatch.settings
      || editorPatch.name || editorPatch.imageEdits
      || editorPatch.enhancedLayer || editorPatch.fontOptions) {
    if (editorPatch.source !== undefined || editorPatch.enhancedLayer !== undefined) {
      try {
        const { project: migrated } = migrateV1ToV2(editor)
        project = {
          ...migrated,
          layers: { ...migrated.layers, ...pickManagedLayers(state.project) },
          rootLayerIds: mergeRootIds(migrated.rootLayerIds, state.project?.rootLayerIds, migrated.layers),
          assets: { ...migrated.assets, ...(state.project?.assets || {}) },
        }
        project = applyElementsToProjectV2(project, editor.elements || [])
        project = applyOverlaysToProjectV2(project, editor.overlays || [])
        project = applyTextLayersToProjectV2(project, editor.textLayers || [])
      } catch (err) {
        if (typeof console !== 'undefined' && console.warn) {
          console.warn('[project] session layer rebuild failed', err)
        }
      }
    }
    project = applyEditorSessionToV2(project, editor)
  }

  const nextEditor = withSessionFromExtensions(buildEditorView(project, editor), project)
  if (editor.source) nextEditor.source = editor.source
  if (editor.enhancedLayer) nextEditor.enhancedLayer = editor.enhancedLayer
  if (editor.imageEdits) nextEditor.imageEdits = editor.imageEdits
  if (editor.fontOptions) nextEditor.fontOptions = editor.fontOptions
  if (editor.settings) nextEditor.settings = { ...nextEditor.settings, ...editor.settings }
  if (editor.name) nextEditor.name = editor.name

  return { project, editor: nextEditor }
}

function pickManagedLayers(project) {
  if (!project?.layers) return {}
  const out = {}
  for (const [id, layer] of Object.entries(project.layers)) {
    if (id === 'layer-background') continue
    if (layer?.rollbackAssetId) continue
    out[id] = layer
  }
  return out
}

function mergeRootIds(migratedRoots, prevRoots, layers) {
  const roots = []
  const seen = new Set()
  for (const id of migratedRoots || []) {
    if (layers[id] && !seen.has(id)) {
      seen.add(id)
      roots.push(id)
    }
  }
  for (const id of prevRoots || []) {
    if (layers[id] && !seen.has(id)) {
      seen.add(id)
      roots.push(id)
    }
  }
  for (const id of Object.keys(layers || {})) {
    if (!seen.has(id)) {
      seen.add(id)
      roots.push(id)
    }
  }
  return roots
}

function pickFields(value, fields) {
  if (!value || typeof value !== 'object') return {}
  return Object.fromEntries(
    fields
      .filter((field) => value[field] !== undefined)
      .map((field) => [field, value[field]]),
  )
}

const STATIC_ASSET_FIELDS = [
  'id', 'kind', 'mimeType', 'checksumSha256', 'byteLength',
  'width', 'height', 'storageKey', 'provenance',
]

const STATIC_LAYER_FIELDS = [
  'id', 'name', 'visible', 'locked', 'opacity', 'blendMode', 'transform', 'effects',
  'type', 'assetId', 'maskAssetId', 'rollbackAssetId', 'text', 'style', 'fontAssetId',
  'childIds', 'scope', 'region', 'fill', 'secure',
]

const STATIC_MEDIA_MAPPING_FIELDS = [
  'kind', 'legacyKind', 'layerKind', 'x', 'y', 'w', 'h', 'width', 'scale', 'url',
  'sourceRect', 'anchorX', 'anchorY', 'cutoutMode', 'engine', 'smart',
]

/** Strip retired project fields while preserving the static composition. */
function normalizeStaticProjectV2(raw) {
  const canvas = raw.canvas || {}
  const fallback = createEmptyProjectV2({
    id: raw.id,
    name: raw.metadata?.name,
    width: Number(canvas.width) || 480,
    height: Number(canvas.height) || 300,
    transparent: canvas.background?.kind === 'transparent',
    backgroundColor: canvas.background?.color,
    appVersion: raw.metadata?.appVersion,
  })

  const assets = Object.fromEntries(Object.entries(raw.assets || {}).map(([id, asset]) => {
    const staticAsset = pickFields(asset, STATIC_ASSET_FIELDS)
    return [id, {
      ...staticAsset,
      id: staticAsset.id || id,
      kind: ['mask', 'depth', 'font'].includes(staticAsset.kind) ? staticAsset.kind : 'image',
    }]
  }))

  const layers = Object.fromEntries(Object.entries(raw.layers || {}).map(([id, layer]) => {
    const staticLayer = pickFields(layer, STATIC_LAYER_FIELDS)
    const mediaMapping = layer?.mediaMapping
      ? pickFields(layer.mediaMapping, STATIC_MEDIA_MAPPING_FIELDS)
      : undefined
    return [id, { ...staticLayer, id: staticLayer.id || id, ...(mediaMapping ? { mediaMapping } : {}) }]
  }))

  const legacy = raw.extensions?.legacySettings || {}
  const session = raw.extensions?.editorSession || {}
  const source = session.source
    ? {
        name: session.source.name,
        kind: 'image',
        width: session.source.width,
        height: session.source.height,
        mimeType: session.source.mimeType,
        storageKey: session.source.storageKey,
        url: session.source.url,
      }
    : null

  return {
    ...fallback,
    id: raw.id || fallback.id,
    metadata: { ...fallback.metadata, ...(raw.metadata || {}) },
    canvas: { ...fallback.canvas, ...canvas },
    assets,
    rootLayerIds: (raw.rootLayerIds || []).filter((id) => layers[id]),
    layers,
    exportSettings: {
      format: 'png',
      reducePalette: Boolean(raw.exportSettings?.reducePalette),
      transparent: Boolean(raw.exportSettings?.transparent ?? (canvas.background?.kind === 'transparent')),
    },
    extensions: {
      ...(raw.extensions?.migratedFrom != null ? { migratedFrom: raw.extensions.migratedFrom } : {}),
      ...(raw.extensions?.legacyFontOptions ? { legacyFontOptions: raw.extensions.legacyFontOptions } : {}),
      legacySettings: {
        fit: legacy.fit,
        scale: Number(legacy.scale ?? 100),
        x: Number(legacy.x ?? 0),
        y: Number(legacy.y ?? 0),
        rotation: Number(legacy.rotation ?? 0),
        opacity: Number(legacy.opacity ?? 100),
        anchorX: Number(legacy.anchorX ?? 50),
        anchorY: Number(legacy.anchorY ?? 50),
        imageFilters: Array.isArray(legacy.imageFilters) ? legacy.imageFilters : [],
      },
      editorSession: {
        source,
        imageEdits: session.imageEdits || null,
        enhancedLayer: session.enhancedLayer || null,
      },
    },
  }
}

export function loadProjectPair(raw) {
  if (!raw || typeof raw !== 'object') {
    return emptyPair()
  }

  if (raw.schemaVersion === 2) {
    const project = normalizeStaticProjectV2(raw)
    layerBitmapRegistry.clear()
    let editor = buildEditorView(project)
    editor = withSessionFromExtensions(editor, project)
    const session = project.extensions?.editorSession
    if (session?.source && !editor.source) editor.source = session.source
    if (session?.imageEdits) editor.imageEdits = { ...editor.imageEdits, ...session.imageEdits }
    if (session?.enhancedLayer) editor.enhancedLayer = session.enhancedLayer
    return { project, editor }
  }

  // Legacy saved file (schemaVersion 1) — migrate once
  layerBitmapRegistry.syncFromElements(raw.elements || [])
  layerBitmapRegistry.syncFromOverlays(raw.overlays || [])
  try {
    const { project } = migrateV1ToV2(raw)
    const withSession = applyEditorSessionToV2(project, raw)
    const editor = withSessionFromExtensions(buildEditorView(withSession, raw), withSession)
    editor.source = raw.source
      ? {
          name: raw.source.name,
          kind: 'image',
          width: raw.source.width,
          height: raw.source.height,
          mimeType: raw.source.mimeType,
          storageKey: raw.source.storageKey,
          url: raw.source.url,
        }
      : editor.source
    editor.enhancedLayer = raw.enhancedLayer || editor.enhancedLayer
    editor.elements = layerBitmapRegistry.attachToElements(editor.elements)
    editor.overlays = layerBitmapRegistry.attachToOverlays(editor.overlays)
    return { project: withSession, editor }
  } catch (err) {
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[project] legacy import migrate failed', err)
    }
    return emptyPair()
  }
}

export function createEmptyProjectPair() {
  return emptyPair()
}
