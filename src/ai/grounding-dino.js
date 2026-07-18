/**
 * Grounding DINO — text-guided object detection.
 * Prefer server (PyTorch) when VITE_GROUNDING_DINO_ONNX is unset.
 */
import { getOnnxSession, imageDataToFloatTensor } from './onnx'

const MODEL_URL = import.meta.env.VITE_GROUNDING_DINO_ONNX || ''

export function groundingDinoConfigured() {
  return Boolean(MODEL_URL)
}

async function viaServer(imageBlob, prompt) {
  const form = new FormData()
  form.append('image', imageBlob, 'frame.png')
  form.append('prompt', prompt)
  const res = await fetch('/api/ai/detect', { method: 'POST', body: form })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

/**
 * @returns {{ boxes: Array<{x,y,w,h,score,label}>, engine: string }}
 */
export async function detectWithGroundingDino({ imageCanvas, prompt, imageBlob }) {
  const blob = imageBlob || await new Promise((resolve) => {
    imageCanvas.toBlob(resolve, 'image/png')
  })

  if (!groundingDinoConfigured()) {
    return viaServer(blob, prompt)
  }

  const ctx = imageCanvas.getContext('2d', { willReadFrequently: true })
  const imageData = ctx.getImageData(0, 0, imageCanvas.width, imageCanvas.height)
  const session = await getOnnxSession(MODEL_URL)
  const tensor = imageDataToFloatTensor(imageData, { size: 800 })
  // Full tokenizer wiring depends on exported ONNX graph; server path is primary.
  const out = await session.run({ images: tensor })
  return { boxes: [], raw: out, engine: 'grounding-dino-onnx', note: 'Use server for text prompts until tokenizer is bundled.' }
}

export async function probeGroundingDino() {
  if (groundingDinoConfigured()) return true
  try {
    const res = await fetch('/api/health', { signal: AbortSignal.timeout(1500) })
    if (!res.ok) return false
    const info = await res.json()
    return Boolean(info.grounding_dino)
  } catch {
    return false
  }
}
