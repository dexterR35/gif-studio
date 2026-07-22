/**
 * Measure text layer bounds with canvas font metrics (no char-width heuristics).
 * Used when a Konva node is not available (e.g. canvas 2D export path).
 */

let measureCtx = null

function getMeasureCtx() {
  if (measureCtx) return measureCtx
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  measureCtx = canvas.getContext('2d')
  return measureCtx
}

/**
 * @param {object} layer
 * @param {number} [fontScale=1]
 * @returns {{ width: number, height: number, lines: string[] }}
 */
export function measureTextLayerPx(layer, fontScale = 1) {
  const size = Math.max(1, (Number(layer.size) || 72) * (Number(layer.scaleY) || 100) / 100 * fontScale)
  const raw = String(layer.text ?? 'Text')
  const paragraphs = raw.split('\n')
  const ctx = getMeasureCtx()
  const letterSpacing = (Number(layer.letterSpacing) || 0) * fontScale
  if (ctx) {
    ctx.font = `${layer.italic ? 'italic ' : ''}${layer.weight || 700} ${size}px "${layer.font || 'Arial'}", sans-serif`
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${letterSpacing}px`
  }

  const maxWidth = layer.boxWidth != null && Number(layer.boxWidth) > 0
    ? Number(layer.boxWidth) * fontScale * ((Number(layer.scaleX) || 100) / 100)
    : null

  const lines = []
  for (const paragraph of paragraphs) {
    if (!ctx || maxWidth == null) {
      lines.push(paragraph)
      continue
    }
    const words = paragraph.length ? paragraph.split(/\s+/) : ['']
    let current = ''
    for (const word of words) {
      const next = current ? `${current} ${word}` : word
      if (ctx.measureText(next).width > maxWidth && current) {
        lines.push(current)
        current = word
      } else {
        current = next
      }
    }
    lines.push(current)
  }

  let widthPx = maxWidth
  if (widthPx == null) {
    widthPx = 1
    if (ctx) {
      for (const line of lines) {
        widthPx = Math.max(widthPx, ctx.measureText(line).width)
      }
    } else {
      widthPx = size * Math.max(1, ...lines.map((l) => l.length)) * 0.5
    }
    widthPx *= (Number(layer.scaleX) || 100) / 100
  }

  const heightPx = Math.max(1, lines.length * size * (Number(layer.lineHeight) || 1.1))
  return { width: widthPx, height: heightPx, lines }
}

/**
 * @param {object} layer
 * @param {number} canvasW
 * @param {number} canvasH
 * @returns {{ left: number, top: number, width: number, height: number }}
 */
export function textLayerBoundsPct(layer, canvasW, canvasH) {
  const { width: widthPx, height: heightPx } = measureTextLayerPx(layer)
  const w = Math.min(100, Math.max(0.5, (widthPx / Math.max(1, canvasW)) * 100))
  const h = Math.min(100, Math.max(0.5, (heightPx / Math.max(1, canvasH)) * 100))
  const align = layer.align || 'center'
  const left = align === 'center' ? layer.x - w / 2 : align === 'right' ? layer.x - w : layer.x
  return { left, top: layer.y - h / 2, width: w, height: h }
}
