const STILL = {
  scaleStart: 100, scaleEnd: 100, rotateStart: 0, rotateEnd: 0,
  xStart: 0, xEnd: 0, yStart: 0, yEnd: 0, opacityStart: 100, opacityEnd: 100,
  pingPong: false,
}

/** Map Amount (%) → timeline keyframes for one-shot / pan presets. */
export function transformsFromAmount(preset, amount) {
  const a = Math.max(0, Number(amount) || 0)
  switch (preset) {
    case 'Zoom in':
      return { ...STILL, scaleStart: 100, scaleEnd: 100 + a, motion: 'None' }
    case 'Zoom out':
      return { ...STILL, scaleStart: 100 + a, scaleEnd: 100, motion: 'None' }
    case 'Ken Burns': {
      const pan = a * 0.35
      return {
        ...STILL,
        scaleStart: 100 + a * 0.08,
        scaleEnd: 100 + a,
        xStart: -pan, xEnd: pan,
        yStart: pan * 0.55, yEnd: -pan * 0.55,
        pingPong: true,
        motion: 'None',
      }
    }
    case 'Spin & zoom':
      return {
        ...STILL,
        scaleStart: Math.max(40, 100 - a),
        scaleEnd: 100 + a,
        rotateStart: -a,
        rotateEnd: a,
        opacityStart: Math.max(0, 100 - a * 3.5),
        opacityEnd: 100,
        pingPong: true,
        motion: 'None',
      }
    case 'Fade in':
      return { ...STILL, opacityStart: 0, opacityEnd: 100, motion: 'None' }
    case 'Float':
      return { ...STILL, motion: 'Float' }
    case 'Drift':
      return { ...STILL, motion: 'Drift' }
    case 'Bounce':
      return { ...STILL, motion: 'Bounce' }
    case 'Pulse':
      return { ...STILL, motion: 'Pulse' }
    case 'Spin':
      return { ...STILL, motion: 'Spin' }
    case 'Wobble':
      return { ...STILL, motion: 'Wobble' }
    case 'Orbit':
      return { ...STILL, scaleStart: 104, scaleEnd: 104, motion: 'Orbit' }
    case 'Still':
    default:
      return { ...STILL, motion: 'None' }
  }
}

export const PRESETS = {
  'Still': { ...transformsFromAmount('Still', 0), amplitude: 0, speed: 1, cycles: 1 },
  'Zoom in': { ...transformsFromAmount('Zoom in', 18), amplitude: 18, speed: 1, cycles: 1 },
  'Zoom out': { ...transformsFromAmount('Zoom out', 20), amplitude: 20, speed: 1, cycles: 1 },
  'Ken Burns': { ...transformsFromAmount('Ken Burns', 25), amplitude: 25, speed: 1, cycles: 1 },
  'Spin & zoom': { ...transformsFromAmount('Spin & zoom', 20), amplitude: 20, speed: 1, cycles: 1 },
  'Fade in': { ...transformsFromAmount('Fade in', 0), amplitude: 0, speed: 1, cycles: 1 },
  'Float': { ...transformsFromAmount('Float', 6), amplitude: 6, speed: 1, cycles: 1 },
  'Drift': { ...transformsFromAmount('Drift', 6), amplitude: 6, speed: 1, cycles: 1 },
  'Bounce': { ...transformsFromAmount('Bounce', 8), amplitude: 8, speed: 1.5, cycles: 1.5 },
  'Pulse': { ...transformsFromAmount('Pulse', 7), amplitude: 7, speed: 2, cycles: 2 },
  'Spin': { ...transformsFromAmount('Spin', 0), amplitude: 0, speed: 1, cycles: 1 },
  'Wobble': { ...transformsFromAmount('Wobble', 5), amplitude: 5, speed: 3, cycles: 3 },
  'Orbit': { ...transformsFromAmount('Orbit', 6), amplitude: 6, speed: 1, cycles: 1 },
}

export const INITIAL = {
  preset: 'Still', duration: 10, fps: 24, easing: 'Ease in-out', width: 480, height: 300,
  fit: 'Contain', background: '#111114', transparent: false, quality: 'High quality', palette: 256,
  dither: true, lossy: 0, compressionMethod: 'Lossless', loop: 0, disposal: 2,
  motion: 'None', speed: 1,
  /** Pivot for scale / rotate / pulse (canvas %, 50 = center). */
  anchorX: 50, anchorY: 50,
  /** Timed liquify / zoom clips — see motion-effects.js */
  motionEffects: [],
  ...PRESETS.Still,
}

export const TEXT_DEFAULT = {
  text: 'Your text', font: 'Arial', size: 72, weight: 700, italic: false,
  align: 'center', color: '#ffffff', strokeColor: '#000000', strokeWidth: 0,
  letterSpacing: 0, lineHeight: 1.1, opacity: 100, x: 50, y: 50, rotation: 0,
  scaleX: 100, scaleY: 100, flipX: false, flipY: false,
  shadowColor: '#000000', shadowBlur: 0, shadowX: 0, shadowY: 4,
  decoration: 'None', casing: 'As typed', blendMode: 'source-over',
  entrance: 'None', entranceDuration: 20, motion: 'None', exit: 'None', exitDuration: 20,
  amplitude: 5, speed: 1, visible: true, locked: false,
  /** Timeline window (seconds) — editable on the Timeline tab */
  in: 0, out: 1,
}

/** Max text layers that can appear as editable timeline tracks. */
export const MAX_TEXT_LAYERS = 5

/** Clamp a text layer's in/out window to the GIF duration. */
export function clampTextInOut(layer, duration) {
  const max = Math.max(0.1, Number(duration) || 1)
  let start = Number.isFinite(Number(layer?.in)) ? Number(layer.in) : 0
  let end = Number.isFinite(Number(layer?.out)) ? Number(layer.out) : max
  start = Math.max(0, Math.min(max, start))
  end = Math.max(0, Math.min(max, end))
  if (end < start) [start, end] = [end, start]
  if (end - start < 0.05) end = Math.min(max, start + 0.05)
  return { ...layer, in: +start.toFixed(2), out: +end.toFixed(2) }
}

export const SYSTEM_FONTS = [
  'Arial', 'Helvetica', 'Segoe UI', 'Verdana', 'Trebuchet MS',
  'Georgia', 'Times New Roman', 'Courier New', 'Impact', 'Comic Sans MS',
]

