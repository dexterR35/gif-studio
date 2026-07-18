/**
 * OpenCV.js image filters — lazy-loaded (@techstark/opencv-js).
 * Once loaded, sync helpers run inside the draw loop without awaiting.
 */
let cvPromise = null
let cvReady = false

export async function loadOpenCV() {
  if (typeof window !== 'undefined' && window.cv?.Mat) {
    cvReady = true
    return window.cv
  }
  if (!cvPromise) {
    cvPromise = import('@techstark/opencv-js').then((mod) => {
      const cv = mod.default || mod
      if (cv.Mat) {
        window.cv = cv
        cvReady = true
        return cv
      }
      return new Promise((resolve) => {
        cv.onRuntimeInitialized = () => {
          window.cv = cv
          cvReady = true
          resolve(cv)
        }
      })
    })
  }
  return cvPromise
}

export function isOpenCVReady() {
  return cvReady && Boolean(window.cv?.Mat)
}

/** Fire-and-forget warm-up for Edit / draw pipeline. */
export function warmOpenCV() {
  loadOpenCV().catch(() => {})
}

function canvasToMat(cv, canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  return cv.matFromImageData(imageData)
}

function matToCanvas(cv, mat, canvas) {
  const img = new cv.Mat()
  try {
    if (mat.type() === cv.CV_8UC1) cv.cvtColor(mat, img, cv.COLOR_GRAY2RGBA)
    else if (mat.type() === cv.CV_8UC3) cv.cvtColor(mat, img, cv.COLOR_RGB2RGBA)
    else if (mat.channels() === 4) mat.copyTo(img)
    else mat.copyTo(img)
    cv.imshow(canvas, img)
  } finally {
    img.delete()
  }
}

/**
 * Apply OpenCV-backed blur / sharpen / gray from studio effect amounts.
 * @returns {boolean} true if OpenCV handled at least one filter
 */
export function applyOpenCVEffectsSync(canvas, effects = {}) {
  if (!isOpenCVReady() || !effects) return false
  const cv = window.cv
  let handled = false
  const src = canvasToMat(cv, canvas)
  let current = src

  try {
    if (effects.blur > 0) {
      const dst = new cv.Mat()
      const k = Math.max(1, Math.round(effects.blur / 8) * 2 + 1)
      cv.GaussianBlur(current, dst, new cv.Size(k, k), 0)
      if (current !== src) current.delete()
      current = dst
      handled = true
    }
    if (effects.sharpen > 0) {
      const dst = new cv.Mat()
      const amount = 1 + effects.sharpen / 50
      const kernel = cv.matFromArray(3, 3, cv.CV_32F, [
        0, -1, 0, -1, 4 + amount, -1, 0, -1, 0,
      ])
      cv.filter2D(current, dst, -1, kernel)
      kernel.delete()
      if (current !== src) current.delete()
      current = dst
      handled = true
    }
    if (effects.preset === 'Grayscale' || effects.preset === 'Monochrome') {
      const gray = new cv.Mat()
      const rgba = new cv.Mat()
      cv.cvtColor(current, gray, cv.COLOR_RGBA2GRAY)
      cv.cvtColor(gray, rgba, cv.COLOR_GRAY2RGBA)
      gray.delete()
      if (current !== src) current.delete()
      current = rgba
      handled = true
    }
    if (handled) matToCanvas(cv, current, canvas)
  } finally {
    if (current !== src) current.delete()
    src.delete()
  }
  return handled
}

export async function applyOpenCVFilter(sourceCanvas, filter, amount = 50, target = sourceCanvas) {
  const cv = await loadOpenCV()
  const effects = {}
  if (filter === 'blur') effects.blur = amount
  if (filter === 'sharpen') effects.sharpen = amount
  if (filter === 'gray') effects.preset = 'Grayscale'
  applyOpenCVEffectsSync(sourceCanvas, effects)
  if (target !== sourceCanvas) {
    target.width = sourceCanvas.width
    target.height = sourceCanvas.height
    target.getContext('2d').drawImage(sourceCanvas, 0, 0)
  }
  return target
}

export async function probeOpenCV() {
  try {
    await loadOpenCV()
    return true
  } catch {
    return false
  }
}

// Expose for optional consumers / debugging
if (typeof window !== 'undefined') {
  window.__gifStudioOpenCV = { applyOpenCVEffectsSync, isOpenCVReady, loadOpenCV, warmOpenCV }
}

