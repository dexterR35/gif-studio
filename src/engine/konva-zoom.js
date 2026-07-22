/**
 * Konva Stage zoom / pan helpers — artboard stays centered & clamped in the viewport.
 * @see https://konvajs.org/docs/sandbox/Zooming_Relative_To_Pointer.html
 */

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

/**
 * Fit artboard into a viewport with padding (centered).
 * @returns {{ scale: number, x: number, y: number, zoomPct: number }}
 */
export function fitArtboard(viewportW, viewportH, artboardW, artboardH, padding = 40) {
  const aw = Math.max(1, artboardW)
  const ah = Math.max(1, artboardH)
  const vw = Math.max(1, viewportW)
  const vh = Math.max(1, viewportH)
  const availableW = Math.max(1, vw - padding * 2)
  const availableH = Math.max(1, vh - padding * 2)
  const scale = clamp(Math.min(availableW / aw, availableH / ah), 0.05, 8)
  const x = (vw - aw * scale) / 2
  const y = (vh - ah * scale) / 2
  return { scale, x, y, zoomPct: Math.round(scale * 100) }
}

/**
 * Clamp stage position so the artboard cannot be panned entirely off the viewport.
 * When the artboard is smaller than the viewport, lock it to center.
 */
export function clampArtboardPan(x, y, scale, viewportW, viewportH, artboardW, artboardH) {
  const s = Math.max(0.05, scale || 1)
  const vw = Math.max(1, viewportW)
  const vh = Math.max(1, viewportH)
  const scaledW = artboardW * s
  const scaledH = artboardH * s

  let nextX = x
  let nextY = y

  if (scaledW <= vw) {
    nextX = (vw - scaledW) / 2
  } else {
    nextX = clamp(x, vw - scaledW, 0)
  }

  if (scaledH <= vh) {
    nextY = (vh - scaledH) / 2
  } else {
    nextY = clamp(y, vh - scaledH, 0)
  }

  return { x: nextX, y: nextY }
}

/**
 * Zoom stage about a pointer, then clamp artboard into the viewport.
 */
export function zoomStageAboutPointer(stage, pointer, newScale, viewportW, viewportH, artboardW, artboardH) {
  if (!stage || !pointer) return null
  const oldScale = stage.scaleX() || 1
  const clamped = clamp(newScale, 0.05, 8)
  const mousePointTo = {
    x: (pointer.x - stage.x()) / oldScale,
    y: (pointer.y - stage.y()) / oldScale,
  }
  stage.scale({ x: clamped, y: clamped })
  let x = pointer.x - mousePointTo.x * clamped
  let y = pointer.y - mousePointTo.y * clamped
  const pos = clampArtboardPan(x, y, clamped, viewportW, viewportH, artboardW, artboardH)
  stage.position(pos)
  stage.batchDraw()
  return { scale: clamped, x: pos.x, y: pos.y, zoomPct: Math.round(clamped * 100) }
}

/**
 * Apply zoom % keeping the artboard center fixed, then clamp into viewport.
 */
export function setStageZoomPct(stage, zoomPct, artboardW, artboardH, viewportW, viewportH) {
  if (!stage) return null
  const next = clamp((Number(zoomPct) || 100) / 100, 0.05, 8)
  const oldScale = stage.scaleX() || 1
  const center = {
    x: stage.x() + (artboardW * oldScale) / 2,
    y: stage.y() + (artboardH * oldScale) / 2,
  }
  stage.scale({ x: next, y: next })
  let x = center.x - (artboardW * next) / 2
  let y = center.y - (artboardH * next) / 2
  const vw = viewportW || stage.width()
  const vh = viewportH || stage.height()
  const pos = clampArtboardPan(x, y, next, vw, vh, artboardW, artboardH)
  stage.position(pos)
  stage.batchDraw()
  return { scale: next, x: pos.x, y: pos.y, zoomPct: Math.round(next * 100) }
}

/** Fit + center artboard in viewport (100% of available space with padding). */
export function applyFitToStage(stage, viewportW, viewportH, artboardW, artboardH, padding = 40) {
  if (!stage) return null
  const f = fitArtboard(viewportW, viewportH, artboardW, artboardH, padding)
  stage.scale({ x: f.scale, y: f.scale })
  stage.position({ x: f.x, y: f.y })
  stage.batchDraw()
  return f
}

/** Reset to fit-centered (not raw 1:1 at origin — that leaves large boards off-screen). */
export function resetStageZoom(stage, viewportW, viewportH, artboardW, artboardH) {
  if (!stage) return null
  if (viewportW && viewportH) {
    return applyFitToStage(stage, viewportW, viewportH, artboardW, artboardH, 40)
  }
  stage.scale({ x: 1, y: 1 })
  stage.position({ x: 0, y: 0 })
  stage.batchDraw()
  return { scale: 1, x: 0, y: 0, zoomPct: 100 }
}

/**
 * Konva dragBoundFunc — keep the node pivot inside the artboard.
 */
export function artboardDragBoundFunc(artboardW, artboardH) {
  return function dragBound(pos) {
    return {
      x: clamp(pos.x, 0, Math.max(0, artboardW)),
      y: clamp(pos.y, 0, Math.max(0, artboardH)),
    }
  }
}
