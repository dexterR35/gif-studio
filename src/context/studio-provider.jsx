import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { GIFEncoder, applyPalette, quantize } from 'gifenc'
import { PRESETS, INITIAL, TEXT_DEFAULT, SYSTEM_FONTS, EFFECT_DEFAULTS, transformsFromAmount } from '../lib/presets'
import { clamp, clampNice, fmtBytes, ease, MAX_CANVAS, MAX_UPLOAD_DIMENSION, nice, uploadImageError } from '../lib/format'
import { applyPixelEffects, ditherToPalette, presetFilter } from '../lib/effects'
import { gifWorkspacePath, workspaceFromPath } from '../lib/routes'
import { useCanvasZoom } from '../hooks/use-canvas-zoom'

const StudioContext = createContext(null)

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

export function useStudio() {
  const ctx = useContext(StudioContext)
  if (!ctx) throw new Error('useStudio must be used within StudioProvider')
  return ctx
}

export function StudioProvider({ children }) {
  const apiErrorMessage = (detail, fallback) => {
    if (!detail) return fallback
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail)) return detail.map((item) => item.msg || item).join(', ')
    return detail.message || fallback
  }


  const canvasRef = useRef(null)
  const stageRef = useRef(null)
  const fileRef = useRef(null)
  const fontFileRef = useRef(null)
  const overlayFileRef = useRef(null)
  const compressGifRef = useRef(null)
  const rafRef = useRef(null)
  const [settings, setSettings] = useState(INITIAL)
  const [image, setImage] = useState(null)
  const [source, setSource] = useState({ name: 'sample_source.png', width: 480, height: 300, url: '/sample_source.png' })
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [exporting, setExporting] = useState(false)
  const [dropActive, setDropActive] = useState(false)
  const [mobilePanel, setMobilePanel] = useState(false)
  const [toast, setToast] = useState('')
  const navigate = useNavigate()
  const location = useLocation()
  const activeTab = workspaceFromPath(location.pathname)
  const goToWorkspace = (id) => { navigate(gifWorkspacePath(id)); setMobilePanel(true) }
  const canvasZoom = useCanvasZoom({ minZoom: 10, maxZoom: 800, defaultZoom: 100, padding: 40 })
  const { zoom, setZoom } = canvasZoom
  const [lockAspect, setLockAspect] = useState(true)
  const [elements, setElements] = useState([])
  const [selectedElements, setSelectedElements] = useState([])
  /** Primary = last selected (edits target). Secondary = other multi-selected layers. */
  const selectedElement = selectedElements.length ? selectedElements[selectedElements.length - 1] : null
  const secondaryElements = selectedElements.length > 1
    ? selectedElements.slice(0, -1)
    : []
  const setSelectedElement = (id) => {
    setSelectedElements(id == null ? [] : [id])
  }
  /** Where new extracted elements / overlays land in the stack. */
  const [layerInsertAt, setLayerInsertAt] = useState('front')
  const [baseImageSelected, setBaseImageSelected] = useState(false)
  const [imageLocked, setImageLocked] = useState(false)
  const [selectMode, setSelectMode] = useState(false)
  const [selectionTool, setSelectionTool] = useState('Rectangle')
  const [selection, setSelection] = useState(null)
  const [selectionPoints, setSelectionPoints] = useState([])
  const selectionStart = useRef(null)
  const textDrag = useRef(null)
  const transformDrag = useRef(null)
  const anchorDrag = useRef(null)
  const [extractTolerance, setExtractTolerance] = useState(42)
  const [apiAvailable, setApiAvailable] = useState(false)
  const [apiInfo, setApiInfo] = useState(null)
  const [segmenting, setSegmenting] = useState(false)
  const [textLayers, setTextLayers] = useState([])
  const [selectedText, setSelectedText] = useState(null)
  const [fontOptions, setFontOptions] = useState(SYSTEM_FONTS)
  const [parallax, setParallax] = useState({ enabled: false, direction: 'Horizontal', strength: 6, speed: 1 })
  const [lastExport, setLastExport] = useState(null)
  const [maskEditing, setMaskEditing] = useState(false)
  const [maskBrush, setMaskBrush] = useState({ mode: 'Hide', size: 48, hardness: 70, opacity: 100, feather: 8 })
  const maskPainting = useRef(false)
  const [imageEdits, setImageEdits] = useState({ rotation: 0, flipX: false, flipY: false, brightness: 100, contrast: 100, saturation: 100, blur: 0, hue: 0, grayscale: 0, sepia: 0 })
  const [censor, setCensor] = useState({ enabled: false, x: 25, y: 25, w: 30, h: 20, pixelSize: 14 })
  const [censorSelecting, setCensorSelecting] = useState(false)
  const [overlays, setOverlays] = useState([])
  const [selectedOverlay, setSelectedOverlay] = useState(null)
  const [effectTarget, setEffectTarget] = useState('Entire GIF')
  const [gifEffects, setGifEffects] = useState(EFFECT_DEFAULTS)

  const update = (key, value) => setSettings((s) => ({
    ...s,
    [key]: typeof value === 'number' ? nice(value, Number.isInteger(value) ? 0 : 1) : value,
  }))

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
    ...current, quality,
    ...(quality === 'Low / small' ? { palette: 64, dither: false, lossy: 80, compressionMethod: 'Lossy LZW' } : {}),
    ...(quality === 'Balanced' ? { palette: 128, dither: true, lossy: 30, compressionMethod: 'Lossy LZW' } : {}),
    ...(quality === 'High quality' ? { palette: 256, dither: true, lossy: 0, compressionMethod: 'Lossless' } : {}),
  }))
  const timedFrames = Math.max(2, Math.round(settings.duration * settings.fps))
  const frames = timedFrames
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
    const img = new Image()
    img.onload = () => {
      setImage(img)
      const width = clamp(img.naturalWidth, 1, MAX_CANVAS)
      const height = clamp(img.naturalHeight, 1, MAX_CANVAS)
      setSource((current) => ({
        ...current,
        width: img.naturalWidth,
        height: img.naturalHeight,
      }))
      // New source → canvas starts at original image size (safety-capped).
      setSettings((current) => ({ ...current, width, height }))
    }
    img.src = source.url
    return () => { if (source.url.startsWith('blob:')) URL.revokeObjectURL(source.url) }
  }, [source.url])

  useEffect(() => {
    fetch('/api/health', { signal: AbortSignal.timeout(1800) })
      .then(async (response) => { if (response.ok) { setApiAvailable(true); setApiInfo(await response.json()) } })
      .catch(() => setApiAvailable(false))
  }, [])

  const draw = useCallback((rawT, target = canvasRef.current, exportScale = 1) => {
    if (!target || !image) return
    const ctx = target.getContext('2d', { willReadFrequently: true })
    const W = target.width, H = target.height
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
    const opacity = (settings.opacityStart + (settings.opacityEnd - settings.opacityStart) * t) / 100
    const iw = image.naturalWidth, ih = image.naturalHeight
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
    ctx.save()
    ctx.translate(left + originX, top + originY)
    ctx.rotate((rotation + imageEdits.rotation) * Math.PI / 180)
    ctx.scale(sx, sy)
    ctx.translate(-originX, -originY)
    ctx.filter = `brightness(${imageEdits.brightness}%) contrast(${imageEdits.contrast}%) saturate(${imageEdits.saturation}%) blur(${imageEdits.blur}px) hue-rotate(${imageEdits.hue}deg) grayscale(${imageEdits.grayscale}%) sepia(${imageEdits.sepia}%)`
    ctx.globalAlpha = opacity
    ctx.drawImage(image, 0, 0, iw, ih, 0, 0, baseDw, baseDh)
    ctx.restore()

    if (censor.enabled) {
      const cx = Math.round(censor.x / 100 * W), cy = Math.round(censor.y / 100 * H)
      const cw = Math.max(1, Math.round(censor.w / 100 * W)), ch = Math.max(1, Math.round(censor.h / 100 * H))
      const pixel = Math.max(2, censor.pixelSize), tiny = document.createElement('canvas')
      tiny.width = Math.max(1, Math.round(cw / pixel)); tiny.height = Math.max(1, Math.round(ch / pixel))
      tiny.getContext('2d').drawImage(target, cx, cy, cw, ch, 0, 0, tiny.width, tiny.height)
      ctx.save(); ctx.imageSmoothingEnabled = false; ctx.drawImage(tiny, 0, 0, tiny.width, tiny.height, cx, cy, cw, ch); ctx.restore()
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
      let overlayImage = overlay.image
      if (overlay.effects && Object.keys(EFFECT_DEFAULTS).some((key) => overlay.effects[key] !== EFFECT_DEFAULTS[key])) {
        const processed = document.createElement('canvas'); processed.width = overlay.image.naturalWidth; processed.height = overlay.image.naturalHeight
        const processedContext = processed.getContext('2d'), light = (100 + overlay.effects.brightness) * overlay.effects.lightness / 100, filter = presetFilter(overlay.effects.preset)
        processedContext.filter = `brightness(${light}%) contrast(${100 + overlay.effects.contrast}%) saturate(${overlay.effects.saturation}%) hue-rotate(${overlay.effects.hue}deg) blur(${overlay.effects.blur}px) ${filter === 'none' ? '' : filter}`
        processedContext.drawImage(overlay.image, 0, 0); processedContext.filter = 'none'; applyPixelEffects(processed, overlay.effects); overlayImage = processed
      }
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
        if (el.motion === 'Float') ty = -Math.sin(phase) * amplitudeY
        if (el.motion === 'Drift') tx = Math.sin(phase) * amplitudeX
        if (el.motion === 'Bounce') ty = -Math.abs(Math.sin(phase)) * amplitudeY
        if (el.motion === 'Pulse') elementScale = 1 + Math.sin(phase) * el.amplitude / 100
        if (el.motion === 'Spin') elementRotation = phase
        if (el.motion === 'Wobble') elementRotation = Math.sin(phase) * el.amplitude * Math.PI / 180
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
        const originX = ((el.anchorX ?? 50) / 100) * w
        const originY = ((el.anchorY ?? 50) / 100) * h
        const sx = elementScale * el.scaleX / 100 * (el.flipX ? -1 : 1)
        const sy = elementScale * el.scaleY / 100 * (el.flipY ? -1 : 1)
        ctx.save()
        ctx.globalAlpha = el.opacity / 100
        ctx.translate(x + originX + tx, y + originY + ty)
        ctx.rotate(elementRotation + el.rotation * Math.PI / 180)
        ctx.scale(sx, sy)
        ctx.translate(-originX, -originY)
        let elementBitmap = el.bitmap
        if (el.effects && Object.keys(EFFECT_DEFAULTS).some((key) => el.effects[key] !== EFFECT_DEFAULTS[key])) {
          elementBitmap = document.createElement('canvas'); elementBitmap.width = el.bitmap.width; elementBitmap.height = el.bitmap.height
          const elementContext = elementBitmap.getContext('2d'); const light = (100 + el.effects.brightness) * el.effects.lightness / 100
          const elementPreset = presetFilter(el.effects.preset)
          elementContext.filter = `brightness(${light}%) contrast(${100 + el.effects.contrast}%) saturate(${el.effects.saturation}%) hue-rotate(${el.effects.hue}deg) blur(${el.effects.blur}px) ${elementPreset === 'none' ? '' : elementPreset}`
          elementContext.drawImage(el.bitmap, 0, 0); elementContext.filter = 'none'; applyPixelEffects(elementBitmap, el.effects)
          if (el.effects.frame !== 'None') {
            const line = Math.max(1, el.effects.frameWidth); elementContext.strokeStyle = el.effects.frameColor; elementContext.fillStyle = el.effects.frameColor; elementContext.lineWidth = line
            if (el.effects.frame === 'Solid border') elementContext.strokeRect(line / 2, line / 2, elementBitmap.width - line, elementBitmap.height - line)
            if (el.effects.frame === 'Rounded corners') { elementContext.globalCompositeOperation = 'destination-in'; elementContext.beginPath(); elementContext.roundRect(0, 0, elementBitmap.width, elementBitmap.height, el.effects.rounded); elementContext.fill(); elementContext.globalCompositeOperation = 'source-over'; elementContext.stroke() }
            if (el.effects.frame === 'Camera') { elementContext.fillRect(0, 0, elementBitmap.width, line); elementContext.fillRect(0, 0, line, elementBitmap.height); elementContext.fillRect(elementBitmap.width - line, 0, line, elementBitmap.height); elementContext.fillRect(0, elementBitmap.height - line * 2.5, elementBitmap.width, line * 2.5) }
            if (el.effects.frame === 'Fuzzy') { elementContext.setLineDash([line, line * .7]); elementContext.strokeRect(line / 2, line / 2, elementBitmap.width - line, elementBitmap.height - line) }
          }
        }
        ctx.drawImage(elementBitmap, 0, 0, elementBitmap.width, elementBitmap.height, 0, 0, w, h)
        ctx.restore()
      })
    }

    textLayers.filter((layer) => layer.visible).forEach((layer) => {
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
      const enterProgress = Math.min(1, rawT / enterLength), enterEase = enterProgress * enterProgress * (3 - 2 * enterProgress)
      if (layer.entrance === 'Fade in') motionOpacity *= enterEase
      if (layer.entrance === 'Slide in left') tx -= (1 - enterEase) * W * .35
      if (layer.entrance === 'Slide in right') tx += (1 - enterEase) * W * .35
      if (layer.entrance === 'Slide in up') ty += (1 - enterEase) * H * .35
      if (layer.entrance === 'Slide in down') ty -= (1 - enterEase) * H * .35
      if (layer.entrance === 'Zoom in') { motionScale *= .25 + .75 * enterEase; motionOpacity *= enterEase }
      if (layer.entrance === 'Spin in') { motionRotation -= (1 - enterEase) * Math.PI; motionOpacity *= enterEase }
      const exitLength = Math.max(.01, layer.exitDuration / 100)
      const exitProgress = Math.max(0, (rawT - (1 - exitLength)) / exitLength), exitEase = exitProgress * exitProgress * (3 - 2 * exitProgress)
      if (layer.exit === 'Fade out') motionOpacity *= 1 - exitEase
      if (layer.exit === 'Slide out left') tx -= exitEase * W * .35
      if (layer.exit === 'Slide out right') tx += exitEase * W * .35
      if (layer.exit === 'Slide out up') ty -= exitEase * H * .35
      if (layer.exit === 'Slide out down') ty += exitEase * H * .35
      if (layer.exit === 'Zoom out') { motionScale *= 1 - .75 * exitEase; motionOpacity *= 1 - exitEase }
      if (layer.exit === 'Spin out') { motionRotation += exitEase * Math.PI; motionOpacity *= 1 - exitEase }
      let content = layer.motion === 'Typewriter' ? layer.text.slice(0, Math.ceil(layer.text.length * Math.min(1, rawT * layer.speed))) : layer.text
      if (layer.casing === 'UPPERCASE') content = content.toUpperCase()
      if (layer.casing === 'lowercase') content = content.toLowerCase()
      const fontScale = W / settings.width
      const size = layer.size * fontScale
      const lines = content.split('\n')
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

    if (Object.keys(EFFECT_DEFAULTS).some((key) => gifEffects[key] !== EFFECT_DEFAULTS[key])) {
      const copy = document.createElement('canvas'); copy.width = W; copy.height = H; copy.getContext('2d').drawImage(target, 0, 0)
      ctx.clearRect(0, 0, W, H)
      const light = (100 + gifEffects.brightness) * gifEffects.lightness / 100
      const gifPreset = presetFilter(gifEffects.preset)
      ctx.filter = `brightness(${light}%) contrast(${100 + gifEffects.contrast}%) saturate(${gifEffects.saturation}%) hue-rotate(${gifEffects.hue}deg) blur(${gifEffects.blur}px) ${gifPreset === 'none' ? '' : gifPreset}`
      ctx.drawImage(copy, 0, 0); ctx.filter = 'none'; applyPixelEffects(target, gifEffects)
      if (gifEffects.preset === 'Vignette') { const gradient = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .2, W / 2, H / 2, Math.max(W, H) * .7); gradient.addColorStop(0, 'rgba(0,0,0,0)'); gradient.addColorStop(1, 'rgba(0,0,0,.72)'); ctx.fillStyle = gradient; ctx.fillRect(0, 0, W, H) }
    }
    if (gifEffects.frame !== 'None') {
      const line = gifEffects.frameWidth * W / settings.width
      ctx.save(); ctx.strokeStyle = gifEffects.frameColor; ctx.lineWidth = line
      if (gifEffects.frame === 'Rounded corners') { ctx.globalCompositeOperation = 'destination-in'; ctx.beginPath(); ctx.roundRect(0, 0, W, H, gifEffects.rounded * W / settings.width); ctx.fill(); ctx.globalCompositeOperation = 'source-over'; ctx.stroke() }
      if (gifEffects.frame === 'Solid border') ctx.strokeRect(line / 2, line / 2, W - line, H - line)
      if (gifEffects.frame === 'Camera') { ctx.fillStyle = gifEffects.frameColor; ctx.fillRect(0, 0, W, line); ctx.fillRect(0, 0, line, H); ctx.fillRect(W - line, 0, line, H); ctx.fillRect(0, H - line * 2.5, W, line * 2.5) }
      if (gifEffects.frame === 'Fuzzy') { ctx.setLineDash([line, line * .7]); ctx.lineCap = 'round'; ctx.strokeRect(line / 2, line / 2, W - line, H - line) }
      ctx.restore()
    }
  }, [image, settings, elements, textLayers, parallax, imageEdits, censor, overlays, gifEffects])

  useEffect(() => {
    if (!image) return
    const canvas = canvasRef.current
    const maxW = 1000, maxH = 650
    const ratio = Math.min(maxW / settings.width, maxH / settings.height, 1)
    canvas.width = Math.max(1, Math.round(settings.width * ratio))
    canvas.height = Math.max(1, Math.round(settings.height * ratio))
    let started = performance.now() - progress * actualDuration * 1000
    const tick = (now) => {
      const timeline = playing ? ((now - started) / (actualDuration * 1000)) % 1 : progress
      const frameIndex = Math.min(frames - 1, Math.floor(timeline * frames))
      const t = frameIndex / frames
      if (playing) setProgress(t)
      draw(t)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [draw, image, playing, settings.width, settings.height, actualDuration, frames])

  const loadFile = (file) => {
    if (!file) return
    const blocked = uploadImageError(file)
    if (blocked) { setToast(blocked); return }
    const url = URL.createObjectURL(file)
    const probe = new Image()
    probe.onload = () => {
      if (Math.max(probe.naturalWidth, probe.naturalHeight) > MAX_UPLOAD_DIMENSION) {
        URL.revokeObjectURL(url)
        setToast(`Image dimensions must be at most ${MAX_UPLOAD_DIMENSION}×${MAX_UPLOAD_DIMENSION} px (got ${probe.naturalWidth}×${probe.naturalHeight}).`)
        return
      }
      setElements([]); setSelectedElements([]); setBaseImageSelected(false); setImageLocked(false); setTextLayers([]); setSelectedText(null); setOverlays([]); setSelectedOverlay(null); setGifEffects({ ...EFFECT_DEFAULTS }); setImageEdits({ rotation: 0, flipX: false, flipY: false, brightness: 100, contrast: 100, saturation: 100, blur: 0, hue: 0, grayscale: 0, sepia: 0 }); setCensor((current) => ({ ...current, enabled: false })); setParallax((current) => ({ ...current, enabled: false }))
      // Canvas size is applied when the image loads (original size, capped at MAX_CANVAS).
      setSource({ name: file.name, width: probe.naturalWidth, height: probe.naturalHeight, url })
      setToast(`Image loaded at ${probe.naturalWidth} × ${probe.naturalHeight} px`)
    }
    probe.onerror = () => { URL.revokeObjectURL(url); setToast('Could not open image.') }
    probe.src = url
  }

  const sourceAspect = source.width > 0 && source.height > 0 ? source.width / source.height : settings.width / Math.max(1, settings.height)

  const setCanvasWidth = (width) => {
    const nextWidth = clamp(width, 1, MAX_CANVAS)
    setSettings((current) => {
      if (!lockAspect) return { ...current, width: nextWidth }
      const nextHeight = clamp(Math.round(nextWidth / sourceAspect), 1, MAX_CANVAS)
      return { ...current, width: nextWidth, height: nextHeight }
    })
  }

  const setCanvasHeight = (height) => {
    const nextHeight = clamp(height, 1, MAX_CANVAS)
    setSettings((current) => {
      if (!lockAspect) return { ...current, height: nextHeight }
      const nextWidth = clamp(Math.round(nextHeight * sourceAspect), 1, MAX_CANVAS)
      return { ...current, width: nextWidth, height: nextHeight }
    })
  }

  const useSourceSize = () => {
    if (!source.width || !source.height) { setToast('Open an image first'); return }
    if (source.width > MAX_CANVAS || source.height > MAX_CANVAS) {
      setToast(`Source exceeds ${MAX_CANVAS}px limit — enter a smaller canvas size`)
      return
    }
    setSettings((current) => ({ ...current, width: source.width, height: source.height }))
    setToast(`Canvas restored to original ${source.width} × ${source.height} px`)
  }

  const applyPreset = (name) => setSettings((s) => ({
    ...s,
    preset: name,
    ...PRESETS[name],
    ...transformsFromAmount(name, PRESETS[name]?.amplitude ?? s.amplitude),
  }))
  const reset = () => { setSettings(INITIAL); setElements([]); setSelectedElements([]); setTextLayers([]); setSelectedText(null); setMaskEditing(false); setOverlays([]); setSelectedOverlay(null); setGifEffects({ ...EFFECT_DEFAULTS }); setImageEdits({ rotation: 0, flipX: false, flipY: false, brightness: 100, contrast: 100, saturation: 100, blur: 0, hue: 0, grayscale: 0, sepia: 0 }); setCensor({ enabled: false, x: 25, y: 25, w: 30, h: 20, pixelSize: 14 }); setParallax({ enabled: false, direction: 'Horizontal', strength: 6, speed: 1 }); setProgress(0); setPlaying(false); setToast('Settings reset') }

  const pointerPosition = (event) => {
    const bounds = stageRef.current.getBoundingClientRect()
    return { x: clamp((event.clientX - bounds.left) / bounds.width, 0, 1), y: clamp((event.clientY - bounds.top) / bounds.height, 0, 1) }
  }

  const selectionBounds = (points) => {
    const xs = points.map((point) => point.x), ys = points.map((point) => point.y)
    const x = Math.min(...xs), y = Math.min(...ys)
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
  }

  const smoothSelectionPath = (points) => {
    if (points.length < 3) return ''
    const first = points[0], last = points[points.length - 1]
    let path = `M ${(last.x + first.x) * 50} ${(last.y + first.y) * 50}`
    points.forEach((point, index) => { const next = points[(index + 1) % points.length]; path += ` Q ${point.x * 100} ${point.y * 100} ${(point.x + next.x) * 50} ${(point.y + next.y) * 50}` })
    return `${path} Z`
  }

  const cancelSelection = () => { selectionStart.current = null; setSelection(null); setSelectionPoints([]); setSelectMode(false) }

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
      if (event.key === 'Enter' && (selectionTool === 'Polygonal Lasso' || selectionTool === 'Pen Path')) completePathSelection()
      if ((event.key === 'Backspace' || event.key === 'Delete') && selectionPoints.length) { event.preventDefault(); setSelectionPoints((points) => points.slice(0, -1)) }
    }
    window.addEventListener('keydown', handleSelectionKeys)
    return () => window.removeEventListener('keydown', handleSelectionKeys)
  }, [selectMode, selectionTool, selectionPoints])

  const startSelection = (event) => {
    if (maskEditing) { event.currentTarget.setPointerCapture(event.pointerId); maskPainting.current = true; paintElementMask(event); return }
    if (censorSelecting) { event.currentTarget.setPointerCapture(event.pointerId); const point = pointerPosition(event); selectionStart.current = point; setSelection({ x: point.x, y: point.y, w: 0, h: 0 }); return }
    if (!selectMode) return
    const point = pointerPosition(event)
    if (selectionTool === 'Polygonal Lasso' || selectionTool === 'Pen Path') { setSelectionPoints((current) => [...current, point]); return }
    event.currentTarget.setPointerCapture(event.pointerId); selectionStart.current = point
    if (selectionTool === 'Freehand Lasso') setSelectionPoints([point])
    setSelection({ x: point.x, y: point.y, w: 0, h: 0 })
  }
  const moveSelection = (event) => {
    if (maskEditing && maskPainting.current) { paintElementMask(event); return }
    if (censorSelecting && selectionStart.current) { const point = pointerPosition(event), start = selectionStart.current; setSelection({ x: Math.min(start.x, point.x), y: Math.min(start.y, point.y), w: Math.abs(point.x - start.x), h: Math.abs(point.y - start.y) }); return }
    if (!selectMode || !selectionStart.current) return
    const point = pointerPosition(event), start = selectionStart.current
    if (selectionTool === 'Freehand Lasso') setSelectionPoints((current) => {
      const last = current[current.length - 1]
      return !last || Math.hypot(last.x - point.x, last.y - point.y) > .002 ? [...current, point] : current
    })
    setSelection({ x: Math.min(start.x, point.x), y: Math.min(start.y, point.y), w: Math.abs(point.x - start.x), h: Math.abs(point.y - start.y) })
  }
  const finishSelection = (event) => {
    if (maskEditing) { paintElementMask(event); maskPainting.current = false; return }
    if (censorSelecting && selectionStart.current) { const point = pointerPosition(event), start = selectionStart.current; const rect = { x: Math.min(start.x, point.x), y: Math.min(start.y, point.y), w: Math.abs(point.x - start.x), h: Math.abs(point.y - start.y) }; setCensor((current) => ({ ...current, enabled: true, x: rect.x * 100, y: rect.y * 100, w: rect.w * 100, h: rect.h * 100 })); selectionStart.current = null; setSelection(null); setToast('Censor region added'); return }
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
    extractElement(rect)
  }

  const extractElementLocal = (rect, pathPoints = null, exactMask = false) => {
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
    const id = Date.now()
    const element = { id, name: `Element ${elements.length + 1}`, ...rect, bitmap, sourceBitmap, maskCanvas, cleanup, effects: { ...EFFECT_DEFAULTS }, rotation: 0, scaleX: 100, scaleY: 100, flipX: false, flipY: false, opacity: 100, motion: 'Float', amplitude: 5, speed: 1, depth: Math.min(100, 30 + elements.length * 20), visible: true, locked: false, anchorX: 50, anchorY: 50 }
    setElements((current) => insertInStack(current, element, layerInsertAt, selectedElement))
    setSelectedElements([id]); goToWorkspace('motion')
    setSettings((current) => ({ ...current, preset: 'Still', ...PRESETS.Still }))
    setToast(layerInsertAt === 'front' ? 'Element extracted in front — choose its motion' : 'Element extracted in back — choose its motion')
  }

  const extractElement = async (rect) => {
    if (!apiAvailable) { extractElementLocal(rect); return }
    const sourceCanvas = canvasRef.current
    if (!sourceCanvas) return
    setSegmenting(true); setToast('OpenCV is separating the object…')
    try {
      const blob = await new Promise((resolve) => sourceCanvas.toBlob(resolve, 'image/png'))
      const form = new FormData()
      form.append('image', blob, 'canvas.png')
      form.append('x', String(Math.round(rect.x * sourceCanvas.width)))
      form.append('y', String(Math.round(rect.y * sourceCanvas.height)))
      form.append('width', String(Math.round(rect.w * sourceCanvas.width)))
      form.append('height', String(Math.round(rect.h * sourceCanvas.height)))
      form.append('iterations', '5')
      form.append('method', 'auto')
      form.append('model', 'isnet-general-use')
      const response = await fetch('/api/segment', { method: 'POST', body: form })
      if (!response.ok) { const detail = await response.json().catch(() => ({})); throw new Error(apiErrorMessage(detail.detail, 'Smart selection failed')) }
      const result = await response.json()
      const cutout = new Image()
      await new Promise((resolve, reject) => { cutout.onload = resolve; cutout.onerror = reject; cutout.src = result.cutout })
      const bitmap = document.createElement('canvas'); bitmap.width = cutout.naturalWidth; bitmap.height = cutout.naturalHeight
      bitmap.getContext('2d').drawImage(cutout, 0, 0)
      const sourceBitmap = document.createElement('canvas'); sourceBitmap.width = bitmap.width; sourceBitmap.height = bitmap.height; sourceBitmap.getContext('2d').drawImage(bitmap, 0, 0)
      const maskCanvas = document.createElement('canvas'); maskCanvas.width = bitmap.width; maskCanvas.height = bitmap.height; const maskCtx = maskCanvas.getContext('2d'); maskCtx.fillStyle = '#fff'; maskCtx.fillRect(0, 0, bitmap.width, bitmap.height)
      const id = Date.now()
      const smartRect = { x: result.rect.x / sourceCanvas.width, y: result.rect.y / sourceCanvas.height, w: result.rect.width / sourceCanvas.width, h: result.rect.height / sourceCanvas.height }
      const element = { id, name: `Element ${elements.length + 1}`, ...smartRect, bitmap, sourceBitmap, maskCanvas, cleanup: null, effects: { ...EFFECT_DEFAULTS }, rotation: 0, scaleX: 100, scaleY: 100, flipX: false, flipY: false, opacity: 100, motion: 'Float', amplitude: 5, speed: 1, depth: Math.min(100, 30 + elements.length * 20), visible: true, smart: true, locked: false, anchorX: 50, anchorY: 50 }
      setElements((current) => insertInStack(current, element, layerInsertAt, selectedElement))
      setSelectedElements([id]); goToWorkspace('motion')
      setSettings((current) => ({ ...current, preset: 'Still', fit: 'Contain', ...PRESETS.Still }))
      setSource((current) => ({ ...current, width: sourceCanvas.width, height: sourceCanvas.height, url: result.background }))
      setToast(`${result.engine.startsWith('rembg') ? 'AI' : 'GrabCut'} object ready · ${layerInsertAt === 'front' ? 'in front' : 'in back'}`)
    } catch (error) {
      console.warn(error); extractElementLocal(rect)
      setToast(`${error.message}. Used edge selection instead.`)
    } finally { setSegmenting(false) }
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
    setSelectedOverlay(null)
  }
  const selectLayer = (id, event) => {
    const el = elements.find((item) => item.id === id)
    if (!el) return
    setBaseImageSelected(false)
    setSelectedOverlay(null)
    setSelectedText(null)
    setPlaying(false)
    setSelectMode(false)
    setEffectTarget('Selected element')
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
    if (imageLocked) { setToast('Base image is locked'); return }
    setBaseImageSelected(true)
    setSelectedElements([])
    setSelectedOverlay(null)
    setSelectedText(null)
    setPlaying(false)
    setEffectTarget('Entire GIF')
    goToWorkspace('motion')
  }
  const selectOverlay = (id) => {
    const overlay = overlays.find((item) => item.id === id)
    if (!overlay) return
    setSelectedOverlay(id)
    setSelectedElements([])
    setBaseImageSelected(false)
    setSelectedText(null)
    setPlaying(false)
    setSelectMode(false)
    setMaskEditing(false)
    setEffectTarget('Selected overlay')
    goToWorkspace('motion')
  }
  const toggleOverlayVisible = (id) => {
    setOverlays((current) => current.map((overlay) => (
      overlay.id === id ? { ...overlay, visible: !overlay.visible } : overlay
    )))
  }
  const removeOverlay = (id) => {
    setOverlays((current) => current.filter((overlay) => overlay.id !== id))
    setSelectedOverlay((current) => current === id ? null : current)
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
    goToWorkspace('motion')
  }

  const imageTransformBox = useMemo(() => {
    if (!source.width || !source.height || !settings.width || !settings.height) {
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
    const scale = (settings.scaleStart + (settings.scaleEnd - settings.scaleStart) * t) / 100
    const ox = (settings.xStart + (settings.xEnd - settings.xStart) * t) / 100
    const oy = (settings.yStart + (settings.yEnd - settings.yStart) * t) / 100
    const rotation = settings.rotateStart + (settings.rotateEnd - settings.rotateStart) * t + imageEdits.rotation
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
  }, [source.width, source.height, settings, imageEdits.rotation, progress])

  const beginTransform = (event, target) => {
    if (!stageRef.current) return
    event.stopPropagation()
    event.preventDefault()
    stageRef.current.setPointerCapture?.(event.pointerId)
    const bounds = stageRef.current.getBoundingClientRect()
    transformDrag.current = {
      ...target,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      boundsW: bounds.width,
      boundsH: bounds.height,
      origin: target.origin,
    }
    setPlaying(false)
  }

  const moveTransform = (event) => {
    const drag = transformDrag.current
    if (!drag || drag.pointerId !== event.pointerId) return
    event.stopPropagation()
    const dx = (event.clientX - drag.startX) / drag.boundsW
    const dy = (event.clientY - drag.startY) / drag.boundsH

    if (drag.kind === 'image') {
      if (drag.mode === 'move') {
        const dpx = dx * 100
        const dpy = dy * 100
        setSettings((s) => ({
          ...s,
          xStart: nice(s.xStart + dpx, 1),
          xEnd: nice(s.xEnd + dpx, 1),
          yStart: nice(s.yStart + dpy, 1),
          yEnd: nice(s.yEnd + dpy, 1),
        }))
        transformDrag.current = { ...drag, startX: event.clientX, startY: event.clientY }
      } else if (drag.mode === 'rotate') {
        const box = drag.origin.box
        const cx = (box.x + box.w / 2) * drag.boundsW
        const cy = (box.y + box.h / 2) * drag.boundsH
        const rect = stageRef.current.getBoundingClientRect()
        const angle = Math.atan2(event.clientY - rect.top - cy, event.clientX - rect.left - cx) * 180 / Math.PI
        const delta = angle - drag.origin.startAngle
        setSettings((s) => ({
          ...s,
          rotateStart: nice(drag.origin.rotateStart + delta, 1),
          rotateEnd: nice(drag.origin.rotateEnd + delta, 1),
        }))
      } else if (drag.mode.startsWith('resize')) {
        const factor = 1 + (dx + dy) * (drag.mode.includes('w') || drag.mode.includes('n') ? -1 : 1)
        const next = clampNice(drag.origin.scale * factor, 5, 400, 1)
        const ratio = next / Math.max(1, drag.origin.scale)
        setSettings((s) => ({
          ...s,
          scaleStart: clampNice(drag.origin.scaleStart * ratio, 5, 400, 1),
          scaleEnd: clampNice(drag.origin.scaleEnd * ratio, 5, 400, 1),
        }))
      }
      return
    }

    if (drag.kind === 'element') {
      const id = drag.id
      setElements((current) => current.map((el) => {
        if (el.id !== id || el.locked) return el
        const o = drag.origin
        if (drag.mode === 'move') {
          return { ...el, x: nice(o.x + dx, 4), y: nice(o.y + dy, 4) }
        }
        if (drag.mode === 'rotate') {
          const cx = (o.x + o.w / 2) * drag.boundsW
          const cy = (o.y + o.h / 2) * drag.boundsH
          const rect = stageRef.current.getBoundingClientRect()
          const angle = Math.atan2(event.clientY - rect.top - cy, event.clientX - rect.left - cx) * 180 / Math.PI
          return { ...el, rotation: nice(o.rotation + (angle - o.startAngle), 1) }
        }
        // resize handles
        let { x, y, w, h } = o
        const handle = drag.mode.replace('resize-', '')
        if (handle.includes('e')) w = Math.max(0.02, o.w + dx)
        if (handle.includes('s')) h = Math.max(0.02, o.h + dy)
        if (handle.includes('w')) { w = Math.max(0.02, o.w - dx); x = o.x + (o.w - w) }
        if (handle.includes('n')) { h = Math.max(0.02, o.h - dy); y = o.y + (o.h - h) }
        return {
          ...el,
          x: nice(x, 4),
          y: nice(y, 4),
          w: nice(w, 4),
          h: nice(h, 4),
        }
      }))
      return
    }

    if (drag.kind === 'overlay') {
      const id = drag.id
      setOverlays((current) => current.map((overlay) => {
        if (overlay.id !== id) return overlay
        const o = drag.origin
        if (drag.mode === 'move') {
          return {
            ...overlay,
            x: nice(o.x + dx * 100, 1),
            y: nice(o.y + dy * 100, 1),
          }
        }
        if (drag.mode === 'rotate') {
          const cx = (o.box.x + o.box.w / 2) * drag.boundsW
          const cy = (o.box.y + o.box.h / 2) * drag.boundsH
          const rect = stageRef.current.getBoundingClientRect()
          const angle = Math.atan2(event.clientY - rect.top - cy, event.clientX - rect.left - cx) * 180 / Math.PI
          return { ...overlay, rotation: nice(o.rotation + (angle - o.startAngle), 1) }
        }
        if (drag.mode.startsWith('resize')) {
          const factor = 1 + (dx + dy) * (drag.mode.includes('w') || drag.mode.includes('n') ? -1 : 1)
          const next = clampNice(o.width * factor, 1, 300, 1)
          return { ...overlay, width: next }
        }
        return overlay
      }))
    }
  }

  const endTransform = (event) => {
    if (!transformDrag.current || transformDrag.current.pointerId !== event.pointerId) return
    event.stopPropagation()
    transformDrag.current = null
  }
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
  const paintElementMask = (event) => {
    const element = elements.find((item) => item.id === selectedElement)
    if (!element?.maskCanvas || !stageRef.current) return
    const point = pointerPosition(event)
    const localX = (point.x - element.x) / element.w, localY = (point.y - element.y) / element.h
    if (localX < 0 || localX > 1 || localY < 0 || localY > 1) return
    mutateMask(element.id, (mask) => {
      const context = mask.getContext('2d'), x = localX * mask.width, y = localY * mask.height
      const radius = maskBrush.size / 2 * mask.width / Math.max(1, settings.width * element.w)
      const gradient = context.createRadialGradient(x, y, radius * maskBrush.hardness / 100, x, y, radius)
      const alpha = maskBrush.opacity / 100
      if (maskBrush.mode === 'Hide') { context.globalCompositeOperation = 'destination-out'; gradient.addColorStop(0, `rgba(0,0,0,${alpha})`); gradient.addColorStop(1, 'rgba(0,0,0,0)') }
      else { context.globalCompositeOperation = 'source-over'; gradient.addColorStop(0, `rgba(255,255,255,${alpha})`); gradient.addColorStop(1, 'rgba(255,255,255,0)') }
      context.fillStyle = gradient; context.beginPath(); context.arc(x, y, radius, 0, Math.PI * 2); context.fill(); context.globalCompositeOperation = 'source-over'
    })
  }

  const addTextLayer = () => {
    const id = Date.now(), layer = { id, name: `Text ${textLayers.length + 1}`, ...TEXT_DEFAULT }
    setTextLayers((current) => [...current, layer]); setSelectedText(id); goToWorkspace('text'); setPlaying(false)
    setToast('Text layer added')
  }
  const updateText = (key, value) => setTextLayers((current) => current.map((layer) => {
    if (layer.id !== selectedText) return layer
    if (typeof value !== 'number') return { ...layer, [key]: value }
    return { ...layer, [key]: nice(value, key === 'x' || key === 'y' ? 2 : 1) }
  }))
  const removeText = (id) => {
    const layer = textLayers.find((item) => item.id === id)
    if (layer?.locked) { setToast('Unlock the text layer before removing it'); return }
    setTextLayers((current) => current.filter((item) => item.id !== id))
    setSelectedText(null)
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
  const activeEffects = effectTarget === 'Selected element'
    ? (elements.find((element) => element.id === selectedElement)?.effects || EFFECT_DEFAULTS)
    : effectTarget === 'Selected overlay'
      ? (overlays.find((overlay) => overlay.id === selectedOverlay)?.effects || EFFECT_DEFAULTS)
      : gifEffects
  const updateEffect = (key, value) => {
    if (effectTarget === 'Selected element' && selectedElement) setElements((current) => current.map((element) => element.id === selectedElement ? { ...element, effects: { ...(element.effects || EFFECT_DEFAULTS), [key]: value } } : element))
    else if (effectTarget === 'Selected overlay' && selectedOverlay) setOverlays((current) => current.map((overlay) => overlay.id === selectedOverlay ? { ...overlay, effects: { ...(overlay.effects || EFFECT_DEFAULTS), [key]: value } } : overlay))
    else setGifEffects((current) => ({ ...current, [key]: value }))
  }
  const addOverlay = async (file) => {
    if (!file) return
    const url = URL.createObjectURL(file), overlayImage = await imageFromUrl(url), id = Date.now()
    const overlay = {
      id, name: file.name, image: overlayImage, url,
      x: 50, y: 50, width: 30, scaleX: 100, scaleY: 100, rotation: 0, opacity: 100,
      flipX: false, flipY: false, effects: { ...EFFECT_DEFAULTS }, visible: true,
      anchorX: 50, anchorY: 50,
    }
    setOverlays((current) => insertInStack(current, overlay, layerInsertAt, selectedOverlay))
    setSelectedOverlay(id)
    setSelectedElements([])
    setBaseImageSelected(false)
    setSelectedText(null)
    setEffectTarget('Selected overlay')
    setPlaying(false)
    goToWorkspace('motion')
    setToast(layerInsertAt === 'front' ? 'Image overlay added in front' : 'Image overlay added in back')
  }
  const updateOverlay = (key, value) => setOverlays((current) => current.map((overlay) => {
    if (overlay.id !== selectedOverlay) return overlay
    if (typeof value !== 'number') return { ...overlay, [key]: value }
    return { ...overlay, [key]: nice(value, 1) }
  }))
  const saveCurrentPng = async (reducePalette = false) => {
    const ratio = Math.min(1, 1920 / Math.max(settings.width, settings.height)), canvas = document.createElement('canvas')
    canvas.width = Math.round(settings.width * ratio); canvas.height = Math.round(settings.height * ratio); draw(progress, canvas, ratio)
    let blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (apiAvailable) {
      try { const form = new FormData(); form.append('image', blob, 'frame.png'); form.append('palette', String(reducePalette)); const response = await fetch('/api/optimize-png', { method: 'POST', body: form }); if (response.ok) blob = await response.blob() } catch { /* Keep browser PNG. */ }
    }
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `${source.name.replace(/\.[^.]+$/, '')}-frame.png`; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000); setToast(`PNG saved · ${fmtBytes(blob.size)}`)
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
  const beginTextDrag = (event, layer) => {
    if (layer.locked) { setToast('Text layer is locked'); return }
    event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId)
    textDrag.current = { id: layer.id, clientX: event.clientX, clientY: event.clientY, x: layer.x, y: layer.y }
    setSelectedText(layer.id); setBaseImageSelected(false); setSelectedElements([]); goToWorkspace('text'); setPlaying(false)
  }
  const dragTextLayer = (event) => {
    if (!textDrag.current || !stageRef.current) return
    event.stopPropagation()
    const bounds = stageRef.current.getBoundingClientRect(), drag = textDrag.current
    const x = nice(drag.x + (event.clientX - drag.clientX) / bounds.width * 100, 1)
    const y = nice(drag.y + (event.clientY - drag.clientY) / bounds.height * 100, 1)
    setTextLayers((current) => current.map((layer) => layer.id === drag.id ? { ...layer, x, y } : layer))
  }
  const endTextDrag = (event) => { event.stopPropagation(); textDrag.current = null }

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
    if (!image || exporting) return
    if (frames > 240) { setToast('Reduce duration or FPS below 240 frames for browser export'); return }
    setExporting(true); setToast(''); setPlaying(false)
    await new Promise((r) => setTimeout(r, 30))
    try {
      const limit = settings.quality === 'High quality' ? 1440 : settings.quality === 'Balanced' ? 1080 : 720
      let ratio = apiAvailable ? 1 : Math.min(1, limit / Math.max(settings.width, settings.height))
      let width = Math.round(settings.width * ratio), height = Math.round(settings.height * ratio)
      const work = document.createElement('canvas'); work.width = width; work.height = height

      if (apiAvailable) {
        try {
          const form = new FormData()
          for (let i = 0; i < frames; i++) {
            draw(i / frames, work, ratio)
            const frameBlob = await new Promise((resolve) => work.toBlob(resolve, 'image/png'))
            form.append('frames', frameBlob, `frame-${String(i).padStart(4, '0')}.png`)
            if (i % 2 === 0) { setProgress((i + 1) / frames * .72); await new Promise((r) => setTimeout(r, 0)) }
          }
          form.append('fps', String(Math.max(1, Math.round(timingFps)))); form.append('loop', String(settings.loop))
          form.append('palette', String(settings.palette)); form.append('optimize', 'true')
          form.append('dither', String(settings.dither)); form.append('lossy', String(settings.lossy))
          form.append('compression_method', settings.compressionMethod)
          form.append('disposal', String(settings.disposal))
          form.append('durations', JSON.stringify(frameDelays))
          setProgress(.8)
          const response = await fetch('/api/export', { method: 'POST', body: form })
          if (!response.ok) { const detail = await response.json().catch(() => ({})); throw new Error(apiErrorMessage(detail.detail, 'Python export failed')) }
          const blob = await response.blob(); setProgress(1)
          const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
          a.download = `${source.name.replace(/\.[^.]+$/, '').trim().replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'animation'}.gif`; a.click()
          setTimeout(() => URL.revokeObjectURL(a.href), 1000)
          const optimized = response.headers.get('X-GIF-Optimized') === 'true'
          const originalBytes = Number(response.headers.get('X-GIF-Original-Bytes')) || blob.size
          setLastExport({ bytes: blob.size, originalBytes, optimized, encoder: 'ImageIO' })
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
        draw(i / frames, work, ratio)
        const rgba = work.getContext('2d').getImageData(0, 0, width, height).data
        const prepared = settings.dither ? ditherToPalette(rgba, width, height, globalPalette) : rgba
        const indexed = applyPalette(prepared, globalPalette, colorFormat)
        encoder.writeFrame(indexed, width, height, { palette: globalPalette, delay: frameDelays[i], repeat: settings.loop, transparent: settings.transparent, dispose: settings.disposal })
        if (i % 3 === 0) { setProgress((i + 1) / frames); await new Promise((r) => setTimeout(r, 0)) }
      }
      encoder.finish()
      const blob = new Blob([encoder.bytesView()], { type: 'image/gif' })
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
      a.download = `${source.name.replace(/\.[^.]+$/, '').trim().replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'animation'}.gif`; a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 1000)
      setLastExport({ bytes: blob.size, originalBytes: blob.size, optimized: false, encoder: 'Browser' })
      setToast(`GIF exported with browser encoder · ${fmtBytes(blob.size)}`)
    } catch (error) { console.error(error); setToast('Export failed — try a smaller canvas') }
    finally { setExporting(false); setPlaying(false) }
  }

  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(''), 3000); return () => clearTimeout(id) }, [toast])

  const stageStyle = { width: '100%', height: '100%' }
  const textBounds = (layer) => {
    const lines = layer.text.split('\n'), longest = Math.max(1, ...lines.map((line) => line.length))
    const width = Math.min(95, Math.max(8, longest * layer.size * .62 * layer.scaleX / 100 / settings.width * 100))
    const height = Math.min(95, Math.max(5, lines.length * layer.size * layer.lineHeight * layer.scaleY / 100 / settings.height * 100))
    const left = layer.align === 'center' ? layer.x - width / 2 : layer.align === 'right' ? layer.x - width : layer.x
    return { left, top: layer.y - height / 2, width, height }
  }

  const value = {
    // refs
    canvasRef, stageRef, fileRef, fontFileRef, overlayFileRef, compressGifRef,
    // state
    settings, setSettings, image, source, playing, setPlaying, progress, setProgress, exporting,
    dropActive, setDropActive, mobilePanel, setMobilePanel, toast, setToast, activeTab, goToWorkspace, zoom, setZoom, canvasZoom,
    lockAspect, setLockAspect, setCanvasWidth, setCanvasHeight, useSourceSize, sourceAspect,
    elements, setElements, selectedElement, setSelectedElement, selectedElements, setSelectedElements,
    secondaryElements, layerInsertAt, setLayerInsertAt,
    selectLayer, clearLayerSelection, updateElementById, moveElement, moveOverlay,
    baseImageSelected, setBaseImageSelected,
    imageLocked, setImageLocked, imageTransformBox,
    selectMode, setSelectMode, selectionTool, setSelectionTool,
    selection, setSelection, selectionPoints, setSelectionPoints, extractTolerance, setExtractTolerance,
    apiAvailable, apiInfo, segmenting, textLayers, setTextLayers, selectedText, setSelectedText, fontOptions,
    parallax, setParallax, lastExport, maskEditing, setMaskEditing, maskBrush, setMaskBrush,
    imageEdits, setImageEdits, censor, setCensor, censorSelecting, setCensorSelecting,
    overlays, setOverlays, selectedOverlay, setSelectedOverlay, effectTarget, setEffectTarget, gifEffects, setGifEffects,
    // derived
    frames, frameDelays, actualDuration, actualFps, memory, timedFrames, timingFps, activeEffects, stageStyle,
    // actions
    update, setAmplitude, setSpeed, applyQuality, applyPreset, reset, loadFile, draw, cancelSelection, completePathSelection,
    startSelection, moveSelection, finishSelection, smoothSelectionPath, updateElement, removeElement,
    toggleElementLock, toggleElementVisible, toggleImageLock, toggleFlip, rotateSelection, selectionFlip, toggleTextLock, selectBaseImage, selectStageElement,
    beginTransform, moveTransform, endTransform,
    resetElementMask, invertElementMask, featherElementMask, addTextLayer, updateText, removeText, moveText,
    uploadFont, updateEffect,
    addOverlay, updateOverlay, selectOverlay, selectStageOverlay, overlayBounds, toggleOverlayVisible, removeOverlay, saveCurrentPng, compressExistingGif, beginTextDrag, dragTextLayer, endTextDrag,
    beginAnchorDrag, moveAnchorDrag, endAnchorDrag, resetMotionAnchor,
    exportGif, textBounds,
  }

  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>
}
