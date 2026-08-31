/**
 * Prompt-assisted selection through the fixed local backend pipeline.
 * The browser sends only image data, a prompt, and a confidence threshold.
 */

async function viaServer(imageBlob, prompt, { confidence = 0.35, signal } = {}) {
  const form = new FormData()
  form.append('image', imageBlob, 'image.png')
  form.append('prompt', prompt || '')
  form.append('confidence', String(confidence))

  const response = await fetch('/api/ai/detect', {
    method: 'POST',
    body: form,
    signal,
  })
  if (!response.ok) {
    if (response.status === 503) throw new Error('Local selection service unavailable')
    if (response.status === 422) throw new Error('Check the image and text prompt')
    throw new Error('Local selection failed')
  }
  return response.json()
}

async function pointViaServer(imageBlob, x, y, { signal } = {}) {
  const form = new FormData()
  form.append('image', imageBlob, 'image.png')
  form.append('x', String(x))
  form.append('y', String(y))

  const response = await fetch('/api/ai/point-cut', {
    method: 'POST',
    body: form,
    signal,
  })
  if (!response.ok) {
    if (response.status === 503) throw new Error('Local point-cut service unavailable')
    if (response.status === 422) throw new Error('Click inside an object on the image')
    throw new Error('Point cut failed')
  }
  return response.json()
}

function canvasPngBlob(imageCanvas) {
  return new Promise((resolve, reject) => {
    imageCanvas.toBlob(
      (value) => (value ? resolve(value) : reject(new Error('Could not read canvas'))),
      'image/png',
    )
  })
}

/**
 * @returns {{
 *   boxes: Array<{x,y,w,h,score,label}>,
 *   engine: string,
 *   mask_png_base64?: string,
 *   cutout_png_base64?: string,
 *   rect?: {x,y,width,height},
 *   pipeline?: string,
 * }}
 */
export async function selectByPrompt({
  imageCanvas,
  prompt,
  imageBlob,
  confidence = 0.35,
  signal,
}) {
  const blob = imageBlob || await canvasPngBlob(imageCanvas)

  return viaServer(blob, prompt, { confidence, signal })
}

/** Cut the object beneath one normalized canvas-space click. */
export async function selectAtPoint({
  imageCanvas,
  imageBlob,
  point,
  canvasWidth = imageCanvas?.width,
  canvasHeight = imageCanvas?.height,
  signal,
}) {
  const width = Number(canvasWidth)
  const height = Number(canvasHeight)
  const nx = Number(point?.x)
  const ny = Number(point?.y)
  if (!Number.isFinite(nx) || !Number.isFinite(ny) || nx < 0 || nx > 1 || ny < 0 || ny > 1) {
    throw new Error('Click is outside the image canvas')
  }
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
    throw new Error('Canvas size is unavailable')
  }
  const x = Math.min(width - 1, Math.max(0, nx * width))
  const y = Math.min(height - 1, Math.max(0, ny * height))
  const blob = imageBlob || await canvasPngBlob(imageCanvas)
  return pointViaServer(blob, Number(x.toFixed(3)), Number(y.toFixed(3)), { signal })
}

export async function probePromptSelection() {
  try {
    const response = await fetch('/api/health', { signal: AbortSignal.timeout(1500) })
    if (!response.ok) return false
    const info = await response.json()
    return Boolean(info.prompt_selection)
  } catch {
    return false
  }
}
