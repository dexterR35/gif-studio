/**
 * Fixed Real-ESRGAN ×2 / ×4 client. Inference always runs on the local API.
 * Size and RAM caps (5k, 20 GiB) are enforced by the Python runner.
 */

const SUPPORTED_SCALES = new Set([2, 4])

function normalizeScale(scale) {
  const value = Number(scale)
  if (!Number.isInteger(value) || !SUPPORTED_SCALES.has(value)) {
    throw new Error('Real-ESRGAN scale must be 2 or 4.')
  }
  return value
}

async function canvasToBlob(canvas) {
  if (!canvas) throw new Error('Could not read canvas')
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not read canvas'))),
      'image/png',
    )
  })
}

async function viaServer(imageBlob, scale) {
  const form = new FormData()
  form.append('image', imageBlob, 'image.png')
  form.append('scale', String(scale))
  const response = await fetch('/api/ai/upscale', { method: 'POST', body: form })
  if (!response.ok) {
    const contentType = response.headers.get('content-type') || ''
    if (contentType.includes('json')) {
      const data = await response.json()
      throw new Error(data.detail || 'Upscale failed')
    }
    throw new Error(await response.text() || 'Upscale failed')
  }
  const blob = await response.blob()
  const engine = response.headers.get('X-Upscale-Engine') || `realesrgan-x${scale}-server`
  return { blob, url: URL.createObjectURL(blob), engine }
}

export async function upscaleWithRealESRGAN({
  imageCanvas,
  imageBlob,
  scale = 2,
}) {
  const normalizedScale = normalizeScale(scale)
  const blob = imageBlob || await canvasToBlob(imageCanvas)
  return viaServer(blob, normalizedScale)
}

export async function probeRealESRGAN() {
  try {
    const response = await fetch('/api/health', { signal: AbortSignal.timeout(1500) })
    if (!response.ok) return false
    const info = await response.json()
    return Boolean(info.realesrgan)
  } catch {
    return false
  }
}
