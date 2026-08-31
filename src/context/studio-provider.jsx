import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { TEXT_DEFAULT, MAX_TEXT_LAYERS } from '../lib/presets'
import { measureTextLayerPx, textLayerBoundsPct } from '../lib/text-measure'
import { IMAGE_EDITS_DEFAULT } from '../lib/project-document'
import { HEALTH_TIMEOUT_MS } from '../lib/catalogs'
import { clamp, clampNice, fmtBytes, MAX_CANVAS, MAX_UPLOAD_DIMENSION, nice, uploadImageError } from '../lib/format'
import { workspacePath, workspaceFromPath } from '../lib/routes'
import { useCanvasZoom } from '../hooks/use-canvas-zoom'
import { useStudioStore } from '../store/studio-store'
import {
  runStudioTask,
  trackImportCommitted,
  trackCutoutApplied,
  trackExportSucceeded,
} from '../tasks/studio-task-bridge'
import { cropRectByPixelBounds, fittedImageNorm, sourceFromStageMatrix } from '../lib/image-space.js'
import { alphaMaskRgba, visibleMaskRgba } from '../lib/mask-pixels.js'
import { apiClient } from '../api/js-client.js'

const StudioContext = createContext(null)

/** Focus workspaces use the right panel, not the mobile inspector sheet. */
const FOCUS_WORKSPACES = new Set(['scale', 'output'])

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

function convertedMaskCanvas(imageLike, width, height, convert) {
  if (!imageLike || !width || !height) return null
  const pixelsCanvas = document.createElement('canvas')
  pixelsCanvas.width = width
  pixelsCanvas.height = height
  const pixelsContext = pixelsCanvas.getContext('2d', { willReadFrequently: true })
  pixelsContext.drawImage(imageLike, 0, 0, width, height)
  const pixels = pixelsContext.getImageData(0, 0, width, height)

  const mask = document.createElement('canvas')
  mask.width = width
  mask.height = height
  const maskContext = mask.getContext('2d')
  const maskData = maskContext.createImageData(width, height)
  maskData.data.set(convert(pixels.data))
  maskContext.putImageData(maskData, 0, 0)
  return mask
}

/** Convert bitmap transparency into an editable white alpha mask. */
function alphaMaskCanvas(imageLike, width = imageLike?.width, height = imageLike?.height) {
  return convertedMaskCanvas(imageLike, width, height, alphaMaskRgba)
}

/** Normalize an opaque grayscale (or alpha-only) model mask for compositing. */
function visibleMaskCanvas(imageLike, width = imageLike?.width, height = imageLike?.height) {
  return convertedMaskCanvas(imageLike, width, height, visibleMaskRgba)
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
  /** Shared finish lock — only one PNG download or upscale at a time. */
  const ioLockRef = useRef(false)
  /** Nestable AI busy depth (segment / detect / matte). */
  const busyDepthRef = useRef(0)
  const enhanceGenRef = useRef(0)
  const selectionStart = useRef(null)
  const anchorDrag = useRef(null)
  const maskPainting = useRef(false)
  const loadGenerationRef = useRef(0)
  const sourceUrlRef = useRef(null)
  const sourceLoadPolicyRef = useRef({ url: null, preserveCanvasSize: false })

  // ── Zustand: durable doc is V2 (`s.project`); editor view for Konva / arrays ──
  const settings = useStudioStore((s) => s.editor.settings)
  const source = useStudioStore((s) => s.editor.source)
  const elements = useStudioStore((s) => s.editor.elements)
  const overlays = useStudioStore((s) => s.editor.overlays)
  const textLayers = useStudioStore((s) => s.editor.textLayers)
  const enhancedLayer = useStudioStore((s) => s.editor.enhancedLayer)
  const imageEdits = useStudioStore((s) => s.editor.imageEdits)
  const fontOptions = useStudioStore((s) => s.editor.fontOptions)

  const setSettings = useStudioStore((s) => s.setSettings)
  const setSource = useStudioStore((s) => s.setSource)
  const setElements = useStudioStore((s) => s.setElements)
  const setOverlays = useStudioStore((s) => s.setOverlays)
  const setTextLayers = useStudioStore((s) => s.setTextLayers)
  const setEnhancedLayer = useStudioStore((s) => s.setEnhancedLayer)
  const setImageEdits = useStudioStore((s) => s.setImageEdits)
  const setFontOptions = useStudioStore((s) => s.setFontOptions)

  const selectedElements = useStudioStore((s) => s.selection.selectedElements)
  const selectedText = useStudioStore((s) => s.selection.selectedText)
  const selectedOverlay = useStudioStore((s) => s.selection.selectedOverlay)
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
  const selectionPurpose = useStudioStore((s) => s.tools.selectionPurpose || 'cutout')
  const pendingSelection = useStudioStore((s) => s.tools.pendingSelection)

  const setSelectMode = useStudioStore((s) => s.setSelectMode)
  const setSelectionTool = useStudioStore((s) => s.setSelectionTool)
  const setSelection = useStudioStore((s) => s.setSelection)
  const setSelectionPoints = useStudioStore((s) => s.setSelectionPoints)
  const setExtractTolerance = useStudioStore((s) => s.setExtractTolerance)
  const setMaskEditing = useStudioStore((s) => s.setMaskEditing)
  const setMaskBrush = useStudioStore((s) => s.setMaskBrush)
  const setSelectionPurpose = useStudioStore((s) => s.setSelectionPurpose)
  const setPendingSelection = useStudioStore((s) => s.setPendingSelection)

  const mobilePanel = useStudioStore((s) => s.ui.mobilePanel)
  const toast = useStudioStore((s) => s.ui.toast)
  const dropActive = useStudioStore((s) => s.ui.dropActive)
  const lockAspect = useStudioStore((s) => s.ui.lockAspect)

  const setMobilePanel = useStudioStore((s) => s.setMobilePanel)
  const setToast = useStudioStore((s) => s.setToast)
  const notifySuccess = useStudioStore((s) => s.notifySuccess)
  const notifyError = useStudioStore((s) => s.notifyError)
  const notifyInfo = useStudioStore((s) => s.notifyInfo)
  const notifyWarning = useStudioStore((s) => s.notifyWarning)
  const clearToast = useStudioStore((s) => s.clearToast)
  const setDropActive = useStudioStore((s) => s.setDropActive)
  const setLockAspect = useStudioStore((s) => s.setLockAspect)
  const downloadBusy = useStudioStore((s) => s.session.downloadBusy)
  const scaleBusy = useStudioStore((s) => s.session.scaleBusy)
  const lastExport = useStudioStore((s) => s.session.lastExport)
  const apiAvailable = useStudioStore((s) => s.session.apiAvailable)
  const apiInfo = useStudioStore((s) => s.session.apiInfo)
  const segmenting = useStudioStore((s) => s.session.segmenting)
  const busyLabel = useStudioStore((s) => s.session.busyLabel)

  const setDownloadBusy = useStudioStore((s) => s.setDownloadBusy)
  const setScaleBusy = useStudioStore((s) => s.setScaleBusy)
  const setLastExport = useStudioStore((s) => s.setLastExport)
  const setApiAvailable = useStudioStore((s) => s.setApiAvailable)
  const setApiInfo = useStudioStore((s) => s.setApiInfo)
  const setSegmenting = useStudioStore((s) => s.setSegmenting)
  const setBusyLabel = useStudioStore((s) => s.setBusyLabel)

  const studioLocked = Boolean(segmenting || scaleBusy || downloadBusy)

  const assertStudioIdle = (message = 'Wait for the current job to finish') => {
    if (busyDepthRef.current > 0 || ioLockRef.current || downloadBusy || scaleBusy || segmenting) {
      setToast(message)
      return false
    }
    return true
  }

  /** Nestable lock for AI jobs — keeps studio overlay up through nested extract calls. */
  const beginBusy = (label) => {
    busyDepthRef.current += 1
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

  /** Runtime-only HTMLImageElement (not serializable). */
  const [image, setImage] = useState(null)

  /** Primary = last selected (edits target). Secondary = other multi-selected layers. */
  const selectedElement = selectedElements.length ? selectedElements[selectedElements.length - 1] : null
  const secondaryElements = selectedElements.length > 1
    ? selectedElements.slice(0, -1)
    : []

  const navigate = useNavigate()
  const location = useLocation()
  const activeTab = workspaceFromPath(location.pathname)
  const goToWorkspace = (id) => {
    navigate(workspacePath(id))
    if (!FOCUS_WORKSPACES.has(id)) setMobilePanel(true)
  }
  const canvasZoom = useCanvasZoom({ minZoom: 10, maxZoom: 800, defaultZoom: 100, padding: 40 })
  const { zoom, setZoom } = canvasZoom

  /** Replace source; revoke previous owned blob URL (never revoke in image-load effect). */
  const replaceSource = (next, { preserveCanvasSize = false } = {}) => {
    const prevUrl = sourceUrlRef.current
    const nextUrl = next?.url ?? null
    sourceUrlRef.current = nextUrl
    sourceLoadPolicyRef.current = { url: nextUrl, preserveCanvasSize }
    setSource(next)
    if (prevUrl && prevUrl !== nextUrl) revokeBlobUrl(prevUrl)
  }

  const update = (key, value) => {
    const nextValue = typeof value === 'number' ? nice(value, Number.isInteger(value) ? 0 : 1) : value
    setSettings((s) => ({ ...s, [key]: nextValue }))
  }

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
      const policy = sourceLoadPolicyRef.current
      if (policy.url !== source.url || !policy.preserveCanvasSize) {
        // Imported source → canvas starts at original image size (safety-capped).
        setSettings((current) => ({ ...current, width, height }))
      }
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

  /** API-derived capability flags. */
  useEffect(() => {
    useStudioStore.getState().setCapabilities({
      api: apiAvailable,
      pointSelection: Boolean(apiInfo?.point_selection),
      promptSelection: Boolean(apiInfo?.prompt_selection),
      matte: Boolean(apiInfo?.matte),
      lama: Boolean(apiInfo?.lama),
      realesrgan: Boolean(apiInfo?.realesrgan),
      rembg: Boolean(apiInfo?.rembg || apiInfo?.ai),
      device: apiInfo?.device || null,
      models: apiInfo?.models || null,
    })
  }, [apiAvailable, apiInfo])

  const draw = useCallback((target = canvasRef.current, exportScale = 1) => {
    if (!target || !image) return
    const ctx = target.getContext('2d', { willReadFrequently: true })
    const W = target.width, H = target.height
    if (settings.transparent) ctx.clearRect(0, 0, W, H)
    else { ctx.fillStyle = settings.background; ctx.fillRect(0, 0, W, H) }
    const scale = (settings.scale ?? 100) / 100
    const x = settings.x ?? 0
    const y = settings.y ?? 0
    const rotation = settings.rotation ?? 0
    const opacity = (settings.opacity ?? 100) / 100
    const drawSource = image
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
      elements.filter((el) => el.visible && el.cleanup).forEach((el) => {
        ctx.drawImage(el.cleanup, el.x * W, el.y * H, el.w * W, el.h * H)
      })
      elements.filter((el) => el.visible && el.bitmap).forEach((el) => {
        const x = el.x * W
        const y = el.y * H
        const w = el.w * W
        const h = el.h * H
        const originX = ((el.anchorX ?? 50) / 100) * w
        const originY = ((el.anchorY ?? 50) / 100) * h
        const sx = (el.scaleX ?? 100) / 100 * (el.flipX ? -1 : 1)
        const sy = (el.scaleY ?? 100) / 100 * (el.flipY ? -1 : 1)
        ctx.save()
        ctx.globalAlpha = (el.opacity ?? 100) / 100
        ctx.translate(x + originX, y + originY)
        ctx.rotate((el.rotation || 0) * Math.PI / 180)
        ctx.scale(sx, sy)
        ctx.translate(-originX, -originY)
        ctx.drawImage(el.bitmap, 0, 0, el.bitmap.width, el.bitmap.height, 0, 0, w, h)
        ctx.restore()
      })
    }

    textLayers.filter((layer) => layer.visible).forEach((layer) => {
      let content = layer.text
      if (layer.casing === 'UPPERCASE') content = content.toUpperCase()
      if (layer.casing === 'lowercase') content = content.toLowerCase()
      const fontScale = W / settings.width
      const size = layer.size * fontScale
      const lineHeight = size * layer.lineHeight
      ctx.save()
      ctx.translate(layer.x / 100 * W, layer.y / 100 * H)
      ctx.rotate((layer.rotation || 0) * Math.PI / 180)
      ctx.scale((layer.flipX ? -1 : 1) * (layer.scaleX ?? 100) / 100, (layer.flipY ? -1 : 1) * (layer.scaleY ?? 100) / 100)
      ctx.globalAlpha = (layer.opacity ?? 100) / 100
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

  }, [image, settings, elements, textLayers, imageEdits, overlays, enhancedLayer, imageVisible])

  useEffect(() => {
    if (!image) return undefined
    const canvas = canvasRef.current
    if (!canvas) return undefined
    canvas.width = Math.max(1, Math.round(settings.width))
    canvas.height = Math.max(1, Math.round(settings.height))
    draw()
    return undefined
  }, [draw, image, settings.width, settings.height])

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
      setSettings((current) => ({ ...current }))
      setImageEdits({ ...IMAGE_EDITS_DEFAULT })
    }

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
      // Keep the base image at native pixels; only the artboard grows or shrinks.
      const next = { ...current, fit: 'Original size', width: nextWidth }
      if (!lockAspect) return next
      next.height = clamp(Math.round(nextWidth / sourceAspect), 1, MAX_CANVAS)
      return next
    })
  }

  const setCanvasHeight = (height) => {
    if (canvasLocked) { setToast('Unlock the artboard to resize'); return }
    const nextHeight = clamp(height, 1, MAX_CANVAS)
    setSettings((current) => {
      const next = { ...current, fit: 'Original size', height: nextHeight }
      if (!lockAspect) return next
      next.width = clamp(Math.round(nextHeight * sourceAspect), 1, MAX_CANVAS)
      return next
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
    setSelectMode(false)
    setMaskEditing(false)
  }

  const reset = () => {
    const current = useStudioStore.getState().project
    if (current.enhancedLayer?.url) revokeBlobUrl(current.enhancedLayer.url)
    ;(current.overlays || []).forEach((overlay) => revokeBlobUrl(overlay.url))
    replaceSource(null)
    setImage(null)
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

  const cancelSelection = () => {
    selectionStart.current = null
    setSelection(null)
    setSelectionPoints([])
    setSelectMode(false)
    setSelectionPurpose('cutout')
    setPendingSelection(null)
  }

  const createStageSelectionMask = (rect, pathPoints = null) => {
    const width = Math.max(1, Math.round(settings.width))
    const height = Math.max(1, Math.round(settings.height))
    const mask = document.createElement('canvas')
    mask.width = width
    mask.height = height
    const context = mask.getContext('2d')
    context.fillStyle = '#000'
    context.fillRect(0, 0, width, height)
    context.fillStyle = '#fff'
    if (pathPoints?.length >= 3) {
      context.beginPath()
      pathPoints.forEach((point, index) => {
        const x = point.x * width
        const y = point.y * height
        if (index === 0) context.moveTo(x, y)
        else context.lineTo(x, y)
      })
      context.closePath()
      context.fill()
    } else {
      context.fillRect(rect.x * width, rect.y * height, rect.w * width, rect.h * height)
    }
    return mask
  }

  /** Project an artboard-space mask back into the untransformed source bitmap. */
  const projectStageMaskToSource = (stageMask, sourceWidth, sourceHeight) => {
    const output = document.createElement('canvas')
    output.width = sourceWidth
    output.height = sourceHeight
    const context = output.getContext('2d')
    context.fillStyle = '#000'
    context.fillRect(0, 0, sourceWidth, sourceHeight)

    let matrix = null
    const imageNode = konvaStageApiRef.current?.getImageNode?.()
    if (imageNode?.getTransform && imageNode.width() > 0 && imageNode.height() > 0) {
      try {
        const inverse = imageNode.getTransform().copy().invert().getMatrix()
        const scaleX = sourceWidth / imageNode.width()
        const scaleY = sourceHeight / imageNode.height()
        matrix = [
          inverse[0] * scaleX,
          inverse[1] * scaleY,
          inverse[2] * scaleX,
          inverse[3] * scaleY,
          inverse[4] * scaleX,
          inverse[5] * scaleY,
        ]
      } catch {
        matrix = null
      }
    }

    if (!matrix) {
      matrix = sourceFromStageMatrix({
        box: imageTransformBox,
        stageWidth: stageMask.width,
        stageHeight: stageMask.height,
        sourceWidth,
        sourceHeight,
        anchorX: settings.anchorX ?? 50,
        anchorY: settings.anchorY ?? 50,
        flipX: imageEdits.flipX,
        flipY: imageEdits.flipY,
      })
    }

    context.save()
    context.setTransform(...matrix)
    context.drawImage(stageMask, 0, 0)
    context.restore()
    return output
  }

  /** Shared source-preserving inpaint path for free selections and cutout masks. */
  const inpaintBaseWithStageMask = async (stageMask, {
    busyLabel,
    startMessage,
    successLabel,
    errorMessage,
  }) => {
    if (!image) {
      setToast('Open an image first')
      return null
    }
    if (!apiAvailable) {
      setToast('Remove from image needs the local API (npm run api)')
      return null
    }
    if (!useStudioStore.getState().capabilities?.lama) {
      setToast('Remove from image needs LaMa (python scripts/setup_ai_models.py)')
      return null
    }
    if (!assertStudioIdle()) return null

    const width = image.naturalWidth || image.width
    const height = image.naturalHeight || image.height
    const plate = document.createElement('canvas')
    plate.width = width
    plate.height = height
    plate.getContext('2d').drawImage(image, 0, 0, width, height)
    const sourceMask = projectStageMaskToSource(stageMask, width, height)

    beginBusy(busyLabel)
    setToast(startMessage)
    try {
      const { inpaintRegion } = await import('../ai/inpaint.js')
      const result = await inpaintRegion({
        imageCanvas: plate,
        maskCanvas: sourceMask,
        model: 'big-lama',
      })
      const encoded = result?.image_png_base64
      if (!encoded) throw new Error('Inpaint returned no image')
      replaceSource({
        ...(source || {}),
        width,
        height,
        url: `data:image/png;base64,${encoded}`,
        kind: 'image',
      }, { preserveCanvasSize: true })
      setToast(`${successLabel} · ${result.fill || result.engine || 'inpaint'}`)
      return result
    } catch (error) {
      console.warn(error)
      setToast(error?.message || errorMessage)
      return null
    } finally {
      endBusy()
    }
  }

  /** Erase a selected region from the base image without creating a cutout. */
  const removeSelectionFromImage = async (rect, pathPoints = null) => {
    if (!rect || rect.w < 0.01 || rect.h < 0.01) {
      setToast('Draw a larger selection to remove')
      return
    }
    const result = await inpaintBaseWithStageMask(
      createStageSelectionMask(rect, pathPoints),
      {
        busyLabel: 'Removing selection…',
        startMessage: 'Removing selection from image…',
        successLabel: 'Cut',
        errorMessage: 'Cut failed',
      },
    )
    if (!result) return
    setPendingSelection(null)
    setSelection(null)
    setSelectionPoints([])
    setSelectMode(false)
    setSelectionPurpose('cutout')
  }

  /** Confirm pending erase selection — LaMa only. */
  const confirmCutSelection = async () => {
    const pending = useStudioStore.getState().tools.pendingSelection
    const rect = pending?.rect || selection
    const points = pending?.points || (selectionPoints?.length >= 3 ? selectionPoints : null)
    if (!rect) {
      setToast('Draw a selection first, then press Cut')
      return
    }
    await removeSelectionFromImage(rect, points)
  }

  /** Start marquee/lasso in erase mode: draw → Cut button → background inpaint. */
  const beginRemoveFromImage = (toolId = 'Rectangle') => {
    if (!image) {
      setToast('Open an image first')
      return
    }
    if (!apiAvailable) {
      setToast('Remove from image needs the local API (npm run api)')
      return
    }
    if (!useStudioStore.getState().capabilities?.lama) {
      setToast('Remove from image needs LaMa (python scripts/setup_ai_models.py)')
      return
    }
    cancelSelection()
    setSelectionPurpose('erase')
    setPendingSelection(null)
    setSelectionTool(toolId)
    setSelectMode(true)
    setMaskEditing(false)
    setMobilePanel(false)
    setBaseImageSelected(false)
    setToast('Draw a selection, then press Cut · LaMa')
  }

  /**
   * Park erase selection for Cut confirm; cutout purpose still extracts immediately.
   */
  const finishSelectionAsCutoutOrErase = (rect, points = null) => {
    const purpose = useStudioStore.getState().tools.selectionPurpose || 'cutout'
    if (purpose === 'erase') {
      setPendingSelection({
        rect,
        points: points?.length >= 3 ? points : null,
      })
      setSelection(rect)
      setSelectionPoints(points?.length >= 3 ? points : [])
      setSelectMode(false)
      setToast('Selection ready — press Cut to remove')
      return
    }
    if (points?.length >= 3) {
      extractElementLocal(rect, points, true)
      return
    }
    extractElementLocal(rect)
  }

  const applyKonvaSelection = (payload) => {
    if (payload?.type === 'point' && payload.point) {
      setSelectMode(false)
      setSelection(null)
      setSelectionPoints([])
      selectionStart.current = null
      void runPointCut(payload.point)
      return
    }
    if (!payload?.rect) return
    const { rect, points, type } = payload
    setSelectMode(false)
    setSelection(null)
    setSelectionPoints([])
    selectionStart.current = null
    if (type === 'path' && points?.length >= 3) {
      finishSelectionAsCutoutOrErase(rect, points)
      return
    }
    finishSelectionAsCutoutOrErase(rect)
  }


  const completePathSelection = () => {
    if (!selectMode || selectionPoints.length < 3) { setToast('Add at least three selection points'); return }
    const points = [...selectionPoints], rect = selectionBounds(points)
    selectionStart.current = null; setSelection(null); setSelectionPoints([]); setSelectMode(false)
    if (rect.w < .015 || rect.h < .015) { setToast('Draw a larger selection'); return }
    finishSelectionAsCutoutOrErase(rect, points)
  }

  useEffect(() => {
    if (!selectMode && !pendingSelection?.rect) return undefined
    const handleSelectionKeys = (event) => {
      if (event.key === 'Escape') cancelSelection()
      // Enter / Backspace handled by Konva selection draft on the stage.
    }
    window.addEventListener('keydown', handleSelectionKeys)
    return () => window.removeEventListener('keydown', handleSelectionKeys)
  }, [selectMode, pendingSelection])

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
      finishSelectionAsCutoutOrErase(rect, points); return
    }
    if (selectMode && (selectionTool === 'Polygonal Lasso' || selectionTool === 'Pen Path')) return
    if (!selectMode || !selectionStart.current) return
    const point = pointerPosition(event), start = selectionStart.current
    const rect = { x: Math.min(start.x, point.x), y: Math.min(start.y, point.y), w: Math.abs(point.x - start.x), h: Math.abs(point.y - start.y) }
    selectionStart.current = null; setSelection(null); setSelectMode(false)
    if (rect.w < .025 || rect.h < .025) { setToast('Draw a larger box around the element'); return }
    finishSelectionAsCutoutOrErase(rect)
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
    const element = { id, name: `Element ${elements.length + 1}`, ...rect, sourceRect: { ...rect }, bitmap, sourceBitmap, maskCanvas, cleanup, rotation: 0, scaleX: 100, scaleY: 100, flipX: false, flipY: false, opacity: 100, visible: true, locked: false, anchorX: 50, anchorY: 50, cutoutMode: 'Cutout' }
    setElements((current) => insertInStack(current, element, layerInsertAt, selectedElement))
    setSelectedElements([id])
    trackCutoutApplied({ method: 'local', kind: 'edge' })
    setToast(layerInsertAt === 'front' ? 'Element extracted in front' : 'Element extracted in back')
    return id
  }

  /**
   * Smart segment with the fixed backend matte.
   * Creates a floating cutout layer. Base replacement is explicit so selecting a subject
   * never destructively rewrites the plate or bakes other visible layers into it.
   * @param {{ x:number, y:number, w:number, h:number }} rect normalized
   * @param {{ name?: string, replaceElementId?: string|null, updateBackground?: boolean }} [opts]
   */
  const extractElement = async (rect, opts = {}) => {
    const segmentModel = 'birefnet'
    const method = 'ai'
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
      form.append('update_background', updateBackground ? 'true' : 'false')
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
      const maskCanvas = alphaMaskCanvas(bitmap)
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
              sourceRect: item.sourceRect || { ...smartRect },
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
          sourceRect: { ...smartRect },
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
          visible: true,
          smart: true,
          locked: false,
          anchorX: 50,
          anchorY: 50,
          engine,
          cutoutMode: 'Cutout',
        }
        setElements((current) => insertInStack(current, element, layerInsertAt, selectedElement))
        setSelectedElements([id])
      }

      setSettings((current) => ({ ...current, fit: 'Contain' }))
      // Only rewrite the base when explicitly requested. Default leave pixels intact so
      // moving the cutout never reveals OpenCV Telea/NS “deformed color” smear.
      if (updateBackground && result.background && !replaceElementId) {
        replaceSource({
          ...(source || {}),
          width: sourceCanvas.width,
          height: sourceCanvas.height,
          url: result.background,
        }, { preserveCanvasSize: true })
      }
      const kind = String(engine).startsWith('rembg') || String(engine).includes('birefnet') || String(engine).includes('rmbg')
        ? 'AI'
        : 'GrabCut'
      trackCutoutApplied({ engine: String(engine), method: String(method), kind })
      const fillNote = result.fill === 'lama'
        ? 'big-lama cleaned base'
        : result.fill
          ? `${result.fill} fill`
          : 'base unchanged'
      setToast(
        updateBackground
          ? `${kind} cutout ready · ${fillNote}`
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
  const rematteSelectedLayer = async () => {
    const el = elements.find((e) => e.id === selectedElement && (e.sourceBitmap || e.bitmap))
    if (!el) {
      setToast('Select a cutout layer to remove its background')
      return
    }
    if (!assertStudioIdle()) return
    const src = el.sourceBitmap || el.bitmap
    const w = src.width
    const h = src.height
    if (w < 2 || h < 2) {
      setToast('Layer is too small to rematte')
      return
    }

    // Opaque plate so transparent holes do not confuse the fixed matte.
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
      const bitmap = document.createElement('canvas')
      bitmap.width = w
      bitmap.height = h
      let maskCanvas = document.createElement('canvas')
      maskCanvas.width = w
      maskCanvas.height = h
      const { matteWithModel } = await import('../ai/matte')
      const result = await matteWithModel({ imageCanvas: plate })
      const engine = result.engine || 'matte'
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
        maskCanvas = visibleMaskCanvas(maskImg, w, h)
        const bctx = bitmap.getContext('2d')
        bctx.drawImage(src, 0, 0)
        bctx.globalCompositeOperation = 'destination-in'
        bctx.drawImage(maskCanvas, 0, 0)
        bctx.globalCompositeOperation = 'source-over'
      } else {
        throw new Error('Matte returned no mask')
      }
      if (result.rgba_png_base64) {
        maskCanvas = alphaMaskCanvas(bitmap)
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

  /** Layer from the backend selection cutout; rect is in canvas pixels. */
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

    const maskCanvas = alphaMaskCanvas(bitmap)

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
      sourceRect: { ...smartRect },
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
      visible: true,
      smart: true,
      locked: false,
      anchorX: 50,
      anchorY: 50,
      engine,
      cutoutMode: 'Cutout',
    }
    setElements((current) => insertInStack(current, element, layerInsertAt, selectedElement))
    setSelectedElements([id])
    setToast(`${name} ready · ${engine}`)
    return id
  }

  /** Build a layer from a full-canvas mask. */
  const addElementFromMask = (maskCanvas, { name = 'AI layer', engine = 'ai' } = {}) => {
    const sourceCanvas = canvasRef.current
    if (!sourceCanvas || !maskCanvas) return null
    const W = sourceCanvas.width
    const H = sourceCanvas.height
    const mw = maskCanvas.width
    const mh = maskCanvas.height
    const normalizedMask = visibleMaskCanvas(maskCanvas, mw, mh)
    const maskCtx = normalizedMask.getContext('2d', { willReadFrequently: true })
    const maskData = maskCtx.getImageData(0, 0, mw, mh).data
    let minX = mw, minY = mh, maxX = 0, maxY = 0, found = false
    for (let y = 0; y < mh; y += 1) {
      for (let x = 0; x < mw; x += 1) {
        const a = maskData[(y * mw + x) * 4 + 3]
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
    localMask.getContext('2d').drawImage(normalizedMask, minX, minY, sw, sh, 0, 0, cw, ch)
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
      sourceRect: { ...rect },
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
      visible: true,
      smart: true,
      locked: false,
      anchorX: 50,
      anchorY: 50,
      engine,
    }
    setElements((current) => insertInStack(current, element, layerInsertAt, selectedElement))
    setSelectedElements([id])
    setToast(`${name} ready · ${engine}`)
    return id
  }

  /**
   * Select Subject / Remove BG.
   * Remove BG remattes the selected cutout only — never rewrites the base image.
   * Select Subject leaves the base untouched; Clean background is the explicit inpaint action.
   * @param {{ target?: 'canvas'|'selection' }} opts
   */
  const runMatteCutout = async ({
    /** 'canvas' = Select Subject (nearly the full image); 'selection' = Remove BG on selected cutout */
    target = 'canvas',
  } = {}) => {
    const canvas = canvasRef.current
    if (!canvas || !image) { setToast('Open an image first'); return }
    if (!assertStudioIdle()) return
    if (target === 'selection') {
      return rematteSelectedLayer()
    }

    // Select Subject — nearly the full image (GrabCut still wants a thin background rim).
    const pad = 0.02
    return extractElement(
      { x: pad, y: pad, w: 1 - pad * 2, h: 1 - pad * 2 },
      {
        name: 'Subject',
        updateBackground: false,
      },
    )
  }

  /**
   * Clean base background under the selected cutout using its bitmask (maskCanvas),
   * including edits from Erase / Reveal paint. LaMa required on the server.
   */
  const cleanBackgroundFromSelected = async () => {
    const el = elements.find((e) => e.id === selectedElement && (e.maskCanvas || e.bitmap))
    if (!el) {
      setToast('Select a cutout layer first')
      return
    }
    const width = Math.max(1, Math.round(settings.width))
    const height = Math.max(1, Math.round(settings.height))
    const stageMask = document.createElement('canvas')
    stageMask.width = width
    stageMask.height = height
    const context = stageMask.getContext('2d')
    context.fillStyle = '#000'
    context.fillRect(0, 0, width, height)
    const mask = el.maskCanvas || alphaMaskCanvas(el.bitmap)
    const sourceRect = el.sourceRect || { x: el.x, y: el.y, w: el.w, h: el.h }
    context.drawImage(
      mask,
      sourceRect.x * width,
      sourceRect.y * height,
      sourceRect.w * width,
      sourceRect.h * height,
    )
    await inpaintBaseWithStageMask(stageMask, {
      busyLabel: 'Cleaning background…',
      startMessage: 'Cleaning background…',
      successLabel: 'Background cleaned',
      errorMessage: 'Clean background failed',
    })
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
    return true
  }

  async function runPointCut(point) {
    const canvas = canvasRef.current
    if (!canvas || !image) {
      setToast('Open an image first')
      return null
    }
    if (!apiAvailable || !useStudioStore.getState().capabilities?.pointSelection) {
      setToast('Point cut needs the local selection service')
      return null
    }
    if (!assertStudioIdle()) return null

    beginBusy('Cutting clicked object…')
    setToast('Finding the object under your click…')
    try {
      const { selectAtPoint } = await import('../ai/prompt-selection')
      const result = await selectAtPoint({ imageCanvas: canvas, point })
      if (!result?.cutout_png_base64 || !result?.rect) {
        throw new Error('No object contour was found at that point')
      }
      useStudioStore.getState().setCapabilities({ pointSelection: true })
      const layerId = await addElementFromDetectCutout(result, {
        name: 'Object cut',
        engine: result.engine || 'point-selection',
      })
      if (!layerId) throw new Error('Could not create the cutout layer')
      selectDetectedCutout(layerId)
      trackCutoutApplied({ method: 'point', kind: 'contour' })
      setToast('Object contour cut into a new layer')
      return layerId
    } catch (error) {
      console.warn(error)
      setToast(error?.message || 'Point cut failed')
      return null
    } finally {
      endBusy()
    }
  }

  const runTextDetect = async (prompt) => {
    const canvas = canvasRef.current
    if (!canvas || !image) { setToast('Open an image first'); return }
    if (!prompt?.trim()) { setToast('Enter a text prompt'); return }
    if (!assertStudioIdle()) return
    beginBusy('Detecting objects…')
    try {
      // The backend owns the fixed detect → contour pipeline and its models.
      const { selectByPrompt } = await import('../ai/prompt-selection')
      const result = await selectByPrompt({
        imageCanvas: canvas,
        prompt: (prompt || '').trim(),
      })
      const boxes = result.boxes || []
      if (!boxes.length && !result.mask_png_base64) {
        setToast(`No objects matched “${prompt.trim()}”`)
        return
      }
      const eng = String(result.detect_engine || result.engine || '')
      useStudioStore.getState().setCapabilities({ promptSelection: true })

      const label = result.selected_label || prompt.trim()
      if (result.cutout_png_base64 && result.rect) {
        const layerId = await addElementFromDetectCutout(result, {
          name: String(label).slice(0, 28) || 'Detected',
          engine: result.engine || eng || 'detect',
        })
        if (layerId) selectDetectedCutout(layerId)
        setToast(`Selection · “${label}” contour ready`)
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
        const layerId = addElementFromMask(maskCanvas, {
          name: String(label).slice(0, 28) || 'Detected',
          engine: result.engine || eng || 'detect',
        })
        if (layerId) selectDetectedCutout(layerId)
        setToast(`Selection · “${label}” contour ready`)
        return
      }
      throw new Error('Selection service returned no contour')
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
  }
  const selectEnhancedLayer = () => {
    if (!enhancedLayer) return
    setEnhancedSelected(true)
    setBaseImageSelected(false)
    setArtboardSelected(false)
    setSelectedElements([])
    setSelectedOverlay(null)
    setSelectedText(null)
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
    const scale = (settings.scale ?? 100) / 100
    const ox = (settings.x ?? 0) / 100
    const oy = (settings.y ?? 0) / 100
    const rotation = (settings.rotation || 0) + imageEdits.rotation
    const ax = (settings.anchorX ?? 50) / 100
    const ay = (settings.anchorY ?? 50) / 100
    const { w: udw, h: udh } = fittedImageNorm(settings.fit, iw, ih, settings.width, settings.height)
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
  }, [source?.width, source?.height, settings, imageEdits.rotation])

  const enhancedTransformBox = useMemo(() => {
    if (!enhancedLayer?.width || !enhancedLayer?.height || !settings.width || !settings.height) {
      return null
    }
    const iw = enhancedLayer.width
    const ih = enhancedLayer.height
    const { w: udw, h: udh } = fittedImageNorm(
      enhancedLayer.fit || 'Contain',
      iw,
      ih,
      settings.width,
      settings.height,
    )
    const scale = (settings.scale ?? 100) / 100
    const ox = (settings.x ?? 0) / 100
    const oy = (settings.y ?? 0) / 100
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
      rotation: (settings.rotation || 0) + (imageEdits.rotation || 0),
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
    const displayRect = cropRectByPixelBounds(el, bounds)
    const originalRect = el.sourceRect || { x: el.x, y: el.y, w: el.w, h: el.h }
    return {
      ...el,
      ...displayRect,
      sourceRect: cropRectByPixelBounds(originalRect, bounds),
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
    setTextLayers((current) => {
      if (current.length >= MAX_TEXT_LAYERS) return current
      const id = newStudioId()
      const layer = { id, name: `Text ${current.length + 1}`, ...TEXT_DEFAULT }
      addedId = id
      return [...current, layer]
    })
    if (addedId == null) {
      setToast(`Max ${MAX_TEXT_LAYERS} text layers`)
      return null
    }
    setSelectedText(addedId)
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
      return { ...layer, ...patch }
    }))
  }
  const removeText = (id) => {
    const layer = textLayers.find((item) => item.id === id)
    if (layer?.locked) { setToast('Unlock the text layer before removing it'); return }
    setTextLayers((current) => current.filter((item) => item.id !== id))
    setSelectedText((current) => (current === id ? null : current))
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

  const runUpscaleToEnhanced = async ({ scale = 2 } = {}) => {
    if (!image) {
      setToast('Open an image first')
      return
    }
    if (!assertStudioIdle()) return
    const normalizedScale = Number(scale)
    if (![2, 4].includes(normalizedScale)) throw new Error('Real-ESRGAN scale must be 2 or 4.')
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
            scale: normalizedScale,
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
              name: `Enhanced ${normalizedScale}×`,
              url,
              image: img,
              width: img.naturalWidth || img.width,
              height: img.naturalHeight || img.height,
              scale: normalizedScale,
              engine: result.engine || `Real-ESRGAN ×${normalizedScale}`,
              fit: 'Contain',
              visible: true,
              bytes: blob.size,
              rollbackKept: true,
            }
          })
          setEnhancedSelected(true)
          setBaseImageSelected(false)
          setImageVisible(false)
          const engine = result.engine || `Real-ESRGAN ×${normalizedScale}`
          setToast(`Enhanced · ${normalizedScale}× · ${engine} · original kept for rollback · hide base to preview`)
          setProgress(1)
          return { engine, scale: normalizedScale }
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
  const saveCurrentPng = async (reducePalette = settings.reducePalette) => {
    if (!image || !assertStudioIdle()) return
    ioLockRef.current = true
    setDownloadBusy(true)
    setBusyLabel('Preparing PNG…')
    let objectUrl = null
    try {
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(settings.width))
      canvas.height = Math.max(1, Math.round(settings.height))
      draw(canvas, 1)
      let blob = await new Promise((resolve, reject) => {
        canvas.toBlob((result) => (result ? resolve(result) : reject(new Error('Could not encode PNG'))), 'image/png')
      })
      let optimized = false
      if (apiAvailable) {
        try {
          const form = new FormData()
          form.append('image', blob, 'image.png')
          form.append('palette', String(Boolean(reducePalette)))
          const { data: response } = await apiClient.postOptimizePng(form)
          blob = await response.blob()
          optimized = true
        } catch { /* Keep the browser-encoded PNG. */ }
      }
      objectUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      const baseName = (source?.name || 'image').replace(/\.[^.]+$/, '').trim().replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'image'
      link.href = objectUrl
      link.download = `${baseName}.png`
      link.click()
      setLastExport({ bytes: blob.size, optimized, encoder: optimized ? 'Pillow' : 'browser PNG' })
      trackExportSucceeded({ format: 'png', bytes: blob.size, backend: optimized ? 'server' : 'browser' })
      setToast(`PNG saved · ${fmtBytes(blob.size)}`)
    } catch (error) {
      setToast(error?.message || 'PNG export failed')
    } finally {
      if (objectUrl) setTimeout(() => revokeBlobUrl(objectUrl), 1500)
      ioLockRef.current = false
      setDownloadBusy(false)
      setBusyLabel('')
    }
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

  const resetTransformAnchor = () => {
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
    canvasRef, stageRef, fileRef, fontFileRef, overlayFileRef,
    // state
    settings, setSettings, image, source,
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
    selectionPurpose, setSelectionPurpose, beginRemoveFromImage, removeSelectionFromImage,
    pendingSelection, confirmCutSelection,
    selection, setSelection, selectionPoints, setSelectionPoints, extractTolerance, setExtractTolerance,
    apiAvailable, apiInfo, segmenting, textLayers, setTextLayers, selectedText, setSelectedText, fontOptions,
    lastExport, maskEditing, setMaskEditing, maskBrush, setMaskBrush,
    imageEdits, setImageEdits,
    overlays, setOverlays, selectedOverlay, setSelectedOverlay,
    // derived
    stageStyle,
    // actions
    update, reset, loadFile, draw, cancelSelection, completePathSelection,
    startSelection, moveSelection, finishSelection, applyKonvaSelection, updateElement, removeElement,
    toggleElementLock, toggleElementVisible, toggleImageLock, toggleFlip, rotateSelection, selectionFlip, toggleTextLock, selectBaseImage, selectStageElement,
    resetElementMask, invertElementMask, featherElementMask, paintElementMask,
    trimElementTransparentBounds, beginMaskErase,
    addTextLayer, updateText, updateTextById, removeText, moveText,
    uploadFont,
    addOverlay, updateOverlay, updateOverlayById, selectOverlay, selectStageOverlay, overlayBounds, toggleOverlayVisible, removeOverlay, saveCurrentPng,
    beginAnchorDrag, moveAnchorDrag, endAnchorDrag, resetTransformAnchor,
    addElementFromMask, runTextDetect,
    runMatteCutout, cleanBackgroundFromSelected,
    textBounds, setKonvaStageApi, konvaStageApiRef,
  }

  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>
}
