import { create } from 'zustand'
import { createEmptyProject, projectFromJson, serializeProject } from '../lib/project-document'

/**
 * Zustand project store — serializable studio document.
 * DOM refs / canvas draw loop stay in StudioProvider; this owns project data.
 */
export const useStudioStore = create((set, get) => ({
  project: createEmptyProject(),
  capabilities: {
    opencv: false,
    pixi: false,
    ffmpeg: false,
    onnx: false,
    mediapipe: false,
    sam2: false,
    groundingDino: false,
    realesrgan: false,
    rife: false,
    rembg: false,
    api: false,
    device: null,
    models: null,
    allowHuggingFace: false,
  },

  resetProject: () => set({ project: createEmptyProject() }),

  loadProject: (raw) => set({ project: projectFromJson(raw) }),

  patchProject: (partial) => set((state) => ({
    project: { ...state.project, ...partial, updatedAt: new Date().toISOString() },
  })),

  setSource: (source) => set((state) => ({
    project: {
      ...state.project,
      source,
      name: source?.name ? source.name.replace(/\.[^.]+$/, '') : state.project.name,
      updatedAt: new Date().toISOString(),
    },
  })),

  setSettings: (updater) => set((state) => {
    const prev = state.project.settings
    const next = typeof updater === 'function' ? updater(prev) : { ...prev, ...updater }
    return {
      project: { ...state.project, settings: next, updatedAt: new Date().toISOString() },
    }
  }),

  setElements: (updater) => set((state) => {
    const prev = state.project.elements
    const next = typeof updater === 'function' ? updater(prev) : updater
    return { project: { ...state.project, elements: next, updatedAt: new Date().toISOString() } }
  }),

  setOverlays: (updater) => set((state) => {
    const prev = state.project.overlays
    const next = typeof updater === 'function' ? updater(prev) : updater
    return { project: { ...state.project, overlays: next, updatedAt: new Date().toISOString() } }
  }),

  setTextLayers: (updater) => set((state) => {
    const prev = state.project.textLayers
    const next = typeof updater === 'function' ? updater(prev) : updater
    return { project: { ...state.project, textLayers: next, updatedAt: new Date().toISOString() } }
  }),

  setGifEffects: (updater) => set((state) => {
    const prev = state.project.gifEffects
    const next = typeof updater === 'function' ? updater(prev) : { ...prev, ...updater }
    return { project: { ...state.project, gifEffects: next, updatedAt: new Date().toISOString() } }
  }),

  setImageEdits: (updater) => set((state) => {
    const prev = state.project.imageEdits
    const next = typeof updater === 'function' ? updater(prev) : { ...prev, ...updater }
    return { project: { ...state.project, imageEdits: next, updatedAt: new Date().toISOString() } }
  }),

  setCensor: (updater) => set((state) => {
    const prev = state.project.censor
    const next = typeof updater === 'function' ? updater(prev) : { ...prev, ...updater }
    return { project: { ...state.project, censor: next } }
  }),

  setParallax: (updater) => set((state) => {
    const prev = state.project.parallax
    const next = typeof updater === 'function' ? updater(prev) : { ...prev, ...updater }
    return { project: { ...state.project, parallax: next } }
  }),

  setKeyframes: (keyframes) => set((state) => ({
    project: { ...state.project, keyframes, updatedAt: new Date().toISOString() },
  })),

  addKeyframe: (kf) => set((state) => ({
    project: {
      ...state.project,
      keyframes: [...(state.project.keyframes || []), kf],
      updatedAt: new Date().toISOString(),
    },
  })),

  updateKeyframe: (id, patch) => set((state) => ({
    project: {
      ...state.project,
      keyframes: (state.project.keyframes || []).map((k) => (k.id === id ? { ...k, ...patch } : k)),
      updatedAt: new Date().toISOString(),
    },
  })),

  removeKeyframe: (id) => set((state) => ({
    project: {
      ...state.project,
      keyframes: (state.project.keyframes || []).filter((k) => k.id !== id),
      updatedAt: new Date().toISOString(),
    },
  })),

  setCapabilities: (partial) => set((state) => ({
    capabilities: { ...state.capabilities, ...partial },
  })),

  exportDocument: (opts) => serializeProject(get().project, opts),
}))
