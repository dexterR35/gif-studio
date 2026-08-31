/** Default settings for the still-image editor. */
export const INITIAL = {
  width: 480,
  height: 300,
  fit: 'Contain',
  background: '#111114',
  transparent: false,
  reducePalette: false,
  x: 0,
  y: 0,
  scale: 100,
  rotation: 0,
  opacity: 100,
  anchorX: 50,
  anchorY: 50,
  imageFilters: [],
}

export const TEXT_DEFAULT = {
  text: 'Your text', font: 'Arial', size: 72, weight: 700, italic: false,
  align: 'center', color: '#ffffff', strokeColor: '#000000', strokeWidth: 0,
  letterSpacing: 0, lineHeight: 1.1, opacity: 100, x: 50, y: 50, rotation: 0,
  scaleX: 100, scaleY: 100, flipX: false, flipY: false,
  /** Wrap width in px — set by Konva Transformer; null uses measured width. */
  boxWidth: null,
  shadowColor: '#000000', shadowBlur: 0, shadowX: 0, shadowY: 4,
  decoration: 'None', casing: 'As typed', blendMode: 'source-over',
  visible: true, locked: false,
}

export const MAX_TEXT_LAYERS = 5

export const SYSTEM_FONTS = [
  'Arial', 'Helvetica', 'Segoe UI', 'Verdana', 'Trebuchet MS',
  'Georgia', 'Times New Roman', 'Courier New', 'Impact', 'Comic Sans MS',
]
