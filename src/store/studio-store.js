import { create } from 'zustand'
import { createEmptyProject, projectFromJson, serializeProject } from '../lib/project-document'
import {
  ensureProjectV2,
  getActiveProjectDocument,
  loadProjectPair,
  syncProjectV2FromV1,
} from './project-v2-bridge'

const apply = (prev, updater) => (typeof updater === 'function' ? updater(prev) : updater)

const INITIAL_SELECTION = {
  selectedElements: [],
  selectedText: null,
  selectedOverlay: null,
  selectedMotionEffect: null,
  baseImageSelected: false,
  enhancedSelected: false,
  artboardSelected: false,
  layerInsertAt: 'front',
  imageLocked: false,
  imageVisible: true,
  canvasLocked: false,
}

const INITIAL_TOOLS = {
  selectMode: false,
  selectionTool: 'Rectangle',
  selection: null,
  selectionPoints: [],
  extractTolerance: 42,
  maskEditing: false,
  maskBrush: { mode: 'Hide', size: 48, hardness: 70, opacity: 100, feather: 8 },
  censorSelecting: false,
  effectTarget: 'Entire GIF',
  /** Soft-matte rembg id, or ``opencv-grabcut`` for explicit OpenCV GrabCut. */
  cutoutModel: 'birefnet',
}

const INITIAL_UI = {
  mobilePanel: false,
  /** @type {null | { message: string, type: 'success'|'error'|'info'|'warning' }} */
  toast: null,
  dropActive: false,
  lockAspect: true,
  gpuPreview: false,
}

function classifyToastMessage(message) {
  const m = String(message || '').toLowerCase()
  if (!m) return 'info'
  if (/fail|error|could not|exceeds|not allowed|rate limit|busy|required|invalid|denied|crash|503|429|too many|only png/.test(m)) {
    return 'error'
  }
  if (/unlock|wait for|draw a|enter a|open an|need at least|select a/.test(m)) {
    return 'warning'
  }
  if (/ready|loaded|added|imported|exported|saved|copied|success|contour|parallax on|optimized|downloaded/.test(m)) {
    return 'success'
  }
  return 'info'
}

function normalizeToast(input) {
  if (input == null || input === '' || input === false) return null
  if (typeof input === 'function') return input
  if (typeof input === 'string') {
    return { message: input, type: classifyToastMessage(input) }
  }
  if (typeof input === 'object' && input.message) {
    return {
      message: String(input.message),
      type: input.type || classifyToastMessage(input.message),
    }
  }
  return null
}

const INITIAL_SESSION = {
  playing: false,
  progress: 0,
  exporting: false,
  downloadBusy: false,
  scaleBusy: false,
  lastExport: null,
  apiAvailable: false,
  apiInfo: null,
  segmenting: false,
  /** Human-readable label while segmenting / scale / download runs (for studio lock overlay). */
  busyLabel: '',
}

const patchProject = (state, partial) => ({
  project: { ...state.project, ...partial, updatedAt: new Date().toISOString() },
})

/**
 * Zustand studio store — project document, selection, tools, UI chrome, session.
 * DOM refs / canvas draw loop / HTMLImageElement / poseRig stay in StudioProvider.
 */
export const useStudioStore = create((set, get) => ({
  project: createEmptyProject(),
  /** V2 document kept alongside V1 when `projectV2` feature flag is on. */
  projectV2: ensureProjectV2(createEmptyProject()),
  selection: { ...INITIAL_SELECTION },
  tools: { ...INITIAL_TOOLS },
  ui: { ...INITIAL_UI },
  session: { ...INITIAL_SESSION },
  capabilities: {
    opencv: false,
    pixi: false,
    ffmpeg: false,
    onnx: false,
    mediapipe: false,
    sam2: false,
    sam3: false,
    groundingDino: false,
    yolo: false,
    matte: false,
    depth: false,
    lama: false,
    inpaint: true,
    film: false,
    gfpgan: false,
    realesrgan: false,
    rife: false,
    rembg: false,
    api: false,
    device: null,
    models: null,
    allowHuggingFace: false,
  },

  // ── Project document ──────────────────────────────────────────────
  resetProject: () => {
    const project = createEmptyProject()
    set({ project, projectV2: ensureProjectV2(project) })
  },

  loadProject: (raw) => {
    const parsed = raw?.schemaVersion === 2 ? raw : projectFromJson(raw)
    const pair = loadProjectPair(parsed)
    set({ project: pair.project, projectV2: pair.projectV2 })
  },

  patchProject: (partial) => set((state) => {
    const next = patchProject(state, partial)
    return {
      ...next,
      projectV2: syncProjectV2FromV1(next.project, state.projectV2),
    }
  }),

  setProjectV2: (updater) => set((state) => ({
    projectV2: typeof updater === 'function' ? updater(state.projectV2) : updater,
  })),

  setSource: (updater) => set((state) => {
    const source = apply(state.project.source, updater)
    const next = patchProject(state, {
      source,
      name: source?.name ? source.name.replace(/\.[^.]+$/, '') : state.project.name,
    })
    return { ...next, projectV2: syncProjectV2FromV1(next.project, state.projectV2) }
  }),

  setSettings: (updater) => set((state) => {
    const prev = state.project.settings
    const nextSettings = typeof updater === 'function' ? updater(prev) : { ...prev, ...updater }
    const next = patchProject(state, { settings: nextSettings })
    return { ...next, projectV2: syncProjectV2FromV1(next.project, state.projectV2) }
  }),

  setElements: (updater) => set((state) => {
    const next = patchProject(state, { elements: apply(state.project.elements, updater) })
    return { ...next, projectV2: syncProjectV2FromV1(next.project, state.projectV2) }
  }),

  setOverlays: (updater) => set((state) => {
    const next = patchProject(state, { overlays: apply(state.project.overlays, updater) })
    return { ...next, projectV2: syncProjectV2FromV1(next.project, state.projectV2) }
  }),

  setTextLayers: (updater) => set((state) => {
    const next = patchProject(state, { textLayers: apply(state.project.textLayers, updater) })
    return { ...next, projectV2: syncProjectV2FromV1(next.project, state.projectV2) }
  }),

  setEnhancedLayer: (updater) => set((state) => {
    const next = patchProject(state, { enhancedLayer: apply(state.project.enhancedLayer, updater) })
    return { ...next, projectV2: syncProjectV2FromV1(next.project, state.projectV2) }
  }),

  setGifEffects: (updater) => set((state) => {
    const prev = state.project.gifEffects
    const nextEffects = typeof updater === 'function' ? updater(prev) : { ...prev, ...updater }
    const next = patchProject(state, { gifEffects: nextEffects })
    return { ...next, projectV2: syncProjectV2FromV1(next.project, state.projectV2) }
  }),

  setImageEdits: (updater) => set((state) => {
    const prev = state.project.imageEdits
    const nextEdits = typeof updater === 'function' ? updater(prev) : { ...prev, ...updater }
    const next = patchProject(state, { imageEdits: nextEdits })
    return { ...next, projectV2: syncProjectV2FromV1(next.project, state.projectV2) }
  }),

  setCensor: (updater) => set((state) => {
    const prev = state.project.censor
    const nextCensor = typeof updater === 'function' ? updater(prev) : { ...prev, ...updater }
    const project = { ...state.project, censor: nextCensor }
    return { project, projectV2: syncProjectV2FromV1(project, state.projectV2) }
  }),

  setParallax: (updater) => set((state) => {
    const prev = state.project.parallax
    const nextParallax = typeof updater === 'function' ? updater(prev) : { ...prev, ...updater }
    const project = { ...state.project, parallax: nextParallax }
    return { project, projectV2: syncProjectV2FromV1(project, state.projectV2) }
  }),

  setFontOptions: (updater) => set((state) => {
    const next = patchProject(state, { fontOptions: apply(state.project.fontOptions, updater) })
    return { ...next, projectV2: syncProjectV2FromV1(next.project, state.projectV2) }
  }),

  setKeyframes: (keyframes) => set((state) => {
    const next = patchProject(state, { keyframes })
    return { ...next, projectV2: syncProjectV2FromV1(next.project, state.projectV2) }
  }),

  addKeyframe: (kf) => set((state) => {
    const next = patchProject(state, {
      keyframes: [...(state.project.keyframes || []), kf],
    })
    return { ...next, projectV2: syncProjectV2FromV1(next.project, state.projectV2) }
  }),

  updateKeyframe: (id, patch) => set((state) => {
    const next = patchProject(state, {
      keyframes: (state.project.keyframes || []).map((k) => (k.id === id ? { ...k, ...patch } : k)),
    })
    return { ...next, projectV2: syncProjectV2FromV1(next.project, state.projectV2) }
  }),

  removeKeyframe: (id) => set((state) => {
    const next = patchProject(state, {
      keyframes: (state.project.keyframes || []).filter((k) => k.id !== id),
    })
    return { ...next, projectV2: syncProjectV2FromV1(next.project, state.projectV2) }
  }),

  // ── Selection / layers chrome ─────────────────────────────────────
  setSelectedElements: (updater) => set((state) => ({
    selection: { ...state.selection, selectedElements: apply(state.selection.selectedElements, updater) },
  })),
  setSelectedElement: (id) => set((state) => ({
    selection: { ...state.selection, selectedElements: id == null ? [] : [id] },
  })),
  setSelectedText: (updater) => set((state) => ({
    selection: { ...state.selection, selectedText: apply(state.selection.selectedText, updater) },
  })),
  setSelectedOverlay: (updater) => set((state) => ({
    selection: { ...state.selection, selectedOverlay: apply(state.selection.selectedOverlay, updater) },
  })),
  setSelectedMotionEffect: (updater) => set((state) => ({
    selection: {
      ...state.selection,
      selectedMotionEffect: apply(state.selection.selectedMotionEffect, updater),
    },
  })),
  setBaseImageSelected: (updater) => set((state) => ({
    selection: { ...state.selection, baseImageSelected: apply(state.selection.baseImageSelected, updater) },
  })),
  setEnhancedSelected: (updater) => set((state) => ({
    selection: { ...state.selection, enhancedSelected: apply(state.selection.enhancedSelected, updater) },
  })),
  setArtboardSelected: (updater) => set((state) => ({
    selection: { ...state.selection, artboardSelected: apply(state.selection.artboardSelected, updater) },
  })),
  setLayerInsertAt: (updater) => set((state) => ({
    selection: { ...state.selection, layerInsertAt: apply(state.selection.layerInsertAt, updater) },
  })),
  setImageLocked: (updater) => set((state) => ({
    selection: { ...state.selection, imageLocked: apply(state.selection.imageLocked, updater) },
  })),
  setImageVisible: (updater) => set((state) => ({
    selection: { ...state.selection, imageVisible: apply(state.selection.imageVisible, updater) },
  })),
  setCanvasLocked: (updater) => set((state) => ({
    selection: { ...state.selection, canvasLocked: apply(state.selection.canvasLocked, updater) },
  })),
  patchSelection: (partial) => set((state) => ({
    selection: { ...state.selection, ...partial },
  })),
  clearSelection: () => set((state) => ({
    selection: {
      ...state.selection,
      selectedElements: [],
      selectedText: null,
      selectedOverlay: null,
      selectedMotionEffect: null,
      baseImageSelected: false,
      enhancedSelected: false,
      artboardSelected: false,
    },
  })),

  // ── Tools / inputs ────────────────────────────────────────────────
  setSelectMode: (updater) => set((state) => ({
    tools: { ...state.tools, selectMode: apply(state.tools.selectMode, updater) },
  })),
  setSelectionTool: (updater) => set((state) => ({
    tools: { ...state.tools, selectionTool: apply(state.tools.selectionTool, updater) },
  })),
  setSelection: (updater) => set((state) => ({
    tools: { ...state.tools, selection: apply(state.tools.selection, updater) },
  })),
  setSelectionPoints: (updater) => set((state) => ({
    tools: { ...state.tools, selectionPoints: apply(state.tools.selectionPoints, updater) },
  })),
  setExtractTolerance: (updater) => set((state) => ({
    tools: { ...state.tools, extractTolerance: apply(state.tools.extractTolerance, updater) },
  })),
  setMaskEditing: (updater) => set((state) => ({
    tools: { ...state.tools, maskEditing: apply(state.tools.maskEditing, updater) },
  })),
  setMaskBrush: (updater) => set((state) => {
    const prev = state.tools.maskBrush
    const next = typeof updater === 'function' ? updater(prev) : { ...prev, ...updater }
    return { tools: { ...state.tools, maskBrush: next } }
  }),
  setCensorSelecting: (updater) => set((state) => ({
    tools: { ...state.tools, censorSelecting: apply(state.tools.censorSelecting, updater) },
  })),
  setEffectTarget: (updater) => set((state) => ({
    tools: { ...state.tools, effectTarget: apply(state.tools.effectTarget, updater) },
  })),
  setCutoutModel: (updater) => set((state) => ({
    tools: { ...state.tools, cutoutModel: apply(state.tools.cutoutModel, updater) },
  })),
  patchTools: (partial) => set((state) => ({
    tools: { ...state.tools, ...partial },
  })),
  resetTools: () => set({ tools: { ...INITIAL_TOOLS } }),

  // ── UI chrome ─────────────────────────────────────────────────────
  setMobilePanel: (updater) => set((state) => ({
    ui: { ...state.ui, mobilePanel: apply(state.ui.mobilePanel, updater) },
  })),
  setToast: (updater) => set((state) => {
    const next = typeof updater === 'function'
      ? normalizeToast(updater(state.ui.toast))
      : normalizeToast(updater)
    return { ui: { ...state.ui, toast: next } }
  }),
  notifySuccess: (message) => set((state) => ({
    ui: { ...state.ui, toast: { message: String(message), type: 'success' } },
  })),
  notifyError: (message) => set((state) => ({
    ui: { ...state.ui, toast: { message: String(message), type: 'error' } },
  })),
  notifyInfo: (message) => set((state) => ({
    ui: { ...state.ui, toast: { message: String(message), type: 'info' } },
  })),
  notifyWarning: (message) => set((state) => ({
    ui: { ...state.ui, toast: { message: String(message), type: 'warning' } },
  })),
  clearToast: () => set((state) => ({
    ui: { ...state.ui, toast: null },
  })),
  setDropActive: (updater) => set((state) => ({
    ui: { ...state.ui, dropActive: apply(state.ui.dropActive, updater) },
  })),
  setLockAspect: (updater) => set((state) => ({
    ui: { ...state.ui, lockAspect: apply(state.ui.lockAspect, updater) },
  })),
  setGpuPreview: (updater) => set((state) => ({
    ui: { ...state.ui, gpuPreview: apply(state.ui.gpuPreview, updater) },
  })),
  patchUi: (partial) => set((state) => ({
    ui: { ...state.ui, ...partial },
  })),

  // ── Session / playback / IO ───────────────────────────────────────
  setPlaying: (updater) => set((state) => ({
    session: { ...state.session, playing: apply(state.session.playing, updater) },
  })),
  setProgress: (updater) => set((state) => ({
    session: { ...state.session, progress: apply(state.session.progress, updater) },
  })),
  setExporting: (updater) => set((state) => ({
    session: { ...state.session, exporting: apply(state.session.exporting, updater) },
  })),
  setDownloadBusy: (updater) => set((state) => ({
    session: { ...state.session, downloadBusy: apply(state.session.downloadBusy, updater) },
  })),
  setScaleBusy: (updater) => set((state) => ({
    session: { ...state.session, scaleBusy: apply(state.session.scaleBusy, updater) },
  })),
  setLastExport: (updater) => set((state) => ({
    session: { ...state.session, lastExport: apply(state.session.lastExport, updater) },
  })),
  setApiAvailable: (updater) => set((state) => ({
    session: { ...state.session, apiAvailable: apply(state.session.apiAvailable, updater) },
  })),
  setApiInfo: (updater) => set((state) => ({
    session: { ...state.session, apiInfo: apply(state.session.apiInfo, updater) },
  })),
  setSegmenting: (updater) => set((state) => ({
    session: { ...state.session, segmenting: apply(state.session.segmenting, updater) },
  })),
  setBusyLabel: (updater) => set((state) => ({
    session: { ...state.session, busyLabel: apply(state.session.busyLabel, updater) },
  })),
  patchSession: (partial) => set((state) => ({
    session: { ...state.session, ...partial },
  })),

  setCapabilities: (partial) => set((state) => ({
    capabilities: { ...state.capabilities, ...partial },
  })),

  /** Clear project + selection/tools/session UI (keeps API capability probe). */
  resetStudio: () => {
    const { apiAvailable, apiInfo } = get().session
    const project = createEmptyProject()
    set({
      project,
      projectV2: ensureProjectV2(project),
      selection: { ...INITIAL_SELECTION },
      tools: { ...INITIAL_TOOLS },
      ui: { ...INITIAL_UI },
      session: { ...INITIAL_SESSION, apiAvailable, apiInfo },
    })
  },

  exportDocument: (opts) => serializeProject(get().project, opts),

  /** Prefer V2 when flag on; else V1. */
  getActiveProjectDocument: () => getActiveProjectDocument(get()),
}))

/** Selector helpers — prefer these in components over useStudio() for new code. */
export const selectProject = (s) => s.project
export const selectProjectV2 = (s) => s.projectV2
export const selectSettings = (s) => s.project.settings
export const selectElements = (s) => s.project.elements
export const selectOverlays = (s) => s.project.overlays
export const selectTextLayers = (s) => s.project.textLayers
export const selectSelection = (s) => s.selection
export const selectTools = (s) => s.tools
export const selectUi = (s) => s.ui
export const selectSession = (s) => s.session
export const selectCapabilities = (s) => s.capabilities

export { getActiveProjectDocument } from './project-v2-bridge'
