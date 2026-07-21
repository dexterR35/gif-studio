import { create } from 'zustand'
import { serializeProject } from '../lib/project-document'
import {
  commitEditorPatch,
  commitElements,
  commitOverlays,
  commitTextLayers,
  createEmptyProjectPair,
  getActiveProjectDocument,
  loadProjectPair,
} from './project-v2-bridge'
import { layerBitmapRegistry } from '../runtime/layer-bitmap-registry'

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

const emptyPair = createEmptyProjectPair()

/**
 * Zustand studio store — durable `project` is always Project V2.
 * `editor` is the derived session view (arrays + settings) for Konva / StudioProvider.
 */
export const useStudioStore = create((set, get) => ({
  project: emptyPair.project,
  editor: emptyPair.editor,
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

  // ── Project document (V2) + editor view ───────────────────────────
  resetProject: () => {
    layerBitmapRegistry.clear()
    const pair = createEmptyProjectPair()
    set({ project: pair.project, editor: pair.editor })
  },

  loadProject: (raw) => {
    layerBitmapRegistry.clear()
    const pair = loadProjectPair(raw)
    set({ project: pair.project, editor: pair.editor })
  },

  patchProject: (partial) => set((state) => {
    // Legacy API: patch editor session fields
    return commitEditorPatch(state, partial)
  }),

  setProject: (updater) => set((state) => {
    const project = typeof updater === 'function' ? updater(state.project) : updater
    if (!project || project.schemaVersion !== 2) return state
    const pair = loadProjectPair(project)
    return { project: pair.project, editor: pair.editor }
  }),

  setSource: (updater) => set((state) => {
    const source = apply(state.editor.source, updater)
    return commitEditorPatch(state, {
      source,
      name: source?.name ? source.name.replace(/\.[^.]+$/, '') : state.editor.name,
    })
  }),

  setSettings: (updater) => set((state) => {
    const prev = state.editor.settings
    const nextSettings = typeof updater === 'function' ? updater(prev) : { ...prev, ...updater }
    return commitEditorPatch(state, { settings: nextSettings })
  }),

  setElements: (updater) => set((state) => commitElements(state, updater)),

  setOverlays: (updater) => set((state) => commitOverlays(state, updater)),

  setTextLayers: (updater) => set((state) => commitTextLayers(state, updater)),

  setEnhancedLayer: (updater) => set((state) => {
    const enhancedLayer = apply(state.editor.enhancedLayer, updater)
    return commitEditorPatch(state, { enhancedLayer })
  }),

  setGifEffects: (updater) => set((state) => {
    const prev = state.editor.gifEffects
    const gifEffects = typeof updater === 'function' ? updater(prev) : { ...prev, ...updater }
    return commitEditorPatch(state, { gifEffects })
  }),

  setImageEdits: (updater) => set((state) => {
    const prev = state.editor.imageEdits
    const imageEdits = typeof updater === 'function' ? updater(prev) : { ...prev, ...updater }
    return commitEditorPatch(state, { imageEdits })
  }),

  setCensor: (updater) => set((state) => {
    const prev = state.editor.censor
    const censor = typeof updater === 'function' ? updater(prev) : { ...prev, ...updater }
    return commitEditorPatch(state, { censor })
  }),

  setParallax: (updater) => set((state) => {
    const prev = state.editor.parallax
    const parallax = typeof updater === 'function' ? updater(prev) : { ...prev, ...updater }
    return commitEditorPatch(state, { parallax })
  }),

  setFontOptions: (updater) => set((state) => {
    const fontOptions = apply(state.editor.fontOptions, updater)
    return commitEditorPatch(state, { fontOptions })
  }),

  setKeyframes: (keyframes) => set((state) => commitEditorPatch(state, { keyframes })),

  addKeyframe: (kf) => set((state) => commitEditorPatch(state, {
    keyframes: [...(state.editor.keyframes || []), kf],
  })),

  updateKeyframe: (id, patch) => set((state) => commitEditorPatch(state, {
    keyframes: (state.editor.keyframes || []).map((k) => (k.id === id ? { ...k, ...patch } : k)),
  })),

  removeKeyframe: (id) => set((state) => commitEditorPatch(state, {
    keyframes: (state.editor.keyframes || []).filter((k) => k.id !== id),
  })),

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
    layerBitmapRegistry.clear()
    const pair = createEmptyProjectPair()
    set({
      project: pair.project,
      editor: pair.editor,
      selection: { ...INITIAL_SELECTION },
      tools: { ...INITIAL_TOOLS },
      ui: { ...INITIAL_UI },
      session: { ...INITIAL_SESSION, apiAvailable, apiInfo },
    })
  },

  exportDocument: (opts) => serializeProject(get().project, opts),

  /** Durable Project V2 document. */
  getActiveProjectDocument: () => getActiveProjectDocument(get()),
}))

/** Selector helpers — prefer these in components over useStudio() for new code. */
export const selectProject = (s) => s.project
export const selectEditor = (s) => s.editor
export const selectSettings = (s) => s.editor.settings
export const selectElements = (s) => s.editor.elements
export const selectOverlays = (s) => s.editor.overlays
export const selectTextLayers = (s) => s.editor.textLayers
export const selectSelection = (s) => s.selection
export const selectTools = (s) => s.tools
export const selectUi = (s) => s.ui
export const selectSession = (s) => s.session
export const selectCapabilities = (s) => s.capabilities

export { getActiveProjectDocument } from './project-v2-bridge'
