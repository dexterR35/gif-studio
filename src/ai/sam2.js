/**
 * SAM2 (Segment Anything 2) — browser ONNX or server proxy.
 * Set VITE_SAM2_ENCODER / VITE_SAM2_DECODER for local ONNX weights.
 */
import { getOnnxSession, imageDataToFloatTensor, ort } from './onnx'

const ENCODER_URL = import.meta.env.VITE_SAM2_ENCODER || ''
const DECODER_URL = import.meta.env.VITE_SAM2_DECODER || ''

let embeddingCache = null

export function sam2Configured() {
  return Boolean(ENCODER_URL && DECODER_URL)
}

async function viaServer(imageBlob, point, model) {
  const form = new FormData()
  form.append('image', imageBlob, 'frame.png')
  if (point) {
    form.append('point_x', String(point.x))
    form.append('point_y', String(point.y))
  }
  form.append('engine', 'sam2')
  if (model) form.append('model', model)
  const res = await fetch('/api/ai/segment', { method: 'POST', body: form })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

/**
 * Point-prompt segmentation. Falls back to FastAPI when ONNX weights are absent.
 */
export async function segmentWithSam2({ imageCanvas, point, imageBlob, model }) {
  if (!sam2Configured()) {
    const blob = imageBlob || await new Promise((resolve) => {
      imageCanvas.toBlob(resolve, 'image/png')
    })
    return viaServer(blob, point, model)
  }

  const ctx = imageCanvas.getContext('2d', { willReadFrequently: true })
  const imageData = ctx.getImageData(0, 0, imageCanvas.width, imageCanvas.height)
  const encoder = await getOnnxSession(ENCODER_URL)
  const decoder = await getOnnxSession(DECODER_URL)
  const tensor = imageDataToFloatTensor(imageData, { size: 1024 })
  const encoded = await encoder.run({ image: tensor })
  embeddingCache = encoded

  const coords = new Float32Array([
    (point.x / imageCanvas.width) * 1024,
    (point.y / imageCanvas.height) * 1024,
  ])
  const labels = new Float32Array([1])
  const feeds = {
    image_embeddings: encoded.image_embeddings || Object.values(encoded)[0],
    point_coords: new ort.Tensor('float32', coords, [1, 1, 2]),
    point_labels: new ort.Tensor('float32', labels, [1, 1]),
  }
  const out = await decoder.run(feeds)
  const maskTensor = out.masks || Object.values(out)[0]
  return { mask: maskTensor, engine: 'sam2-onnx', embedding: embeddingCache }
}

export async function probeSam2() {
  if (sam2Configured()) return true
  try {
    const res = await fetch('/api/health', { signal: AbortSignal.timeout(1500) })
    if (!res.ok) return false
    const info = await res.json()
    return Boolean(info.sam2)
  } catch {
    return false
  }
}
