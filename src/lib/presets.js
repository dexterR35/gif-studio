export const PRESETS = {
  'Zoom in': { scaleStart: 100, scaleEnd: 118, rotateStart: 0, rotateEnd: 0, xStart: 0, xEnd: 0, yStart: 0, yEnd: 0, opacityStart: 100, opacityEnd: 100, amplitude: 4, cycles: 1, pingPong: false, motion: 'None', speed: 1 },
  'Zoom out': { scaleStart: 120, scaleEnd: 100, rotateStart: 0, rotateEnd: 0, xStart: 0, xEnd: 0, yStart: 0, yEnd: 0, opacityStart: 100, opacityEnd: 100, amplitude: 4, cycles: 1, pingPong: false, motion: 'None', speed: 1 },
  'Ken Burns': { scaleStart: 102, scaleEnd: 125, rotateStart: 0, rotateEnd: 0, xStart: -7, xEnd: 7, yStart: 4, yEnd: -4, opacityStart: 100, opacityEnd: 100, amplitude: 4, cycles: 1, pingPong: true, motion: 'None', speed: 1 },
  'Pulse': { scaleStart: 100, scaleEnd: 100, rotateStart: 0, rotateEnd: 0, xStart: 0, xEnd: 0, yStart: 0, yEnd: 0, opacityStart: 100, opacityEnd: 100, amplitude: 7, cycles: 2, pingPong: false, motion: 'Pulse', speed: 2 },
  'Orbit': { scaleStart: 104, scaleEnd: 104, rotateStart: 0, rotateEnd: 0, xStart: 0, xEnd: 0, yStart: 0, yEnd: 0, opacityStart: 100, opacityEnd: 100, amplitude: 6, cycles: 1, pingPong: false, motion: 'Orbit', speed: 1 },
  'Spin & zoom': { scaleStart: 85, scaleEnd: 120, rotateStart: -18, rotateEnd: 18, xStart: 0, xEnd: 0, yStart: 0, yEnd: 0, opacityStart: 35, opacityEnd: 100, amplitude: 4, cycles: 1, pingPong: true, motion: 'None', speed: 1 },
  'Fade in': { scaleStart: 100, scaleEnd: 100, rotateStart: 0, rotateEnd: 0, xStart: 0, xEnd: 0, yStart: 0, yEnd: 0, opacityStart: 0, opacityEnd: 100, amplitude: 0, cycles: 1, pingPong: false, motion: 'None', speed: 1 },
  'Wobble': { scaleStart: 104, scaleEnd: 104, rotateStart: 0, rotateEnd: 0, xStart: 0, xEnd: 0, yStart: 0, yEnd: 0, opacityStart: 100, opacityEnd: 100, amplitude: 5, cycles: 3, pingPong: false, motion: 'Wobble', speed: 3 },
  'Still': { scaleStart: 100, scaleEnd: 100, rotateStart: 0, rotateEnd: 0, xStart: 0, xEnd: 0, yStart: 0, yEnd: 0, opacityStart: 100, opacityEnd: 100, amplitude: 0, cycles: 1, pingPong: false, motion: 'None', speed: 1 },
}

export const INITIAL = {
  preset: 'Zoom in', duration: 2.5, fps: 15, easing: 'Ease in-out', width: 480, height: 300,
  fit: 'Contain', background: '#111114', transparent: false, quality: 'High quality', palette: 256,
  dither: true, lossy: 0, compressionMethod: 'Lossless', loop: 0, disposal: 2,
  motion: 'None', speed: 1,
  ...PRESETS['Zoom in'],
}

/** Loop animations for the base GIF image (Motion tab). No parallax — that is element-only. */
export const BASE_MOTIONS = ['None', 'Float', 'Drift', 'Bounce', 'Pulse', 'Spin', 'Wobble', 'Orbit']


export const TEXT_DEFAULT = {
  text: 'Your text', font: 'Arial', size: 72, weight: 700, italic: false,
  align: 'center', color: '#ffffff', strokeColor: '#000000', strokeWidth: 0,
  letterSpacing: 0, lineHeight: 1.1, opacity: 100, x: 50, y: 50, rotation: 0,
  scaleX: 100, scaleY: 100, flipX: false, flipY: false,
  shadowColor: '#000000', shadowBlur: 0, shadowX: 0, shadowY: 4,
  decoration: 'None', casing: 'As typed', blendMode: 'source-over',
  entrance: 'None', entranceDuration: 20, motion: 'None', exit: 'None', exitDuration: 20,
  amplitude: 5, speed: 1, visible: true, locked: false,
}

export const SYSTEM_FONTS = [
  'Arial', 'Helvetica', 'Segoe UI', 'Verdana', 'Trebuchet MS',
  'Georgia', 'Times New Roman', 'Courier New', 'Impact', 'Comic Sans MS',
]

export const EFFECT_DEFAULTS = {
  hue: 0, saturation: 100, lightness: 100, brightness: 0, contrast: 0,
  preset: 'None', invert: 0, tintColor: '#ff6b6b', tint: 0,
  transparentEnabled: false, transparentColor: '#ffffff', fuzz: 2, edgeCleanup: 2,
  blur: 0, sharpen: 0, posterize: 0, solarize: 0, noise: 0, emboss: 0, oilPaint: 0,
  distortion: 'None', distortionAmount: 0, dither: 'None',
  frame: 'None', frameColor: '#ffffff', frameWidth: 12, rounded: 28,
}
