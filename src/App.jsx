import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlignCenter, AlignLeft, AlignRight, ArrowDown, ArrowUp, Check, ChevronDown, Copy, Crop, Download, FileImage, Film, FolderOpen, ImagePlus, Info,
  Layers3, LoaderCircle, Maximize2, Menu, MousePointer2, Pause, Play, Plus, Redo2,
  RotateCcw, RotateCw, Settings2, SlidersHorizontal, Sparkles, Trash2, Type, Undo2, Upload, X, Zap,
} from 'lucide-react'
import { GIFEncoder, applyPalette, quantize } from 'gifenc'

const PRESETS = {
  'Zoom in': { scaleStart: 100, scaleEnd: 118, rotateStart: 0, rotateEnd: 0, xStart: 0, xEnd: 0, yStart: 0, yEnd: 0, opacityStart: 100, opacityEnd: 100, amplitude: 4, cycles: 1, pingPong: false },
  'Zoom out': { scaleStart: 120, scaleEnd: 100, rotateStart: 0, rotateEnd: 0, xStart: 0, xEnd: 0, yStart: 0, yEnd: 0, opacityStart: 100, opacityEnd: 100, amplitude: 4, cycles: 1, pingPong: false },
  'Ken Burns': { scaleStart: 102, scaleEnd: 125, rotateStart: 0, rotateEnd: 0, xStart: -7, xEnd: 7, yStart: 4, yEnd: -4, opacityStart: 100, opacityEnd: 100, amplitude: 4, cycles: 1, pingPong: true },
  'Pulse': { scaleStart: 100, scaleEnd: 100, rotateStart: 0, rotateEnd: 0, xStart: 0, xEnd: 0, yStart: 0, yEnd: 0, opacityStart: 100, opacityEnd: 100, amplitude: 7, cycles: 2, pingPong: false },
  'Orbit': { scaleStart: 104, scaleEnd: 104, rotateStart: 0, rotateEnd: 0, xStart: 0, xEnd: 0, yStart: 0, yEnd: 0, opacityStart: 100, opacityEnd: 100, amplitude: 6, cycles: 1, pingPong: false },
  'Spin & zoom': { scaleStart: 85, scaleEnd: 120, rotateStart: -18, rotateEnd: 18, xStart: 0, xEnd: 0, yStart: 0, yEnd: 0, opacityStart: 35, opacityEnd: 100, amplitude: 4, cycles: 1, pingPong: true },
  'Fade in': { scaleStart: 100, scaleEnd: 100, rotateStart: 0, rotateEnd: 0, xStart: 0, xEnd: 0, yStart: 0, yEnd: 0, opacityStart: 0, opacityEnd: 100, amplitude: 0, cycles: 1, pingPong: false },
  'Wobble': { scaleStart: 104, scaleEnd: 104, rotateStart: 0, rotateEnd: 0, xStart: 0, xEnd: 0, yStart: 0, yEnd: 0, opacityStart: 100, opacityEnd: 100, amplitude: 5, cycles: 3, pingPong: false },
  'Still': { scaleStart: 100, scaleEnd: 100, rotateStart: 0, rotateEnd: 0, xStart: 0, xEnd: 0, yStart: 0, yEnd: 0, opacityStart: 100, opacityEnd: 100, amplitude: 0, cycles: 1, pingPong: false },
}

const INITIAL = {
  preset: 'Zoom in', duration: 2.5, fps: 15, easing: 'Ease in-out', width: 800, height: 520,
  fit: 'Contain', background: '#111114', transparent: false, quality: 'High quality', palette: 256,
  dither: true, lossy: 0, compressionMethod: 'Lossless', loop: 0, disposal: 2, ...PRESETS['Zoom in'],
}

const TEXT_DEFAULT = {
  text: 'Your text', font: 'Arial', size: 72, weight: 700, italic: false,
  align: 'center', color: '#ffffff', strokeColor: '#000000', strokeWidth: 0,
  letterSpacing: 0, lineHeight: 1.1, opacity: 100, x: 50, y: 50, rotation: 0,
  scaleX: 100, scaleY: 100, flipX: false, flipY: false,
  shadowColor: '#000000', shadowBlur: 0, shadowX: 0, shadowY: 4,
  decoration: 'None', casing: 'As typed', blendMode: 'source-over',
  entrance: 'None', entranceDuration: 20, motion: 'None', exit: 'None', exitDuration: 20,
  amplitude: 5, speed: 1, visible: true,
}

const SYSTEM_FONTS = ['Arial', 'Helvetica', 'Segoe UI', 'Verdana', 'Trebuchet MS', 'Georgia', 'Times New Roman', 'Courier New', 'Impact', 'Comic Sans MS']
const EFFECT_DEFAULTS = {
  hue: 0, saturation: 100, lightness: 100, brightness: 0, contrast: 0,
  preset: 'None', invert: 0, tintColor: '#ff6b6b', tint: 0,
  transparentEnabled: false, transparentColor: '#ffffff', fuzz: 2, edgeCleanup: 2,
  blur: 0, sharpen: 0, posterize: 0, solarize: 0, noise: 0, emboss: 0, oilPaint: 0,
  distortion: 'None', distortionAmount: 0, dither: 'None',
  frame: 'None', frameColor: '#ffffff', frameWidth: 12, rounded: 28,
}

const ease = (t, type) => {
  if (type === 'Linear') return t
  if (type === 'Ease in') return t * t
  if (type === 'Ease out') return 1 - (1 - t) ** 2
  if (type === 'Smoothstep') return t * t * (3 - 2 * t)
  return t < .5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2
}
const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0))
const fmtBytes = (bytes) => bytes > 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : `${Math.round(bytes / 1024 ** 2)} MB`

const ditherToPalette = (rgba, width, height, palette) => {
  const output = new Uint8ClampedArray(rgba), cache = new Map()
  const nearest = (r, g, b) => {
    const key = (r >> 3) << 10 | (g >> 3) << 5 | (b >> 3)
    if (cache.has(key)) return cache.get(key)
    let best = 0, bestDistance = Infinity
    for (let i = 0; i < palette.length; i++) {
      const color = palette[i], dr = r - color[0], dg = g - color[1], db = b - color[2]
      const distance = dr * dr * .30 + dg * dg * .59 + db * db * .11
      if (distance < bestDistance) { bestDistance = distance; best = i }
    }
    cache.set(key, best); return best
  }
  const spread = (x, y, er, eg, eb, factor) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return
    const index = (y * width + x) * 4
    if (output[index + 3] < 128) return
    output[index] += er * factor; output[index + 1] += eg * factor; output[index + 2] += eb * factor
  }
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const index = (y * width + x) * 4
    if (output[index + 3] < 128) continue
    const oldR = output[index], oldG = output[index + 1], oldB = output[index + 2]
    const color = palette[nearest(oldR, oldG, oldB)]
    output[index] = color[0]; output[index + 1] = color[1]; output[index + 2] = color[2]
    const er = oldR - color[0], eg = oldG - color[1], eb = oldB - color[2]
    spread(x + 1, y, er, eg, eb, 7 / 16); spread(x - 1, y + 1, er, eg, eb, 3 / 16)
    spread(x, y + 1, er, eg, eb, 5 / 16); spread(x + 1, y + 1, er, eg, eb, 1 / 16)
  }
  return output
}

const presetFilter = (preset) => ({
  Gotham: 'grayscale(.25) contrast(1.35) brightness(.9) saturate(.8)',
  Lomo: 'contrast(1.3) saturate(1.35) brightness(.95)',
  Nashville: 'sepia(.25) contrast(1.15) brightness(1.08) saturate(1.15)',
  Toaster: 'sepia(.35) contrast(1.25) saturate(1.4) brightness(.95)',
  Polaroid: 'sepia(.18) contrast(1.08) brightness(1.1) saturate(.85)',
  Grayscale: 'grayscale(1)', Sepia: 'sepia(1)', Monochrome: 'grayscale(1) contrast(1.8)',
}[preset] || 'none')

const convolveCanvas = (canvas, kernel, mix = 1) => {
  const context = canvas.getContext('2d', { willReadFrequently: true }), width = canvas.width, height = canvas.height
  const source = context.getImageData(0, 0, width, height), output = context.createImageData(width, height), side = Math.sqrt(kernel.length), half = Math.floor(side / 2)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const target = (y * width + x) * 4
    for (let channel = 0; channel < 3; channel++) {
      let value = 0
      for (let ky = 0; ky < side; ky++) for (let kx = 0; kx < side; kx++) {
        const sx = Math.max(0, Math.min(width - 1, x + kx - half)), sy = Math.max(0, Math.min(height - 1, y + ky - half))
        value += source.data[(sy * width + sx) * 4 + channel] * kernel[ky * side + kx]
      }
      output.data[target + channel] = source.data[target + channel] * (1 - mix) + value * mix
    }
    output.data[target + 3] = source.data[target + 3]
  }
  context.putImageData(output, 0, 0)
}

const applyPixelEffects = (canvas, effects) => {
  if (!effects) return canvas
  const context = canvas.getContext('2d', { willReadFrequently: true }), width = canvas.width, height = canvas.height
  if (effects.distortion !== 'None' && effects.distortionAmount > 0) {
    const source = document.createElement('canvas'); source.width = width; source.height = height; source.getContext('2d').drawImage(canvas, 0, 0)
    const original = source.getContext('2d').getImageData(0, 0, width, height), output = context.createImageData(width, height)
    const cx = width / 2, cy = height / 2, maxRadius = Math.hypot(cx, cy), strength = effects.distortionAmount / 100
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      let sx = x, sy = y, dx = x - cx, dy = y - cy, radius = Math.hypot(dx, dy), angle = Math.atan2(dy, dx)
      if (effects.distortion === 'Swirl') { angle -= strength * 3 * (1 - Math.min(1, radius / maxRadius)); sx = cx + Math.cos(angle) * radius; sy = cy + Math.sin(angle) * radius }
      if (effects.distortion === 'Implode') { const mapped = maxRadius * Math.pow(Math.min(1, radius / maxRadius), 1 + strength * 2); sx = cx + Math.cos(angle) * mapped; sy = cy + Math.sin(angle) * mapped }
      if (effects.distortion === 'Wave') sx -= Math.sin(y / Math.max(4, 24 - strength * 18)) * strength * 24
      const sourceIndex = (Math.max(0, Math.min(height - 1, Math.round(sy))) * width + Math.max(0, Math.min(width - 1, Math.round(sx)))) * 4, targetIndex = (y * width + x) * 4
      output.data[targetIndex] = original.data[sourceIndex]; output.data[targetIndex + 1] = original.data[sourceIndex + 1]; output.data[targetIndex + 2] = original.data[sourceIndex + 2]; output.data[targetIndex + 3] = original.data[sourceIndex + 3]
    }
    context.putImageData(output, 0, 0)
  }
  const pixels = context.getImageData(0, 0, width, height), data = pixels.data
  const tint = [parseInt(effects.tintColor.slice(1, 3), 16), parseInt(effects.tintColor.slice(3, 5), 16), parseInt(effects.tintColor.slice(5, 7), 16)]
  const key = [parseInt(effects.transparentColor.slice(1, 3), 16), parseInt(effects.transparentColor.slice(3, 5), 16), parseInt(effects.transparentColor.slice(5, 7), 16)]
  const bayer = [0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5]
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i], g = data[i + 1], b = data[i + 2]
    if (effects.invert) { const amount = effects.invert / 100; r += (255 - 2 * r) * amount; g += (255 - 2 * g) * amount; b += (255 - 2 * b) * amount }
    if (effects.tint) { const amount = effects.tint / 100; r = r * (1 - amount) + tint[0] * amount; g = g * (1 - amount) + tint[1] * amount; b = b * (1 - amount) + tint[2] * amount }
    if (effects.posterize) { const levels = Math.max(2, Math.round(16 - effects.posterize / 7)); r = Math.round(r / 255 * (levels - 1)) * 255 / (levels - 1); g = Math.round(g / 255 * (levels - 1)) * 255 / (levels - 1); b = Math.round(b / 255 * (levels - 1)) * 255 / (levels - 1) }
    if (effects.solarize) { const threshold = 255 - effects.solarize * 2.2; if (r > threshold) r = 255 - r; if (g > threshold) g = 255 - g; if (b > threshold) b = 255 - b }
    if (effects.noise) { const noise = (Math.sin(i * 12.9898) * 43758.5453 % 1 - .5) * effects.noise * 2; r += noise; g += noise; b += noise }
    if (effects.dither === 'Ordered') { const p = (i / 4), x = p % width, y = Math.floor(p / width), threshold = (bayer[(y % 4) * 4 + (x % 4)] / 16 - .5) * 32; r += threshold; g += threshold; b += threshold }
    if (effects.transparentEnabled) { const distance = Math.hypot(r - key[0], g - key[1], b - key[2]); if (distance <= effects.fuzz * 4.42) data[i + 3] = 0; else if (distance <= (effects.fuzz + effects.edgeCleanup) * 4.42) data[i + 3] *= (distance - effects.fuzz * 4.42) / Math.max(1, effects.edgeCleanup * 4.42) }
    data[i] = r; data[i + 1] = g; data[i + 2] = b
  }
  context.putImageData(pixels, 0, 0)
  if (effects.dither === 'Error diffusion') {
    const palette = []
    for (let r = 0; r < 4; r++) for (let g = 0; g < 4; g++) for (let b = 0; b < 4; b++) palette.push([r * 85, g * 85, b * 85])
    const dithered = ditherToPalette(context.getImageData(0, 0, width, height).data, width, height, palette)
    context.putImageData(new ImageData(dithered, width, height), 0, 0)
  }
  if (effects.sharpen) convolveCanvas(canvas, [0,-1,0,-1,5,-1,0,-1,0], effects.sharpen / 100)
  if (effects.emboss) convolveCanvas(canvas, [-2,-1,0,-1,1,1,0,1,2], effects.emboss / 100)
  if (effects.oilPaint) {
    const copy = document.createElement('canvas'); copy.width = width; copy.height = height; copy.getContext('2d').drawImage(canvas, 0, 0)
    context.clearRect(0, 0, width, height); context.filter = `blur(${effects.oilPaint / 35}px) contrast(${1 + effects.oilPaint / 120}) saturate(${1 + effects.oilPaint / 160})`; context.drawImage(copy, 0, 0); context.filter = 'none'
  }
  return canvas
}

function IconButton({ label, children, onClick, disabled = false }) {
  return <button title={label} aria-label={label} onClick={onClick} disabled={disabled} className="focus-ring grid h-9 w-9 place-items-center rounded-lg text-zinc-400 transition hover:bg-white/5 hover:text-white disabled:opacity-30">{children}</button>
}

function Field({ label, value, onChange, suffix, min, max, step = 1 }) {
  return <label className="block">
    <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[.13em] text-zinc-500">{label}</span>
    <div className="flex h-10 items-center rounded-xl border border-white/[.08] bg-black/20 px-3 transition focus-within:border-acid/50">
      <input type="number" value={value} min={min} max={max} step={step} onChange={(e) => onChange(clamp(e.target.value, min ?? -9999, max ?? 9999))} className="w-full bg-transparent text-sm font-medium text-zinc-100 outline-none" />
      {suffix && <span className="text-xs text-zinc-600">{suffix}</span>}
    </div>
  </label>
}

function SelectField({ label, value, onChange, children }) {
  return <label className="block">
    {label && <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[.13em] text-zinc-500">{label}</span>}
    <div className="relative">
      <select value={value} onChange={(e) => onChange(e.target.value)} className="focus-ring h-10 w-full appearance-none rounded-xl border border-white/[.08] bg-[#111113] px-3 pr-9 text-sm font-medium text-zinc-200 outline-none">
        {children}
      </select><ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-zinc-500" />
    </div>
  </label>
}

function Switch({ checked, onChange, label }) {
  return <label className="flex cursor-pointer items-center justify-between gap-3 text-sm text-zinc-300">
    <span>{label}</span><input className="sr-only" type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    <span className={`relative h-5 w-9 rounded-full transition ${checked ? 'bg-acid' : 'bg-zinc-700'}`}><span className={`absolute top-0.5 h-4 w-4 rounded-full bg-black transition ${checked ? 'left-[18px]' : 'left-0.5'}`} /></span>
  </label>
}

function Section({ title, children, open = true }) {
  const [expanded, setExpanded] = useState(open)
  return <section className="border-b border-white/[.07] py-5">
    <button onClick={() => setExpanded(!expanded)} className="flex w-full items-center justify-between text-left">
      <span className="display text-sm font-bold text-zinc-100">{title}</span><ChevronDown className={`h-4 w-4 text-zinc-600 transition ${expanded ? 'rotate-180' : ''}`} />
    </button>{expanded && <div className="mt-4">{children}</div>}
  </section>
}

function App() {
  const canvasRef = useRef(null)
  const stageRef = useRef(null)
  const fileRef = useRef(null)
  const fontFileRef = useRef(null)
  const frameFileRef = useRef(null)
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
  const [activeTab, setActiveTab] = useState('motion')
  const [zoom, setZoom] = useState(84)
  const [elements, setElements] = useState([])
  const [selectedElement, setSelectedElement] = useState(null)
  const [selectMode, setSelectMode] = useState(false)
  const [selectionTool, setSelectionTool] = useState('Rectangle')
  const [selection, setSelection] = useState(null)
  const [selectionPoints, setSelectionPoints] = useState([])
  const selectionStart = useRef(null)
  const textDrag = useRef(null)
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
  const [frameSequence, setFrameSequence] = useState([])
  const [frameMode, setFrameMode] = useState(false)
  const [frameOptions, setFrameOptions] = useState({ fit: 'Contain', crossfade: false, crossfadeFrames: 3 })
  const maskPainting = useRef(false)
  const [imageEdits, setImageEdits] = useState({ rotation: 0, flipX: false, flipY: false, cropLeft: 0, cropTop: 0, cropRight: 0, cropBottom: 0, brightness: 100, contrast: 100, saturation: 100, blur: 0, hue: 0, grayscale: 0, sepia: 0 })
  const [censor, setCensor] = useState({ enabled: false, x: 25, y: 25, w: 30, h: 20, pixelSize: 14 })
  const [censorSelecting, setCensorSelecting] = useState(false)
  const [overlays, setOverlays] = useState([])
  const [selectedOverlay, setSelectedOverlay] = useState(null)
  const [effectTarget, setEffectTarget] = useState('Entire GIF')
  const [gifEffects, setGifEffects] = useState(EFFECT_DEFAULTS)

  const update = (key, value) => setSettings((s) => ({ ...s, [key]: value }))
  const applyQuality = (quality) => setSettings((current) => ({
    ...current, quality,
    ...(quality === 'Low / small' ? { palette: 64, dither: false, lossy: 80, compressionMethod: 'Lossy LZW' } : {}),
    ...(quality === 'Balanced' ? { palette: 128, dither: true, lossy: 30, compressionMethod: 'Lossy LZW' } : {}),
    ...(quality === 'High quality' ? { palette: 256, dither: true, lossy: 0, compressionMethod: 'Lossless' } : {}),
  }))
  const timedFrames = Math.max(2, Math.round(settings.duration * settings.fps))
  const sequenceFrames = frameSequence.length + (frameOptions.crossfade ? frameSequence.length * frameOptions.crossfadeFrames : 0)
  const frames = frameMode && frameSequence.length ? Math.max(timedFrames, sequenceFrames) : timedFrames
  const timingFps = frameMode && frameSequence.length ? frames / settings.duration : settings.fps
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
    img.onload = () => setImage(img)
    img.src = source.url
    return () => { if (source.url.startsWith('blob:')) URL.revokeObjectURL(source.url) }
  }, [source.url])

  useEffect(() => {
    fetch('/api/health', { signal: AbortSignal.timeout(1800) })
      .then(async (response) => { if (response.ok) { setApiAvailable(true); setApiInfo(await response.json()) } })
      .catch(() => setApiAvailable(false))
  }, [])

  useEffect(() => {
    if (!frameMode || !frameSequence.length) return
    const sequenceDuration = Math.max(.1, Math.min(120, frameSequence.reduce((sum, frame) => sum + frame.delay, 0) / 100))
    setSettings((current) => Math.abs(current.duration - sequenceDuration) < .001 ? current : { ...current, duration: sequenceDuration })
  }, [frameMode, frameSequence])

  const draw = useCallback((rawT, target = canvasRef.current, exportScale = 1) => {
    if (!target || !image) return
    const ctx = target.getContext('2d', { willReadFrequently: true })
    const W = target.width, H = target.height
    if (settings.transparent) ctx.clearRect(0, 0, W, H)
    else { ctx.fillStyle = settings.background; ctx.fillRect(0, 0, W, H) }
    let timeline = settings.pingPong ? 1 - Math.abs(1 - rawT * 2) : rawT
    const t = ease(timeline, settings.easing)
    let scale = (settings.scaleStart + (settings.scaleEnd - settings.scaleStart) * t) / 100
    let x = settings.xStart + (settings.xEnd - settings.xStart) * t
    let y = settings.yStart + (settings.yEnd - settings.yStart) * t
    let rotation = settings.rotateStart + (settings.rotateEnd - settings.rotateStart) * t
    const phase = rawT * Math.PI * 2 * settings.cycles
    if (settings.preset === 'Pulse') scale *= 1 + Math.sin(phase) * settings.amplitude / 100
    if (settings.preset === 'Orbit') { x += Math.cos(phase) * settings.amplitude; y += Math.sin(phase) * settings.amplitude }
    if (settings.preset === 'Wobble') rotation += Math.sin(phase) * settings.amplitude
    const opacity = (settings.opacityStart + (settings.opacityEnd - settings.opacityStart) * t) / 100
    let activeImages = [{ image, alpha: 1 }]
    if (frameMode && frameSequence.length) {
      const totalDelay = frameSequence.reduce((total, frame) => total + frame.delay, 0)
      let position = rawT * totalDelay, frameIndex = 0
      while (frameIndex < frameSequence.length - 1 && position >= frameSequence[frameIndex].delay) { position -= frameSequence[frameIndex].delay; frameIndex++ }
      const current = frameSequence[frameIndex], frameProgress = position / Math.max(1, current.delay)
      activeImages = [{ image: current.image, alpha: 1 }]
      const fadeStart = Math.max(.1, 1 - frameOptions.crossfadeFrames / 10)
      if (frameOptions.crossfade && frameProgress > fadeStart) {
        const fade = (frameProgress - fadeStart) / (1 - fadeStart), next = frameSequence[(frameIndex + 1) % frameSequence.length]
        activeImages = [{ image: current.image, alpha: 1 - fade }, { image: next.image, alpha: fade }]
      }
    }
    ctx.save(); ctx.translate(W / 2 + x / 100 * W, H / 2 + y / 100 * H); ctx.rotate((rotation + imageEdits.rotation) * Math.PI / 180); ctx.scale(imageEdits.flipX ? -1 : 1, imageEdits.flipY ? -1 : 1)
    ctx.filter = `brightness(${imageEdits.brightness}%) contrast(${imageEdits.contrast}%) saturate(${imageEdits.saturation}%) blur(${imageEdits.blur}px) hue-rotate(${imageEdits.hue}deg) grayscale(${imageEdits.grayscale}%) sepia(${imageEdits.sepia}%)`
    activeImages.forEach(({ image: frameImage, alpha }) => {
      const iw = frameImage.naturalWidth, ih = frameImage.naturalHeight
      const sx = imageEdits.cropLeft / 100 * iw, sy = imageEdits.cropTop / 100 * ih
      const cropWidth = Math.max(1, iw * (1 - (imageEdits.cropLeft + imageEdits.cropRight) / 100))
      const cropHeight = Math.max(1, ih * (1 - (imageEdits.cropTop + imageEdits.cropBottom) / 100))
      const contain = Math.min(W / cropWidth, H / cropHeight), cover = Math.max(W / cropWidth, H / cropHeight)
      const fitMode = frameMode ? frameOptions.fit : settings.fit
      const base = fitMode === 'Cover' ? cover : fitMode === 'Original size' ? exportScale : contain
      const dw = cropWidth * base * scale, dh = cropHeight * base * scale
      ctx.globalAlpha = opacity * alpha
      if (fitMode === 'Stretch') ctx.drawImage(frameImage, sx, sy, cropWidth, cropHeight, -W * scale / 2, -H * scale / 2, W * scale, H * scale)
      else ctx.drawImage(frameImage, sx, sy, cropWidth, cropHeight, -dw / 2, -dh / 2, dw, dh)
    })
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
      const width = overlay.width / 100 * W, height = width * overlay.image.naturalHeight / overlay.image.naturalWidth
      ctx.save(); ctx.globalAlpha = overlay.opacity / 100; ctx.translate(overlay.x / 100 * W, overlay.y / 100 * H); ctx.rotate(overlay.rotation * Math.PI / 180); ctx.scale((overlay.flipX ? -1 : 1) * (overlay.scaleX || 100) / 100, (overlay.flipY ? -1 : 1) * (overlay.scaleY || 100) / 100)
      let overlayImage = overlay.image
      if (overlay.effects && Object.keys(EFFECT_DEFAULTS).some((key) => overlay.effects[key] !== EFFECT_DEFAULTS[key])) {
        const processed = document.createElement('canvas'); processed.width = overlay.image.naturalWidth; processed.height = overlay.image.naturalHeight
        const processedContext = processed.getContext('2d'), light = (100 + overlay.effects.brightness) * overlay.effects.lightness / 100, filter = presetFilter(overlay.effects.preset)
        processedContext.filter = `brightness(${light}%) contrast(${100 + overlay.effects.contrast}%) saturate(${overlay.effects.saturation}%) hue-rotate(${overlay.effects.hue}deg) blur(${overlay.effects.blur}px) ${filter === 'none' ? '' : filter}`
        processedContext.drawImage(overlay.image, 0, 0); processedContext.filter = 'none'; applyPixelEffects(processed, overlay.effects); overlayImage = processed
      }
      const sourceWidth = overlayImage.width || overlay.image.naturalWidth, sourceHeight = overlayImage.height || overlay.image.naturalHeight
      const sx = (overlay.cropLeft || 0) / 100 * sourceWidth, sy = (overlay.cropTop || 0) / 100 * sourceHeight
      const sw = Math.max(1, sourceWidth * (1 - ((overlay.cropLeft || 0) + (overlay.cropRight || 0)) / 100)), sh = Math.max(1, sourceHeight * (1 - ((overlay.cropTop || 0) + (overlay.cropBottom || 0)) / 100))
      ctx.drawImage(overlayImage, sx, sy, sw, sh, -width / 2, -height / 2, width, height); ctx.restore()
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
        let tx = 0, ty = 0, rotation = 0, elementScale = 1
        if (el.motion === 'Float') ty = -Math.sin(phase) * amplitudeY
        if (el.motion === 'Drift') tx = Math.sin(phase) * amplitudeX
        if (el.motion === 'Bounce') ty = -Math.abs(Math.sin(phase)) * amplitudeY
        if (el.motion === 'Pulse') elementScale = 1 + Math.sin(phase) * el.amplitude / 100
        if (el.motion === 'Spin') rotation = phase
        if (el.motion === 'Wobble') rotation = Math.sin(phase) * el.amplitude * Math.PI / 180
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
        ctx.save(); ctx.globalAlpha = el.opacity / 100; ctx.translate(x + w / 2 + tx, y + h / 2 + ty); ctx.rotate(rotation + el.rotation * Math.PI / 180); ctx.scale(elementScale * el.scaleX / 100 * (el.flipX ? -1 : 1), elementScale * el.scaleY / 100 * (el.flipY ? -1 : 1))
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
        const sourceX = el.cropLeft / 100 * elementBitmap.width, sourceY = el.cropTop / 100 * elementBitmap.height
        const sourceWidth = Math.max(1, elementBitmap.width * (1 - (el.cropLeft + el.cropRight) / 100)), sourceHeight = Math.max(1, elementBitmap.height * (1 - (el.cropTop + el.cropBottom) / 100))
        ctx.drawImage(elementBitmap, sourceX, sourceY, sourceWidth, sourceHeight, -w / 2, -h / 2, w, h); ctx.restore()
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
  }, [image, settings, elements, textLayers, parallax, frameMode, frameSequence, frameOptions, imageEdits, censor, overlays, gifEffects])

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
    if (!file || !file.type.startsWith('image/')) { setToast('Please choose an image file'); return }
    const url = URL.createObjectURL(file)
    const probe = new Image()
    probe.onload = () => {
      const cap = Math.min(1, 1200 / Math.max(probe.naturalWidth, probe.naturalHeight))
      setElements([]); setSelectedElement(null); setTextLayers([]); setSelectedText(null); setFrameSequence([]); setFrameMode(false); setOverlays([]); setSelectedOverlay(null); setGifEffects({ ...EFFECT_DEFAULTS }); setImageEdits({ rotation: 0, flipX: false, flipY: false, cropLeft: 0, cropTop: 0, cropRight: 0, cropBottom: 0, brightness: 100, contrast: 100, saturation: 100, blur: 0, hue: 0, grayscale: 0, sepia: 0 }); setCensor((current) => ({ ...current, enabled: false })); setParallax((current) => ({ ...current, enabled: false }))
      setSource({ name: file.name, width: probe.naturalWidth, height: probe.naturalHeight, url })
      setSettings((s) => ({ ...s, width: Math.round(probe.naturalWidth * cap), height: Math.round(probe.naturalHeight * cap) }))
      setToast('Image added to your project')
    }
    probe.src = url
  }

  const applyPreset = (name) => setSettings((s) => ({ ...s, preset: name, ...PRESETS[name] }))
  const reset = () => { setSettings(INITIAL); setElements([]); setSelectedElement(null); setTextLayers([]); setSelectedText(null); setFrameSequence([]); setFrameMode(false); setMaskEditing(false); setOverlays([]); setSelectedOverlay(null); setGifEffects({ ...EFFECT_DEFAULTS }); setImageEdits({ rotation: 0, flipX: false, flipY: false, cropLeft: 0, cropTop: 0, cropRight: 0, cropBottom: 0, brightness: 100, contrast: 100, saturation: 100, blur: 0, hue: 0, grayscale: 0, sepia: 0 }); setCensor({ enabled: false, x: 25, y: 25, w: 30, h: 20, pixelSize: 14 }); setParallax({ enabled: false, direction: 'Horizontal', strength: 6, speed: 1 }); setProgress(0); setPlaying(false); setToast('Settings reset') }

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
    if (censorSelecting && selectionStart.current) { const point = pointerPosition(event), start = selectionStart.current; const rect = { x: Math.min(start.x, point.x), y: Math.min(start.y, point.y), w: Math.abs(point.x - start.x), h: Math.abs(point.y - start.y) }; setCensor((current) => ({ ...current, enabled: true, x: rect.x * 100, y: rect.y * 100, w: rect.w * 100, h: rect.h * 100 })); selectionStart.current = null; setSelection(null); setCensorSelecting(false); setToast('Censor region added'); return }
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
    const element = { id, name: `Element ${elements.length + 1}`, ...rect, bitmap, sourceBitmap, maskCanvas, cleanup, effects: { ...EFFECT_DEFAULTS }, rotation: 0, scaleX: 100, scaleY: 100, flipX: false, flipY: false, opacity: 100, cropLeft: 0, cropRight: 0, cropTop: 0, cropBottom: 0, motion: 'Float', amplitude: 5, speed: 1, depth: Math.min(100, 30 + elements.length * 20), visible: true }
    setElements((current) => [...current, element]); setSelectedElement(id); setActiveTab('elements')
    setSettings((current) => ({ ...current, preset: 'Still', ...PRESETS.Still }))
    setToast('Element extracted — choose its motion')
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
      if (!response.ok) { const detail = await response.json().catch(() => ({})); throw new Error(detail.detail || 'Smart selection failed') }
      const result = await response.json()
      const cutout = new Image()
      await new Promise((resolve, reject) => { cutout.onload = resolve; cutout.onerror = reject; cutout.src = result.cutout })
      const bitmap = document.createElement('canvas'); bitmap.width = cutout.naturalWidth; bitmap.height = cutout.naturalHeight
      bitmap.getContext('2d').drawImage(cutout, 0, 0)
      const sourceBitmap = document.createElement('canvas'); sourceBitmap.width = bitmap.width; sourceBitmap.height = bitmap.height; sourceBitmap.getContext('2d').drawImage(bitmap, 0, 0)
      const maskCanvas = document.createElement('canvas'); maskCanvas.width = bitmap.width; maskCanvas.height = bitmap.height; const maskCtx = maskCanvas.getContext('2d'); maskCtx.fillStyle = '#fff'; maskCtx.fillRect(0, 0, bitmap.width, bitmap.height)
      const id = Date.now()
      const smartRect = { x: result.rect.x / sourceCanvas.width, y: result.rect.y / sourceCanvas.height, w: result.rect.width / sourceCanvas.width, h: result.rect.height / sourceCanvas.height }
      const element = { id, name: `Element ${elements.length + 1}`, ...smartRect, bitmap, sourceBitmap, maskCanvas, cleanup: null, effects: { ...EFFECT_DEFAULTS }, rotation: 0, scaleX: 100, scaleY: 100, flipX: false, flipY: false, opacity: 100, cropLeft: 0, cropRight: 0, cropTop: 0, cropBottom: 0, motion: 'Float', amplitude: 5, speed: 1, depth: Math.min(100, 30 + elements.length * 20), visible: true, smart: true }
      setElements((current) => [...current, element]); setSelectedElement(id); setActiveTab('elements')
      setSettings((current) => ({ ...current, preset: 'Still', fit: 'Contain', ...PRESETS.Still }))
      setSource((current) => ({ ...current, width: sourceCanvas.width, height: sourceCanvas.height, url: result.background }))
      setToast(`${result.engine.startsWith('rembg') ? 'AI' : 'GrabCut'} object ready · background content-filled`)
    } catch (error) {
      console.warn(error); extractElementLocal(rect)
      setToast(`${error.message}. Used edge selection instead.`)
    } finally { setSegmenting(false) }
  }

  const updateElement = (key, value) => setElements((current) => current.map((el) => el.id === selectedElement ? { ...el, [key]: value } : el))
  const removeElement = (id) => { setElements((current) => current.filter((el) => el.id !== id)); setSelectedElement(null); setToast('Element removed') }
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
    setTextLayers((current) => [...current, layer]); setSelectedText(id); setActiveTab('text'); setPlaying(false)
    setToast('Text layer added')
  }
  const updateText = (key, value) => setTextLayers((current) => current.map((layer) => layer.id === selectedText ? { ...layer, [key]: value } : layer))
  const removeText = (id) => { setTextLayers((current) => current.filter((layer) => layer.id !== id)); setSelectedText(null); setToast('Text layer removed') }
  const moveText = (id, direction) => setTextLayers((current) => {
    const index = current.findIndex((layer) => layer.id === id), next = index + direction
    if (index < 0 || next < 0 || next >= current.length) return current
    const copy = [...current]; [copy[index], copy[next]] = [copy[next], copy[index]]; return copy
  })
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
  const loadFrameFiles = async (files) => {
    const selected = [...files]; if (!selected.length) return
    setToast(`Loading ${selected.length} frame source${selected.length > 1 ? 's' : ''}…`)
    const additions = []
    for (const file of selected) {
      let extracted = null
      if (apiAvailable) {
        try {
          const form = new FormData(); form.append('image', file, file.name)
          const response = await fetch('/api/extract-frames', { method: 'POST', body: form })
          if (response.ok) extracted = (await response.json()).frames
        } catch { /* Browser fallback below. */ }
      }
      if (extracted) {
        for (const frame of extracted) additions.push({ id: `${Date.now()}-${additions.length}`, name: `${file.name} · ${frame.index + 1}`, image: await imageFromUrl(frame.image), url: frame.image, delay: frame.delay })
      } else {
        const url = URL.createObjectURL(file)
        additions.push({ id: `${Date.now()}-${additions.length}`, name: file.name, image: await imageFromUrl(url), url, delay: 10 })
      }
    }
    setFrameSequence((current) => [...current, ...additions]); setFrameMode(true); setActiveTab('frames'); setPlaying(false)
    const first = additions[0]?.image
    if (first) { const cap = Math.min(1, 1920 / Math.max(first.naturalWidth, first.naturalHeight)); setSettings((current) => ({ ...current, width: Math.round(first.naturalWidth * cap), height: Math.round(first.naturalHeight * cap), duration: Math.max(.1, additions.reduce((sum, frame) => sum + frame.delay, 0) / 100) })) }
    setToast(`${additions.length} frame${additions.length > 1 ? 's' : ''} added`)
  }
  const updateFrame = (id, values) => setFrameSequence((current) => current.map((frame) => frame.id === id ? { ...frame, ...values } : frame))
  const moveFrame = (id, direction) => setFrameSequence((current) => {
    const index = current.findIndex((frame) => frame.id === id), next = index + direction
    if (index < 0 || next < 0 || next >= current.length) return current
    const copy = [...current]; [copy[index], copy[next]] = [copy[next], copy[index]]; return copy
  })
  const duplicateFrame = (frame) => setFrameSequence((current) => [...current.slice(0, current.indexOf(frame) + 1), { ...frame, id: `${Date.now()}-copy`, name: `${frame.name} copy` }, ...current.slice(current.indexOf(frame) + 1)])
  const removeFrame = (id) => setFrameSequence((current) => current.filter((frame) => frame.id !== id))
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
  const reorderFrame = (draggedId, targetId) => setFrameSequence((current) => {
    const from = current.findIndex((frame) => frame.id === draggedId), to = current.findIndex((frame) => frame.id === targetId)
    if (from < 0 || to < 0 || from === to) return current
    const copy = [...current], [moved] = copy.splice(from, 1); copy.splice(to, 0, moved); return copy
  })
  const addOverlay = async (file) => {
    if (!file) return
    const url = URL.createObjectURL(file), overlayImage = await imageFromUrl(url), id = Date.now()
    setOverlays((current) => [...current, { id, name: file.name, image: overlayImage, url, x: 50, y: 50, width: 30, scaleX: 100, scaleY: 100, rotation: 0, opacity: 100, flipX: false, flipY: false, cropLeft: 0, cropRight: 0, cropTop: 0, cropBottom: 0, effects: { ...EFFECT_DEFAULTS }, visible: true }]); setSelectedOverlay(id); setEffectTarget('Selected overlay'); setActiveTab('edit'); setToast('Image overlay added')
  }
  const updateOverlay = (key, value) => setOverlays((current) => current.map((overlay) => overlay.id === selectedOverlay ? { ...overlay, [key]: value } : overlay))
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
      if (!response.ok) { const detail = await response.json().catch(() => ({})); throw new Error(detail.detail || 'Compression failed') }
      const blob = await response.blob(), originalBytes = Number(response.headers.get('X-GIF-Original-Bytes')) || file.size
      const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `${file.name.replace(/\.gif$/i, '')}-compressed.gif`; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000)
      setLastExport({ bytes: blob.size, originalBytes, optimized: true, encoder: 'gifsicle compressor' }); setToast(`Compressed ${Math.max(0, Math.round((1 - blob.size / originalBytes) * 100))}% · ${fmtBytes(blob.size)}`)
    } catch (error) { setToast(error.message) } finally { setExporting(false) }
  }
  const beginTextDrag = (event, layer) => {
    event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId)
    textDrag.current = { id: layer.id, clientX: event.clientX, clientY: event.clientY, x: layer.x, y: layer.y }
    setSelectedText(layer.id); setActiveTab('text'); setPlaying(false)
  }
  const dragTextLayer = (event) => {
    if (!textDrag.current || !stageRef.current) return
    event.stopPropagation()
    const bounds = stageRef.current.getBoundingClientRect(), drag = textDrag.current
    const x = drag.x + (event.clientX - drag.clientX) / bounds.width * 100
    const y = drag.y + (event.clientY - drag.clientY) / bounds.height * 100
    setTextLayers((current) => current.map((layer) => layer.id === drag.id ? { ...layer, x, y } : layer))
  }
  const endTextDrag = (event) => { event.stopPropagation(); textDrag.current = null }

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
          if (!response.ok) { const detail = await response.json().catch(() => ({})); throw new Error(detail.detail || 'Python export failed') }
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

  const stageStyle = { width: `${Math.min(100, zoom)}%`, maxWidth: 1000, aspectRatio: `${settings.width}/${settings.height}` }
  const textBounds = (layer) => {
    const lines = layer.text.split('\n'), longest = Math.max(1, ...lines.map((line) => line.length))
    const width = Math.min(95, Math.max(8, longest * layer.size * .62 * layer.scaleX / 100 / settings.width * 100))
    const height = Math.min(95, Math.max(5, lines.length * layer.size * layer.lineHeight * layer.scaleY / 100 / settings.height * 100))
    const left = layer.align === 'center' ? layer.x - width / 2 : layer.align === 'right' ? layer.x - width : layer.x
    return { left, top: layer.y - height / 2, width, height }
  }

  return <div className="flex h-screen max-h-screen flex-col overflow-hidden bg-ink text-zinc-100">
    <header className="relative z-40 flex h-[68px] shrink-0 items-center justify-between border-b border-white/[.07] bg-ink/95 px-4 backdrop-blur md:px-6">
      <div className="flex items-center gap-3">
        <button onClick={() => setMobilePanel(!mobilePanel)} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-white/5 lg:hidden"><Menu className="h-5 w-5" /></button>
        <div className="grid h-8 w-8 place-items-center rounded-[10px] bg-acid text-black"><Zap className="h-[18px] w-[18px] fill-current" /></div>
        <div className="display text-[17px] font-extrabold tracking-tight">GIF STUDIO</div>
        <span className="hidden rounded-full border border-white/10 px-2 py-0.5 text-[9px] font-bold tracking-widest text-zinc-500 sm:block">LOCAL</span>
      </div>
      <div className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-1 md:flex">
        <IconButton label="Undo"><Undo2 className="h-4 w-4" /></IconButton><IconButton label="Redo" disabled><Redo2 className="h-4 w-4" /></IconButton>
        <span className="mx-2 h-5 w-px bg-white/[.08]" />
        <div className="max-w-48 truncate text-xs font-medium text-zinc-400">{source.name.replace(/\.[^.]+$/, '')}</div><span className="h-1.5 w-1.5 rounded-full bg-zinc-700" />
      </div>
      <div className="flex items-center gap-2">
        <button onClick={reset} className="hidden h-9 items-center gap-2 rounded-xl px-3 text-xs font-semibold text-zinc-400 hover:bg-white/5 hover:text-white sm:flex"><RotateCcw className="h-4 w-4" /> Reset</button>
        <button onClick={exportGif} disabled={exporting} className="focus-ring flex h-10 items-center gap-2 rounded-xl bg-acid px-4 text-xs font-bold text-black transition hover:bg-[#e2ff6a] disabled:opacity-70">
          {exporting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}{exporting ? 'Exporting' : 'Export GIF'}
        </button>
      </div>
    </header>

    <nav className="relative z-30 flex h-[54px] shrink-0 items-center justify-center border-b border-white/[.07] bg-panel/95 px-3 backdrop-blur-xl" aria-label="Studio workspaces">
      <div className="flex w-full max-w-3xl items-center gap-1 rounded-2xl border border-white/[.06] bg-black/20 p-1">
        {[['motion', Sparkles], ['elements', Layers3], ['text', Type], ['frames', Film], ['edit', SlidersHorizontal], ['output', Settings2]].map(([id, Icon]) => <button key={id} onClick={() => { setActiveTab(id); setMobilePanel(true) }} className={`flex h-9 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl px-1 text-[8px] font-bold uppercase tracking-normal transition sm:px-2 sm:text-[10px] sm:tracking-[.08em] ${activeTab === id ? 'bg-acid text-black shadow-[0_4px_18px_rgba(216,255,62,.12)]' : 'text-zinc-500 hover:bg-white/[.05] hover:text-white'}`}><Icon className="hidden h-3.5 w-3.5 shrink-0 sm:block" /><span>{id}</span></button>)}
      </div>
    </nav>

    <main className="relative flex min-h-0 flex-1 overflow-hidden">
      <aside className={`scrollbar absolute inset-y-0 left-0 z-20 h-full w-[286px] overflow-y-auto overscroll-contain border-r border-white/[.07] bg-panel px-4 transition-transform lg:relative lg:inset-auto lg:shrink-0 lg:translate-x-0 ${mobilePanel ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex h-14 items-center justify-between border-b border-white/[.07]">
          <span className="display text-xs font-bold uppercase tracking-[.14em] text-zinc-400">Project</span><button onClick={() => setMobilePanel(false)} className="lg:hidden"><X className="h-4 w-4" /></button>
        </div>
        <div className="py-4">
          <button onClick={() => fileRef.current?.click()} onDragOver={(e) => { e.preventDefault(); setDropActive(true) }} onDragLeave={() => setDropActive(false)} onDrop={(e) => { e.preventDefault(); setDropActive(false); loadFile(e.dataTransfer.files[0]) }} className={`focus-ring group w-full rounded-2xl border border-dashed p-3 text-left transition ${dropActive ? 'border-acid bg-acid/5' : 'border-white/[.13] hover:border-white/30'}`}>
            <div className="relative mb-3 aspect-[1.55] overflow-hidden rounded-xl bg-[#101012] checker"><img src={source.url} alt="Source" className="h-full w-full object-contain" /><div className="absolute inset-0 grid place-items-center bg-black/55 opacity-0 transition group-hover:opacity-100"><span className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-bold text-black"><FolderOpen className="h-4 w-4" /> Replace</span></div></div>
            <div className="flex items-start gap-2"><FileImage className="mt-0.5 h-4 w-4 shrink-0 text-acid" /><div className="min-w-0"><p className="truncate text-xs font-semibold text-zinc-200">{source.name}</p><p className="mt-1 text-[10px] text-zinc-600">{source.width} × {source.height} px</p></div></div>
          </button>
          <input ref={fileRef} className="hidden" type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(e) => loadFile(e.target.files[0])} />
        </div>

        {activeTab === 'motion' && <>
          <Section title="Motion preset">
            <SelectField value={settings.preset} onChange={applyPreset}>{Object.keys(PRESETS).map((p) => <option key={p}>{p}</option>)}</SelectField>
            <div className="mt-3 rounded-xl border border-acid/10 bg-acid/[.04] p-3 text-[11px] leading-relaxed text-zinc-500"><Sparkles className="mr-1.5 inline h-3.5 w-3.5 text-acid" />Presets stay fully editable. Tune every value below.</div>
          </Section>
          <Section title="Timing">
            <div className="grid grid-cols-2 gap-3"><Field label="Duration" value={settings.duration} onChange={(v) => update('duration', v)} min={.1} max={20} step={.1} suffix="s" /><Field label="Frame rate" value={settings.fps} onChange={(v) => update('fps', v)} min={1} max={60} suffix="fps" /></div>
            <div className="mt-3"><SelectField label="Easing" value={settings.easing} onChange={(v) => update('easing', v)}>{['Linear','Ease in','Ease out','Ease in-out','Smoothstep'].map(x => <option key={x}>{x}</option>)}</SelectField></div>
            <div className="mt-4"><Switch label="Ping-pong loop" checked={settings.pingPong} onChange={(v) => update('pingPong', v)} /></div>
          </Section>
          <Section title="Transform">
            <div className="mb-2 grid grid-cols-[1fr_68px_68px] gap-2 text-[9px] font-bold uppercase tracking-widest text-zinc-600"><span>Property</span><span>Start</span><span>End</span></div>
            {[['Scale','scaleStart','scaleEnd','%'],['Rotate','rotateStart','rotateEnd','°'],['X position','xStart','xEnd','%'],['Y position','yStart','yEnd','%'],['Opacity','opacityStart','opacityEnd','%']].map(([label,a,b,suffix]) => <div key={label} className="grid grid-cols-[1fr_68px_68px] items-center gap-2 border-t border-white/[.05] py-2"><span className="text-xs text-zinc-400">{label}</span>{[a,b].map(key => <div key={key} className="flex h-8 items-center rounded-lg bg-black/20 px-2"><input type="number" value={settings[key]} onChange={(e) => update(key, Number(e.target.value))} className="w-full bg-transparent text-xs font-semibold outline-none" /><span className="text-[10px] text-zinc-600">{suffix}</span></div>)}</div>)}
          </Section>
        </>}

        {activeTab === 'text' && <>
          <Section title="Text layers">
            <button onClick={addTextLayer} className="focus-ring flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-acid text-xs font-bold text-black transition hover:bg-[#e2ff6a]"><Plus className="h-4 w-4" />Add text</button>
            <div className="mt-3 space-y-2">{textLayers.map((layer) => <button key={layer.id} onClick={() => { setSelectedText(layer.id); setPlaying(false) }} className={`flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition ${selectedText === layer.id ? 'border-acid/40 bg-acid/[.06]' : 'border-white/[.07] bg-black/10 hover:border-white/20'}`}><Type className="h-4 w-4 text-zinc-500" /><span className="min-w-0 flex-1"><b className="block truncate text-xs text-zinc-200">{layer.text || 'Empty text'}</b><small className="text-[10px] text-zinc-600">{layer.font} · {layer.size}px</small></span><span className={`h-2 w-2 rounded-full ${layer.visible ? 'bg-acid' : 'bg-zinc-700'}`} /></button>)}</div>
            {!textLayers.length && <p className="mt-3 text-center text-[10px] text-zinc-600">Add headlines, captions, labels, or animated titles.</p>}
          </Section>

          {selectedText && (() => { const layer = textLayers.find((item) => item.id === selectedText); return layer ? <>
            <Section title="Content & font">
              <textarea value={layer.text} onChange={(e) => updateText('text', e.target.value)} className="h-20 w-full resize-none rounded-xl border border-white/[.08] bg-black/20 p-3 text-sm text-white outline-none focus:border-acid/50" placeholder="Type your text…" />
              <div className="mt-3"><SelectField label="Font family" value={layer.font} onChange={(v) => updateText('font', v)}>{fontOptions.map((font) => <option key={font} value={font}>{font}</option>)}</SelectField></div>
              <button onClick={() => fontFileRef.current?.click()} className="mt-2 flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-white/10 text-[11px] font-semibold text-zinc-400 hover:border-white/20 hover:text-white"><Upload className="h-3.5 w-3.5" />Upload local font</button>
              <input ref={fontFileRef} type="file" accept=".ttf,.otf,.woff,.woff2" className="hidden" onChange={(e) => uploadFont(e.target.files[0])} />
              <div className="mt-3 grid grid-cols-2 gap-3"><Field label="Size" value={layer.size} onChange={(v) => updateText('size', v)} min={4} max={1000} suffix="px" /><SelectField label="Weight" value={layer.weight} onChange={(v) => updateText('weight', Number(v))}>{[100,200,300,400,500,600,700,800,900].map((x) => <option key={x} value={x}>{x}</option>)}</SelectField></div>
              <div className="mt-4"><Switch label="Italic" checked={layer.italic} onChange={(v) => updateText('italic', v)} /></div>
              <div className="mt-3 grid grid-cols-2 gap-3"><SelectField label="Case" value={layer.casing} onChange={(v) => updateText('casing', v)}>{['As typed','UPPERCASE','lowercase'].map((x) => <option key={x}>{x}</option>)}</SelectField><SelectField label="Decoration" value={layer.decoration} onChange={(v) => updateText('decoration', v)}>{['None','Underline','Strikethrough'].map((x) => <option key={x}>{x}</option>)}</SelectField></div>
              <div className="mt-4 grid grid-cols-3 gap-2">{[['left',AlignLeft],['center',AlignCenter],['right',AlignRight]].map(([align, Icon]) => <button key={align} onClick={() => updateText('align', align)} className={`grid h-9 place-items-center rounded-lg border ${layer.align === align ? 'border-acid/50 bg-acid/10 text-acid' : 'border-white/[.07] text-zinc-500'}`}><Icon className="h-4 w-4" /></button>)}</div>
              <div className="mt-3 grid grid-cols-2 gap-3"><Field label="Tracking" value={layer.letterSpacing} onChange={(v) => updateText('letterSpacing', v)} min={-20} max={100} suffix="px" /><Field label="Line height" value={layer.lineHeight} onChange={(v) => updateText('lineHeight', v)} min={.5} max={4} step={.1} suffix="×" /></div>
            </Section>

            <Section title="Fill & outline">
              <label className="flex items-center justify-between text-xs text-zinc-500"><span>Text color</span><span className="flex items-center gap-2"><input type="color" value={layer.color} onChange={(e) => updateText('color', e.target.value)} className="h-8 w-10 bg-transparent" /><span className="font-mono text-[10px]">{layer.color}</span></span></label>
              <label className="mt-3 flex items-center justify-between text-xs text-zinc-500"><span>Outline color</span><span className="flex items-center gap-2"><input type="color" value={layer.strokeColor} onChange={(e) => updateText('strokeColor', e.target.value)} className="h-8 w-10 bg-transparent" /><span className="font-mono text-[10px]">{layer.strokeColor}</span></span></label>
              <div className="mt-3 grid grid-cols-2 gap-3"><Field label="Outline" value={layer.strokeWidth} onChange={(v) => updateText('strokeWidth', v)} min={0} max={30} suffix="px" /><Field label="Opacity" value={layer.opacity} onChange={(v) => updateText('opacity', v)} min={0} max={100} suffix="%" /></div>
              <div className="mt-3"><SelectField label="Blend mode" value={layer.blendMode} onChange={(v) => updateText('blendMode', v)}>{[['source-over','Normal'],['multiply','Multiply'],['screen','Screen'],['overlay','Overlay'],['darken','Darken'],['lighten','Lighten'],['difference','Difference']].map(([value,label]) => <option key={value} value={value}>{label}</option>)}</SelectField></div>
            </Section>

            <Section title="Transform">
              <div className="grid grid-cols-2 gap-3"><Field label="X position" value={layer.x} onChange={(v) => updateText('x', v)} min={-100} max={200} suffix="%" /><Field label="Y position" value={layer.y} onChange={(v) => updateText('y', v)} min={-100} max={200} suffix="%" /></div>
              <div className="mt-3 grid grid-cols-2 gap-3"><Field label="Width scale" value={layer.scaleX} onChange={(v) => updateText('scaleX', v)} min={1} max={500} suffix="%" /><Field label="Height scale" value={layer.scaleY} onChange={(v) => updateText('scaleY', v)} min={1} max={500} suffix="%" /></div>
              <div className="mt-3"><Field label="Rotation" value={layer.rotation} onChange={(v) => updateText('rotation', v)} min={-360} max={360} suffix="°" /></div>
              <div className="mt-4 grid grid-cols-2 gap-3"><Switch label="Flip X" checked={layer.flipX} onChange={(v) => updateText('flipX', v)} /><Switch label="Flip Y" checked={layer.flipY} onChange={(v) => updateText('flipY', v)} /></div>
            </Section>

            <Section title="Shadow">
              <label className="flex items-center justify-between text-xs text-zinc-500"><span>Shadow color</span><input type="color" value={layer.shadowColor} onChange={(e) => updateText('shadowColor', e.target.value)} className="h-8 w-10 bg-transparent" /></label>
              <div className="mt-3 grid grid-cols-2 gap-3"><Field label="Blur" value={layer.shadowBlur} onChange={(v) => updateText('shadowBlur', v)} min={0} max={100} suffix="px" /><Field label="X offset" value={layer.shadowX} onChange={(v) => updateText('shadowX', v)} min={-100} max={100} suffix="px" /><Field label="Y offset" value={layer.shadowY} onChange={(v) => updateText('shadowY', v)} min={-100} max={100} suffix="px" /></div>
            </Section>

            <Section title="Text animation">
              <SelectField label="Entrance" value={layer.entrance} onChange={(v) => updateText('entrance', v)}>{['None','Fade in','Slide in left','Slide in right','Slide in up','Slide in down','Zoom in','Spin in'].map((x) => <option key={x}>{x}</option>)}</SelectField>
              <div className="mt-3"><Field label="Entrance duration" value={layer.entranceDuration} onChange={(v) => updateText('entranceDuration', v)} min={1} max={80} suffix="%" /></div>
              <div className="mt-4"><SelectField label="Loop animation" value={layer.motion} onChange={(v) => updateText('motion', v)}>{['None','Float','Drift','Bounce','Pulse','Spin','Wobble','Fade','Typewriter'].map((x) => <option key={x}>{x}</option>)}</SelectField></div>
              <div className="mt-3 grid grid-cols-2 gap-3"><Field label="Amount" value={layer.amplitude} onChange={(v) => updateText('amplitude', v)} min={0} max={100} suffix="%" /><Field label="Speed" value={layer.speed} onChange={(v) => updateText('speed', v)} min={.1} max={10} step={.1} suffix="×" /></div>
              <div className="mt-4"><SelectField label="Exit" value={layer.exit} onChange={(v) => updateText('exit', v)}>{['None','Fade out','Slide out left','Slide out right','Slide out up','Slide out down','Zoom out','Spin out'].map((x) => <option key={x}>{x}</option>)}</SelectField></div>
              <div className="mt-3"><Field label="Exit duration" value={layer.exitDuration} onChange={(v) => updateText('exitDuration', v)} min={1} max={80} suffix="%" /></div>
              <div className="mt-3 rounded-xl border border-white/[.06] bg-black/10 p-3 text-[10px] text-zinc-600">Entrance → loop → exit animations are combined on the same text layer.</div>
            </Section>

            <Section title="Arrange">
              <div className="grid grid-cols-2 gap-2"><button onClick={() => moveText(layer.id, 1)} className="flex h-9 items-center justify-center gap-2 rounded-xl border border-white/10 text-[11px] font-semibold text-zinc-400"><ArrowUp className="h-3.5 w-3.5" />Bring forward</button><button onClick={() => moveText(layer.id, -1)} className="flex h-9 items-center justify-center gap-2 rounded-xl border border-white/10 text-[11px] font-semibold text-zinc-400"><ArrowDown className="h-3.5 w-3.5" />Send backward</button></div>
              <div className="mt-3"><Switch label="Show text layer" checked={layer.visible} onChange={(v) => updateText('visible', v)} /></div>
              <button onClick={() => removeText(layer.id)} className="mt-4 flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-red-500/15 text-xs font-semibold text-red-400 hover:bg-red-500/10"><Trash2 className="h-3.5 w-3.5" />Delete text layer</button>
            </Section>
          </> : null })()}
        </>}

        {activeTab === 'frames' && <>
          <Section title="GIF frame maker">
            <button onClick={() => frameFileRef.current?.click()} className="focus-ring flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-acid text-xs font-bold text-black"><Plus className="h-4 w-4" />Add images or animations</button>
            <input ref={frameFileRef} type="file" multiple accept="image/*,.heic,.heif,.avif,.tiff" className="hidden" onChange={(e) => loadFrameFiles(e.target.files)} />
            <p className="mt-3 text-[10px] leading-relaxed text-zinc-600">Mix static images and animated GIF, WebP, or APNG files. The Python API splits animated inputs and preserves their delays.</p>
            <div className="mt-4"><Switch label="Use frame sequence" checked={frameMode} onChange={(v) => { setFrameMode(v); setPlaying(false) }} /></div>
          </Section>
          <Section title="Sequence options">
            <SelectField label="Mixed-size fitting" value={frameOptions.fit} onChange={(v) => setFrameOptions((current) => ({ ...current, fit: v }))}>{['Contain','Cover','Stretch','Original size'].map((x) => <option key={x}>{x}</option>)}</SelectField>
            <div className="mt-4"><Switch label="Crossfade frames" checked={frameOptions.crossfade} onChange={(v) => setFrameOptions((current) => ({ ...current, crossfade: v }))} /></div>
            <div className={`mt-3 ${frameOptions.crossfade ? '' : 'pointer-events-none opacity-40'}`}><Field label="Crossfade steps" value={frameOptions.crossfadeFrames} onChange={(v) => setFrameOptions((current) => ({ ...current, crossfadeFrames: v }))} min={1} max={9} /></div>
            <div className="mt-3 rounded-xl border border-white/[.06] bg-black/10 p-3 text-[10px] text-zinc-600">Canvas is limited to 1920 × 1920px for frame sequences. Delay uses GIF centiseconds: 10 = 0.10 seconds.</div>
          </Section>
          <Section title={`Frames · ${frameSequence.length}`}>
            {!frameSequence.length && <div className="rounded-xl border border-dashed border-white/10 py-7 text-center"><Film className="mx-auto h-5 w-5 text-zinc-700" /><p className="mt-2 text-[10px] text-zinc-600">No sequence frames yet</p></div>}
            <div className="space-y-2">{frameSequence.map((frame, index) => <div key={frame.id} draggable onDragStart={(e) => e.dataTransfer.setData('text/frame-id', frame.id)} onDragOver={(e) => { e.preventDefault(); const id = e.dataTransfer.getData('text/frame-id'); if (id) reorderFrame(id, frame.id) }} className="rounded-xl border border-white/[.07] bg-black/10 p-2.5">
              <div className="flex items-center gap-2"><span className="w-5 text-center text-[9px] font-bold text-zinc-600">{index + 1}</span><span className="grid h-10 w-12 shrink-0 place-items-center overflow-hidden rounded-lg checker"><img src={frame.url} alt="" className="max-h-full max-w-full" /></span><span className="min-w-0 flex-1 truncate text-[10px] font-semibold text-zinc-300">{frame.name}</span></div>
              <div className="mt-2 flex items-center gap-2"><span className="text-[9px] uppercase tracking-wider text-zinc-600">Delay</span><input type="number" min="2" max="6000" value={frame.delay} onChange={(e) => updateFrame(frame.id, { delay: clamp(e.target.value, 2, 6000) })} className="h-7 w-16 rounded-lg bg-black/30 px-2 text-[10px] outline-none" /><span className="text-[9px] text-zinc-600">× 1/100s</span><span className="flex-1" /><IconButton label="Move earlier" onClick={() => moveFrame(frame.id, -1)}><ArrowUp className="h-3.5 w-3.5" /></IconButton><IconButton label="Move later" onClick={() => moveFrame(frame.id, 1)}><ArrowDown className="h-3.5 w-3.5" /></IconButton><IconButton label="Duplicate" onClick={() => duplicateFrame(frame)}><Copy className="h-3.5 w-3.5" /></IconButton><IconButton label="Delete" onClick={() => removeFrame(frame.id)}><Trash2 className="h-3.5 w-3.5" /></IconButton></div>
            </div>)}</div>
          </Section>
        </>}

        {activeTab === 'edit' && <>
          <Section title="Edit target">
            <SelectField label="Apply edit controls to" value={effectTarget} onChange={setEffectTarget}><option>Entire GIF</option><option disabled={!selectedElement}>Selected element</option><option disabled={!selectedOverlay}>Selected overlay</option></SelectField>
            {effectTarget === 'Selected element' && selectedElement && <p className="mt-3 rounded-lg bg-acid/[.06] px-3 py-2 text-[10px] text-acid">Editing {elements.find((item) => item.id === selectedElement)?.name}</p>}
            {effectTarget === 'Selected overlay' && selectedOverlay && <p className="mt-3 rounded-lg bg-acid/[.06] px-3 py-2 text-[10px] text-acid">Editing {overlays.find((item) => item.id === selectedOverlay)?.name}</p>}
          </Section>
          {effectTarget === 'Selected element' && selectedElement && (() => { const el = elements.find((item) => item.id === selectedElement); return el ? <Section title="Selected layer geometry">
            <div className="grid grid-cols-2 gap-3"><Field label="X" value={Math.round(el.x * 1000) / 10} onChange={(v) => updateElement('x', v / 100)} min={-100} max={200} suffix="%" /><Field label="Y" value={Math.round(el.y * 1000) / 10} onChange={(v) => updateElement('y', v / 100)} min={-100} max={200} suffix="%" /><Field label="Width" value={Math.round(el.w * 1000) / 10} onChange={(v) => updateElement('w', v / 100)} min={1} max={300} suffix="%" /><Field label="Height" value={Math.round(el.h * 1000) / 10} onChange={(v) => updateElement('h', v / 100)} min={1} max={300} suffix="%" /><Field label="Rotation" value={el.rotation} onChange={(v) => updateElement('rotation', v)} min={-360} max={360} suffix="°" /><Field label="Opacity" value={el.opacity} onChange={(v) => updateElement('opacity', v)} min={0} max={100} suffix="%" /></div>
            <div className="mt-3 grid grid-cols-2 gap-3"><Switch label="Flip horizontal" checked={el.flipX} onChange={(v) => updateElement('flipX', v)} /><Switch label="Flip vertical" checked={el.flipY} onChange={(v) => updateElement('flipY', v)} /></div>
            <div className="mt-4 grid grid-cols-2 gap-3"><Field label="Crop left" value={el.cropLeft} onChange={(v) => updateElement('cropLeft', v)} min={0} max={95} suffix="%" /><Field label="Crop right" value={el.cropRight} onChange={(v) => updateElement('cropRight', v)} min={0} max={95} suffix="%" /><Field label="Crop top" value={el.cropTop} onChange={(v) => updateElement('cropTop', v)} min={0} max={95} suffix="%" /><Field label="Crop bottom" value={el.cropBottom} onChange={(v) => updateElement('cropBottom', v)} min={0} max={95} suffix="%" /></div>
          </Section> : null })()}
          {effectTarget === 'Selected overlay' && selectedOverlay && (() => { const overlay = overlays.find((item) => item.id === selectedOverlay); return overlay ? <Section title="Selected overlay geometry">
            <div className="grid grid-cols-2 gap-3"><Field label="X" value={overlay.x} onChange={(v) => updateOverlay('x', v)} min={-100} max={200} suffix="%" /><Field label="Y" value={overlay.y} onChange={(v) => updateOverlay('y', v)} min={-100} max={200} suffix="%" /><Field label="Size" value={overlay.width} onChange={(v) => updateOverlay('width', v)} min={1} max={300} suffix="%" /><Field label="Rotation" value={overlay.rotation} onChange={(v) => updateOverlay('rotation', v)} min={-360} max={360} suffix="°" /><Field label="Scale X" value={overlay.scaleX || 100} onChange={(v) => updateOverlay('scaleX', v)} min={1} max={500} suffix="%" /><Field label="Scale Y" value={overlay.scaleY || 100} onChange={(v) => updateOverlay('scaleY', v)} min={1} max={500} suffix="%" /><Field label="Opacity" value={overlay.opacity} onChange={(v) => updateOverlay('opacity', v)} min={0} max={100} suffix="%" /></div>
            <div className="mt-3 grid grid-cols-3 gap-2"><button onClick={() => updateOverlay('rotation', overlay.rotation - 90)} className="h-9 rounded-xl border border-white/10 text-[10px] text-zinc-400">−90°</button><button onClick={() => updateOverlay('rotation', 0)} className="grid h-9 place-items-center rounded-xl border border-white/10 text-zinc-400"><RotateCcw className="h-4 w-4" /></button><button onClick={() => updateOverlay('rotation', overlay.rotation + 90)} className="h-9 rounded-xl border border-white/10 text-[10px] text-zinc-400">+90°</button></div>
            <div className="mt-3 grid grid-cols-2 gap-3"><Switch label="Flip horizontal" checked={overlay.flipX} onChange={(v) => updateOverlay('flipX', v)} /><Switch label="Flip vertical" checked={overlay.flipY} onChange={(v) => updateOverlay('flipY', v)} /></div>
            <div className="mt-4 grid grid-cols-2 gap-3"><Field label="Crop left" value={overlay.cropLeft || 0} onChange={(v) => updateOverlay('cropLeft', v)} min={0} max={95} suffix="%" /><Field label="Crop right" value={overlay.cropRight || 0} onChange={(v) => updateOverlay('cropRight', v)} min={0} max={95} suffix="%" /><Field label="Crop top" value={overlay.cropTop || 0} onChange={(v) => updateOverlay('cropTop', v)} min={0} max={95} suffix="%" /><Field label="Crop bottom" value={overlay.cropBottom || 0} onChange={(v) => updateOverlay('cropBottom', v)} min={0} max={95} suffix="%" /></div>
          </Section> : null })()}
          <Section title="GIF canvas resize & crop">
            <div className="grid grid-cols-2 gap-3"><Field label="Width" value={settings.width} onChange={(v) => update('width', v)} min={1} max={1920} suffix="px" /><Field label="Height" value={settings.height} onChange={(v) => update('height', v)} min={1} max={1920} suffix="px" /></div>
            <div className="mt-3 grid grid-cols-2 gap-3"><Field label="Crop left" value={imageEdits.cropLeft} onChange={(v) => setImageEdits((s) => ({ ...s, cropLeft: v }))} min={0} max={90} suffix="%" /><Field label="Crop right" value={imageEdits.cropRight} onChange={(v) => setImageEdits((s) => ({ ...s, cropRight: v }))} min={0} max={90} suffix="%" /><Field label="Crop top" value={imageEdits.cropTop} onChange={(v) => setImageEdits((s) => ({ ...s, cropTop: v }))} min={0} max={90} suffix="%" /><Field label="Crop bottom" value={imageEdits.cropBottom} onChange={(v) => setImageEdits((s) => ({ ...s, cropBottom: v }))} min={0} max={90} suffix="%" /></div>
          </Section>
          <Section title="GIF base rotate & flip">
            <div className="grid grid-cols-3 gap-2"><button onClick={() => setImageEdits((s) => ({ ...s, rotation: s.rotation - 90 }))} className="h-9 rounded-xl border border-white/10 text-[10px] text-zinc-400">−90°</button><button onClick={() => setImageEdits((s) => ({ ...s, rotation: 0 }))} className="grid h-9 place-items-center rounded-xl border border-white/10 text-zinc-400"><RotateCcw className="h-4 w-4" /></button><button onClick={() => setImageEdits((s) => ({ ...s, rotation: s.rotation + 90 }))} className="h-9 rounded-xl border border-white/10 text-[10px] text-zinc-400">+90°</button></div>
            <div className="mt-3 grid grid-cols-2 gap-3"><Switch label="Flip horizontal" checked={imageEdits.flipX} onChange={(v) => setImageEdits((s) => ({ ...s, flipX: v }))} /><Switch label="Flip vertical" checked={imageEdits.flipY} onChange={(v) => setImageEdits((s) => ({ ...s, flipY: v }))} /></div>
          </Section>
          <Section title="Base image quick adjustments">
            <div className="grid grid-cols-2 gap-3"><Field label="Brightness" value={imageEdits.brightness} onChange={(v) => setImageEdits((s) => ({ ...s, brightness: v }))} min={0} max={300} suffix="%" /><Field label="Contrast" value={imageEdits.contrast} onChange={(v) => setImageEdits((s) => ({ ...s, contrast: v }))} min={0} max={300} suffix="%" /><Field label="Saturation" value={imageEdits.saturation} onChange={(v) => setImageEdits((s) => ({ ...s, saturation: v }))} min={0} max={300} suffix="%" /><Field label="Hue" value={imageEdits.hue} onChange={(v) => setImageEdits((s) => ({ ...s, hue: v }))} min={-180} max={180} suffix="°" /><Field label="Blur" value={imageEdits.blur} onChange={(v) => setImageEdits((s) => ({ ...s, blur: v }))} min={0} max={50} suffix="px" /><Field label="Grayscale" value={imageEdits.grayscale} onChange={(v) => setImageEdits((s) => ({ ...s, grayscale: v }))} min={0} max={100} suffix="%" /><Field label="Sepia" value={imageEdits.sepia} onChange={(v) => setImageEdits((s) => ({ ...s, sepia: v }))} min={0} max={100} suffix="%" /></div>
            <button onClick={() => setImageEdits((s) => ({ ...s, brightness: 100, contrast: 100, saturation: 100, blur: 0, hue: 0, grayscale: 0, sepia: 0 }))} className="mt-3 h-9 w-full rounded-xl border border-white/10 text-[10px] font-semibold text-zinc-400">Reset effects</button>
          </Section>
          <Section title="Advanced effects">
            <SelectField label="Apply effects to" value={effectTarget} onChange={setEffectTarget}><option>Entire GIF</option><option disabled={!selectedElement}>Selected element</option><option disabled={!selectedOverlay}>Selected overlay</option></SelectField>
            <div className="mt-3 rounded-lg bg-black/15 px-3 py-2 text-[9px] text-zinc-600">Editing: <b className="text-zinc-300">{effectTarget === 'Selected element' ? elements.find((item) => item.id === selectedElement)?.name || 'No element selected' : effectTarget === 'Selected overlay' ? overlays.find((item) => item.id === selectedOverlay)?.name || 'No overlay selected' : 'complete GIF output'}</b></div>
            <div className="mt-4 grid grid-cols-2 gap-3"><Field label="Hue" value={activeEffects.hue} onChange={(v) => updateEffect('hue', v)} min={-180} max={180} suffix="°" /><Field label="Saturation" value={activeEffects.saturation} onChange={(v) => updateEffect('saturation', v)} min={0} max={300} suffix="%" /><Field label="Lightness" value={activeEffects.lightness} onChange={(v) => updateEffect('lightness', v)} min={0} max={200} suffix="%" /><Field label="Brightness" value={activeEffects.brightness} onChange={(v) => updateEffect('brightness', v)} min={-100} max={100} /><Field label="Contrast" value={activeEffects.contrast} onChange={(v) => updateEffect('contrast', v)} min={-100} max={200} /></div>
            <div className="mt-4"><SelectField label="Color preset" value={activeEffects.preset} onChange={(v) => updateEffect('preset', v)}>{['None','Grayscale','Sepia','Monochrome','Gotham','Lomo','Nashville','Toaster','Vignette','Polaroid'].map((x) => <option key={x}>{x}</option>)}</SelectField></div>
            <div className="mt-3 grid grid-cols-2 gap-3"><Field label="Negative / invert" value={activeEffects.invert} onChange={(v) => updateEffect('invert', v)} min={0} max={100} suffix="%" /><Field label="Tint amount" value={activeEffects.tint} onChange={(v) => updateEffect('tint', v)} min={0} max={100} suffix="%" /></div>
            <label className="mt-3 flex items-center justify-between text-[10px] text-zinc-500"><span>Tint color</span><input type="color" value={activeEffects.tintColor} onChange={(e) => updateEffect('tintColor', e.target.value)} className="h-8 w-10 bg-transparent" /></label>
          </Section>
          <Section title="Color to transparency">
            <Switch label="Replace selected color" checked={activeEffects.transparentEnabled} onChange={(v) => updateEffect('transparentEnabled', v)} />
            <div className="mt-3 grid grid-cols-3 gap-2"><button onClick={() => updateEffect('transparentColor', '#ffffff')} className="h-8 rounded-lg border border-white/10 text-[9px] text-zinc-400">White</button><button onClick={() => updateEffect('transparentColor', '#000000')} className="h-8 rounded-lg border border-white/10 text-[9px] text-zinc-400">Black</button><input type="color" value={activeEffects.transparentColor} onChange={(e) => updateEffect('transparentColor', e.target.value)} className="h-8 w-full bg-transparent" /></div>
            <div className="mt-3 grid grid-cols-2 gap-3"><Field label="Fuzz" value={activeEffects.fuzz} onChange={(v) => updateEffect('fuzz', v)} min={0} max={100} suffix="%" /><Field label="Edge cleanup" value={activeEffects.edgeCleanup} onChange={(v) => updateEffect('edgeCleanup', v)} min={0} max={20} suffix="px" /></div>
            <label className="mt-3 flex items-center justify-between text-[10px] text-zinc-500"><span>GIF background</span><input type="color" value={settings.background} onChange={(e) => update('background', e.target.value)} className="h-8 w-10 bg-transparent" /></label>
          </Section>
          <Section title="Blur, sharpen & artistic">
            <div className="grid grid-cols-2 gap-3"><Field label="Gaussian blur" value={activeEffects.blur} onChange={(v) => updateEffect('blur', v)} min={0} max={30} suffix="px" /><Field label="Sharpen" value={activeEffects.sharpen} onChange={(v) => updateEffect('sharpen', v)} min={0} max={100} suffix="%" /><Field label="Oil paint" value={activeEffects.oilPaint} onChange={(v) => updateEffect('oilPaint', v)} min={0} max={100} /><Field label="Emboss" value={activeEffects.emboss} onChange={(v) => updateEffect('emboss', v)} min={0} max={100} /><Field label="Posterize" value={activeEffects.posterize} onChange={(v) => updateEffect('posterize', v)} min={0} max={100} /><Field label="Solarize" value={activeEffects.solarize} onChange={(v) => updateEffect('solarize', v)} min={0} max={100} /><Field label="Noise" value={activeEffects.noise} onChange={(v) => updateEffect('noise', v)} min={0} max={100} /></div>
          </Section>
          <Section title="Dithering & distortion">
            <SelectField label="Dithering" value={activeEffects.dither} onChange={(v) => updateEffect('dither', v)}>{['None','Ordered','Error diffusion'].map((x) => <option key={x}>{x}</option>)}</SelectField>
            <div className="mt-3"><SelectField label="Distortion" value={activeEffects.distortion} onChange={(v) => updateEffect('distortion', v)}>{['None','Swirl','Implode','Wave'].map((x) => <option key={x}>{x}</option>)}</SelectField></div>
            <div className="mt-3"><Field label="Distortion amount" value={activeEffects.distortionAmount} onChange={(v) => updateEffect('distortionAmount', v)} min={0} max={100} suffix="%" /></div>
          </Section>
          <Section title="Decorative frame">
            <SelectField label="Frame style" value={activeEffects.frame} onChange={(v) => updateEffect('frame', v)}>{['None','Camera','Fuzzy','Rounded corners','Solid border'].map((x) => <option key={x}>{x}</option>)}</SelectField>
            <label className="mt-3 flex items-center justify-between text-[10px] text-zinc-500"><span>Frame color</span><input type="color" value={activeEffects.frameColor} onChange={(e) => updateEffect('frameColor', e.target.value)} className="h-8 w-10 bg-transparent" /></label>
            <div className="mt-3 grid grid-cols-2 gap-3"><Field label="Frame width" value={activeEffects.frameWidth} onChange={(v) => updateEffect('frameWidth', v)} min={1} max={200} suffix="px" /><Field label="Corner radius" value={activeEffects.rounded} onChange={(v) => updateEffect('rounded', v)} min={0} max={500} suffix="px" /></div>
            <button onClick={() => { if (effectTarget === 'Selected element' && selectedElement) setElements((current) => current.map((element) => element.id === selectedElement ? { ...element, effects: { ...EFFECT_DEFAULTS } } : element)); else if (effectTarget === 'Selected overlay' && selectedOverlay) setOverlays((current) => current.map((overlay) => overlay.id === selectedOverlay ? { ...overlay, effects: { ...EFFECT_DEFAULTS } } : overlay)); else setGifEffects({ ...EFFECT_DEFAULTS }) }} className="mt-3 h-9 w-full rounded-xl border border-white/10 text-[10px] font-semibold text-zinc-400">Reset advanced effects</button>
          </Section>
          <Section title="Censor / pixelate">
            <button onClick={() => { setCensorSelecting(true); setMaskEditing(false); setSelectMode(false); setPlaying(false) }} className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-acid/30 bg-acid/[.05] text-[11px] font-bold text-acid"><Crop className="h-4 w-4" />Draw censor region</button>
            <div className="mt-3"><Switch label="Show censor" checked={censor.enabled} onChange={(v) => setCensor((s) => ({ ...s, enabled: v }))} /></div>
            <div className="mt-3"><Field label="Pixel block size" value={censor.pixelSize} onChange={(v) => setCensor((s) => ({ ...s, pixelSize: v }))} min={2} max={100} suffix="px" /></div>
          </Section>
          <Section title="Add image overlay">
            <button onClick={() => overlayFileRef.current?.click()} className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-white/10 text-[11px] font-semibold text-zinc-300"><ImagePlus className="h-4 w-4" />Add image</button><input ref={overlayFileRef} type="file" accept="image/*" className="hidden" onChange={(e) => addOverlay(e.target.files[0])} />
            <div className="mt-3 space-y-2">{overlays.map((overlay) => <button key={overlay.id} onClick={() => { setSelectedOverlay(overlay.id); setEffectTarget('Selected overlay') }} className={`flex w-full items-center gap-2 rounded-xl border p-2 text-left ${selectedOverlay === overlay.id ? 'border-acid/40' : 'border-white/[.07]'}`}><img src={overlay.url} alt="" className="h-8 w-8 rounded object-contain" /><span className="min-w-0 flex-1 truncate text-[10px]">{overlay.name}</span></button>)}</div>
            {selectedOverlay && (() => { const overlay = overlays.find((item) => item.id === selectedOverlay); return overlay ? <div className="mt-4"><div className="grid grid-cols-2 gap-3"><Field label="X" value={overlay.x} onChange={(v) => updateOverlay('x', v)} min={-100} max={200} suffix="%" /><Field label="Y" value={overlay.y} onChange={(v) => updateOverlay('y', v)} min={-100} max={200} suffix="%" /><Field label="Width" value={overlay.width} onChange={(v) => updateOverlay('width', v)} min={1} max={300} suffix="%" /><Field label="Rotation" value={overlay.rotation} onChange={(v) => updateOverlay('rotation', v)} min={-360} max={360} suffix="°" /><Field label="Opacity" value={overlay.opacity} onChange={(v) => updateOverlay('opacity', v)} min={0} max={100} suffix="%" /></div><div className="mt-3 grid grid-cols-2 gap-3"><Switch label="Flip X" checked={overlay.flipX} onChange={(v) => updateOverlay('flipX', v)} /><Switch label="Flip Y" checked={overlay.flipY} onChange={(v) => updateOverlay('flipY', v)} /></div><button onClick={() => { setOverlays((current) => current.filter((item) => item.id !== overlay.id)); setSelectedOverlay(null) }} className="mt-3 h-9 w-full rounded-xl border border-red-500/20 text-[10px] text-red-400">Remove overlay</button></div> : null })()}
          </Section>
          <Section title="Sequence & save">
            <button disabled={!frameSequence.length} onClick={() => setFrameSequence((current) => [...current].reverse())} className="flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-white/10 text-[10px] font-semibold text-zinc-400 disabled:opacity-30"><RotateCw className="h-3.5 w-3.5" />Reverse frame order</button>
            <div className="mt-2 grid grid-cols-2 gap-2"><button onClick={() => saveCurrentPng(false)} className="h-9 rounded-xl bg-white text-[10px] font-bold text-black">Save PNG</button><button onClick={() => saveCurrentPng(true)} className="h-9 rounded-xl border border-acid/30 text-[10px] font-bold text-acid">8-bit PNG</button></div>
            <p className="mt-2 text-[9px] leading-relaxed text-zinc-600">PNG saving uses oxipng O4 when installed, otherwise lossless Pillow compression. The 8-bit option reduces output to 256 colors.</p>
          </Section>
        </>}

        {activeTab === 'output' && <>
          <Section title="Canvas">
            <div className="grid grid-cols-2 gap-3"><Field label="Width" value={settings.width} onChange={(v) => update('width', v)} min={1} max={8192} suffix="px" /><Field label="Height" value={settings.height} onChange={(v) => update('height', v)} min={1} max={8192} suffix="px" /></div>
            <div className="mt-3"><SelectField label="Image fit" value={settings.fit} onChange={(v) => update('fit', v)}>{['Contain','Cover','Stretch','Original size'].map(x => <option key={x}>{x}</option>)}</SelectField></div>
          </Section>
          <Section title="Background">
            <Switch label="Transparent canvas" checked={settings.transparent} onChange={(v) => update('transparent', v)} />
            <label className="mt-4 flex items-center justify-between text-xs text-zinc-500"><span>Matte color</span><span className="flex items-center gap-2"><input type="color" value={settings.background} disabled={settings.transparent} onChange={(e) => update('background', e.target.value)} className="h-8 w-10 cursor-pointer rounded-lg border-0 bg-transparent" /><span className="font-mono text-zinc-400">{settings.background}</span></span></label>
          </Section>
          <Section title="Encoding">
            <SelectField label="Quality profile" value={settings.quality} onChange={applyQuality}>{['Low / small','Balanced','High quality','Custom'].map(x => <option key={x}>{x}</option>)}</SelectField>
            <div className="mt-3 grid grid-cols-2 gap-3"><Field label="Palette" value={settings.palette} onChange={(v) => setSettings((s) => ({ ...s, palette: v, quality: 'Custom' }))} min={2} max={256} suffix="colors" /><Field label="Loop" value={settings.loop} onChange={(v) => update('loop', v)} min={0} max={65535} /></div>
            <div className="mt-3"><SelectField label="Frame disposal" value={settings.disposal} onChange={(v) => update('disposal', Number(v))}><option value="2">Don't stack · clear next</option><option value="1">Keep previous frame</option><option value="3">Restore previous</option></SelectField></div>
            <div className="mt-3"><SelectField label="Compression method" value={settings.compressionMethod} onChange={(v) => setSettings((s) => ({ ...s, compressionMethod: v, quality: 'Custom' }))}>{['Lossless','Lossy LZW','Optimize Transparency','Color Reduction'].map((x) => <option key={x}>{x}</option>)}</SelectField></div>
            <div className={`mt-3 ${settings.compressionMethod === 'Lossy LZW' ? '' : 'pointer-events-none opacity-35'}`}><Field label="Lossy LZW level" value={settings.lossy} onChange={(v) => setSettings((s) => ({ ...s, lossy: v, quality: 'Custom' }))} min={0} max={200} /></div>
            <div className="mt-2 flex justify-between text-[9px] font-semibold uppercase tracking-wider text-zinc-700"><span>Best quality</span><span>Smallest</span></div>
            <div className="mt-4"><Switch label="Floyd–Steinberg dither" checked={settings.dither} onChange={(v) => setSettings((s) => ({ ...s, dither: v, quality: 'Custom' }))} /></div>
            <div className="mt-4 rounded-xl border border-white/[.07] bg-black/15 p-3 text-[10px] leading-relaxed text-zinc-500"><b className="text-zinc-300">{settings.quality}</b> · {settings.palette} colors · {settings.compressionMethod}{settings.compressionMethod === 'Lossy LZW' ? ` ${settings.lossy}` : ''} · exact {settings.width} × {settings.height}px with Python export.</div>
            <p className="mt-2 text-[9px] leading-relaxed text-zinc-600">High Quality uses GIF's full 256-color palette, one shared palette across every frame, and perceptual dithering. GIF itself cannot store more than 256 simultaneous colors.</p>
            <div className="mt-4 border-t border-white/[.06] pt-4"><button onClick={() => compressGifRef.current?.click()} className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-acid/30 bg-acid/[.05] text-[10px] font-bold text-acid"><Download className="h-3.5 w-3.5" />Compress existing GIF</button><input ref={compressGifRef} type="file" accept="image/gif,.gif" className="hidden" onChange={(e) => compressExistingGif(e.target.files[0])} /><p className="mt-2 text-[9px] leading-relaxed text-zinc-600">Lossy works best for photos and gradients. Transparency optimization is best for flat graphics with unchanged areas.</p></div>
            {lastExport && <div className="mt-3 rounded-xl border border-acid/15 bg-acid/[.04] p-3"><div className="flex items-center justify-between text-[10px]"><span className="font-semibold text-zinc-400">Last exported file</span><b className="text-acid">{fmtBytes(lastExport.bytes)}</b></div><div className="mt-1 text-[9px] text-zinc-600">{lastExport.encoder}{lastExport.optimized ? ' + gifsicle O3' : ''}{lastExport.originalBytes > lastExport.bytes ? ` · ${Math.round((1 - lastExport.bytes / lastExport.originalBytes) * 100)}% smaller` : ''}</div></div>}
          </Section>
        </>}

        {activeTab === 'elements' && <>
          <Section title="Element animator">
            <div className={`mb-3 flex items-center gap-2 rounded-lg px-2.5 py-2 text-[10px] font-semibold ${apiAvailable ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-300'}`}><span className={`h-1.5 w-1.5 rounded-full ${apiAvailable ? 'bg-emerald-400' : 'bg-amber-300'}`} />{apiAvailable ? apiInfo?.ai ? 'AI + OpenCV selection connected' : 'OpenCV smart selection connected' : 'Edge selector active · start Python API'}</div>
            <p className="mb-4 text-[11px] leading-relaxed text-zinc-500">Choose a professional selection tool. Lasso and path selections create an exact alpha mask; Rectangle can use AI/OpenCV separation and content-aware fill.</p>
            <SelectField label="Selection tool" value={selectionTool} onChange={(value) => { cancelSelection(); setSelectionTool(value) }}>{['Rectangle','Freehand Lasso','Polygonal Lasso','Pen Path'].map((tool) => <option key={tool}>{tool}</option>)}</SelectField>
            <button disabled={segmenting} onClick={() => { setSelection(null); setSelectionPoints([]); setSelectMode(true); setPlaying(false); setMobilePanel(false) }} className={`focus-ring mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl text-xs font-bold transition disabled:opacity-60 ${selectMode ? 'bg-acid text-black' : 'border border-acid/30 bg-acid/[.06] text-acid hover:bg-acid/10'}`}>{segmenting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <MousePointer2 className="h-4 w-4" />}{segmenting ? 'Separating object…' : selectMode ? `${selectionTool} active…` : `Start ${selectionTool}`}</button>
            <p className="mt-2 text-[9px] leading-relaxed text-zinc-600">Rectangle: drag. Freehand: draw continuously. Polygon/Pen: click anchors, then double-click or press Complete.</p>
            <div className="mt-4">
              <label className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-zinc-500"><span>Edge tolerance</span><b className="text-zinc-300">{extractTolerance}</b></label>
              <input type="range" min="5" max="120" value={extractTolerance} onChange={(e) => setExtractTolerance(Number(e.target.value))} className="mt-3 h-1 w-full" />
              <p className="mt-2 text-[10px] leading-relaxed text-zinc-600">Raise this when background pixels remain. Lower it if parts of the object disappear.</p>
            </div>
          </Section>
          <Section title={`Layers · ${elements.length}`}>
            {!elements.length && <div className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-center"><Layers3 className="mx-auto h-5 w-5 text-zinc-700" /><p className="mt-2 text-[11px] text-zinc-600">No animated elements yet</p></div>}
            <div className="space-y-2">{elements.map((el) => <button key={el.id} onClick={() => setSelectedElement(el.id)} className={`flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition ${selectedElement === el.id ? 'border-acid/40 bg-acid/[.06]' : 'border-white/[.07] bg-black/10 hover:border-white/20'}`}>
              <span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-lg checker"><img src={el.bitmap.toDataURL()} alt="" className="max-h-full max-w-full" /></span>
              <span className="min-w-0 flex-1"><b className="block truncate text-xs text-zinc-200">{el.name}</b><small className="text-[10px] text-zinc-600">{el.motion} · {el.speed}×</small></span><span className={`h-2 w-2 rounded-full ${el.visible ? 'bg-acid' : 'bg-zinc-700'}`} />
            </button>)}</div>
          </Section>
          <Section title="Parallax scene">
            <Switch label="Enable group parallax" checked={parallax.enabled} onChange={(v) => setParallax((current) => ({ ...current, enabled: v }))} />
            <div className={`mt-4 transition ${parallax.enabled ? '' : 'pointer-events-none opacity-40'}`}>
              <SelectField label="Travel path" value={parallax.direction} onChange={(v) => setParallax((current) => ({ ...current, direction: v }))}>{['Horizontal','Vertical','Diagonal','Orbit'].map((x) => <option key={x}>{x}</option>)}</SelectField>
              <div className="mt-3 grid grid-cols-2 gap-3"><Field label="Strength" value={parallax.strength} onChange={(v) => setParallax((current) => ({ ...current, strength: v }))} min={0} max={40} suffix="%" /><Field label="Speed" value={parallax.speed} onChange={(v) => setParallax((current) => ({ ...current, speed: v }))} min={.1} max={8} step={.1} suffix="×" /></div>
            </div>
            <div className="mt-3 rounded-xl border border-white/[.06] bg-black/10 p-3 text-[10px] leading-relaxed text-zinc-600">Each element moves by its depth: far layers travel less, near layers travel more. The loop remains seamless for GIF export.</div>
            {elements.length < 2 && <p className="mt-2 text-[10px] font-semibold text-amber-300/70">Add at least two elements for a visible depth effect.</p>}
          </Section>
          {selectedElement && (() => { const el = elements.find((item) => item.id === selectedElement); return el ? <Section title="Layer transform & crop">
            <div className="grid grid-cols-2 gap-3"><Field label="X position" value={Math.round(el.x * 1000) / 10} onChange={(v) => updateElement('x', v / 100)} min={-100} max={200} suffix="%" /><Field label="Y position" value={Math.round(el.y * 1000) / 10} onChange={(v) => updateElement('y', v / 100)} min={-100} max={200} suffix="%" /><Field label="Box width" value={Math.round(el.w * 1000) / 10} onChange={(v) => updateElement('w', v / 100)} min={1} max={300} suffix="%" /><Field label="Box height" value={Math.round(el.h * 1000) / 10} onChange={(v) => updateElement('h', v / 100)} min={1} max={300} suffix="%" /></div>
            <div className="mt-3 grid grid-cols-2 gap-3"><Field label="Scale X" value={el.scaleX} onChange={(v) => updateElement('scaleX', v)} min={1} max={500} suffix="%" /><Field label="Scale Y" value={el.scaleY} onChange={(v) => updateElement('scaleY', v)} min={1} max={500} suffix="%" /><Field label="Rotation" value={el.rotation} onChange={(v) => updateElement('rotation', v)} min={-360} max={360} suffix="°" /><Field label="Opacity" value={el.opacity} onChange={(v) => updateElement('opacity', v)} min={0} max={100} suffix="%" /></div>
            <div className="mt-3 grid grid-cols-3 gap-2"><button onClick={() => updateElement('rotation', el.rotation - 90)} className="h-9 rounded-xl border border-white/10 text-[10px] text-zinc-400">−90°</button><button onClick={() => updateElement('rotation', 0)} className="h-9 rounded-xl border border-white/10 text-[10px] text-zinc-400">Reset</button><button onClick={() => updateElement('rotation', el.rotation + 90)} className="h-9 rounded-xl border border-white/10 text-[10px] text-zinc-400">+90°</button></div>
            <div className="mt-3 grid grid-cols-2 gap-3"><Switch label="Flip horizontal" checked={el.flipX} onChange={(v) => updateElement('flipX', v)} /><Switch label="Flip vertical" checked={el.flipY} onChange={(v) => updateElement('flipY', v)} /></div>
            <div className="mt-4 grid grid-cols-2 gap-3"><Field label="Crop left" value={el.cropLeft} onChange={(v) => updateElement('cropLeft', v)} min={0} max={95} suffix="%" /><Field label="Crop right" value={el.cropRight} onChange={(v) => updateElement('cropRight', v)} min={0} max={95} suffix="%" /><Field label="Crop top" value={el.cropTop} onChange={(v) => updateElement('cropTop', v)} min={0} max={95} suffix="%" /><Field label="Crop bottom" value={el.cropBottom} onChange={(v) => updateElement('cropBottom', v)} min={0} max={95} suffix="%" /></div>
          </Section> : null })()}
          {selectedElement && (() => { const el = elements.find((item) => item.id === selectedElement); return el ? <Section title="Layer motion">
            <SelectField label="Animation" value={el.motion} onChange={(v) => updateElement('motion', v)}>{['Float','Drift','Bounce','Pulse','Spin','Wobble'].map((x) => <option key={x}>{x}</option>)}</SelectField>
            <div className="mt-3 grid grid-cols-2 gap-3"><Field label="Amount" value={el.amplitude} onChange={(v) => updateElement('amplitude', v)} min={0} max={40} suffix="%" /><Field label="Speed" value={el.speed} onChange={(v) => updateElement('speed', v)} min={.1} max={8} step={.1} suffix="×" /></div>
            <div className="mt-3"><Field label="Parallax depth" value={el.depth ?? 50} onChange={(v) => updateElement('depth', v)} min={0} max={100} suffix="%" /></div>
            <div className="mt-2 flex justify-between text-[9px] font-semibold uppercase tracking-wider text-zinc-700"><span>Far</span><span>Near</span></div>
            <div className="mt-4"><Switch label="Show layer" checked={el.visible} onChange={(v) => updateElement('visible', v)} /></div>
            <button onClick={() => removeElement(el.id)} className="mt-4 flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-red-500/15 text-xs font-semibold text-red-400 transition hover:bg-red-500/10"><Trash2 className="h-3.5 w-3.5" />Remove element</button>
          </Section> : null })()}
          {selectedElement && <Section title="Layer mask">
            <Switch label="Paint mask on canvas" checked={maskEditing} onChange={(v) => { setMaskEditing(v); setPlaying(false); setSelectMode(false) }} />
            <div className="mt-4 grid grid-cols-2 gap-2">{['Hide','Reveal'].map((mode) => <button key={mode} onClick={() => setMaskBrush((current) => ({ ...current, mode }))} className={`h-9 rounded-xl border text-[11px] font-semibold ${maskBrush.mode === mode ? 'border-acid/50 bg-acid/10 text-acid' : 'border-white/10 text-zinc-500'}`}>{mode} pixels</button>)}</div>
            <div className="mt-3 grid grid-cols-2 gap-3"><Field label="Brush size" value={maskBrush.size} onChange={(v) => setMaskBrush((current) => ({ ...current, size: v }))} min={2} max={500} suffix="px" /><Field label="Hardness" value={maskBrush.hardness} onChange={(v) => setMaskBrush((current) => ({ ...current, hardness: v }))} min={0} max={100} suffix="%" /><Field label="Opacity" value={maskBrush.opacity} onChange={(v) => setMaskBrush((current) => ({ ...current, opacity: v }))} min={1} max={100} suffix="%" /><Field label="Feather" value={maskBrush.feather} onChange={(v) => setMaskBrush((current) => ({ ...current, feather: v }))} min={0} max={80} suffix="px" /></div>
            <div className="mt-3 grid grid-cols-2 gap-2"><button onClick={() => resetElementMask('Rectangle')} className="h-9 rounded-xl border border-white/10 text-[10px] font-semibold text-zinc-400">Rectangle mask</button><button onClick={() => resetElementMask('Ellipse')} className="h-9 rounded-xl border border-white/10 text-[10px] font-semibold text-zinc-400">Ellipse mask</button><button onClick={invertElementMask} className="h-9 rounded-xl border border-white/10 text-[10px] font-semibold text-zinc-400">Invert mask</button><button onClick={featherElementMask} className="h-9 rounded-xl border border-white/10 text-[10px] font-semibold text-zinc-400">Apply feather</button></div>
            <p className="mt-3 text-[10px] leading-relaxed text-zinc-600">Masks are non-destructive: the original extracted pixels are retained and can be revealed again.</p>
          </Section>}
        </>}

      </aside>

      {mobilePanel && <button aria-label="Close panel" onClick={() => setMobilePanel(false)} className="absolute inset-0 z-10 bg-black/60 lg:hidden" />}

      <section className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[#111113]">
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-white/[.06] px-4 md:px-5">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.15em] text-zinc-600"><span className="h-1.5 w-1.5 rounded-full bg-acid" />Live preview</div>
          <div className="flex items-center gap-1"><IconButton label="Fit canvas" onClick={() => setZoom(84)}><Maximize2 className="h-4 w-4" /></IconButton><span className="w-12 text-center text-[10px] font-semibold text-zinc-600">{zoom}%</span></div>
        </div>

        <div className="checker relative flex min-h-[360px] flex-1 items-center justify-center overflow-hidden p-5 md:p-10">
          <div ref={stageRef} style={stageStyle} onPointerDown={startSelection} onPointerMove={moveSelection} onPointerUp={finishSelection} onDoubleClick={() => { if (selectMode && (selectionTool === 'Polygonal Lasso' || selectionTool === 'Pen Path')) completePathSelection() }} className={`card-shadow relative overflow-hidden rounded-[4px] ring-1 ring-white/10 ${selectMode || maskEditing || censorSelecting ? 'cursor-crosshair ring-2 ring-acid' : ''}`}>
            <canvas ref={canvasRef} className="block h-full w-full" />
            {!image && <div className="absolute inset-0 grid place-items-center bg-zinc-900"><ImagePlus className="h-8 w-8 text-zinc-700" /></div>}
            {selection && selectionTool === 'Rectangle' && <div className="pointer-events-none absolute border-2 border-acid bg-acid/10 shadow-[0_0_0_9999px_rgba(0,0,0,.38)]" style={{ left: `${selection.x * 100}%`, top: `${selection.y * 100}%`, width: `${selection.w * 100}%`, height: `${selection.h * 100}%` }} />}
            {selectMode && selectionPoints.length > 0 && <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
              {selectionTool === 'Pen Path' && selectionPoints.length >= 3 ? <path d={smoothSelectionPath(selectionPoints)} fill="rgba(216,255,62,.12)" stroke="#d8ff3e" strokeWidth=".45" strokeDasharray="1.2 1" /> : <polygon points={selectionPoints.map((point) => `${point.x * 100},${point.y * 100}`).join(' ')} fill="rgba(216,255,62,.12)" stroke="#d8ff3e" strokeWidth=".45" strokeDasharray="1.2 1" />}
              {(selectionTool === 'Polygonal Lasso' || selectionTool === 'Pen Path') && selectionPoints.map((point, index) => <circle key={index} cx={point.x * 100} cy={point.y * 100} r=".8" fill="#111113" stroke="#d8ff3e" strokeWidth=".35" />)}
            </svg>}
            {!selectMode && !maskEditing && !playing && elements.map((el) => <button key={el.id} onClick={() => { setSelectedElement(el.id); setActiveTab('elements') }} title={el.name} className={`absolute border transition ${selectedElement === el.id ? 'border-acid shadow-[0_0_0_1px_#d8ff3e]' : 'border-white/30 hover:border-acid/70'} ${el.visible ? '' : 'opacity-30'}`} style={{ left: `${el.x * 100}%`, top: `${el.y * 100}%`, width: `${el.w * 100}%`, height: `${el.h * 100}%` }}><span className="absolute -left-px -top-5 rounded-t bg-black/70 px-1.5 py-0.5 text-[8px] font-bold text-zinc-300">{el.name}</span></button>)}
            {!selectMode && !maskEditing && !playing && textLayers.filter((layer) => layer.visible).map((layer) => { const box = textBounds(layer); return <button key={layer.id} onPointerDown={(e) => beginTextDrag(e, layer)} onPointerMove={dragTextLayer} onPointerUp={endTextDrag} title="Drag to position text" className={`absolute cursor-move border border-dashed transition ${selectedText === layer.id ? 'border-acid bg-acid/[.04]' : 'border-white/30 hover:border-acid/70'}`} style={{ left: `${box.left}%`, top: `${box.top}%`, width: `${box.width}%`, height: `${box.height}%`, transform: `rotate(${layer.rotation}deg)` }}><span className="absolute -left-px -top-5 rounded-t bg-black/70 px-1.5 py-0.5 text-[8px] font-bold text-zinc-300">{layer.name}</span></button> })}
            {selectMode && !selection && selectionPoints.length === 0 && <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-lg bg-black/75 px-3 py-2 text-[10px] font-semibold text-white shadow-xl">{selectionTool === 'Rectangle' ? 'Drag a box around the object' : selectionTool === 'Freehand Lasso' ? 'Draw around the object continuously' : 'Click to place selection anchors'}</div>}
            {selectMode && (selectionTool === 'Polygonal Lasso' || selectionTool === 'Pen Path') && selectionPoints.length > 0 && <div className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 gap-2 rounded-xl border border-white/10 bg-black/80 p-2 shadow-xl backdrop-blur" onPointerDown={(event) => event.stopPropagation()}>
              <button onClick={() => setSelectionPoints((points) => points.slice(0, -1))} className="h-8 rounded-lg border border-white/10 px-3 text-[9px] font-bold text-zinc-300">Undo point</button>
              <button disabled={selectionPoints.length < 3} onClick={completePathSelection} className="h-8 rounded-lg bg-acid px-3 text-[9px] font-bold text-black disabled:opacity-40">Complete</button>
              <button onClick={cancelSelection} className="h-8 rounded-lg border border-white/10 px-3 text-[9px] font-bold text-zinc-400">Cancel</button>
            </div>}
            {censorSelecting && !selection && <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-lg bg-black/75 px-3 py-2 text-[10px] font-semibold text-white shadow-xl">Drag over the area to censor</div>}
          </div>
          <div className="absolute bottom-4 left-4 hidden items-center gap-2 rounded-lg border border-white/[.07] bg-black/40 px-2.5 py-1.5 text-[10px] text-zinc-500 backdrop-blur sm:flex"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />Processed locally</div>
        </div>

        <div className="shrink-0 border-t border-white/[.07] bg-panel px-4 pb-4 pt-3 md:px-6">
          <div className="mb-3 flex items-center gap-3">
            <button onClick={() => setPlaying(!playing)} className="focus-ring grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-black transition hover:scale-105">{playing ? <Pause className="h-4 w-4 fill-current" /> : <Play className="ml-0.5 h-4 w-4 fill-current" />}</button>
            <span className="w-11 text-right font-mono text-[10px] text-zinc-500">{(progress * actualDuration).toFixed(1)}s</span>
            <input aria-label="Timeline" type="range" min="0" max={frames - 1} step="1" value={Math.round(progress * frames)} onChange={(e) => { const t = Number(e.target.value) / frames; setPlaying(false); setProgress(t); draw(t) }} className="h-1 w-full cursor-pointer" />
            <span className="w-11 font-mono text-[10px] text-zinc-500">{actualDuration.toFixed(1)}s</span>
          </div>
          <div className="flex items-center justify-between gap-4 border-t border-white/[.05] pt-3 text-[10px] text-zinc-600">
            <div className="flex gap-4"><span><b className="text-zinc-400">{frames}</b> frames</span><span title={`GIF delays: ${[...new Set(frameDelays)].join('/')} ms`}><b className="text-zinc-400">{actualFps.toFixed(2)}</b> real fps</span><span className="hidden sm:inline"><b className="text-zinc-400">{settings.width} × {settings.height}</b> px</span></div>
            <div className={`flex items-center gap-1.5 ${memory > 1.8e9 ? 'text-red-400' : ''}`}><Info className="h-3.5 w-3.5" /> {fmtBytes(memory)} render memory</div>
          </div>
        </div>
      </section>
    </main>

    {exporting && <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-sm"><div className="w-[min(90vw,380px)] rounded-3xl border border-white/10 bg-panel p-6 text-center shadow-2xl"><div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-acid/10 text-acid"><LoaderCircle className="h-6 w-6 animate-spin" /></div><h2 className="display mt-4 text-lg font-bold">Building your GIF</h2><p className="mt-2 text-xs text-zinc-500">Rendering {frames} frames locally in your browser.</p><div className="mt-5 h-1.5 overflow-hidden rounded-full bg-black/40"><div className="h-full rounded-full bg-acid transition-all" style={{ width: `${Math.max(3, progress * 100)}%` }} /></div><p className="mt-2 text-right font-mono text-[10px] text-zinc-600">{Math.round(progress * 100)}%</p></div></div>}
    {toast && <div className="toast fixed bottom-5 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-xl border border-white/10 bg-zinc-800 px-4 py-3 text-xs font-semibold shadow-2xl"><Check className="h-4 w-4 text-acid" />{toast}</div>}
  </div>
}

export default App
