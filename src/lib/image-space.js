/**
 * Normalized width/height of the base image on the artboard (1 = full board).
 * Original size keeps native pixels; Contain / Cover / Stretch scale to the board.
 */
export function fittedImageNorm(fit, sourceW, sourceH, canvasW, canvasH) {
  const iw = Math.max(1, Number(sourceW) || 1)
  const ih = Math.max(1, Number(sourceH) || 1)
  const cw = Math.max(1, Number(canvasW) || 1)
  const ch = Math.max(1, Number(canvasH) || 1)
  if (fit === 'Stretch') return { w: 1, h: 1 }
  if (fit === 'Original size') return { w: iw / cw, h: ih / ch }
  const contain = Math.min(cw / iw, ch / ih)
  const cover = Math.max(cw / iw, ch / ih)
  const base = fit === 'Cover' ? cover : contain
  return { w: (iw * base) / cw, h: (ih * base) / ch }
}

/**
 * Return an affine matrix that maps artboard pixels into source-image pixels.
 * The transform mirrors the base Konva image node, including its canvas anchor,
 * rotation, and flips.
 */
export function sourceFromStageMatrix({
  box,
  stageWidth,
  stageHeight,
  sourceWidth,
  sourceHeight,
  anchorX = 50,
  anchorY = 50,
  flipX = false,
  flipY = false,
}) {
  const safeBox = box || { x: 0, y: 0, w: 1, h: 1, rotation: 0 }
  const nodeWidth = Math.max(1, safeBox.w * stageWidth)
  const nodeHeight = Math.max(1, safeBox.h * stageHeight)
  const pivotX = (anchorX / 100) * stageWidth
  const pivotY = (anchorY / 100) * stageHeight
  const offsetX = pivotX - safeBox.x * stageWidth
  const offsetY = pivotY - safeBox.y * stageHeight
  const radians = -(safeBox.rotation || 0) * Math.PI / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  const directionX = flipX ? -1 : 1
  const directionY = flipY ? -1 : 1
  const scaleX = sourceWidth / nodeWidth
  const scaleY = sourceHeight / nodeHeight
  return [
    directionX * cos * scaleX,
    directionY * sin * scaleY,
    -directionX * sin * scaleX,
    directionY * cos * scaleY,
    (offsetX - directionX * cos * pivotX + directionX * sin * pivotY) * scaleX,
    (offsetY - directionY * sin * pivotX - directionY * cos * pivotY) * scaleY,
  ]
}

export function transformPoint(matrix, point) {
  return {
    x: matrix[0] * point.x + matrix[2] * point.y + matrix[4],
    y: matrix[1] * point.x + matrix[3] * point.y + matrix[5],
  }
}

/** Crop a normalized rectangle by pixel bounds from its associated bitmap. */
export function cropRectByPixelBounds(rect, bounds) {
  const width = Math.max(1, bounds.w)
  const height = Math.max(1, bounds.h)
  return {
    x: rect.x + (bounds.minX / width) * rect.w,
    y: rect.y + (bounds.minY / height) * rect.h,
    w: (bounds.nw / width) * rect.w,
    h: (bounds.nh / height) * rect.h,
  }
}
