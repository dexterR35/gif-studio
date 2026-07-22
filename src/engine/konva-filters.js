/**
 * Konva Filters catalog — maps 1:1 to Konva.Filters (docs).
 * @see https://konvajs.org/docs/filters/Blur.html
 */
import Konva from 'konva'

export const KONVA_FILTER_TYPES = [
  { type: 'Blur', label: 'Blur', attr: 'blurRadius', min: 0, max: 40, step: 1, default: 8 },
  { type: 'Brighten', label: 'Brighten', attr: 'brightness', min: -1, max: 1, step: 0.05, default: 0.1 },
  { type: 'Contrast', label: 'Contrast', attr: 'contrast', min: -100, max: 100, step: 1, default: 10 },
  { type: 'Enhance', label: 'Enhance', attr: 'enhance', min: -1, max: 1, step: 0.05, default: 0.2 },
  { type: 'Grayscale', label: 'Grayscale', attr: null, min: 0, max: 0, step: 0, default: null },
  { type: 'Invert', label: 'Invert', attr: null, min: 0, max: 0, step: 0, default: null },
  { type: 'Noise', label: 'Noise', attr: 'noise', min: 0, max: 1, step: 0.05, default: 0.2 },
  { type: 'Pixelate', label: 'Pixelate', attr: 'pixelSize', min: 1, max: 40, step: 1, default: 8 },
  { type: 'Sepia', label: 'Sepia', attr: null, min: 0, max: 0, step: 0, default: null },
  { type: 'Threshold', label: 'Threshold', attr: 'threshold', min: 0, max: 1, step: 0.05, default: 0.5 },
]

const FILTER_FN = {
  Blur: Konva.Filters.Blur,
  Brighten: Konva.Filters.Brighten,
  Contrast: Konva.Filters.Contrast,
  Enhance: Konva.Filters.Enhance,
  Grayscale: Konva.Filters.Grayscale,
  Invert: Konva.Filters.Invert,
  Noise: Konva.Filters.Noise,
  Pixelate: Konva.Filters.Pixelate,
  Sepia: Konva.Filters.Sepia,
  Threshold: Konva.Filters.Threshold,
}

/**
 * @param {{ type: string, [key: string]: number }[]} imageFilters
 * @returns {Function[]}
 */
export function resolveKonvaFilters(imageFilters = []) {
  const out = []
  for (const entry of imageFilters || []) {
    const fn = FILTER_FN[entry?.type]
    if (fn) out.push(fn)
  }
  return out
}

/**
 * Apply Konva filter attrs on a node (must call node.cache() first / after).
 * @param {import('konva/lib/Node').Node} node
 * @param {{ type: string, [key: string]: number }[]} imageFilters
 */
export function applyFilterAttrs(node, imageFilters = []) {
  if (!node) return
  const list = imageFilters || []
  // Reset common attrs so removed filters don't stick.
  node.blurRadius?.(0)
  node.brightness?.(0)
  node.contrast?.(0)
  node.enhance?.(0)
  node.noise?.(0)
  node.pixelSize?.(1)
  node.threshold?.(0.5)

  for (const entry of list) {
    const meta = KONVA_FILTER_TYPES.find((f) => f.type === entry.type)
    if (!meta?.attr) continue
    const value = entry[meta.attr] ?? meta.default
    if (typeof node[meta.attr] === 'function') node[meta.attr](value)
  }
}

/**
 * Cache + set filters on a Konva Image/Text node.
 * @param {import('konva/lib/Node').Node} node
 * @param {{ type: string, [key: string]: number }[]} imageFilters
 */
export function applyKonvaFilters(node, imageFilters = []) {
  if (!node) return
  const list = imageFilters || []
  if (!list.length) {
    node.filters([])
    node.clearCache?.()
    return
  }
  node.cache()
  node.filters(resolveKonvaFilters(list))
  applyFilterAttrs(node, list)
  node.getLayer()?.batchDraw()
}

export function createFilterEntry(type) {
  const meta = KONVA_FILTER_TYPES.find((f) => f.type === type)
  if (!meta) return null
  const entry = { type }
  if (meta.attr) entry[meta.attr] = meta.default
  return entry
}
