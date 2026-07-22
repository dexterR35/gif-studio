import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { GIFEncoder, applyPalette, quantize } from 'gifenc'
import { PRESETS, TEXT_DEFAULT, transformsFromAmount, MAX_TEXT_LAYERS, clampTextInOut } from '../lib/presets'
import { measureTextLayerPx, textLayerBoundsPct } from '../lib/text-measure'
import { IMAGE_EDITS_DEFAULT, PARALLAX_DEFAULT } from '../lib/project-document'
import { QUALITY_PROFILE_MAP, HEALTH_TIMEOUT_MS } from '../lib/catalogs'
import { clamp, clampNice, fmtBytes, ease, MAX_CANVAS, MAX_UPLOAD_DIMENSION, nice, uploadImageError } from '../lib/format'
import { parseLayerTrackId } from '../lib/timeline-ids'
import { gifWorkspacePath, workspaceFromPath } from '../lib/routes'
import { useCanvasZoom } from '../hooks/use-canvas-zoom'
import { useStudioStore } from '../store/studio-store'
import { sampleKeyframes } from '../lib/keyframes'
import { playTimeline, stopTimeline } from '../engine/gsap-playback'
import {
  POSE_RIG_DEFAULT, POSE_KEY_JOINTS, drawPoseSkeleton, samplePoseSway, applyJointKeys,
  emptyJointKey,
} from '../lib/pose'
import { warpElementByJoints, poseHasWarp } from '../lib/pose-warp'
import { evaluatePreviewPlan } from '../render/preview-evaluator-bridge'
import {
  runStudioTask,
  trackImportCommitted,
  trackCutoutApplied,
  trackExportSucceeded,
} from '../tasks/studio-task-bridge'
import { GIF_CUTOUT_LABEL, resolveGifCutoutPolicy } from '../tools/gif-cutout-policy'

const StudioContext = createContext(null)

/** Focus workspaces use the right panel, not the mobile inspector sheet. */
const FOCUS_WORKSPACES = new Set(['timeline', 'scale', 'output'])

const revokeBlobUrl = (url) => {
  if (typeof url === 'string' && url.startsWith('blob:')) URL.revokeObjectURL(url)
}

const newStudioId = () => (
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
)

const blobUrlFromCanvas = (canvas, type = 'image/png') => new Promise((resolve, reject) => {
  canvas.toBlob((blob) => {
    if (!blob) {
      reject(new Error('Could not encode canvas to blob'))
      return
    }
    resolve(URL.createObjectURL(blob))
  }, type)
})

/** Array index 0 = back, last = front. direction: -1 back, +1 front, 'back', 'front'. */
function moveInStack(list, id, direction) {
  const index = list.findIndex((item) => item.id === id)
  if (index < 0) return list
  let nextIndex = index
  if (direction === 'front') nextIndex = list.length - 1
  else if (direction === 'back') nextIndex = 0
  else nextIndex = index + direction
  if (nextIndex < 0 || nextIndex >= list.length || nextIndex === index) return list
  const copy = [...list]
  const [item] = copy.splice(index, 1)
  copy.splice(nextIndex, 0, item)
  return copy
}

/** Drag-reorder: place `fromId` at the current index of `toId` (index +/−). */
function reorderInStack(list, fromId, toId) {
  if (fromId === toId) return list
  const from = list.findIndex((item) => item.id === fromId)
  if (from < 0) return list
  const copy = [...list]
  const [item] = copy.splice(from, 1)
  const to = copy.findIndex((entry) => entry.id === toId)
  if (to < 0) return list
  copy.splice(to, 0, item)
  return copy
}

/** Insert relative to selected layer, or absolute front/back of the stack. */
function insertInStack(list, item, mode, relativeId = null) {
  if (relativeId != null) {
    const index = list.findIndex((entry) => entry.id === relativeId)
    if (index >= 0) {
      const copy = [...list]
      copy.splice(mode === 'front' ? index + 1 : index, 0, item)
      return copy
    }
  }
  return mode === 'front' ? [...list, item] : [item, ...list]
}

/**
 * Facade over StudioProvider: refs, derived metrics, and imperative actions (draw, export, AI).
 * Prefer `useStudioStore` selectors for project / selection / tools / ui / session state.
 */
export function useStudio() {
  const ctx = useContext(StudioContext)
  if (!ctx) throw new Error('useStudio must be used within StudioProvider')
  return ctx
}

export function StudioProvider({ children }) {
  const apiErrorMessage = (detail, defaultMessage) => {
    if (!detail) return defaultMessage
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail)) return detail.map((item) => item.msg || item).join(', ')
    return detail.message || defaultMessage
  }


  const canvasRef = useRef(null)
  const konvaStageApiRef = useRef(null)
  const setKonvaStageApi = useCallback((api) => { konvaStageApiRef.current = api }, [])
  const stageRef = useRef(null)
  const fileRef = useRef(null)
  const fontFileRef = useRef(null)
  const overlayFileRef = useRef(null)
  const compressGifRef = useRef(null)
  const progressRef = useRef(0)
  const progressUiAt = useRef(0)
  const playingRef = useRef(false)
  /** Shared finish lock — only one of export / PNG download / upscale at a time. */
  const ioLockRef = useRef(false)
  /** Nestable AI busy depth (segment / detect / matte / pose). */
  const busyDepthRef = useRef(0)
  const enhanceGenRef = useRef(0)
  const selectionStart = useRef(null)
  const anchorDrag = useRef(null)
  const jointDrag = useRef(null)
  const poseWarpCacheRef = useRef(new Map())
  const maskPainting = useRef(false)
  const pixiCanvasRef = useRef(null)
  const gifFramesRef = useRef(null)
  const loadGenerationRef = useRef(0)
  const sourceUrlRef = useRef(null)
  const drawRef = useRef(null)

  // ── Zustand: durable doc is V2 (`s.project`); editor view for Konva / arrays ──
  const settings = useStudioStore((s) => s.editor.settings)
  const source = useStudioStore((s) => s.editor.source)
  const elements = useStudioStore((s) => s.editor.elements)
  const overlays = useStudioStore((s) => s.editor.overlays)
  const textLayers = useStudioStore((s) => s.editor.textLayers)
  const enhancedLayer = useStudioStore((s) => s.editor.enhancedLayer)
  const imageEdits = useStudioStore((s) => s.editor.imageEdits)
  const parallax = useStudioStore((s) => s.editor.parallax)
  const fontOptions = useStudioStore((s) => s.editor.fontOptions)

  const setSettings = useStudioStore((s) => s.setSettings)
  const setSource = useStudioStore((s) => s.setSource)
  const setElements = useStudioStore((s) => s.setElements)
  const setOverlays = useStudioStore((s) => s.setOverlays)
  const setTextLayers = useStudioStore((s) => s.setTextLayers)
  const setEnhancedLayer = useStudioStore((s) => s.setEnhancedLayer)
  const setImageEdits = useStudioStore((s) => s.setImageEdits)
  const setParallax = useStudioStore((s) => s.setParallax)
  const setFontOptions = useStudioStore((s) => s.setFontOptions)

  const selectedElements = useStudioStore((s) => s.selection.selectedElements)
  const selectedText = useStudioStore((s) => s.selection.selectedText)
  const selectedOverlay = useStudioStore((s) => s.selection.selectedOverlay)
  const selectedMotionEffect = useStudioStore((s) => s.selection.selectedMotionEffect)
  const baseImageSelected = useStudioStore((s) => s.selection.baseImageSelected)
  const enhancedSelected = useStudioStore((s) => s.selection.enhancedSelected)
  const artboardSelected = useStudioStore((s) => s.selection.artboardSelected)
  const layerInsertAt = useStudioStore((s) => s.selection.layerInsertAt)
  const imageLocked = useStudioStore((s) => s.selection.imageLocked)
  const imageVisible = useStudioStore((s) => s.selection.imageVisible)
  const canvasLocked = useStudioStore((s) => s.selection.canvasLocked)

  const setSelectedElements = useStudioStore((s) => s.setSelectedElements)
  const setSelectedElement = useStudioStore((s) => s.setSelectedElement)
  const setSelectedText = useStudioStore((s) => s.setSelectedText)
  const setSelectedOverlay = useStudioStore((s) => s.setSelectedOverlay)
  const setSelectedMotionEffect = useStudioStore((s) => s.setSelectedMotionEffect)
  const setBaseImageSelected = useStudioStore((s) => s.setBaseImageSelected)
  const setEnhancedSelected = useStudioStore((s) => s.setEnhancedSelected)
  const setArtboardSelected = useStudioStore((s) => s.setArtboardSelected)
  const setLayerInsertAt = useStudioStore((s) => s.setLayerInsertAt)
  const setImageLocked = useStudioStore((s) => s.setImageLocked)
  const setImageVisible = useStudioStore((s) => s.setImageVisible)
  const setCanvasLocked = useStudioStore((s) => s.setCanvasLocked)

  const selectMode = useStudioStore((s) => s.tools.selectMode)
  const selectionTool = useStudioStore((s) => s.tools.selectionTool)
  const selection = useStudioStore((s) => s.tools.selection)
  const selectionPoints = useStudioStore((s) => s.tools.selectionPoints)
  const extractTolerance = useStudioStore((s) => s.tools.extractTolerance)
  const maskEditing = useStudioStore((s) => s.tools.maskEditing)
  const maskBrush = useStudioStore((s) => s.tools.maskBrush)

  const setSelectMode = useStudioStore((s) => s.setSelectMode)
  const setSelectionTool = useStudioStore((s) => s.setSelectionTool)
  const setSelection = useStudioStore((s) => s.setSelection)
  const setSelectionPoints = useStudioStore((s) => s.setSelectionPoints)
  const setExtractTolerance = useStudioStore((s) => s.setExtractTolerance)
  const setMaskEditing = useStudioStore((s) => s.setMaskEditing)
  const setMaskBrush = useStudioStore((s) => s.setMaskBrush)

  const mobilePanel = useStudioStore((s) => s.ui.mobilePanel)
  const toast = useStudioStore((s) => s.ui.toast)
  const dropActive = useStudioStore((s) => s.ui.dropActive)
  const lockAspect = useStudioStore((s) => s.ui.lockAspect)
  const gpuPreview = useStudioStore((s) => s.ui.gpuPreview)

  const setMobilePanel = useStudioStore((s) => s.setMobilePanel)
  const setToast = useStudioStore((s) => s.setToast)
  const notifySuccess = useStudioStore((s) => s.notifySuccess)
  const notifyError = useStudioStore((s) => s.notifyError)
  const notifyInfo = useStudioStore((s) => s.notifyInfo)
  const notifyWarning = useStudioStore((s) => s.notifyWarning)
  const clearToast = useStudioStore((s) => s.clearToast)
  const setDropActive = useStudioStore((s) => s.setDropActive)
  const setLockAspect = useStudioStore((s) => s.setLockAspect)
  const setGpuPreview = useStudioStore((s) => s.setGpuPreview)

  const playing = useStudioStore((s) => s.session.playing)
  const progress = useStudioStore((s) => s.session.progress)
  const exporting = useStudioStore((s) => s.session.exporting)
  const downloadBusy = useStudioStore((s) => s.session.downloadBusy)
  const scaleBusy = useStudioStore((s) => s.session.scaleBusy)
  const lastExport = useStudioStore((s) => s.session.lastExport)
  const apiAvailable = useStudioStore((s) => s.session.apiAvailable)
  const apiInfo = useStudioStore((s) => s.session.apiInfo)
  const segmenting = useStudioStore((s) => s.session.segmenting)
  const busyLabel = useStudioStore((s) => s.session.busyLabel)

  const setPlaying = useStudioStore((s) => s.setPlaying)
  const setExporting = useStudioStore((s) => s.setExporting)
  const setDownloadBusy = useStudioStore((s) => s.setDownloadBusy)
  const setScaleBusy = useStudioStore((s) => s.setScaleBusy)
  const setLastExport = useStudioStore((s) => s.setLastExport)
  const setApiAvailable = useStudioStore((s) => s.setApiAvailable)
  const setApiInfo = useStudioStore((s) => s.setApiInfo)
  const setSegmenting = useStudioStore((s) => s.setSegmenting)
  const setBusyLabel = useStudioStore((s) => s.setBusyLabel)

  const studioLocked = Boolean(segmenting || scaleBusy || downloadBusy || exporting)

  const assertStudioIdle = (message = 'Wait for the current job to finish') => {
    if (busyDepthRef.current > 0 || ioLockRef.current || exporting || downloadBusy || scaleBusy || segmenting) {
      setToast(message)
      return false
    }
    return true
  }

  /** Nestable lock for AI jobs — keeps studio overlay up through nested extract calls. */
  const beginBusy = (label) => {
    busyDepthRef.current += 1
    setPlaying(false)
    setSegmenting(true)
    if (label) setBusyLabel(label)
  }

  const endBusy = () => {
    busyDepthRef.current = Math.max(0, busyDepthRef.current - 1)
    if (busyDepthRef.current === 0) {
      setSegmenting(false)
      setBusyLabel('')
    }
  }

  /** Keep a sync ref so paused rAF / idle redraw never reads a stale closure. */
  const setProgress = (value, { force = false } = {}) => {
    const next = typeof value === 'function' ? value(progressRef.current) : value
    progressRef.current = next
    // During play, throttle store updates — full tree re-render every GSAP tick freezes the UI.
    const now = performance.now()
    if (force || !playingRef.current || now - progressUiAt.current > 80) {
      progressUiAt.current = now
      useStudioStore.getState().setProgress(next)
    }
  }
  playingRef.current = playing

  /** Runtime-only: decoded HTMLImageElement (not serializable). */
  const [image, setImage] = useState(null)
  /** Runtime pose preview — high-frequency joint drag syncs via poseRigRef. */
  const [poseRig, setPoseRig] = useState({ ...POSE_RIG_DEFAULT })
  const poseRigRef = useRef(poseRig)
  poseRigRef.current = poseRig

  /** Primary = last selected (edits target). Secondary = other multi-selected layers. */
  const selectedElement = selectedElements.length ? selectedElements[selectedElements.length - 1] : null
  const secondaryElements = selectedElements.length > 1
    ? selectedElements.slice(0, -1)
    : []

  const navigate = useNavigate()
  const location = useLocation()
  const activeTab = workspaceFromPath(location.pathname)
  const goToWorkspace = (id) => {
    navigate(gifWorkspacePath(id))
    if (!FOCUS_WORKSPACES.has(id)) setMobilePanel(true)
  }
  const canvasZoom = useCanvasZoom({ minZoom: 10, maxZoom: 800, defaultZoom: 100, padding: 40 })
  const { zoom, setZoom } = canvasZoom

  /** Replace source; revoke previous owned blob URL (never revoke in image-load effect). */
  const replaceSource = (next) => {
    const prevUrl = sourceUrlRef.current
    const nextUrl = next?.url ?? null
    sourceUrlRef.current = nextUrl
    setSource(next)
    if (prevUrl && prevUrl !== nextUrl) revokeBlobUrl(prevUrl)
  }

  const update = (key, value) => {
    const nextValue = typeof value === 'number' ? nice(value, Number.isInteger(value) ? 0 : 1) : value
    setSettings((s) => ({ ...s, [key]: nextValue }))
    if (key === 'duration') {
      setTextLayers((current) => current.map((layer) => clampTextInOut(layer, nextValue)))
    }
  }

  const clearTimelineLayerSelection = (kind, id) => {
    setSelectedMotionEffect((current) => {
      const parsed = parseLayerTrackId(current)
      if (parsed && parsed.kind === kind && parsed.id === id) return null
      return current
    })
  }

  /** Amount drives loop strength and timeline zoom/pan intensity for the active preset. */
  const setAmplitude = (amount) => setSettings((s) => ({
    ...s,
    amplitude: amount,
    ...transformsFromAmount(s.preset, amount),
  }))

  /** Speed drives loop phase rate; for one-shot presets it finishes earlier then holds. */
  const setSpeed = (speed) => setSettings((s) => ({
    ...s,
    speed,
    cycles: speed,
  }))
  const applyQuality = (quality) => setSettings((current) => ({
    ...current,
    quality,
    ...(QUALITY_PROFILE_MAP[quality] || {}),
  }))
  const frames = Math.max(2, Math.round(settings.duration * settings.fps))
  const timingFps = settings.fps
  const frameDelays = useMemo(() => Array.from({ length: frames }, (_, index) => {
    const start = Math.round(index * 1000 / timingFps / 10) * 10
    const end = Math.round((index + 1) * 1000 / timingFps / 10) * 10
    return Math.max(10, end - start)
  }), [frames, timingFps])
  const actualDuration = frameDelays.reduce((total, delay) => total + delay, 0) / 1000
  const actualFps = frames / actualDuration
  const memory = settings.width * settings.height * 4 * frames

  useEffect(() => {
    if (!source?.url) {
      setImage(null)
      return undefined
    }
    let cancelled = false
    const img = new Image()
    img.onload = () => {
      if (cancelled) return
      setImage(img)
      const width = clamp(img.naturalWidth, 1, MAX_CANVAS)
      const height = clamp(img.naturalHeight, 1, MAX_CANVAS)
      setSource((current) => (current ? {
        ...current,
        width: img.naturalWidth,
        height: img.naturalHeight,
      } : current))
      // New source → canvas starts at original image size (safety-capped).
      setSettings((current) => ({ ...current, width, height }))
    }
    img.onerror = () => {
      if (cancelled) return
      setImage(null)
      setToast('Could not load image source.')
    }
    img.src = source.url
    // Do NOT revoke blob URLs here — Strict Mode remount would break the load.
    return () => { cancelled = true }
  }, [source?.url])

  useEffect(() => {
    let cancelled = false
    const probe = async () => {
      try {
        const response = await fetch('/api/health', { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) })
        if (cancelled) return
        if (response.ok) {
          setApiAvailable(true)
          setApiInfo(await response.json())
          return
        }
      } catch { /* retry once — API often starts after Vite */ }
      await new Promise((r) => setTimeout(r, 800))
      if (cancelled) return
      try {
        const response = await fetch('/api/health', { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) })
        if (cancelled) return
        if (response.ok) {
          setApiAvailable(true)
          setApiInfo(await response.json())
          return
        }
      } catch { /* offline */ }
      if (!cancelled) setApiAvailable(false)
    }
    probe()
    return () => { cancelled = true }
  }, [])

  /** API-derived capability flags only — never wipe client-discovered ffmpeg/pixi/mediapipe. */
  useEffect(() => {
    useStudioStore.getState().setCapabilities({
      api: apiAvailable,
      sam2: Boolean(apiInfo?.sam2),
      sam3: Boolean(apiInfo?.sam3),
      groundingDino: Boolean(apiInfo?.grounding_dino),
      matte: Boolean(apiInfo?.matte),
      gfpgan: Boolean(apiInfo?.gfpgan),
      realesrgan: Boolean(apiInfo?.realesrgan),
      rembg: Boolean(apiInfo?.rembg || apiInfo?.ai),
      device: apiInfo?.device || null,
      models: apiInfo?.models || null,
      allowHuggingFace: Boolean(apiInfo?.allow_huggingface),
    })
  }, [apiAvailable, apiInfo])

  const draw = useCallback((rawT, target = canvasRef.current, exportScale = 1) => {
    if (!target || !image) return
    // Strangler: build V2 RenderPlan alongside legacy draw (parity prep).
    if (target === canvasRef.current) evaluatePreviewPlan(rawT)
    const ctx = target.getContext('2d', { willReadFrequently: true })
    const W = target.width, H = target.height
    // Prefer live ref so joint drags warp immediately (setState is async).
    const poseRig = poseRigRef.current
    // Skeleton / joint dots are preview chrome only — never bake into export / PNG / GIF frames.
    const previewCanvas = target === canvasRef.current
    if (settings.transparent) ctx.clearRect(0, 0, W, H)
    else { ctx.fillStyle = settings.background; ctx.fillRect(0, 0, W, H) }
    const motion = settings.motion || 'None'
    const motionSpeed = Math.max(0.1, settings.speed ?? settings.cycles ?? 1)
    const isLoop = motion !== 'None'
    let timeline = rawT
    if (settings.pingPong) {
      const phase = (rawT * (isLoop ? 1 : motionSpeed)) % 2
      timeline = phase <= 1 ? phase : 2 - phase
    } else if (!isLoop) {
      // One-shot (zoom / fade): higher speed finishes earlier, then holds end pose.
      timeline = Math.min(1, rawT * motionSpeed)
    }
    const t = ease(timeline, settings.easing)
    const timeSec = rawT * (settings.duration || 1)
    let scale = (settings.scaleStart + (settings.scaleEnd - settings.scaleStart) * t) / 100
    let x = settings.xStart + (settings.xEnd - settings.xStart) * t
    let y = settings.yStart + (settings.yEnd - settings.yStart) * t
    let rotation = settings.rotateStart + (settings.rotateEnd - settings.rotateStart) * t
    // Loop animation for the base image (Float, Orbit, Pulse, …).
    const amp = settings.amplitude ?? 0
    if (isLoop && (amp !== 0 || motion === 'Spin')) {
      const phase = rawT * Math.PI * 2 * motionSpeed
      if (motion === 'Float') y += -Math.sin(phase) * amp
      if (motion === 'Drift') x += Math.sin(phase) * amp
      if (motion === 'Bounce') y += -Math.abs(Math.sin(phase)) * amp
      if (motion === 'Pulse') scale *= 1 + Math.sin(phase) * amp / 100
      if (motion === 'Spin') rotation += (phase * 180) / Math.PI
      if (motion === 'Wobble') rotation += Math.sin(phase) * amp
      if (motion === 'Orbit') { x += Math.cos(phase) * amp; y += Math.sin(phase) * amp }
    }
    let opacity = (settings.opacityStart + (settings.opacityEnd - settings.opacityStart) * t) / 100
    // Custom keyframe timeline (Zustand) overrides base motion channels.
    const keyframes = useStudioStore.getState().project.keyframes || []
    if (keyframes.length) {
      const kfScale = sampleKeyframes(keyframes, timeSec, 'scale')
      const kfX = sampleKeyframes(keyframes, timeSec, 'x')
      const kfY = sampleKeyframes(keyframes, timeSec, 'y')
      const kfOpacity = sampleKeyframes(keyframes, timeSec, 'opacity')
      if (kfScale != null) scale *= Number(kfScale) / 100
      if (kfX != null) x = Number(kfX)
      if (kfY != null) y = Number(kfY)
      if (kfOpacity != null) opacity = Number(kfOpacity) / 100
    }
    // Multi-frame GIF (gifuct): sample source frame by timeline progress.
    let drawSource = image
    const gifPack = gifFramesRef.current
    if (gifPack?.frames?.length > 1) {
      const totalDelay = gifPack.frames.reduce((sum, f) => sum + (f.delay || 100), 0) || 1
      let elapsed = (rawT % 1) * totalDelay
      let frameIdx = 0
      for (let i = 0; i < gifPack.frames.length; i += 1) {
        elapsed -= gifPack.frames[i].delay || 100
        if (elapsed <= 0) { frameIdx = i; break }
        frameIdx = i
      }
      drawSource = gifPack.frames[frameIdx].canvas || image
    }
    const iw = drawSource.naturalWidth || drawSource.width
    const ih = drawSource.naturalHeight || drawSource.height
    const contain = Math.min(W / iw, H / ih), cover = Math.max(W / iw, H / ih)
    const fitMode = settings.fit
    // Match Python engine._base_size: Contain/Cover scale to canvas; Original size = 1:1 source pixels.
    const base = fitMode === 'Cover'
      ? cover
      : fitMode === 'Original size'
        ? exportScale
        : contain
    // Unscaled size — scale/rotate pivot around the anchor without shifting the laid-out image.
    const baseDw = fitMode === 'Stretch' ? W : iw * base
    const baseDh = fitMode === 'Stretch' ? H : ih * base
    const cx = W / 2 + x / 100 * W
    const cy = H / 2 + y / 100 * H
    const left = cx - baseDw / 2
    const top = cy - baseDh / 2
    // Anchor is a point on the canvas; origin is relative to the image top-left.
    // At scale 1 / rotation 0, changing the anchor never moves the image.
    const originX = ((settings.anchorX ?? 50) / 100) * W - left
    const originY = ((settings.anchorY ?? 50) / 100) * H - top
    const sx = (imageEdits.flipX ? -1 : 1) * scale
    const sy = (imageEdits.flipY ? -1 : 1) * scale

    // Enhanced underlay — drawn under the base; never replaces source.
    const enhanced = enhancedLayer
    if (enhanced?.image && enhanced.visible !== false) {
      const eiw = enhanced.width || enhanced.image.naturalWidth || enhanced.image.width
      const eih = enhanced.height || enhanced.image.naturalHeight || enhanced.image.height
      const eFit = enhanced.fit || 'Contain'
      const eContain = Math.min(W / eiw, H / eih)
      const eCover = Math.max(W / eiw, H / eih)
      const eBase = eFit === 'Cover'
        ? eCover
        : eFit === 'Original size'
          ? exportScale
          : eContain
      const eDw = eFit === 'Stretch' ? W : eiw * eBase
      const eDh = eFit === 'Stretch' ? H : eih * eBase
      const eLeft = cx - eDw / 2
      const eTop = cy - eDh / 2
      const eOriginX = ((settings.anchorX ?? 50) / 100) * W - eLeft
      const eOriginY = ((settings.anchorY ?? 50) / 100) * H - eTop
      ctx.save()
      ctx.translate(eLeft + eOriginX, eTop + eOriginY)
      ctx.rotate((rotation + imageEdits.rotation) * Math.PI / 180)
      ctx.scale(sx, sy)
      ctx.translate(-eOriginX, -eOriginY)
      ctx.globalAlpha = opacity
      ctx.drawImage(enhanced.image, 0, 0, eiw, eih, 0, 0, eDw, eDh)
      ctx.restore()
    }

    if (imageVisible !== false) {
      ctx.save()
      ctx.translate(left + originX, top + originY)
      ctx.rotate((rotation + imageEdits.rotation) * Math.PI / 180)
      ctx.scale(sx, sy)
      ctx.translate(-originX, -originY)
      ctx.globalAlpha = opacity
      ctx.drawImage(drawSource, 0, 0, iw, ih, 0, 0, baseDw, baseDh)
      ctx.restore()
    }

    overlays.filter((overlay) => overlay.visible).forEach((overlay) => {
      const width = overlay.width / 100 * W
      const height = width * overlay.image.naturalHeight / overlay.image.naturalWidth
      const sx = (overlay.flipX ? -1 : 1) * (overlay.scaleX || 100) / 100
      const sy = (overlay.flipY ? -1 : 1) * (overlay.scaleY || 100) / 100
      const cx = overlay.x / 100 * W
      const cy = overlay.y / 100 * H
      const left = cx - width / 2
      const top = cy - height / 2
      const originX = ((overlay.anchorX ?? 50) / 100) * width
      const originY = ((overlay.anchorY ?? 50) / 100) * height
      ctx.save()
      ctx.globalAlpha = overlay.opacity / 100
      ctx.translate(left + originX, top + originY)
      ctx.rotate(overlay.rotation * Math.PI / 180)
      ctx.scale(sx, sy)
      ctx.translate(-originX, -originY)
      const overlayImage = overlay.image
      const sourceWidth = overlayImage.width || overlay.image.naturalWidth, sourceHeight = overlayImage.height || overlay.image.naturalHeight
      ctx.drawImage(overlayImage, 0, 0, sourceWidth, sourceHeight, 0, 0, width, height)
      ctx.restore()
    })

    if (elements.length) {
      // Replace each extracted area with its sampled surrounding color before
      // drawing the moving cutout. This works especially well for clean and flat backgrounds.
      elements.filter((el) => el.visible && el.cleanup).forEach((el) => {
        ctx.drawImage(el.cleanup, el.x * W, el.y * H, el.w * W, el.h * H)
      })
      elements.filter((el) => el.visible).forEach((el) => {
        const phase = rawT * Math.PI * 2 * el.speed
        const amplitudeX = el.amplitude / 100 * W
        const amplitudeY = el.amplitude / 100 * H
        let tx = 0, ty = 0, elementRotation = 0, elementScale = 1
        let anchorXPct = el.anchorX ?? 50
        let anchorYPct = el.anchorY ?? 50
        if (el.motion === 'Float') ty = -Math.sin(phase) * amplitudeY
        if (el.motion === 'Drift') tx = Math.sin(phase) * amplitudeX
        if (el.motion === 'Bounce') ty = -Math.abs(Math.sin(phase)) * amplitudeY
        if (el.motion === 'Pulse') elementScale = 1 + Math.sin(phase) * el.amplitude / 100
        if (el.motion === 'Spin') elementRotation = phase
        if (el.motion === 'Wobble') elementRotation = Math.sin(phase) * el.amplitude * Math.PI / 180
        if (el.motion === 'Orbit') {
          tx = Math.cos(phase) * amplitudeX
          ty = Math.sin(phase) * amplitudeY
        }
        if (el.motion === 'Pose sway' && (el.poseJoints?.length || poseRig.restJoints?.length || poseRig.joints?.length)) {
          const baseJoints = el.poseJoints?.length
            ? el.poseJoints
            : (poseRig.restJoints?.length ? poseRig.restJoints : poseRig.joints)
          const joints = applyJointKeys(baseJoints, poseRig.jointKeys, rawT)
          // Soft whole-body sway; limb mesh warp handles arm/hand separately.
          const hasWarp = poseHasWarp(baseJoints, joints)
          const swayAmp = hasWarp ? Math.min(el.amplitude, 3) : el.amplitude
          const sway = samplePoseSway(joints, {
            phase,
            amplitude: swayAmp,
            boxX: el.x * W,
            boxY: el.y * H,
            boxW: el.w * W,
            boxH: el.h * H,
            canvasW: W,
            canvasH: H,
          })
          tx += sway.tx
          ty += sway.ty
          elementRotation += sway.rotationRad
          elementScale *= sway.scale
          if (poseRig.driveMotion !== false) {
            anchorXPct = sway.anchorX
            anchorYPct = sway.anchorY
          }
        }
        if (parallax.enabled) {
          const parallaxPhase = rawT * Math.PI * 2 * parallax.speed
          const depth = (el.depth ?? 50) / 100
          const distanceX = parallax.strength / 100 * W * depth
          const distanceY = parallax.strength / 100 * H * depth
          if (parallax.direction === 'Horizontal') tx += Math.sin(parallaxPhase) * distanceX
          if (parallax.direction === 'Vertical') ty += Math.sin(parallaxPhase) * distanceY
          if (parallax.direction === 'Diagonal') { tx += Math.sin(parallaxPhase) * distanceX; ty += Math.sin(parallaxPhase) * distanceY }
          if (parallax.direction === 'Orbit') { tx += Math.cos(parallaxPhase) * distanceX; ty += Math.sin(parallaxPhase) * distanceY }
        }
        const x = el.x * W, y = el.y * H, w = el.w * W, h = el.h * H
        const originX = (anchorXPct / 100) * w
        const originY = (anchorYPct / 100) * h
        const sx = elementScale * el.scaleX / 100 * (el.flipX ? -1 : 1)
        const sy = elementScale * el.scaleY / 100 * (el.flipY ? -1 : 1)
        ctx.save()
        ctx.globalAlpha = el.opacity / 100
        ctx.translate(x + originX + tx, y + originY + ty)
        ctx.rotate(elementRotation + el.rotation * Math.PI / 180)
        ctx.scale(sx, sy)
        ctx.translate(-originX, -originY)
        let elementBitmap = el.bitmap
        // Skeleton mesh warp — only on Body / pose cutouts (not every layer).
        const isPoseBody = Boolean(
          el.poseJoints?.length
          || el.name === 'Body'
          || /pose|mediapipe|sam2|human|rembg/i.test(el.engine || ''),
        )
        const restForWarp = isPoseBody
          ? (el.poseJoints?.length
            ? el.poseJoints
            : (poseRig.restJoints?.length ? poseRig.restJoints : poseRig.joints))
          : null
        if (restForWarp?.length && poseRig.jointKeys && Object.keys(poseRig.jointKeys).length) {
          const posedForWarp = applyJointKeys(restForWarp, poseRig.jointKeys, rawT)
          if (poseHasWarp(restForWarp, posedForWarp)) {
            const bucket = Math.round(rawT * 48)
            const cacheKey = `${el.id}:${poseRig.keysVersion || 0}:${bucket}:${elementBitmap.width}x${elementBitmap.height}`
            const cache = poseWarpCacheRef.current
            let warped = cache.get(cacheKey)
            if (!warped) {
              warped = warpElementByJoints(elementBitmap, {
                restJoints: restForWarp,
                posedJoints: posedForWarp,
                canvasW: W,
                canvasH: H,
                boxX: x,
                boxY: y,
                boxW: w,
                boxH: h,
              })
              if (cache.size > 64) cache.clear()
              cache.set(cacheKey, warped)
            }
            elementBitmap = warped
          }
        }
        ctx.drawImage(elementBitmap, 0, 0, elementBitmap.width, elementBitmap.height, 0, 0, w, h)
        ctx.restore()
      })
    }

    textLayers.filter((layer) => layer.visible).forEach((layer) => {
      const clipIn = Number.isFinite(Number(layer.in)) ? Number(layer.in) : 0
      const clipOut = Number.isFinite(Number(layer.out)) ? Number(layer.out) : Math.max(0.1, settings.duration || 1)
      if (timeSec < clipIn || timeSec > clipOut) return
      const clipSpan = Math.max(0.05, clipOut - clipIn)
      const localT = Math.min(1, Math.max(0, (timeSec - clipIn) / clipSpan))
      // Loop phase follows global time (like elements); in/out only gates visibility + entrance/exit.
      const phase = rawT * Math.PI * 2 * layer.speed
      const amountX = layer.amplitude / 100 * W, amountY = layer.amplitude / 100 * H
      let tx = 0, ty = 0, motionRotation = 0, motionScale = 1, motionOpacity = 1
      if (layer.motion === 'Float') ty = -Math.sin(phase) * amountY
      if (layer.motion === 'Drift') tx = Math.sin(phase) * amountX
      if (layer.motion === 'Bounce') ty = -Math.abs(Math.sin(phase)) * amountY
      if (layer.motion === 'Pulse') motionScale = 1 + Math.sin(phase) * layer.amplitude / 100
      if (layer.motion === 'Spin') motionRotation = phase
      if (layer.motion === 'Wobble') motionRotation = Math.sin(phase) * layer.amplitude * Math.PI / 180
      if (layer.motion === 'Fade') motionOpacity = .2 + .8 * (1 - Math.cos(phase)) / 2
      const enterLength = Math.max(.01, layer.entranceDuration / 100)
      const enterProgress = Math.min(1, localT / enterLength), enterEase = enterProgress * enterProgress * (3 - 2 * enterProgress)
      if (layer.entrance === 'Fade in') motionOpacity *= enterEase
      if (layer.entrance === 'Slide in left') tx -= (1 - enterEase) * W * .35
      if (layer.entrance === 'Slide in right') tx += (1 - enterEase) * W * .35
      if (layer.entrance === 'Slide in up') ty += (1 - enterEase) * H * .35
      if (layer.entrance === 'Slide in down') ty -= (1 - enterEase) * H * .35
      if (layer.entrance === 'Zoom in') { motionScale *= .25 + .75 * enterEase; motionOpacity *= enterEase }
      if (layer.entrance === 'Spin in') { motionRotation -= (1 - enterEase) * Math.PI; motionOpacity *= enterEase }
      const exitLength = Math.max(.01, layer.exitDuration / 100)
      const exitProgress = Math.max(0, (localT - (1 - exitLength)) / exitLength), exitEase = exitProgress * exitProgress * (3 - 2 * exitProgress)
      if (layer.exit === 'Fade out') motionOpacity *= 1 - exitEase
      if (layer.exit === 'Slide out left') tx -= exitEase * W * .35
      if (layer.exit === 'Slide out right') tx += exitEase * W * .35
      if (layer.exit === 'Slide out up') ty -= exitEase * H * .35
      if (layer.exit === 'Slide out down') ty += exitEase * H * .35
      if (layer.exit === 'Zoom out') { motionScale *= 1 - .75 * exitEase; motionOpacity *= 1 - exitEase }
      if (layer.exit === 'Spin out') { motionRotation += exitEase * Math.PI; motionOpacity *= 1 - exitEase }
      let content = layer.motion === 'Typewriter' ? layer.text.slice(0, Math.ceil(layer.text.length * Math.min(1, localT * layer.speed))) : layer.text
      if (layer.casing === 'UPPERCASE') content = content.toUpperCase()
      if (layer.casing === 'lowercase') content = content.toLowerCase()
      const fontScale = W / settings.width
      const size = layer.size * fontScale
      const lineHeight = size * layer.lineHeight
      ctx.save()
      ctx.translate(layer.x / 100 * W + tx, layer.y / 100 * H + ty)
      ctx.rotate(layer.rotation * Math.PI / 180 + motionRotation)
      ctx.scale((layer.flipX ? -1 : 1) * layer.scaleX / 100 * motionScale, (layer.flipY ? -1 : 1) * layer.scaleY / 100 * motionScale)
      ctx.globalAlpha = layer.opacity / 100 * motionOpacity
      ctx.globalCompositeOperation = layer.blendMode
      ctx.font = `${layer.italic ? 'italic ' : ''}${layer.weight} ${size}px "${layer.font}", sans-serif`
      ctx.textAlign = layer.align; ctx.textBaseline = 'middle'
      if ('letterSpacing' in ctx) ctx.letterSpacing = `${layer.letterSpacing * fontScale}px`
      ctx.fillStyle = layer.color; ctx.strokeStyle = layer.strokeColor; ctx.lineWidth = layer.strokeWidth * fontScale * 2
      ctx.lineJoin = 'round'; ctx.shadowColor = layer.shadowColor; ctx.shadowBlur = layer.shadowBlur * fontScale
      ctx.shadowOffsetX = layer.shadowX * fontScale; ctx.shadowOffsetY = layer.shadowY * fontScale
      const { lines } = measureTextLayerPx({ ...layer, text: content }, fontScale)
      lines.forEach((line, index) => {
        const lineY = (index - (lines.length - 1) / 2) * lineHeight
        if (layer.strokeWidth > 0) ctx.strokeText(line, 0, lineY)
        ctx.fillText(line, 0, lineY)
        if (layer.decoration !== 'None') {
          const metrics = ctx.measureText(line), lineWidth = metrics.width
          const startX = layer.align === 'center' ? -lineWidth / 2 : layer.align === 'right' ? -lineWidth : 0
          const decorationY = lineY + (layer.decoration === 'Underline' ? size * .52 : 0)
          ctx.save(); ctx.shadowColor = 'transparent'; ctx.lineWidth = Math.max(1, size * .055); ctx.strokeStyle = layer.color
          ctx.beginPath(); ctx.moveTo(startX, decorationY); ctx.lineTo(startX + lineWidth, decorationY); ctx.stroke(); ctx.restore()
        }
      })
      ctx.restore()
    })

    // Body joints overlay — preview only (toggle). Excluded from export / save PNG.
    const restSkeleton = poseRig.restJoints?.length ? poseRig.restJoints : poseRig.joints
    if (previewCanvas && poseRig.visible && restSkeleton?.length) {
      const animJoints = applyJointKeys(restSkeleton, poseRig.jointKeys, rawT)
      drawPoseSkeleton(ctx, animJoints, {
        width: W,
        height: H,
        color: '#d8ff3e',
        lineWidth: Math.max(1.5, Math.min(W, H) * 0.004),
        jointRadius: Math.max(2.5, Math.min(W, H) * 0.008),
        highlight: poseRig.selectedJoint,
      })
    }

  }, [image, settings, elements, textLayers, parallax, imageEdits, overlays, poseRig, enhancedLayer, imageVisible])

  drawRef.current = draw

  // Idle preview — redraw when settings/layers change (not while playing).
  // Canvas stays at full artboard resolution (source of truth for cutout / matte).
  useEffect(() => {
    if (!image || playing) return undefined
    const canvas = canvasRef.current
    if (!canvas) return undefined
    canvas.width = Math.max(1, Math.round(settings.width))
    canvas.height = Math.max(1, Math.round(settings.height))
    const frameIndex = Math.min(frames - 1, Math.floor(progressRef.current * frames))
    draw(frameIndex / frames)
    return undefined
  }, [draw, image, playing, settings.width, settings.height, frames])

  // Playback loop — do NOT depend on `draw`, or every motion slider restart freezes the app.
  useEffect(() => {
    if (!image || !playing) return undefined
    const canvas = canvasRef.current
    if (!canvas) return undefined
    canvas.width = Math.max(1, Math.round(settings.width))
    canvas.height = Math.max(1, Math.round(settings.height))

    const frameFromProgress = (p) => {
      const frameIndex = Math.min(frames - 1, Math.floor(p * frames))
      return frameIndex / frames
    }

    let cancelled = false
    let pixiReady = false
    let blit = null
    let blitFails = 0
    const bootPixi = async () => {
      if (!gpuPreview || !pixiCanvasRef.current) return null
      try {
        const { createPixiRenderer, resizePixiRenderer, blitCanvasToPixi } = await import('../engine/pixi-renderer')
        if (cancelled) return null
        await createPixiRenderer({
          width: canvas.width,
          height: canvas.height,
          canvas: pixiCanvasRef.current,
        })
        if (cancelled) return null
        resizePixiRenderer(canvas.width, canvas.height)
        pixiReady = true
        useStudioStore.getState().setCapabilities({ pixi: true })
        return blitCanvasToPixi
      } catch {
        return null
      }
    }
    if (gpuPreview) bootPixi().then((fn) => { if (!cancelled) blit = fn })
    playTimeline({
      duration: actualDuration,
      from: progressRef.current,
      onUpdate: (t) => {
        const frameT = frameFromProgress(t)
        setProgress(frameT)
        drawRef.current?.(frameT)
        if (pixiReady && blit) {
          const ok = blit(canvas)
          if (!ok) {
            blitFails += 1
            if (blitFails >= 3) {
              pixiReady = false
              blit = null
            }
          } else blitFails = 0
        }
      },
    })
    return () => {
      cancelled = true
      stopTimeline()
      if (gpuPreview) {
        import('../engine/pixi-renderer').then(({ destroyPixiRenderer }) => destroyPixiRenderer())
      }
    }
  }, [image, playing, settings.width, settings.height, actualDuration, frames, gpuPreview])

  const loadFile = async (file) => {
    if (!file) return
    if (!assertStudioIdle()) return
    const blocked = uploadImageError(file)
    if (blocked) { notifyError(blocked); return }

    const generation = ++loadGenerationRef.current
    const isStale = () => generation !== loadGenerationRef.current

    const resetLayers = () => {
      setElements([])
      setSelectedElements([])
      setBaseImageSelected(false)
      setArtboardSelected(false)
      setImageLocked(false)
      setImageVisible(true)
      setEnhancedLayer((current) => {
        if (current?.url) revokeBlobUrl(current.url)
        return null
      })
      setEnhancedSelected(false)
      setTextLayers([])
      setSelectedText(null)
      setOverlays((current) => {
        current.forEach((overlay) => revokeBlobUrl(overlay.url))
        return []
      })
      setSelectedOverlay(null)
      setSelectedMotionEffect(null)
      setSettings((current) => ({ ...current }))
      setImageEdits({ ...IMAGE_EDITS_DEFAULT })
      setParallax({ ...PARALLAX_DEFAULT })
      setPoseRig({ ...POSE_RIG_DEFAULT })
      setProgress(0)
      setPlaying(false)
      useStudioStore.getState().setKeyframes([])
    }

    const isGif = /image\/gif|\.gif$/i.test(file.type || file.name || '')
    if (isGif) {
      try {
        const { decodeGifFile } = await import('../engine/gif-decode')
        const decoded = await decodeGifFile(file)
        if (isStale()) return
        const url = await decoded.firstFrameUrl()
        if (isStale()) { revokeBlobUrl(url); return }
        resetLayers()
        gifFramesRef.current = decoded
        const totalMs = decoded.frames.reduce((sum, f) => sum + (f.delay || 100), 0)
        const avgDelay = totalMs / Math.max(1, decoded.frameCount)
        setSettings((current) => ({
          ...current,
          duration: Math.max(0.1, +(totalMs / 1000).toFixed(2)),
          fps: Math.max(1, Math.min(60, Math.round(1000 / avgDelay))),
          width: Math.min(MAX_CANVAS, decoded.width),
          height: Math.min(MAX_CANVAS, decoded.height),
        }))
        replaceSource({
          name: file.name,
          width: decoded.width,
          height: decoded.height,
          url,
          frameCount: decoded.frameCount,
          kind: 'gif',
        })
        trackImportCommitted({ kind: 'gif', frameCount: decoded.frameCount, width: decoded.width, height: decoded.height })
        const cutPolicy = resolveGifCutoutPolicy({ kind: 'animated-image', frameCount: decoded.frameCount })
        setToast(`GIF imported · ${decoded.frameCount} frames · ${decoded.width} × ${decoded.height} px · cutouts: ${cutPolicy.label}`)
      } catch (err) {
        if (!isStale()) setToast(err?.message || 'Could not decode GIF.')
      }
      return
    }

    const isVideo = /^video\//i.test(file.type || '') || /\.(mp4|webm|mov)$/i.test(file.name || '')
    if (isVideo) {
      try {
        setToast('Extracting video frames with ffmpeg.wasm…')
        const { extractFramesWithFFmpeg, loadFFmpeg } = await import('../engine/ffmpeg-export')
        await loadFFmpeg()
        if (isStale()) return
        useStudioStore.getState().setCapabilities({ ffmpeg: true })
        const blobs = await extractFramesWithFFmpeg(file, { fps: 12, maxFrames: 120 })
        if (isStale()) return
        if (!blobs.length) throw new Error('No frames extracted')
        const firstUrl = URL.createObjectURL(blobs[0])
        const probe = await new Promise((resolve, reject) => {
          const img = new Image()
          img.onload = () => resolve(img)
          img.onerror = reject
          img.src = firstUrl
        })
        if (isStale()) { revokeBlobUrl(firstUrl); return }
        const frameCanvases = []
        for (const blob of blobs) {
          const url = URL.createObjectURL(blob)
          const img = await new Promise((resolve, reject) => {
            const el = new Image()
            el.onload = () => resolve(el)
            el.onerror = reject
            el.src = url
          })
          const c = document.createElement('canvas')
          c.width = img.naturalWidth
          c.height = img.naturalHeight
          c.getContext('2d').drawImage(img, 0, 0)
          URL.revokeObjectURL(url)
          frameCanvases.push({ canvas: c, delay: Math.round(1000 / 12) })
        }
        if (isStale()) { revokeBlobUrl(firstUrl); return }
        resetLayers()
        gifFramesRef.current = {
          frames: frameCanvases,
          frameCount: frameCanvases.length,
          width: probe.naturalWidth,
          height: probe.naturalHeight,
        }
        setSettings((current) => ({
          ...current,
          duration: Math.max(0.1, +(frameCanvases.length / 12).toFixed(2)),
          fps: 12,
          width: Math.min(MAX_CANVAS, probe.naturalWidth),
          height: Math.min(MAX_CANVAS, probe.naturalHeight),
        }))
        replaceSource({
          name: file.name,
          width: probe.naturalWidth,
          height: probe.naturalHeight,
          url: firstUrl,
          frameCount: frameCanvases.length,
          kind: 'video',
        })
        trackImportCommitted({ kind: 'video', frameCount: frameCanvases.length })
        setToast(`Video imported · ${frameCanvases.length} frames via ffmpeg.wasm`)
      } catch (err) {
        if (!isStale()) setToast(err?.message || 'Video import failed')
      }
      return
    }

    gifFramesRef.current = null
    const url = URL.createObjectURL(file)
    const probe = new Image()
    probe.onload = () => {
      if (isStale()) { revokeBlobUrl(url); return }
      if (Math.max(probe.naturalWidth, probe.naturalHeight) > MAX_UPLOAD_DIMENSION) {
        revokeBlobUrl(url)
        setToast(`Image dimensions must be at most ${MAX_UPLOAD_DIMENSION}×${MAX_UPLOAD_DIMENSION} px (got ${probe.naturalWidth}×${probe.naturalHeight}).`)
        return
      }
      resetLayers()
      // Canvas size is applied when the image loads (original size, capped at MAX_CANVAS).
      replaceSource({ name: file.name, width: probe.naturalWidth, height: probe.naturalHeight, url, kind: 'image' })
      trackImportCommitted({ kind: 'image', width: probe.naturalWidth, height: probe.naturalHeight })
      setToast(`Image loaded at ${probe.naturalWidth} × ${probe.naturalHeight} px`)
    }
    probe.onerror = () => { revokeBlobUrl(url); if (!isStale()) setToast('Could not open image.') }
    probe.src = url
  }

  const sourceAspect = source?.width > 0 && source?.height > 0
    ? source.width / source.height
    : settings.width / Math.max(1, settings.height)

  const setCanvasWidth = (width) => {
    if (canvasLocked) { setToast('Unlock the artboard to resize'); return }
    const nextWidth = clamp(width, 1, MAX_CANVAS)
    setSettings((current) => {
      if (!lockAspect) return { ...current, width: nextWidth }
      const nextHeight = clamp(Math.round(nextWidth / sourceAspect), 1, MAX_CANVAS)
      return { ...current, width: nextWidth, height: nextHeight }
    })
  }

  const setCanvasHeight = (height) => {
    if (canvasLocked) { setToast('Unlock the artboard to resize'); return }
    const nextHeight = clamp(height, 1, MAX_CANVAS)
    setSettings((current) => {
      if (!lockAspect) return { ...current, height: nextHeight }
      const nextWidth = clamp(Math.round(nextHeight * sourceAspect), 1, MAX_CANVAS)
      return { ...current, width: nextWidth, height: nextHeight }
    })
  }

  const useSourceSize = () => {
    if (canvasLocked) { setToast('Unlock the artboard to resize'); return }
    if (!source?.width || !source?.height) { setToast('Open an image first'); return }
    if (source.width > MAX_CANVAS || source.height > MAX_CANVAS) {
      setToast(`Source exceeds ${MAX_CANVAS}px limit — enter a smaller artboard size`)
      return
    }
    setSettings((current) => ({ ...current, width: source.width, height: source.height }))
    setToast(`Artboard set to base image size ${source.width} × ${source.height} px`)
  }

  const toggleCanvasLock = () => {
    setCanvasLocked((current) => {
      const next = !current
      setToast(next ? 'Artboard locked' : 'Artboard unlocked')
      return next
    })
  }

  const selectArtboard = () => {
    setArtboardSelected(true)
    setBaseImageSelected(false)
    setSelectedElements([])
    setSelectedOverlay(null)
    setEnhancedSelected(false)
    setSelectedText(null)
    setPlaying(false)
    setSelectMode(false)
    setMaskEditing(false)
  }

  const applyPreset = (name) => setSettings((s) => ({
    ...s,
    preset: name,
    ...PRESETS[name],
    ...transformsFromAmount(name, PRESETS[name]?.amplitude ?? s.amplitude),
  }))
  const reset = () => {
    const current = useStudioStore.getState().project
    if (current.enhancedLayer?.url) revokeBlobUrl(current.enhancedLayer.url)
    ;(current.overlays || []).forEach((overlay) => revokeBlobUrl(overlay.url))
    replaceSource(null)
    setImage(null)
    gifFramesRef.current = null
    setPoseRig({ ...POSE_RIG_DEFAULT })
    progressRef.current = 0
    busyDepthRef.current = 0
    ioLockRef.current = false
    useStudioStore.getState().resetStudio()
    setToast('Project cleared — open an image to start')
  }

  const pointerPosition = (event) => {
    const bounds = stageRef.current.getBoundingClientRect()
    return { x: clamp((event.clientX - bounds.left) / bounds.width, 0, 1), y: clamp((event.clientY - bounds.top) / bounds.height, 0, 1) }
  }

  const selectionBounds = (points) => {
    const xs = points.map((point) => point.x), ys = points.map((point) => point.y)
    const x = Math.min(...xs), y = Math.min(...ys)
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
  }

  const cancelSelection = () => { selectionStart.current = null; setSelection(null); setSelectionPoints([]); setSelectMode(false) }

  const applyKonvaSelection = (payload) => {
    if (!payload?.rect) return
    const { rect, points, type } = payload
    setSelectMode(false)
    setSelection(null)
    setSelectionPoints([])
    selectionStart.current = null
    if (type === 'path' && points?.length >= 3) {
      extractElementLocal(rect, points, true)
      return
    }
    extractElementLocal(rect)
  }


  const completePathSelection = () => {
    if (!selectMode || selectionPoints.length < 3) { setToast('Add at least three selection points'); return }
    const points = [...selectionPoints], rect = selectionBounds(points)
    selectionStart.current = null; setSelection(null); setSelectionPoints([]); setSelectMode(false)
    if (rect.w < .015 || rect.h < .015) { setToast('Draw a larger selection'); return }
    extractElementLocal(rect, points, true)
  }

  useEffect(() => {
    if (!selectMode) return undefined
    const handleSelectionKeys = (event) => {
      if (event.key === 'Escape') cancelSelection()
      // Enter / Backspace handled by Konva selection draft on the stage.
    }
    window.addEventListener('keydown', handleSelectionKeys)
    return () => window.removeEventListener('keydown', handleSelectionKeys)
  }, [selectMode])

  const startSelection = (event) => {
    if (maskEditing) { event.currentTarget.setPointerCapture(event.pointerId); maskPainting.current = true; paintElementMask(event); return }
    if (!selectMode) return
    const point = pointerPosition(event)
    if (selectionTool === 'Polygonal Lasso' || selectionTool === 'Pen Path') { setSelectionPoints((current) => [...current, point]); return }
    event.currentTarget.setPointerCapture(event.pointerId); selectionStart.current = point
    if (selectionTool === 'Freehand Lasso') setSelectionPoints([point])
    setSelection({ x: point.x, y: point.y, w: 0, h: 0 })
  }
  const moveSelection = (event) => {
    if (maskEditing && maskPainting.current) { paintElementMask(event); return }
    if (!selectMode || !selectionStart.current) return
    const point = pointerPosition(event), start = selectionStart.current
    if (selectionTool === 'Freehand Lasso') setSelectionPoints((current) => {
      const last = current[current.length - 1]
      return !last || Math.hypot(last.x - point.x, last.y - point.y) > .002 ? [...current, point] : current
    })
    setSelection({ x: Math.min(start.x, point.x), y: Math.min(start.y, point.y), w: Math.abs(point.x - start.x), h: Math.abs(point.y - start.y) })
  }
  const finishSelection = (event) => {
    if (maskEditing) {
      const wasPainting = maskPainting.current
      maskPainting.current = false
      if (wasPainting) endMaskStroke(event)
      return
    }
    if (selectMode && selectionTool === 'Freehand Lasso' && selectionStart.current) {
      const point = pointerPosition(event), points = [...selectionPoints, point], rect = selectionBounds(points)
      selectionStart.current = null; setSelection(null); setSelectionPoints([]); setSelectMode(false)
      if (points.length < 3 || rect.w < .015 || rect.h < .015) { setToast('Draw a larger lasso selection'); return }
      extractElementLocal(rect, points, true); return
    }
    if (selectMode && (selectionTool === 'Polygonal Lasso' || selectionTool === 'Pen Path')) return
    if (!selectMode || !selectionStart.current) return
    const point = pointerPosition(event), start = selectionStart.current
    const rect = { x: Math.min(start.x, point.x), y: Math.min(start.y, point.y), w: Math.abs(point.x - start.x), h: Math.abs(point.y - start.y) }
    selectionStart.current = null; setSelection(null); setSelectMode(false)
    if (rect.w < .025 || rect.h < .025) { setToast('Draw a larger box around the element'); return }
    // Rectangle matches lasso/pen: always local canvas cut (not API rembg/GrabCut).
    extractElementLocal(rect)
  }

  function extractElementLocal(rect, pathPoints = null, exactMask = false) {
    const sourceCanvas = canvasRef.current
    if (!sourceCanvas) return
    const padX = Math.min(.04, Math.max(.012, rect.w * .1)), padY = Math.min(.04, Math.max(.012, rect.h * .1))
    rect = {
      x: Math.max(0, rect.x - padX), y: Math.max(0, rect.y - padY),
      w: Math.min(1, rect.x + rect.w + padX) - Math.max(0, rect.x - padX),
      h: Math.min(1, rect.y + rect.h + padY) - Math.max(0, rect.y - padY),
    }
    const sx = Math.round(rect.x * sourceCanvas.width), sy = Math.round(rect.y * sourceCanvas.height)
    const sw = Math.max(2, Math.round(rect.w * sourceCanvas.width)), sh = Math.max(2, Math.round(rect.h * sourceCanvas.height))
    const srcCtx = sourceCanvas.getContext('2d', { willReadFrequently: true })
    const pixels = srcCtx.getImageData(sx, sy, sw, sh)
    const data = pixels.data, original = new Uint8ClampedArray(pixels.data), border = []
    for (let x = 0; x < sw; x++) { border.push((x * 4), ((sh - 1) * sw + x) * 4) }
    for (let y = 1; y < sh - 1; y++) { border.push((y * sw) * 4, (y * sw + sw - 1) * 4) }
    const bg = border.reduce((sum, i) => [sum[0] + data[i], sum[1] + data[i + 1], sum[2] + data[i + 2]], [0, 0, 0]).map((v) => Math.round(v / border.length))
    if (!exactMask) for (let i = 0; i < data.length; i += 4) {
      const distance = Math.hypot(data[i] - bg[0], data[i + 1] - bg[1], data[i + 2] - bg[2])
      if (distance < extractTolerance) data[i + 3] = 0
      else if (distance < extractTolerance + 24) data[i + 3] = Math.round(data[i + 3] * (distance - extractTolerance) / 24)
    }
    const bitmap = document.createElement('canvas'); bitmap.width = sw; bitmap.height = sh
    bitmap.getContext('2d').putImageData(pixels, 0, 0)
    const sourceBitmap = document.createElement('canvas'); sourceBitmap.width = sw; sourceBitmap.height = sh
    sourceBitmap.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(original), sw, sh), 0, 0)
    const maskCanvas = document.createElement('canvas'); maskCanvas.width = sw; maskCanvas.height = sh; const maskCtx = maskCanvas.getContext('2d'); maskCtx.fillStyle = '#fff'
    if (pathPoints?.length >= 3) {
      maskCtx.beginPath()
      const localPoints = pathPoints.map((point) => ({ x: (point.x - rect.x) / rect.w * sw, y: (point.y - rect.y) / rect.h * sh }))
      if (selectionTool === 'Pen Path') {
        const first = localPoints[0], last = localPoints[localPoints.length - 1]; maskCtx.moveTo((last.x + first.x) / 2, (last.y + first.y) / 2)
        localPoints.forEach((point, index) => { const next = localPoints[(index + 1) % localPoints.length]; maskCtx.quadraticCurveTo(point.x, point.y, (point.x + next.x) / 2, (point.y + next.y) / 2) })
      } else localPoints.forEach((point, index) => { if (index === 0) maskCtx.moveTo(point.x, point.y); else maskCtx.lineTo(point.x, point.y) })
      maskCtx.closePath(); maskCtx.fill()
      const bitmapContext = bitmap.getContext('2d'); bitmapContext.globalCompositeOperation = 'destination-in'; bitmapContext.drawImage(maskCanvas, 0, 0); bitmapContext.globalCompositeOperation = 'source-over'
      const masked = bitmapContext.getImageData(0, 0, sw, sh).data
      for (let i = 3; i < data.length; i += 4) data[i] = masked[i]
    } else maskCtx.fillRect(0, 0, sw, sh)
    const cleanup = document.createElement('canvas'); cleanup.width = sw; cleanup.height = sh
    const filled = new ImageData(sw, sh)
    for (let py = 0; py < sh; py++) for (let px = 0; px < sw; px++) {
      const i = (py * sw + px) * 4
      if (!data[i + 3]) continue
      const distances = [px, sw - 1 - px, py, sh - 1 - py]
      const edge = distances.indexOf(Math.min(...distances))
      const sampleX = edge === 0 ? 0 : edge === 1 ? sw - 1 : px
      const sampleY = edge === 2 ? 0 : edge === 3 ? sh - 1 : py
      const sample = (sampleY * sw + sampleX) * 4
      filled.data[i] = original[sample]; filled.data[i + 1] = original[sample + 1]; filled.data[i + 2] = original[sample + 2]
      filled.data[i + 3] = data[i + 3]
    }
    cleanup.getContext('2d').putImageData(filled, 0, 0)
    const id = newStudioId()
    const element = { id, name: `Element ${elements.length + 1}`, ...rect, bitmap, sourceBitmap, maskCanvas, cleanup, rotation: 0, scaleX: 100, scaleY: 100, flipX: false, flipY: false, opacity: 100, motion: 'None', amplitude: 5, speed: 1, depth: Math.min(100, 30 + elements.length * 20), visible: true, locked: false, anchorX: 50, anchorY: 50, cutoutMode: source?.kind === 'gif' ? GIF_CUTOUT_LABEL : 'Still image' }
    setElements((current) => insertInStack(current, element, layerInsertAt, selectedElement))
    setSelectedElements([id])
    trackCutoutApplied({ method: 'local', kind: 'edge' })
    if (activeTab !== 'ai') goToWorkspace('motion')
    setSettings((current) => ({ ...current, preset: 'Still', ...PRESETS.Still }))
    setToast(layerInsertAt === 'front' ? 'Element extracted in front — choose its motion' : 'Element extracted in back — choose its motion')
    return id
  }

  /** Map UI matte ids → rembg session names used by /api/segment. */
  const toSegmentModel = (modelId) => {
    const map = {
      birefnet: 'birefnet-general',
      'rmbg-2.0': 'bria-rmbg',
      rmbg: 'bria-rmbg',
      'bria-rmbg': 'bria-rmbg',
      'rembg-isnet': 'isnet-general-use',
      isnet: 'isnet-general-use',
      'isnet-general-use': 'isnet-general-use',
    }
    return map[String(modelId || '').toLowerCase()] || 'isnet-general-use'
  }

  /** Resolve cutout dropdown id → /api/segment { model, method }. GrabCut is explicit, not a fallback. */
  const resolveCutoutRequest = (cutoutId, overrides = {}) => {
    const id = String(overrides.model ?? cutoutId ?? 'birefnet').toLowerCase()
    if (id === 'opencv-grabcut' || id === 'grabcut' || id === 'opencv') {
      return { model: 'isnet-general-use', method: 'grabcut' }
    }
    if (overrides.method) {
      return {
        model: toSegmentModel(id),
        method: overrides.method,
      }
    }
    return { model: toSegmentModel(id), method: 'ai' }
  }

  /**
   * Smart segment: rembg (method=ai) or OpenCV GrabCut (method=grabcut) from cutout dropdown.
   * Creates a floating cutout layer. Does **not** rewrite the base image with OpenCV
   * Telea smear unless ``updateBackground: true`` (optional clean-hole path).
   * @param {{ x:number, y:number, w:number, h:number }} rect normalized
   * @param {{ model?: string, method?: string, name?: string, replaceElementId?: string|null, updateBackground?: boolean }} [opts]
   */
  const extractElement = async (rect, opts = {}) => {
    const storeCutout = useStudioStore.getState().tools.cutoutModel || 'birefnet'
    const { model: segmentModel, method } = resolveCutoutRequest(storeCutout, opts)
    const {
      name = null,
      replaceElementId = null,
      updateBackground = false,
    } = opts
    if (!apiAvailable) return extractElementLocal(rect)
    const sourceCanvas = canvasRef.current
    if (!sourceCanvas) return
    const nested = busyDepthRef.current > 0
    if (!nested && !assertStudioIdle()) return null
    beginBusy('Separating subject…')
    setToast('Separating subject…')
    try {
      const blob = await new Promise((resolve) => sourceCanvas.toBlob(resolve, 'image/png'))
      const form = new FormData()
      form.append('image', blob, 'canvas.png')
      form.append('x', String(Math.round(rect.x * sourceCanvas.width)))
      form.append('y', String(Math.round(rect.y * sourceCanvas.height)))
      form.append('width', String(Math.round(rect.w * sourceCanvas.width)))
      form.append('height', String(Math.round(rect.h * sourceCanvas.height)))
      form.append('iterations', '5')
      form.append('method', method)
      form.append('model', segmentModel)
      const response = await fetch('/api/segment', { method: 'POST', body: form })
      if (!response.ok) {
        const detail = await response.json().catch(() => ({}))
        const message = apiErrorMessage(detail.detail, 'Smart selection failed')
        if (response.status === 429 || response.status === 503) {
          setToast(message)
          return null
        }
        throw new Error(message)
      }
      const result = await response.json()
      const cutout = new Image()
      await new Promise((resolve, reject) => { cutout.onload = resolve; cutout.onerror = reject; cutout.src = result.cutout })
      const bitmap = document.createElement('canvas'); bitmap.width = cutout.naturalWidth; bitmap.height = cutout.naturalHeight
      bitmap.getContext('2d').drawImage(cutout, 0, 0)
      // Keep an opaque RGB copy for later “Remove BG” rematte (never bake base inpaint into it).
      const sourceBitmap = document.createElement('canvas')
      sourceBitmap.width = bitmap.width
      sourceBitmap.height = bitmap.height
      {
        const sctx = sourceBitmap.getContext('2d')
        const rx = Math.round(result.rect.x)
        const ry = Math.round(result.rect.y)
        const rw = Math.round(result.rect.width)
        const rh = Math.round(result.rect.height)
        sctx.drawImage(sourceCanvas, rx, ry, rw, rh, 0, 0, bitmap.width, bitmap.height)
      }
      const maskCanvas = document.createElement('canvas'); maskCanvas.width = bitmap.width; maskCanvas.height = bitmap.height
      {
        const maskCtx = maskCanvas.getContext('2d')
        const alpha = bitmap.getContext('2d').getImageData(0, 0, bitmap.width, bitmap.height)
        const maskData = maskCtx.createImageData(bitmap.width, bitmap.height)
        for (let i = 0; i < alpha.data.length; i += 4) {
          const a = alpha.data[i + 3]
          maskData.data[i] = a
          maskData.data[i + 1] = a
          maskData.data[i + 2] = a
          maskData.data[i + 3] = 255
        }
        maskCtx.putImageData(maskData, 0, 0)
      }
      const smartRect = { x: result.rect.x / sourceCanvas.width, y: result.rect.y / sourceCanvas.height, w: result.rect.width / sourceCanvas.width, h: result.rect.height / sourceCanvas.height }
      const engine = result.engine || segmentModel

      let id = replaceElementId
      if (replaceElementId) {
        setElements((current) => current.map((item) => (
          item.id !== replaceElementId
            ? item
            : {
              ...item,
              ...smartRect,
              bitmap,
              sourceBitmap,
              maskCanvas,
              cleanup: null,
              smart: true,
              engine,
              name: name || item.name,
            }
        )))
        setSelectedElements([replaceElementId])
      } else {
        id = newStudioId()
        const element = {
          id,
          name: name || `Element ${elements.length + 1}`,
          ...smartRect,
          bitmap,
          sourceBitmap,
          maskCanvas,
          cleanup: null,
          rotation: 0,
          scaleX: 100,
          scaleY: 100,
          flipX: false,
          flipY: false,
          opacity: 100,
          motion: 'None',
          amplitude: 5,
          speed: 1,
          depth: Math.min(100, 30 + elements.length * 20),
          visible: true,
          smart: true,
          locked: false,
          anchorX: 50,
          anchorY: 50,
          engine,
          cutoutMode: source?.kind === 'gif' ? GIF_CUTOUT_LABEL : 'Still image',
        }
        setElements((current) => insertInStack(current, element, layerInsertAt, selectedElement))
        setSelectedElements([id])
      }

      if (activeTab !== 'ai') goToWorkspace('motion')
      setSettings((current) => ({ ...current, preset: 'Still', fit: 'Contain', ...PRESETS.Still }))
      // Only rewrite the base when explicitly requested. Default leave pixels intact so
      // moving the cutout never reveals OpenCV Telea/NS “deformed color” smear.
      if (updateBackground && result.background && !replaceElementId) {
        replaceSource({
          ...(source || {}),
          width: sourceCanvas.width,
          height: sourceCanvas.height,
          url: result.background,
        })
      }
      const kind = String(engine).startsWith('rembg') || String(engine).includes('birefnet') || String(engine).includes('rmbg')
        ? 'AI'
        : 'GrabCut'
      trackCutoutApplied({ engine: String(engine), method: String(method), kind })
      setToast(
        updateBackground
          ? `${kind} object ready · hole filled on base`
          : `${kind} cutout layer ready · base image unchanged`,
      )
      return id
    } catch (error) {
      console.warn(error)
      const id = extractElementLocal(rect)
      setToast(`${error.message}. Used edge selection instead.`)
      return id
    } finally { endBusy() }
  }

  /**
   * Remove BG on an existing cutout — mattes that layer only.
   * Never rewrites the base image (that caused the smear behind moved layers).
   */
  const rematteSelectedLayer = async ({ model, method } = {}) => {
    const el = elements.find((e) => e.id === selectedElement && (e.sourceBitmap || e.bitmap))
    if (!el) {
      setToast('Select a cutout layer to remove its background')
      return
    }
    if (!assertStudioIdle()) return
    const storeCutout = useStudioStore.getState().tools.cutoutModel || 'birefnet'
    const { model: segmentModel, method: segMethod } = resolveCutoutRequest(storeCutout, { model, method })
    const src = el.sourceBitmap || el.bitmap
    const w = src.width
    const h = src.height
    if (w < 2 || h < 2) {
      setToast('Layer is too small to rematte')
      return
    }

    // Opaque plate for rembg / GrabCut (transparent holes would confuse the model).
    const plate = document.createElement('canvas')
    plate.width = w
    plate.height = h
    const pctx = plate.getContext('2d')
    pctx.fillStyle = '#808080'
    pctx.fillRect(0, 0, w, h)
    pctx.drawImage(src, 0, 0)

    beginBusy('Removing background…')
    setToast('Removing background…')
    try {
      let bitmap = document.createElement('canvas')
      bitmap.width = w
      bitmap.height = h
      let maskCanvas = document.createElement('canvas')
      maskCanvas.width = w
      maskCanvas.height = h
      let engine = segmentModel

      if (segMethod === 'grabcut') {
        const blob = await new Promise((resolve, reject) => {
          plate.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode layer'))), 'image/png')
        })
        const form = new FormData()
        form.append('image', blob, 'layer.png')
        form.append('x', '0')
        form.append('y', '0')
        form.append('width', String(w))
        form.append('height', String(h))
        form.append('iterations', '5')
        form.append('method', 'grabcut')
        form.append('model', segmentModel)
        const response = await fetch('/api/segment', { method: 'POST', body: form })
        if (!response.ok) {
          const detail = await response.json().catch(() => ({}))
          throw new Error(apiErrorMessage(detail.detail, 'Remove background failed'))
        }
        const result = await response.json()
        engine = result.engine || 'opencv-grabcut'
        const cutout = new Image()
        await new Promise((resolve, reject) => {
          cutout.onload = resolve
          cutout.onerror = reject
          cutout.src = result.cutout
        })
        bitmap.getContext('2d').drawImage(cutout, 0, 0, w, h)
        const alpha = bitmap.getContext('2d').getImageData(0, 0, w, h)
        const maskData = maskCanvas.getContext('2d').createImageData(w, h)
        for (let i = 0; i < alpha.data.length; i += 4) {
          const a = alpha.data[i + 3]
          maskData.data[i] = a
          maskData.data[i + 1] = a
          maskData.data[i + 2] = a
          maskData.data[i + 3] = 255
        }
        maskCanvas.getContext('2d').putImageData(maskData, 0, 0)
      } else {
        const { matteWithModel } = await import('../ai/matte')
        const result = await matteWithModel({
          imageCanvas: plate,
          model: String(model || storeCutout),
        })
        engine = result.engine || segmentModel
        if (result.rgba_png_base64) {
          const img = new Image()
          await new Promise((resolve, reject) => {
            img.onload = resolve
            img.onerror = reject
            img.src = `data:image/png;base64,${result.rgba_png_base64}`
          })
          bitmap.getContext('2d').drawImage(img, 0, 0, w, h)
        } else if (result.mask_png_base64) {
          const maskImg = new Image()
          await new Promise((resolve, reject) => {
            maskImg.onload = resolve
            maskImg.onerror = reject
            maskImg.src = `data:image/png;base64,${result.mask_png_base64}`
          })
          maskCanvas.getContext('2d').drawImage(maskImg, 0, 0, w, h)
          const bctx = bitmap.getContext('2d')
          bctx.drawImage(src, 0, 0)
          bctx.globalCompositeOperation = 'destination-in'
          bctx.drawImage(maskCanvas, 0, 0)
          bctx.globalCompositeOperation = 'source-over'
        } else {
          throw new Error('Matte returned no mask')
        }
        // Derive mask from alpha when we only got RGBA.
        if (result.rgba_png_base64) {
          const alpha = bitmap.getContext('2d').getImageData(0, 0, w, h)
          const maskData = maskCanvas.getContext('2d').createImageData(w, h)
          for (let i = 0; i < alpha.data.length; i += 4) {
            const a = alpha.data[i + 3]
            maskData.data[i] = a
            maskData.data[i + 1] = a
            maskData.data[i + 2] = a
            maskData.data[i + 3] = 255
          }
          maskCanvas.getContext('2d').putImageData(maskData, 0, 0)
        }
      }

      const opaque = document.createElement('canvas')
      opaque.width = w
      opaque.height = h
      opaque.getContext('2d').drawImage(src, 0, 0)

      setElements((current) => current.map((item) => (
        item.id !== el.id
          ? item
          : {
            ...item,
            bitmap,
            sourceBitmap: opaque,
            maskCanvas,
            cleanup: null,
            smart: true,
            engine,
          }
      )))
      setSelectedElements([el.id])
      // Trim after paint so bounds match the new alpha (helper defined later in this render).
      queueMicrotask(() => trimElementTransparentBounds(el.id))
      setToast('Background removed from layer · base image untouched')
    } catch (err) {
      setToast(err?.message || 'Remove background failed')
    } finally {
      endBusy()
    }
  }

  /**
   * Layer from detect pipeline cutout (DINO → Real-ESRGAN → SAM2 → RGBA).
   * ``result.rect`` is in original canvas pixels; bitmap may be higher density.
   */
  const addElementFromDetectCutout = async (result, { name = 'AI layer', engine = 'ai' } = {}) => {
    const sourceCanvas = canvasRef.current
    if (!sourceCanvas || !result?.cutout_png_base64 || !result?.rect) return null
    const W = sourceCanvas.width
    const H = sourceCanvas.height
    const cutout = new Image()
    await new Promise((resolve, reject) => {
      cutout.onload = resolve
      cutout.onerror = reject
      cutout.src = `data:image/png;base64,${result.cutout_png_base64}`
    })
    const bitmap = document.createElement('canvas')
    bitmap.width = cutout.naturalWidth
    bitmap.height = cutout.naturalHeight
    bitmap.getContext('2d').drawImage(cutout, 0, 0)

    const rx = Math.round(result.rect.x)
    const ry = Math.round(result.rect.y)
    const rw = Math.max(2, Math.round(result.rect.width))
    const rh = Math.max(2, Math.round(result.rect.height))
    const sourceBitmap = document.createElement('canvas')
    sourceBitmap.width = bitmap.width
    sourceBitmap.height = bitmap.height
    sourceBitmap.getContext('2d').drawImage(
      sourceCanvas, rx, ry, rw, rh, 0, 0, bitmap.width, bitmap.height,
    )

    const maskCanvas = document.createElement('canvas')
    maskCanvas.width = bitmap.width
    maskCanvas.height = bitmap.height
    {
      const maskCtx = maskCanvas.getContext('2d')
      const alpha = bitmap.getContext('2d').getImageData(0, 0, bitmap.width, bitmap.height)
      const maskData = maskCtx.createImageData(bitmap.width, bitmap.height)
      for (let i = 0; i < alpha.data.length; i += 4) {
        const a = alpha.data[i + 3]
        maskData.data[i] = a
        maskData.data[i + 1] = a
        maskData.data[i + 2] = a
        maskData.data[i + 3] = 255
      }
      maskCtx.putImageData(maskData, 0, 0)
    }

    const smartRect = {
      x: rx / W,
      y: ry / H,
      w: rw / W,
      h: rh / H,
    }
    const id = newStudioId()
    const element = {
      id,
      name,
      ...smartRect,
      bitmap,
      sourceBitmap,
      maskCanvas,
      cleanup: null,
      rotation: 0,
      scaleX: 100,
      scaleY: 100,
      flipX: false,
      flipY: false,
      opacity: 100,
      motion: 'None',
      amplitude: 5,
      speed: 1,
      depth: Math.min(100, 30 + elements.length * 20),
      visible: true,
      smart: true,
      locked: false,
      anchorX: 50,
      anchorY: 50,
      engine,
      cutoutMode: source?.kind === 'gif' ? GIF_CUTOUT_LABEL : 'Still image',
    }
    setElements((current) => insertInStack(current, element, layerInsertAt, selectedElement))
    setSelectedElements([id])
    if (activeTab !== 'ai') goToWorkspace('motion')
    setSettings((current) => ({ ...current, preset: 'Still', ...PRESETS.Still }))
    setToast(`${name} ready · ${engine}`)
    return id
  }

  /** Build a movable layer from a full-canvas mask (SAM2 / MediaPipe / etc.). */
  const addElementFromMask = (maskCanvas, { name = 'AI layer', engine = 'ai' } = {}) => {
    const sourceCanvas = canvasRef.current
    if (!sourceCanvas || !maskCanvas) return null
    const W = sourceCanvas.width
    const H = sourceCanvas.height
    const mw = maskCanvas.width
    const mh = maskCanvas.height
    const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true })
    const maskData = maskCtx.getImageData(0, 0, mw, mh).data
    let minX = mw, minY = mh, maxX = 0, maxY = 0, found = false
    for (let y = 0; y < mh; y += 1) {
      for (let x = 0; x < mw; x += 1) {
        const a = maskData[(y * mw + x) * 4]
        if (a > 24) {
          found = true
          if (x < minX) minX = x
          if (y < minY) minY = y
          if (x > maxX) maxX = x
          if (y > maxY) maxY = y
        }
      }
    }
    if (!found) {
      setToast('Mask was empty — nothing to extract')
      return null
    }
    const pad = 2
    minX = Math.max(0, minX - pad)
    minY = Math.max(0, minY - pad)
    maxX = Math.min(mw - 1, maxX + pad)
    maxY = Math.min(mh - 1, maxY + pad)
    const sw = Math.max(2, maxX - minX + 1)
    const sh = Math.max(2, maxY - minY + 1)
    const scaleX = W / mw
    const scaleY = H / mh
    const sx = Math.round(minX * scaleX)
    const sy = Math.round(minY * scaleY)
    const cw = Math.max(2, Math.round(sw * scaleX))
    const ch = Math.max(2, Math.round(sh * scaleY))

    const bitmap = document.createElement('canvas')
    bitmap.width = cw
    bitmap.height = ch
    const bctx = bitmap.getContext('2d')
    bctx.drawImage(sourceCanvas, sx, sy, cw, ch, 0, 0, cw, ch)
    const localMask = document.createElement('canvas')
    localMask.width = cw
    localMask.height = ch
    localMask.getContext('2d').drawImage(maskCanvas, minX, minY, sw, sh, 0, 0, cw, ch)
    bctx.globalCompositeOperation = 'destination-in'
    bctx.drawImage(localMask, 0, 0)
    bctx.globalCompositeOperation = 'source-over'

    const sourceBitmap = document.createElement('canvas')
    sourceBitmap.width = cw
    sourceBitmap.height = ch
    sourceBitmap.getContext('2d').drawImage(sourceCanvas, sx, sy, cw, ch, 0, 0, cw, ch)

    const id = newStudioId()
    const rect = { x: sx / W, y: sy / H, w: cw / W, h: ch / H }
    const element = {
      id,
      name,
      ...rect,
      bitmap,
      sourceBitmap,
      maskCanvas: localMask,
      cleanup: null,
      rotation: 0,
      scaleX: 100,
      scaleY: 100,
      flipX: false,
      flipY: false,
      opacity: 100,
      motion: 'None',
      amplitude: 5,
      speed: 1,
      depth: Math.min(100, 30 + elements.length * 20),
      visible: true,
      smart: true,
      locked: false,
      anchorX: 50,
      anchorY: 50,
      engine,
    }
    setElements((current) => insertInStack(current, element, layerInsertAt, selectedElement))
    setSelectedElements([id])
    if (activeTab !== 'ai') goToWorkspace('motion')
    setSettings((current) => ({ ...current, preset: 'Still', ...PRESETS.Still }))
    setToast(`${name} ready · ${engine}`)
    return id
  }

  /**
   * Select Subject / Remove BG.
   * Remove BG remattes the selected cutout only — never rewrites the base image.
   * @param {{ model?: string, method?: string, target?: 'canvas'|'selection' }} opts
   */
  const runMatteCutout = async ({
    model,
    method,
    /** 'canvas' = Select Subject (near-full frame); 'selection' = Remove BG on selected cutout */
    target = 'canvas',
  } = {}) => {
    const canvas = canvasRef.current
    if (!canvas || !image) { setToast('Open an image first'); return }
    if (!assertStudioIdle()) return
    const cutoutId = model || useStudioStore.getState().tools.cutoutModel || 'birefnet'
    const req = { model: cutoutId, ...(method ? { method } : {}) }

    if (target === 'selection') {
      return rematteSelectedLayer(req)
    }

    // Select Subject — near-full frame (GrabCut still wants a thin BG rim around the subject).
    const pad = 0.02
    return extractElement(
      { x: pad, y: pad, w: 1 - pad * 2, h: 1 - pad * 2 },
      {
        ...req,
        name: 'Subject',
      },
    )
  }

  /**
   * Body joints via MediaPipe Pose (no human cutout).
   * @param {{ joints?: boolean, openPanel?: boolean, driveMotion?: boolean }} opts
   */
  const runPoseDetect = async ({
    joints = true,
    openPanel = false,
    driveMotion = true,
  } = {}) => {
    const canvas = canvasRef.current
    if (!canvas || !image) { setToast('Open an image first'); return }
    if (!assertStudioIdle()) return
    beginBusy('Detecting body…')
    try {
      const { detectBodyAndJoints } = await import('../ai/mediapipe')
      const result = await detectBodyAndJoints(canvas)
      useStudioStore.getState().setCapabilities({ mediapipe: true })

      const marked = result.joints.filter((j) => (j.score ?? 1) >= 0.25)
      const firstKey = marked.find((j) => POSE_KEY_JOINTS.includes(j.name))?.name
        || marked[0]?.name
        || null

      if (joints && result.joints?.length) {
        poseWarpCacheRef.current.clear()
        setPoseRig((current) => ({
          ...current,
          joints: result.joints,
          restJoints: result.joints,
          visible: true,
          driveMotion,
          score: result.score,
          engine: result.engine,
          panelOpen: openPanel,
          selectedJoint: openPanel ? (current.selectedJoint || firstKey) : current.selectedJoint,
          jointKeys: {},
          keysVersion: (current.keysVersion || 0) + 1,
        }))
        setBaseImageSelected(false)
        setArtboardSelected(false)
        setSelectedElements([])
        setSelectedOverlay(null)
        setSelectedText(null)
        if (openPanel) setGpuPreview(true)
      }

      if (result.joints?.length) {
        // Bind joints to an existing cutout layer when present (e.g. from DINO+SAM2).
        setElements((current) => {
          const body = current.find((el) => (
            el.name === 'Body'
            || /pose|mediapipe|sam2|dino|detect/i.test(el.engine || '')
          ))
          if (!body) return current
          return current.map((el) => (
            el.id === body.id
              ? { ...el, poseJoints: result.joints, motion: el.motion === 'None' ? 'Pose sway' : el.motion }
              : el
          ))
        })
      }

      setToast(marked.length ? `Pose · ${marked.length} joints` : 'No body / joints found')
    } catch (err) {
      setToast(err?.message || 'Body / pose detect failed')
    } finally {
      endBusy()
    }
  }

  /** After detect/segment: keep mask contour visible and select the Konva transform cube. */
  const selectDetectedCutout = (elementId = selectedElement) => {
    const id = elementId || selectedElement
    if (!id) return false
    setSelectedElements([id])
    setBaseImageSelected(false)
    setArtboardSelected(false)
    setSelectedOverlay(null)
    setSelectedText(null)
    setSelectMode(false)
    setMaskEditing(false)
    setPlaying(false)
    return true
  }

  const pickBestDetectBox = (boxes, promptText) => {
    const tokens = String(promptText || '')
      .toLowerCase()
      .split(/[\s.,;|]+/)
      .filter((t) => t.length > 1)
    const negatives = {
      dice: ['chip', 'poker', 'token', 'coin', 'roulette'],
      die: ['chip', 'poker', 'token', 'coin', 'roulette'],
    }
    const scored = (boxes || []).map((box) => {
      const label = String(box.label || '').toLowerCase()
      let match = 0
      for (const tok of tokens) {
        if (label.includes(tok) || tok.includes(label)) match = 2
        else if (tok.length >= 3 && (label.startsWith(tok.slice(0, 3)) || tok.startsWith(label.slice(0, 3)))) {
          match = Math.max(match, 1)
        }
      }
      let penalty = 0
      for (const tok of tokens) {
        for (const bad of negatives[tok] || []) {
          if (label.includes(bad) && !label.includes(tok)) penalty = 1
        }
      }
      const area = (box.w || 0) * (box.h || 0)
      return { box, match, penalty, score: box.score || 0, area }
    })
    const preferSmall = tokens.some((t) => ['dice', 'die', 'coin', 'ring', 'button'].includes(t))
    scored.sort((a, b) => (
      (b.match - a.match)
      || (a.penalty - b.penalty)
      || (preferSmall ? (a.area - b.area) : 0)
      || (b.score - a.score)
      || (a.area - b.area)
    ))
    return scored[0]?.box || null
  }

  const runTextDetect = async (prompt, {
    dinoModel, sam2Model, sam3Model, engine = 'grounding_dino',
  } = {}) => {
    const canvas = canvasRef.current
    if (!canvas || !image) { setToast('Open an image first'); return }
    const detectEngine = engine || 'grounding_dino'
    if (!prompt?.trim()) { setToast('Enter a text prompt'); return }
    if (!assertStudioIdle()) return
    beginBusy('Detecting objects…')
    try {
      // Roles: SAM3 text→mask | DINO→Real-ESRGAN→SAM2→RGBA. Never SAM3 on top of DINO.
      const { detectWithGroundingDino } = await import('../ai/grounding-dino')
      const result = await detectWithGroundingDino({
        imageCanvas: canvas,
        prompt: (prompt || '').trim(),
        refineSam2: detectEngine !== 'sam3',
        engine: detectEngine,
        dinoModel,
        sam2Model,
        sam3Model,
      })
      const boxes = result.boxes || []
      if (!boxes.length && !result.mask_png_base64) {
        setToast(`Detect · ${result.engine || 'ok'} · no boxes`)
        return
      }
      const eng = String(result.detect_engine || result.engine || '')
      if (/sam3/i.test(eng)) {
        useStudioStore.getState().setCapabilities({ sam3: true })
      } else {
        useStudioStore.getState().setCapabilities({ groundingDino: true })
      }

      const label = result.selected_label || prompt.trim()
      // DINO→Real-ESRGAN→SAM2 returns an RGBA cutout (may be denser than canvas).
      if (result.cutout_png_base64 && result.rect) {
        if (/sam3/i.test(eng)) {
          useStudioStore.getState().setCapabilities({ sam3: true })
        } else {
          const caps = { sam2: true }
          const up = String(result.upscale_engine || '')
          if (up && !up.startsWith('identity') && !up.startsWith('lanczos')) {
            caps.realesrgan = true
          }
          useStudioStore.getState().setCapabilities(caps)
        }
        const layerId = await addElementFromDetectCutout(result, {
          name: String(label).slice(0, 28) || 'Detected',
          engine: result.engine || eng || 'detect',
        })
        if (layerId) selectDetectedCutout(layerId)
        const sx = result.upscale_scale_x || 1
        const how = sx > 1.01
          ? 'DINO → Real-ESRGAN → SAM2'
          : 'Grounding DINO + SAM2'
        setToast(`${how} · “${label}” contour · cube selected`)
        return
      }

      if (result.mask_png_base64) {
        const maskCanvas = document.createElement('canvas')
        const img = new Image()
        await new Promise((resolve, reject) => {
          img.onload = resolve
          img.onerror = reject
          img.src = `data:image/png;base64,${result.mask_png_base64}`
        })
        maskCanvas.width = img.naturalWidth
        maskCanvas.height = img.naturalHeight
        maskCanvas.getContext('2d').drawImage(img, 0, 0)
        if (/sam3/i.test(eng)) {
          useStudioStore.getState().setCapabilities({ sam3: true })
        } else {
          useStudioStore.getState().setCapabilities({ sam2: true })
        }
        const layerId = addElementFromMask(maskCanvas, {
          name: String(label).slice(0, 28) || 'Detected',
          engine: result.engine || eng || 'detect',
        })
        if (layerId) selectDetectedCutout(layerId)
        const how = /sam3/i.test(eng)
          ? 'SAM 3 text→mask'
          : 'Grounding DINO + SAM2'
        setToast(`${how} · “${label}” contour · cube selected`)
        return
      }

      // Fallback: box only — rectangular crop (no object contour). Surface why.
      const top = result.selected_box || pickBestDetectBox(boxes, prompt.trim())
        || [...boxes].sort((a, b) => (b.score || 0) - (a.score || 0))[0]
      const rect = {
        x: top.x / canvas.width,
        y: top.y / canvas.height,
        w: top.w / canvas.width,
        h: top.h / canvas.height,
      }
      const layerId = await extractElement(rect)
      if (layerId) selectDetectedCutout(layerId)
      const why = result.refine_error
        || 'SAM2 mask missing — square box only, not object contour'
      setToast(`Detect · ${top.label || 'box'} · ${why}`)
    } catch (err) {
      setToast(err?.message || 'Text detect failed')
    } finally {
      endBusy()
    }
  }

  const updateElement = (key, value) => setElements((current) => current.map((el) => {
    if (el.id !== selectedElement) return el
    if (typeof value !== 'number') return { ...el, [key]: value }
    const decimals = key === 'x' || key === 'y' || key === 'w' || key === 'h' ? 4 : 1
    return { ...el, [key]: nice(value, decimals) }
  }))
  const updateElementById = (id, key, value) => setElements((current) => current.map((el) => {
    if (el.id !== id) return el
    if (typeof value !== 'number') return { ...el, [key]: value }
    const decimals = key === 'x' || key === 'y' || key === 'w' || key === 'h' ? 4 : 1
    return { ...el, [key]: nice(value, decimals) }
  }))
  const removeElement = (id) => {
    const target = elements.find((el) => el.id === id)
    if (target?.locked) { setToast('Unlock the element before removing it'); return }
    setElements((current) => current.filter((el) => el.id !== id))
    setSelectedElements((current) => current.filter((item) => item !== id))
    clearTimelineLayerSelection('element', id)
    setToast('Element removed')
  }
  const clearLayerSelection = () => {
    setSelectedElements([])
    setBaseImageSelected(false)
    setArtboardSelected(false)
    setSelectedOverlay(null)
    setEnhancedSelected(false)
  }
  const selectLayer = (id, event) => {
    const el = elements.find((item) => item.id === id)
    if (!el) return
    setBaseImageSelected(false)
    setArtboardSelected(false)
    setSelectedOverlay(null)
    setEnhancedSelected(false)
    setSelectedText(null)
    setPlaying(false)
    setSelectMode(false)
    const additive = Boolean(event?.metaKey || event?.ctrlKey)
    const range = Boolean(event?.shiftKey)
    setSelectedElements((prev) => {
      const ids = elements.map((item) => item.id)
      if (range && prev.length) {
        const anchor = prev[0]
        const a = ids.indexOf(anchor)
        const b = ids.indexOf(id)
        if (a >= 0 && b >= 0) {
          const lo = Math.min(a, b)
          const hi = Math.max(a, b)
          // Keep click target as primary (last).
          return [...ids.slice(lo, hi + 1).filter((item) => item !== id), id]
        }
      }
      if (additive) {
        if (prev.includes(id)) return prev.filter((item) => item !== id)
        return [...prev, id]
      }
      // Re-click a secondary layer → promote it to primary without clearing the group.
      if (prev.includes(id) && prev.length > 1) {
        return [...prev.filter((item) => item !== id), id]
      }
      return [id]
    })
  }
  const moveElement = (id, direction) => {
    setElements((current) => moveInStack(current, id, direction))
  }
  const moveOverlay = (id, direction) => {
    setOverlays((current) => moveInStack(current, id, direction))
  }
  const reorderElement = (fromId, toId) => {
    setElements((current) => reorderInStack(current, fromId, toId))
  }
  const reorderOverlay = (fromId, toId) => {
    setOverlays((current) => reorderInStack(current, fromId, toId))
  }
  const reorderText = (fromId, toId) => {
    setTextLayers((current) => reorderInStack(current, fromId, toId))
  }
  const toggleElementLock = (id) => {
    setElements((current) => current.map((el) => el.id === id ? { ...el, locked: !el.locked } : el))
  }
  const toggleElementVisible = (id) => {
    setElements((current) => current.map((el) => el.id === id ? { ...el, visible: !el.visible } : el))
  }
  const toggleImageLock = () => {
    setImageLocked((current) => {
      const next = !current
      setToast(next ? 'Base image locked' : 'Base image unlocked')
      return next
    })
  }
  /** Flip selected layer, or base image when none / base is selected. */
  const toggleFlip = (axis) => {
    const key = axis === 'y' ? 'flipY' : 'flipX'
    if (selectedElement) {
      const el = elements.find((item) => item.id === selectedElement)
      if (!el) return
      if (el.locked) { setToast('Unlock the layer to flip'); return }
      updateElement(key, !el[key])
      return
    }
    if (imageLocked) { setToast('Unlock the base image to flip'); return }
    setImageEdits((current) => ({ ...current, [key]: !current[key] }))
    if (!baseImageSelected) {
      setBaseImageSelected(true)
      setSelectedElements([])
    }
  }
  const rotateSelection = (delta) => {
    if (selectedElement) {
      const el = elements.find((item) => item.id === selectedElement)
      if (!el) return
      if (el.locked) { setToast('Unlock the layer to rotate'); return }
      updateElement('rotation', el.rotation + delta)
      return
    }
    if (imageLocked) { setToast('Unlock the base image to rotate'); return }
    setImageEdits((current) => ({ ...current, rotation: current.rotation + delta }))
    if (!baseImageSelected) {
      setBaseImageSelected(true)
      setSelectedElements([])
    }
  }
  const selectionFlip = (() => {
    if (selectedElement) {
      const el = elements.find((item) => item.id === selectedElement)
      return { flipX: Boolean(el?.flipX), flipY: Boolean(el?.flipY) }
    }
    return { flipX: Boolean(imageEdits.flipX), flipY: Boolean(imageEdits.flipY) }
  })()

  const selectBaseImage = () => {
    setBaseImageSelected(true)
    setArtboardSelected(false)
    setSelectedElements([])
    setSelectedOverlay(null)
    setEnhancedSelected(false)
    setSelectedText(null)
    setPlaying(false)
  }
  const selectEnhancedLayer = () => {
    if (!enhancedLayer) return
    setEnhancedSelected(true)
    setBaseImageSelected(false)
    setArtboardSelected(false)
    setSelectedElements([])
    setSelectedOverlay(null)
    setSelectedText(null)
    setPlaying(false)
  }
  const selectOverlay = (id) => {
    const overlay = overlays.find((item) => item.id === id)
    if (!overlay) return
    setSelectedOverlay(id)
    setSelectedElements([])
    setBaseImageSelected(false)
    setArtboardSelected(false)
    setEnhancedSelected(false)
    setSelectedText(null)
    setPlaying(false)
    setSelectMode(false)
    setMaskEditing(false)
  }
  const toggleOverlayVisible = (id) => {
    setOverlays((current) => current.map((overlay) => (
      overlay.id === id ? { ...overlay, visible: !overlay.visible } : overlay
    )))
  }
  const removeOverlay = (id) => {
    setOverlays((current) => {
      const target = current.find((overlay) => overlay.id === id)
      if (target) revokeBlobUrl(target.url)
      return current.filter((overlay) => overlay.id !== id)
    })
    setSelectedOverlay((current) => (current === id ? null : current))
    clearTimelineLayerSelection('overlay', id)
    setToast('Overlay removed')
  }
  /** Stage hit-box for an overlay (fractions of canvas), matching draw layout. */
  const overlayBounds = (overlay) => {
    if (!overlay?.image || !settings.width || !settings.height) {
      return { x: 0.2, y: 0.2, w: 0.3, h: 0.3, rotation: 0 }
    }
    const aspect = overlay.image.naturalHeight / Math.max(1, overlay.image.naturalWidth)
    const w = (overlay.width / 100) * ((overlay.scaleX || 100) / 100)
    const h = (overlay.width / 100) * aspect * (settings.width / settings.height) * ((overlay.scaleY || 100) / 100)
    return {
      x: overlay.x / 100 - w / 2,
      y: overlay.y / 100 - h / 2,
      w: Math.max(0.02, w),
      h: Math.max(0.02, h),
      rotation: overlay.rotation || 0,
    }
  }
  const selectStageOverlay = (id, event) => {
    event?.stopPropagation?.()
    selectOverlay(id)
  }
  const selectStageElement = (id, event) => {
    const el = elements.find((item) => item.id === id)
    if (!el) return
    const additive = Boolean(event?.metaKey || event?.ctrlKey || event?.shiftKey)
    if (el.locked && !additive) {
      setToast('Element is locked — unlock to transform')
    }
    selectLayer(id, event)
  }

  const imageTransformBox = useMemo(() => {
    if (!source?.width || !source?.height || !settings.width || !settings.height) {
      return { x: 0.1, y: 0.1, w: 0.8, h: 0.8, rotation: 0 }
    }
    const iw = source.width
    const ih = source.height
    const motion = settings.motion || 'None'
    const motionSpeed = Math.max(0.1, settings.speed ?? settings.cycles ?? 1)
    const isLoop = motion !== 'None'
    let timeline = progress
    if (settings.pingPong) {
      const phase = (progress * (isLoop ? 1 : motionSpeed)) % 2
      timeline = phase <= 1 ? phase : 2 - phase
    } else if (!isLoop) {
      timeline = Math.min(1, progress * motionSpeed)
    }
    const t = ease(timeline, settings.easing)
    const timeSec = progress * (settings.duration || 1)
    let scale = (settings.scaleStart + (settings.scaleEnd - settings.scaleStart) * t) / 100
    let ox = (settings.xStart + (settings.xEnd - settings.xStart) * t) / 100
    let oy = (settings.yStart + (settings.yEnd - settings.yStart) * t) / 100
    let rotation = settings.rotateStart + (settings.rotateEnd - settings.rotateStart) * t + imageEdits.rotation
    const amp = settings.amplitude ?? 0
    if (isLoop && (amp !== 0 || motion === 'Spin')) {
      const phase = progress * Math.PI * 2 * motionSpeed
      if (motion === 'Float') oy += -Math.sin(phase) * amp / 100
      if (motion === 'Drift') ox += Math.sin(phase) * amp / 100
      if (motion === 'Bounce') oy += -Math.abs(Math.sin(phase)) * amp / 100
      if (motion === 'Pulse') scale *= 1 + Math.sin(phase) * amp / 100
      if (motion === 'Spin') rotation += (phase * 180) / Math.PI
      if (motion === 'Wobble') rotation += Math.sin(phase) * amp
      if (motion === 'Orbit') {
        ox += Math.cos(phase) * amp / 100
        oy += Math.sin(phase) * amp / 100
      }
    }
    const ax = (settings.anchorX ?? 50) / 100
    const ay = (settings.anchorY ?? 50) / 100
    const fit = settings.fit
    let udw
    let udh
    if (fit === 'Stretch') {
      udw = 1
      udh = 1
    } else if (fit === 'Original size') {
      udw = iw / settings.width
      udh = ih / settings.height
    } else {
      const contain = Math.min(settings.width / iw, settings.height / ih)
      const cover = Math.max(settings.width / iw, settings.height / ih)
      const base = fit === 'Cover' ? cover : contain
      udw = (iw * base) / settings.width
      udh = (ih * base) / settings.height
    }
    const cx = 0.5 + ox
    const cy = 0.5 + oy
    const left = cx - udw / 2
    const top = cy - udh / 2
    // Same image-local pivot as draw(): at scale 1 the box stays put when the anchor moves.
    const dw = udw * scale
    const dh = udh * scale
    return {
      x: ax + (left - ax) * scale,
      y: ay + (top - ay) * scale,
      w: Math.max(0.02, dw),
      h: Math.max(0.02, dh),
      rotation,
    }
  }, [source?.width, source?.height, settings, imageEdits.rotation, progress])

  const enhancedTransformBox = useMemo(() => {
    if (!enhancedLayer?.width || !enhancedLayer?.height || !settings.width || !settings.height) {
      return null
    }
    const iw = enhancedLayer.width
    const ih = enhancedLayer.height
    const fit = enhancedLayer.fit || 'Contain'
    let udw
    let udh
    if (fit === 'Stretch') {
      udw = 1
      udh = 1
    } else if (fit === 'Original size') {
      udw = iw / settings.width
      udh = ih / settings.height
    } else {
      const contain = Math.min(settings.width / iw, settings.height / ih)
      const cover = Math.max(settings.width / iw, settings.height / ih)
      const base = fit === 'Cover' ? cover : contain
      udw = (iw * base) / settings.width
      udh = (ih * base) / settings.height
    }
    const scale = (settings.scaleStart ?? 100) / 100
    const ox = (settings.xStart ?? 0) / 100
    const oy = (settings.yStart ?? 0) / 100
    const cx = 0.5 + ox
    const cy = 0.5 + oy
    const left = cx - udw / 2
    const top = cy - udh / 2
    const ax = (settings.anchorX ?? 50) / 100
    const ay = (settings.anchorY ?? 50) / 100
    return {
      x: ax + (left - ax) * scale,
      y: ay + (top - ay) * scale,
      w: Math.max(0.02, udw * scale),
      h: Math.max(0.02, udh * scale),
      rotation: (settings.rotateStart || 0) + (imageEdits.rotation || 0),
    }
  }, [enhancedLayer, settings, imageEdits.rotation])

  const rebuildMaskedElement = (element) => {
    if (!element.sourceBitmap || !element.maskCanvas) return element
    const bitmap = document.createElement('canvas'); bitmap.width = element.sourceBitmap.width; bitmap.height = element.sourceBitmap.height
    const context = bitmap.getContext('2d'); context.drawImage(element.sourceBitmap, 0, 0); context.globalCompositeOperation = 'destination-in'; context.drawImage(element.maskCanvas, 0, 0)
    return { ...element, bitmap }
  }
  const mutateMask = (id, mutation) => setElements((current) => current.map((element) => {
    if (element.id !== id || !element.maskCanvas) return element
    mutation(element.maskCanvas); return rebuildMaskedElement(element)
  }))
  const resetElementMask = (shape = 'Rectangle') => mutateMask(selectedElement, (mask) => {
    const context = mask.getContext('2d'); context.globalCompositeOperation = 'source-over'; context.clearRect(0, 0, mask.width, mask.height); context.fillStyle = '#fff'
    if (shape === 'Ellipse') { context.beginPath(); context.ellipse(mask.width / 2, mask.height / 2, mask.width / 2, mask.height / 2, 0, 0, Math.PI * 2); context.fill() }
    else context.fillRect(0, 0, mask.width, mask.height)
  })
  const invertElementMask = () => mutateMask(selectedElement, (mask) => {
    const context = mask.getContext('2d'), pixels = context.getImageData(0, 0, mask.width, mask.height)
    for (let i = 3; i < pixels.data.length; i += 4) pixels.data[i] = 255 - pixels.data[i]
    context.putImageData(pixels, 0, 0)
  })
  const featherElementMask = () => mutateMask(selectedElement, (mask) => {
    const copy = document.createElement('canvas'); copy.width = mask.width; copy.height = mask.height; copy.getContext('2d').drawImage(mask, 0, 0)
    const context = mask.getContext('2d'); context.clearRect(0, 0, mask.width, mask.height); context.filter = `blur(${maskBrush.feather}px)`; context.drawImage(copy, 0, 0); context.filter = 'none'
  })
  const strokeMaskAtEvent = (element, mask, event) => {
    if (!stageRef.current) return false
    const point = pointerPosition(event)
    const localX = (point.x - element.x) / element.w
    const localY = (point.y - element.y) / element.h
    if (localX < 0 || localX > 1 || localY < 0 || localY > 1) return false
    const context = mask.getContext('2d')
    const x = localX * mask.width
    const y = localY * mask.height
    const radius = maskBrush.size / 2 * mask.width / Math.max(1, settings.width * element.w)
    const gradient = context.createRadialGradient(x, y, radius * maskBrush.hardness / 100, x, y, radius)
    const alpha = maskBrush.opacity / 100
    if (maskBrush.mode === 'Hide') {
      context.globalCompositeOperation = 'destination-out'
      gradient.addColorStop(0, `rgba(0,0,0,${alpha})`)
      gradient.addColorStop(1, 'rgba(0,0,0,0)')
    } else {
      context.globalCompositeOperation = 'source-over'
      gradient.addColorStop(0, `rgba(255,255,255,${alpha})`)
      gradient.addColorStop(1, 'rgba(255,255,255,0)')
    }
    context.fillStyle = gradient
    context.beginPath()
    context.arc(x, y, radius, 0, Math.PI * 2)
    context.fill()
    context.globalCompositeOperation = 'source-over'
    return true
  }

  const paintElementMask = (event) => {
    const element = elements.find((item) => item.id === selectedElement)
    if (!element?.maskCanvas) return
    mutateMask(element.id, (mask) => { strokeMaskAtEvent(element, mask, event) })
  }

  const cropCanvas = (src, minX, minY, nw, nh) => {
    if (!src) return null
    const canvas = document.createElement('canvas')
    canvas.width = nw
    canvas.height = nh
    canvas.getContext('2d').drawImage(src, minX, minY, nw, nh, 0, 0, nw, nh)
    return canvas
  }

  const tightBoundsFromBitmap = (bitmap) => {
    const w = bitmap.width
    const h = bitmap.height
    if (w < 2 || h < 2) return null
    const data = bitmap.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data
    let minX = w
    let minY = h
    let maxX = -1
    let maxY = -1
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        if (data[(y * w + x) * 4 + 3] > 10) {
          if (x < minX) minX = x
          if (y < minY) minY = y
          if (x > maxX) maxX = x
          if (y > maxY) maxY = y
        }
      }
    }
    if (maxX < 0) return null
    minX = Math.max(0, minX - 1)
    minY = Math.max(0, minY - 1)
    maxX = Math.min(w - 1, maxX + 1)
    maxY = Math.min(h - 1, maxY + 1)
    const nw = maxX - minX + 1
    const nh = maxY - minY + 1
    if (nw >= w - 2 && nh >= h - 2) return null
    return { minX, minY, nw, nh, w, h }
  }

  const applyTightBounds = (el, bounds) => {
    if (!bounds) return el
    const { minX, minY, nw, nh, w, h } = bounds
    return {
      ...el,
      x: el.x + (minX / w) * el.w,
      y: el.y + (minY / h) * el.h,
      w: (nw / w) * el.w,
      h: (nh / h) * el.h,
      bitmap: cropCanvas(el.bitmap, minX, minY, nw, nh),
      sourceBitmap: cropCanvas(el.sourceBitmap, minX, minY, nw, nh) || cropCanvas(el.bitmap, minX, minY, nw, nh),
      maskCanvas: cropCanvas(el.maskCanvas, minX, minY, nw, nh),
      cleanup: el.cleanup ? cropCanvas(el.cleanup, minX, minY, nw, nh) : null,
    }
  }

  /** Last dab of a brush stroke — paint + (when erasing) shrink the transform box. */
  const endMaskStroke = (event) => {
    const id = selectedElement
    if (!id) return
    setElements((current) => current.map((element) => {
      if (element.id !== id || !element.maskCanvas) return element
      strokeMaskAtEvent(element, element.maskCanvas, event)
      let next = rebuildMaskedElement(element)
      if (maskBrush.mode === 'Hide' && next.bitmap) {
        next = applyTightBounds(next, tightBoundsFromBitmap(next.bitmap))
      }
      return next
    }))
  }

  /** Crop layer bitmaps + shrink transform box to opaque mask pixels (after erase brush). */
  const trimElementTransparentBounds = (id) => {
    setElements((current) => current.map((el) => {
      if (el.id !== id || !el.bitmap) return el
      return applyTightBounds(el, tightBoundsFromBitmap(el.bitmap))
    }))
  }

  /** Enter erase brush on the selected cutout — delete stray path (hair/hand) from the mask. */
  const beginMaskErase = (elementId = selectedElement) => {
    const id = elementId || selectedElement
    if (!id) {
      setToast('Select a cutout layer first')
      return false
    }
    selectDetectedCutout(id)
    setMaskBrush((current) => ({ ...current, mode: 'Hide' }))
    setMaskEditing(true)
    return true
  }

  const addTextLayer = (opts = {}) => {
    let addedId = null
    const duration = Math.max(0.1, settings.duration || 1)
    setTextLayers((current) => {
      if (current.length >= MAX_TEXT_LAYERS) return current
      const id = newStudioId()
      const layer = clampTextInOut(
        { id, name: `Text ${current.length + 1}`, ...TEXT_DEFAULT, in: 0, out: duration },
        duration,
      )
      addedId = id
      return [...current, layer]
    })
    if (addedId == null) {
      setToast(`Max ${MAX_TEXT_LAYERS} text layers`)
      return null
    }
    setSelectedText(addedId)
    setPlaying(false)
    if (!opts.stay) goToWorkspace('text')
    setToast('Text layer added')
    return addedId
  }
  const updateText = (key, value) => setTextLayers((current) => current.map((layer) => {
    if (layer.id !== selectedText) return layer
    if (typeof value !== 'number') return { ...layer, [key]: value }
    return { ...layer, [key]: nice(value, key === 'x' || key === 'y' ? 2 : 1) }
  }))
  const updateTextById = (id, patch) => {
    setTextLayers((current) => current.map((layer) => {
      if (layer.id !== id) return layer
      const next = { ...layer, ...patch }
      return clampTextInOut(next, settings.duration)
    }))
  }
  const removeText = (id) => {
    const layer = textLayers.find((item) => item.id === id)
    if (layer?.locked) { setToast('Unlock the text layer before removing it'); return }
    setTextLayers((current) => current.filter((item) => item.id !== id))
    setSelectedText((current) => (current === id ? null : current))
    clearTimelineLayerSelection('text', id)
    setToast('Text layer removed')
  }
  const toggleTextLock = (id) => {
    setTextLayers((current) => current.map((layer) => layer.id === id ? { ...layer, locked: !layer.locked } : layer))
  }
  const moveText = (id, direction) => setTextLayers((current) => moveInStack(current, id, direction))
  const uploadFont = async (file) => {
    if (!file) return
    try {
      const family = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ')
      const face = new FontFace(family, await file.arrayBuffer()); await face.load(); document.fonts.add(face)
      setFontOptions((current) => current.includes(family) ? current : [...current, family]); updateText('font', family)
      setToast(`${family} font loaded locally`)
    } catch { setToast('This font file could not be loaded') }
  }
  const imageFromUrl = (url) => new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = url })

  const clearEnhancedLayer = () => {
    setEnhancedLayer((current) => {
      if (current?.url) revokeBlobUrl(current.url)
      return null
    })
    setEnhancedSelected(false)
  }

  const updateEnhancedLayer = (patch) => {
    setEnhancedLayer((current) => (current ? { ...current, ...patch } : current))
  }

  const removeEnhancedLayer = () => {
    clearEnhancedLayer()
    setToast('Enhanced layer removed')
  }

  const matchEnhancedSize = () => {
    if (canvasLocked) { setToast('Unlock the artboard to resize'); return }
    if (!enhancedLayer?.width || !enhancedLayer?.height) {
      setToast('Upscale an image first')
      return
    }
    if (enhancedLayer.width > MAX_CANVAS || enhancedLayer.height > MAX_CANVAS) {
      setToast(`Enhanced exceeds ${MAX_CANVAS}px limit — lower scale or enter a smaller artboard`)
      return
    }
    setSettings((current) => ({
      ...current,
      width: enhancedLayer.width,
      height: enhancedLayer.height,
      fit: 'Original size',
    }))
    setEnhancedLayer((current) => (current ? { ...current, fit: 'Original size' } : current))
    setToast(`Artboard set to enhanced size ${enhancedLayer.width} × ${enhancedLayer.height} px`)
  }

  const runUpscaleToEnhanced = async ({ model = 'realesrgan', scale = 2 } = {}) => {
    if (!image) {
      setToast('Open an image first')
      return
    }
    if (!assertStudioIdle()) return
    if (String(model).toLowerCase() === 'gfpgan') {
      throw new Error('GFPGAN slot — place weights under models/gfpgan/, or use Real-ESRGAN')
    }
    const gen = ++enhanceGenRef.current
    ioLockRef.current = true
    setScaleBusy(true)
    setBusyLabel('Upscaling…')
    setToast('Upscaling…')
    try {
      await runStudioTask({
        kind: 'upscale',
        backend: 'server',
        run: async ({ setProgress }) => {
          setProgress(0.05)
          // Always upscale the original source bitmap — not the composited preview canvas.
          const srcCanvas = document.createElement('canvas')
          srcCanvas.width = image.naturalWidth || image.width
          srcCanvas.height = image.naturalHeight || image.height
          srcCanvas.getContext('2d').drawImage(image, 0, 0)
          const { upscaleWithRealESRGAN } = await import('../ai/realesrgan')
          const result = await upscaleWithRealESRGAN({
            imageCanvas: srcCanvas,
            scale,
            model,
          })
          setProgress(0.85)
          if (gen !== enhanceGenRef.current) return null
          if (!result.url && !result.blob) throw new Error('Upscale returned no image')
          const blob = result.blob || await (await fetch(result.url)).blob()
          const url = result.url || URL.createObjectURL(blob)
          const img = await imageFromUrl(url)
          if (gen !== enhanceGenRef.current) {
            if (url.startsWith('blob:')) revokeBlobUrl(url)
            return null
          }
          setEnhancedLayer((prev) => {
            if (prev?.url && prev.url !== url) revokeBlobUrl(prev.url)
            return {
              id: newStudioId(),
              name: `Enhanced ${scale}×`,
              url,
              image: img,
              width: img.naturalWidth || img.width,
              height: img.naturalHeight || img.height,
              scale,
              model,
              engine: result.engine || model,
              fit: 'Contain',
              visible: true,
              bytes: blob.size,
              rollbackKept: true,
            }
          })
          setEnhancedSelected(true)
          setBaseImageSelected(false)
          setImageVisible(false)
          setToast(`Enhanced · ${scale}× · ${result.engine || model} · original kept for rollback · hide base to preview`)
          setProgress(1)
          return { engine: result.engine || model, scale }
        },
      })
    } catch (err) {
      if (err?.code !== 'CANCELLED' && err?.code !== 'STALE') {
        setToast(err?.message || 'Upscale failed')
      }
    } finally {
      if (gen === enhanceGenRef.current) {
        ioLockRef.current = false
        setScaleBusy(false)
        setBusyLabel('')
      }
    }
  }

  const downloadEnhancedPng = async () => {
    if (!enhancedLayer?.image) {
      setToast('Upscale an image first')
      return
    }
    if (!assertStudioIdle()) return
    ioLockRef.current = true
    setDownloadBusy(true)
    setBusyLabel('Preparing PNG…')
    setToast('Preparing PNG…')
    let objectUrl = null
    try {
      const canvas = document.createElement('canvas')
      canvas.width = enhancedLayer.width || enhancedLayer.image.naturalWidth
      canvas.height = enhancedLayer.height || enhancedLayer.image.naturalHeight
      canvas.getContext('2d').drawImage(enhancedLayer.image, 0, 0)
      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode PNG'))), 'image/png')
      })
      objectUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = objectUrl
      const baseName = (source?.name || 'image').replace(/\.[^.]+$/, '')
      link.download = `${baseName}-enhanced-${enhancedLayer.scale || 2}x.png`
      link.click()
      setToast(`Enhanced PNG · ${fmtBytes(blob.size)}`)
    } catch (err) {
      setToast(err?.message || 'PNG download failed')
    } finally {
      if (objectUrl) setTimeout(() => revokeBlobUrl(objectUrl), 1500)
      ioLockRef.current = false
      setDownloadBusy(false)
      setBusyLabel('')
    }
  }

  const addOverlay = async (file) => {
    if (!file) return
    const blocked = uploadImageError(file)
    if (blocked) { notifyError(blocked); return }
    try {
      const url = URL.createObjectURL(file)
      const overlayImage = await imageFromUrl(url)
      const id = newStudioId()
      const overlay = {
        id, name: file.name, image: overlayImage, url,
        x: 50, y: 50, width: 30, scaleX: 100, scaleY: 100, rotation: 0, opacity: 100,
        flipX: false, flipY: false, visible: true,
        anchorX: 50, anchorY: 50,
      }
      setOverlays((current) => insertInStack(current, overlay, layerInsertAt, selectedOverlay))
      setSelectedOverlay(id)
      setSelectedElements([])
      setBaseImageSelected(false)
      setArtboardSelected(false)
      setEnhancedSelected(false)
      setSelectedText(null)
      setPlaying(false)
      if (activeTab !== 'ai') goToWorkspace('motion')
      notifySuccess(layerInsertAt === 'front' ? 'Image overlay added in front' : 'Image overlay added in back')
    } catch (err) {
      notifyError(err?.message || 'Could not add overlay image.')
    }
  }
  const updateOverlay = (key, value) => setOverlays((current) => current.map((overlay) => {
    if (overlay.id !== selectedOverlay) return overlay
    if (typeof value !== 'number') return { ...overlay, [key]: value }
    return { ...overlay, [key]: nice(value, 1) }
  }))
  const updateOverlayById = (id, patch) => setOverlays((current) => current.map((overlay) => {
    if (overlay.id !== id) return overlay
    const next = { ...overlay }
    Object.entries(patch).forEach(([key, value]) => {
      next[key] = typeof value === 'number' ? nice(value, 1) : value
    })
    return next
  }))
  const saveCurrentPng = async (reducePalette = false) => {
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(settings.width))
    canvas.height = Math.max(1, Math.round(settings.height))
    draw(progress, canvas, 1)
    let blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (apiAvailable) {
      try { const form = new FormData(); form.append('image', blob, 'frame.png'); form.append('palette', String(reducePalette)); const response = await fetch('/api/optimize-png', { method: 'POST', body: form }); if (response.ok) blob = await response.blob() } catch { /* Keep browser PNG. */ }
    }
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `${(source?.name || 'frame').replace(/\.[^.]+$/, '')}-frame.png`; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000); setToast(`PNG saved · ${fmtBytes(blob.size)}`)
  }
  const compressExistingGif = async (file) => {
    if (!file) return
    if (!apiAvailable) { setToast('Start the Python API to compress an existing GIF'); return }
    setExporting(true); setToast('Compressing GIF with gifsicle…')
    try {
      const form = new FormData(); form.append('image', file, file.name); form.append('compression_method', settings.compressionMethod); form.append('lossy', String(settings.lossy)); form.append('colors', String(settings.palette))
      const response = await fetch('/api/compress-gif', { method: 'POST', body: form })
      if (!response.ok) { const detail = await response.json().catch(() => ({})); throw new Error(apiErrorMessage(detail.detail, 'Compression failed')) }
      const blob = await response.blob(), originalBytes = Number(response.headers.get('X-GIF-Original-Bytes')) || file.size
      const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `${file.name.replace(/\.gif$/i, '')}-compressed.gif`; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000)
      setLastExport({ bytes: blob.size, originalBytes, optimized: true, encoder: 'gifsicle compressor' }); setToast(`Compressed ${Math.max(0, Math.round((1 - blob.size / originalBytes) * 100))}% · ${fmtBytes(blob.size)}`)
    } catch (error) { setToast(error.message) } finally { setExporting(false) }
  }

  const beginAnchorDrag = (event) => {
    if (!stageRef.current) return
    event.stopPropagation()
    event.preventDefault()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    const kind = baseImageSelected
      ? 'image'
      : selectedOverlay
        ? 'overlay'
        : selectedElements.length === 1
          ? 'element'
          : null
    if (!kind) return
    anchorDrag.current = {
      kind,
      id: kind === 'element' ? selectedElements[0] : kind === 'overlay' ? selectedOverlay : null,
    }
  }
  const moveAnchorDrag = (event) => {
    const drag = anchorDrag.current
    if (!drag || !stageRef.current) return
    event.stopPropagation()
    const bounds = stageRef.current.getBoundingClientRect()
    const px = clampNice(((event.clientX - bounds.left) / bounds.width) * 100, 0, 100, 1)
    const py = clampNice(((event.clientY - bounds.top) / bounds.height) * 100, 0, 100, 1)

    if (drag.kind === 'image') {
      setSettings((current) => ({ ...current, anchorX: px, anchorY: py }))
      return
    }
    if (drag.kind === 'element') {
      setElements((current) => current.map((el) => {
        if (el.id !== drag.id || el.locked) return el
        const ax = clampNice((px / 100 - el.x) / Math.max(0.001, el.w) * 100, 0, 100, 1)
        const ay = clampNice((py / 100 - el.y) / Math.max(0.001, el.h) * 100, 0, 100, 1)
        return { ...el, anchorX: ax, anchorY: ay }
      }))
      return
    }
    if (drag.kind === 'overlay') {
      setOverlays((current) => current.map((overlay) => {
        if (overlay.id !== drag.id) return overlay
        const box = overlayBounds(overlay)
        const ax = clampNice((px / 100 - box.x) / Math.max(0.001, box.w) * 100, 0, 100, 1)
        const ay = clampNice((py / 100 - box.y) / Math.max(0.001, box.h) * 100, 0, 100, 1)
        return { ...overlay, anchorX: ax, anchorY: ay }
      }))
    }
  }
  const endAnchorDrag = (event) => {
    if (!anchorDrag.current) return
    event.stopPropagation()
    anchorDrag.current = null
  }

  /** Drag a pose joint in the preview — writes start/end keys from the playhead. */
  const beginJointDrag = (event, jointName) => {
    if (!stageRef.current || !jointName) return
    event.stopPropagation()
    event.preventDefault()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    const rest = (poseRig.restJoints?.length ? poseRig.restJoints : poseRig.joints)
      .find((j) => j.name === jointName)
    if (!rest) return
    setPlaying(false)
    setPoseRig((current) => ({
      ...current,
      panelOpen: true,
      selectedJoint: jointName,
      visible: true,
    }))
    jointDrag.current = {
      name: jointName,
      restX: rest.x,
      restY: rest.y,
      atStart: progress < 0.5,
    }
  }

  const moveJointDrag = (event) => {
    const drag = jointDrag.current
    if (!drag || !stageRef.current) return
    event.stopPropagation()
    const bounds = stageRef.current.getBoundingClientRect()
    const nx = clamp((event.clientX - bounds.left) / bounds.width, 0, 1)
    const ny = clamp((event.clientY - bounds.top) / bounds.height, 0, 1)
    const dx = clampNice(nx - drag.restX, -0.35, 0.35, 4)
    const dy = clampNice(ny - drag.restY, -0.35, 0.35, 4)
    poseWarpCacheRef.current.clear()
    const nextRig = (() => {
      const current = poseRigRef.current
      const prev = current.jointKeys?.[drag.name] || emptyJointKey()
      const nextKey = drag.atStart
        ? { ...prev, startDx: dx, startDy: dy }
        : { ...prev, endDx: dx, endDy: dy }
      return {
        ...current,
        jointKeys: { ...current.jointKeys, [drag.name]: nextKey },
        keysVersion: (current.keysVersion || 0) + 1,
        selectedJoint: drag.name,
      }
    })()
    poseRigRef.current = nextRig
    setPoseRig(nextRig)
    drawRef.current?.(progress)
  }

  const endJointDrag = (event) => {
    if (!jointDrag.current) return
    event?.stopPropagation?.()
    jointDrag.current = null
    draw(progress)
  }

  const resetMotionAnchor = () => {
    if (baseImageSelected) {
      setSettings((current) => ({ ...current, anchorX: 50, anchorY: 50 }))
      return
    }
    if (selectedOverlay) {
      setOverlays((current) => current.map((overlay) => (
        overlay.id === selectedOverlay ? { ...overlay, anchorX: 50, anchorY: 50 } : overlay
      )))
      return
    }
    if (selectedElements.length === 1) {
      const id = selectedElements[0]
      setElements((current) => current.map((el) => (
        el.id === id ? { ...el, anchorX: 50, anchorY: 50 } : el
      )))
    }
  }

  const exportGif = async () => {
    if (!image || !assertStudioIdle()) return
    if (frames > 240) { setToast('Reduce duration or FPS below 240 frames for browser export'); return }
    ioLockRef.current = true
    setExporting(true); setToast(''); setPlaying(false)
    await new Promise((r) => setTimeout(r, 30))
    try {
      const limit = settings.quality === 'High quality' ? 1440 : settings.quality === 'Balanced' ? 1080 : 720
      let ratio = apiAvailable ? 1 : Math.min(1, limit / Math.max(settings.width, settings.height))
      let width = Math.round(settings.width * ratio), height = Math.round(settings.height * ratio)
      const work = document.createElement('canvas'); work.width = width; work.height = height

      const renderExportFrame = (tNorm) => {
        const api = konvaStageApiRef.current
        if (api?.seekTo && api?.captureFrameCanvas) {
          api.seekTo(tNorm)
          const captured = api.captureFrameCanvas()
          if (captured) {
            const ctx = work.getContext('2d')
            ctx.clearRect(0, 0, width, height)
            ctx.drawImage(captured, 0, 0, width, height)
            return
          }
        }
        draw(tNorm, work, ratio)
      }

      if (apiAvailable) {
        try {
          const form = new FormData()
          for (let i = 0; i < frames; i++) {
            renderExportFrame(i / frames)
            const frameBlob = await new Promise((resolve) => work.toBlob(resolve, 'image/png'))
            form.append('frames', frameBlob, `frame-${String(i).padStart(4, '0')}.png`)
            if (i % 2 === 0) { setProgress((i + 1) / frames * .72); await new Promise((r) => setTimeout(r, 0)) }
          }
          form.append('fps', String(Math.max(1, Math.round(timingFps)))); form.append('loop', String(settings.loop))
          form.append('palette', String(settings.palette)); form.append('optimize', 'true')
          form.append('dither', 'false'); form.append('lossy', String(settings.lossy))
          form.append('compression_method', settings.compressionMethod)
          form.append('disposal', String(settings.disposal))
          form.append('durations', JSON.stringify(frameDelays))
          setProgress(.8)
          const response = await fetch('/api/export', { method: 'POST', body: form })
          if (!response.ok) { const detail = await response.json().catch(() => ({})); throw new Error(apiErrorMessage(detail.detail, 'Python export failed')) }
          const blob = await response.blob(); setProgress(1)
          const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
          a.download = `${(source?.name || 'animation').replace(/\.[^.]+$/, '').trim().replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'animation'}.gif`; a.click()
          setTimeout(() => URL.revokeObjectURL(a.href), 1000)
          const optimized = response.headers.get('X-GIF-Optimized') === 'true'
          const originalBytes = Number(response.headers.get('X-GIF-Original-Bytes')) || blob.size
          setLastExport({ bytes: blob.size, originalBytes, optimized, encoder: 'ImageIO' })
          trackExportSucceeded({ encoder: 'ImageIO', bytes: blob.size, frames, backend: 'server' })
          setToast(`GIF exported with ImageIO${optimized ? ' + gifsicle' : ''} · ${fmtBytes(blob.size)}`)
          return
        } catch (error) {
          console.warn('Python export unavailable; using browser encoder.', error)
          setToast('Python export unavailable — using browser encoder')
          ratio = Math.min(1, limit / Math.max(settings.width, settings.height))
          width = Math.round(settings.width * ratio); height = Math.round(settings.height * ratio)
          work.width = width; work.height = height
        }
      }

      const encoder = GIFEncoder()
      const colorFormat = settings.transparent ? 'rgba4444' : 'rgb565'
      const maxColors = Math.min(256, settings.palette)
      const sampleWidth = Math.min(240, width), sampleHeight = Math.max(1, Math.round(height * sampleWidth / width))
      const sampleCanvas = document.createElement('canvas'); sampleCanvas.width = sampleWidth; sampleCanvas.height = sampleHeight
      const sampleCount = Math.min(12, frames), samplePixels = new Uint8Array(sampleWidth * sampleHeight * 4 * sampleCount)
      for (let sample = 0; sample < sampleCount; sample++) {
        draw(sample / sampleCount, sampleCanvas, sampleWidth / settings.width)
        samplePixels.set(sampleCanvas.getContext('2d').getImageData(0, 0, sampleWidth, sampleHeight).data, sample * sampleWidth * sampleHeight * 4)
      }
      const globalPalette = quantize(samplePixels, maxColors, { format: colorFormat, oneBitAlpha: settings.transparent })
      for (let i = 0; i < frames; i++) {
        renderExportFrame(i / frames)
        const rgba = work.getContext('2d').getImageData(0, 0, width, height).data
        const indexed = applyPalette(rgba, globalPalette, colorFormat)
        encoder.writeFrame(indexed, width, height, { palette: globalPalette, delay: frameDelays[i], repeat: settings.loop, transparent: settings.transparent, dispose: settings.disposal })
        if (i % 3 === 0) { setProgress((i + 1) / frames); await new Promise((r) => setTimeout(r, 0)) }
      }
      encoder.finish()
      const blob = new Blob([encoder.bytesView()], { type: 'image/gif' })
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
      a.download = `${(source?.name || 'animation').replace(/\.[^.]+$/, '').trim().replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'animation'}.gif`; a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 1000)
      setLastExport({ bytes: blob.size, originalBytes: blob.size, optimized: false, encoder: 'gifenc' })
      trackExportSucceeded({ encoder: 'gifenc', bytes: blob.size, frames, backend: 'browser' })
      setToast(`GIF exported with gifenc · ${fmtBytes(blob.size)}`)
    } catch (error) {
      console.error(error)
      try {
        setToast('Browser encoder failed — trying ffmpeg.wasm…')
        const pngFrames = []
        const workFf = document.createElement('canvas')
        const limitFf = settings.quality === 'High quality' ? 1440 : settings.quality === 'Balanced' ? 1080 : 720
        const ratioFf = Math.min(1, limitFf / Math.max(settings.width, settings.height))
        workFf.width = Math.round(settings.width * ratioFf)
        workFf.height = Math.round(settings.height * ratioFf)
        for (let i = 0; i < frames; i += 1) {
          draw(i / frames, workFf, ratioFf)
          const frameBlob = await new Promise((resolve) => workFf.toBlob(resolve, 'image/png'))
          pngFrames.push(frameBlob)
          if (i % 3 === 0) {
            setProgress((i + 1) / frames * 0.9)
            await new Promise((r) => setTimeout(r, 0))
          }
        }
        const { encodeGifWithFFmpeg, loadFFmpeg } = await import('../engine/ffmpeg-export')
        await loadFFmpeg()
        useStudioStore.getState().setCapabilities({ ffmpeg: true })
        const blob = await encodeGifWithFFmpeg(pngFrames, {
          fps: Math.max(1, Math.round(timingFps)),
          onProgress: (p) => setProgress(0.9 + p * 0.1),
        })
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = `${(source?.name || 'animation').replace(/\.[^.]+$/, '').trim().replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'animation'}.gif`
        a.click()
        setTimeout(() => URL.revokeObjectURL(a.href), 1000)
        setLastExport({ bytes: blob.size, originalBytes: blob.size, optimized: false, encoder: 'ffmpeg.wasm' })
        trackExportSucceeded({ encoder: 'ffmpeg.wasm', bytes: blob.size, frames, backend: 'browser' })
        setToast(`GIF exported with ffmpeg.wasm · ${fmtBytes(blob.size)}`)
      } catch (ffErr) {
        console.error(ffErr)
        setToast('Export failed — try a smaller canvas')
      }
    }
    finally {
      ioLockRef.current = false
      setExporting(false)
      setPlaying(false)
      const frameIndex = Math.min(frames - 1, Math.floor(progressRef.current * frames))
      draw(frameIndex / frames)
    }
  }

  useEffect(() => {
    if (!toast?.message) return undefined
    const ms = toast.type === 'error' ? 5200 : toast.type === 'warning' ? 4200 : 3000
    const id = setTimeout(() => clearToast(), ms)
    return () => clearTimeout(id)
  }, [toast, clearToast])

  const stageStyle = { width: '100%', height: '100%' }
  const textBounds = (layer) => textLayerBoundsPct(layer, settings.width, settings.height)

  const value = {
    // refs
    canvasRef, pixiCanvasRef, stageRef, fileRef, fontFileRef, overlayFileRef, compressGifRef,
    // state
    settings, setSettings, image, source, playing, setPlaying, progress, setProgress, exporting,
    downloadBusy, scaleBusy, busyLabel, studioLocked,
    dropActive, setDropActive, mobilePanel, setMobilePanel, toast, setToast,
    notifySuccess, notifyError, notifyInfo, notifyWarning, clearToast,
    activeTab, goToWorkspace, zoom, setZoom, canvasZoom,
    lockAspect, setLockAspect, setCanvasWidth, setCanvasHeight, useSourceSize, sourceAspect,
    elements, setElements, selectedElement, setSelectedElement, selectedElements, setSelectedElements,
    secondaryElements, layerInsertAt, setLayerInsertAt,
    selectLayer, clearLayerSelection, updateElementById, moveElement, moveOverlay,
    reorderElement, reorderOverlay, reorderText,
    baseImageSelected, setBaseImageSelected,
    imageVisible, setImageVisible,
    enhancedLayer, enhancedSelected, enhancedTransformBox,
    selectEnhancedLayer, updateEnhancedLayer, removeEnhancedLayer,
    runUpscaleToEnhanced, downloadEnhancedPng, matchEnhancedSize,
    artboardSelected, setArtboardSelected, selectArtboard,
    canvasLocked, setCanvasLocked, toggleCanvasLock,
    imageLocked, setImageLocked, imageTransformBox,
    selectMode, setSelectMode, selectionTool, setSelectionTool,
    selection, setSelection, selectionPoints, setSelectionPoints, extractTolerance, setExtractTolerance,
    apiAvailable, apiInfo, segmenting, textLayers, setTextLayers, selectedText, setSelectedText, fontOptions,
    parallax, setParallax, lastExport, maskEditing, setMaskEditing, maskBrush, setMaskBrush,
    imageEdits, setImageEdits,
    overlays, setOverlays, selectedOverlay, setSelectedOverlay,
    selectedMotionEffect, setSelectedMotionEffect,
    gpuPreview, setGpuPreview,
    poseRig, setPoseRig,
    // derived
    frames, frameDelays, actualDuration, actualFps, memory, timingFps, stageStyle,
    // actions
    update, setAmplitude, setSpeed, applyQuality, applyPreset, reset, loadFile, draw, cancelSelection, completePathSelection,
    startSelection, moveSelection, finishSelection, applyKonvaSelection, updateElement, removeElement,
    toggleElementLock, toggleElementVisible, toggleImageLock, toggleFlip, rotateSelection, selectionFlip, toggleTextLock, selectBaseImage, selectStageElement,
    resetElementMask, invertElementMask, featherElementMask, paintElementMask,
    trimElementTransparentBounds, beginMaskErase,
    addTextLayer, updateText, updateTextById, removeText, moveText,
    uploadFont,
    addOverlay, updateOverlay, updateOverlayById, selectOverlay, selectStageOverlay, overlayBounds, toggleOverlayVisible, removeOverlay, saveCurrentPng, compressExistingGif,
    beginAnchorDrag, moveAnchorDrag, endAnchorDrag, resetMotionAnchor,
    beginJointDrag, moveJointDrag, endJointDrag,
    addElementFromMask, runPoseDetect, runTextDetect,
    runMatteCutout,
    exportGif, textBounds, setKonvaStageApi, konvaStageApiRef,
  }

  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>
}
