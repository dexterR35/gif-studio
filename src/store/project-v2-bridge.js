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
import { msToUs } from '../domain/timeline/time.js'
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
  const durationSec = Number(settings.duration) || 10
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
    timeline: {
      ...project.timeline,
      durationUs: msToUs(durationSec * 1000),
      loopMode: settings.loop === 1 ? 'once' : (project.timeline?.loopMode || 'loop'),
    },
    exportSettings: {
      ...project.exportSettings,
      fps: Number(settings.fps) || 24,
      quality: settings.quality || 'High quality',
      loop: Number.isFinite(Number(settings.loop)) ? Number(settings.loop) : 0,
      paletteSize: Number(settings.palette) || 256,
      disposal: Number(settings.disposal) || 2,
      transparent: Boolean(settings.transparent),
    },
    extensions: {
      ...(project.extensions || {}),
      legacyFontOptions: editor?.fontOptions,
      legacySettings: {
        preset: settings.preset,
        fit: settings.fit,
        motion: settings.motion || 'None',
        imageFilters: settings.imageFilters || [],
      },
      editorSession: {
        source: editor?.source
          ? {
              name: editor.source.name,
              kind: editor.source.kind,
              width: editor.source.width,
              height: editor.source.height,
              mimeType: editor.source.mimeType,
              frameCount: editor.source.frameCount,
              storageKey: editor.source.storageKey,
              url: editor.source.url && !String(editor.source.url).startsWith('blob:')
                ? editor.source.url
                : null,
            }
          : null,
        imageEdits: editor?.imageEdits || null,
        parallax: editor?.parallax || null,
        enhancedLayer: editor?.enhancedLayer
          ? {
              name: editor.enhancedLayer.name,
              width: editor.enhancedLayer.width,
              height: editor.enhancedLayer.height,
              visible: editor.enhancedLayer.visible,
              storageKey: editor.enhancedLayer.storageKey,
            }
          : null,
        keyframes: Array.isArray(editor?.keyframes) ? editor.keyframes : [],
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
    parallax: editor.parallax ?? session.parallax ?? editor.parallax,
    enhancedLayer: editor.enhancedLayer ?? session.enhancedLayer ?? null,
    keyframes: editor.keyframes?.length ? editor.keyframes : (session.keyframes || []),
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
      || editorPatch.parallax || editorPatch.enhancedLayer || editorPatch.fontOptions
      || editorPatch.keyframes) {
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
  if (editor.parallax) nextEditor.parallax = editor.parallax
  if (editor.fontOptions) nextEditor.fontOptions = editor.fontOptions
  if (editor.keyframes) nextEditor.keyframes = editor.keyframes
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

export function loadProjectPair(raw) {
  if (!raw || typeof raw !== 'object') {
    return emptyPair()
  }

  if (raw.schemaVersion === 2) {
    const project = raw
    layerBitmapRegistry.clear()
    let editor = buildEditorView(project)
    editor = withSessionFromExtensions(editor, project)
    const session = project.extensions?.editorSession
    if (session?.source && !editor.source) editor.source = session.source
    if (session?.imageEdits) editor.imageEdits = { ...editor.imageEdits, ...session.imageEdits }
    if (session?.parallax) editor.parallax = { ...editor.parallax, ...session.parallax }
    if (session?.enhancedLayer) editor.enhancedLayer = session.enhancedLayer
    if (session?.keyframes) editor.keyframes = session.keyframes
    return { project, editor }
  }

  // Legacy saved file (schemaVersion 1) — migrate once
  layerBitmapRegistry.syncFromElements(raw.elements || [])
  layerBitmapRegistry.syncFromOverlays(raw.overlays || [])
  try {
    const { project } = migrateV1ToV2(raw)
    const withSession = applyEditorSessionToV2(project, raw)
    const editor = withSessionFromExtensions(buildEditorView(withSession, raw), withSession)
    editor.source = raw.source || editor.source
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
