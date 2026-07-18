/**
 * RealESRGAN upscaling — ONNX in-browser or FastAPI/Celery job.
 */
import { getOnnxSession, imageDataToFloatTensor, ort } from './onnx'

const MODEL_URL = import.meta.env.VITE_REALESRGAN_ONNX || ''

export function realesrganConfigured() {
  return Boolean(MODEL_URL)
}

async function viaServer(imageBlob, scale = 2) {
  const form = new FormData()
  form.append('image', imageBlob, 'frame.png')
  form.append('scale', String(scale))
  const res = await fetch('/api/ai/upscale', { method: 'POST', body: form })
  if (!res.ok) throw new Error(await res.text())
  if (res.headers.get('content-type')?.includes('json')) {
    const data = await res.json()
    if (data.job_id && !data.storage_key) {
      throw new Error('Upscale job queued — async polling is not wired yet. Run without Celery for sync results.')
    }
    if (data.storage_key || data.url) {
      throw new Error('Upscale returned a storage key; use sync upscale (async_job=false).')
    }
    throw new Error(data.detail || 'Upscale failed')
  }
  const blob = await res.blob()
  const engine = res.headers.get('X-Upscale-Engine') || 'realesrgan-server'
  return { blob, url: URL.createObjectURL(blob), engine }
}

/** Convert ONNX float tensor NCHW → PNG blob URL. */
async function tensorToPngUrl(tensor, fallbackW, fallbackH) {
  const dims = tensor.dims || []
  let c = 3
  let h = fallbackH
  let w = fallbackW
  if (dims.length === 4) {
    c = dims[1]
    h = dims[2]
    w = dims[3]
  } else if (dims.length === 3) {
    c = dims[0]
    h = dims[1]
    w = dims[2]
  }
  const data = tensor.data
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  const imageData = ctx.createImageData(w, h)
  const plane = w * h
  const maxSample = Math.max(...Array.from({ length: Math.min(64, data.length) }, (_, i) => Math.abs(data[i])))
  const scale = maxSample > 1.5 ? 1 : 255
  for (let i = 0; i < plane; i += 1) {
    const r = data[i] * scale
    const g = (c > 1 ? data[plane + i] : data[i]) * scale
    const b = (c > 2 ? data[2 * plane + i] : data[i]) * scale
    imageData.data[i * 4] = Math.max(0, Math.min(255, Math.round(r)))
    imageData.data[i * 4 + 1] = Math.max(0, Math.min(255, Math.round(g)))
    imageData.data[i * 4 + 2] = Math.max(0, Math.min(255, Math.round(b)))
    imageData.data[i * 4 + 3] = 255
  }
  ctx.putImageData(imageData, 0, 0)
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode upscaled image'))), 'image/png')
  })
  return { blob, url: URL.createObjectURL(blob) }
}

export async function upscaleWithRealESRGAN({ imageCanvas, imageBlob, scale = 2 }) {
  const blob = imageBlob || await new Promise((resolve, reject) => {
    imageCanvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not read canvas'))), 'image/png')
  })
  if (!realesrganConfigured()) return viaServer(blob, scale)

  const ctx = imageCanvas.getContext('2d', { willReadFrequently: true })
  const imageData = ctx.getImageData(0, 0, imageCanvas.width, imageCanvas.height)
  const session = await getOnnxSession(MODEL_URL)
  const input = imageDataToFloatTensor(imageData, {
    size: Math.max(imageCanvas.width, imageCanvas.height),
    normalize: false,
  })
  const out = await session.run({ input })
  const tensor = out.output || Object.values(out)[0]
  if (!tensor?.data) {
    throw new Error('RealESRGAN ONNX returned no tensor — check VITE_REALESRGAN_ONNX or use the server path')
  }
  const png = await tensorToPngUrl(tensor, imageCanvas.width * scale, imageCanvas.height * scale)
  return { ...png, tensor, engine: 'realesrgan-onnx', ort }
}

export async function probeRealESRGAN() {
  if (realesrganConfigured()) return true
  try {
    const res = await fetch('/api/health', { signal: AbortSignal.timeout(1500) })
    if (!res.ok) return false
    const info = await res.json()
    return Boolean(info.realesrgan)
  } catch {
    return false
  }
}
