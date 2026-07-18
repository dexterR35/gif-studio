/**
 * Grounding DINO — IDEA-Research open-set detection.
 * https://github.com/IDEA-Research/GroundingDINO
 *
 * Prompt tip: separate categories with "." e.g. "chair . person . dog ."
 * Server: official load_model/predict + optional SAM2 refine (Grounded-SAM).
 */
import { getOnnxSession, imageDataToFloatTensor } from './onnx'

const MODEL_URL = import.meta.env.VITE_GROUNDING_DINO_ONNX || ''

export function groundingDinoConfigured() {
  return Boolean(MODEL_URL)
}

async function viaServer(imageBlob, prompt, {
  confidence = 0.35,
  refineSam2 = true,
  engine = 'auto',
  dinoModel,
  sam2Model,
  yoloModel,
} = {}) {
  const form = new FormData()
  form.append('image', imageBlob, 'frame.png')
  form.append('prompt', prompt || '')
  form.append('confidence', String(confidence))
  form.append('refine_sam2', refineSam2 ? 'true' : 'false')
  form.append('engine', engine || 'auto')
  if (dinoModel) form.append('dino_model', dinoModel)
  if (sam2Model) form.append('sam2_model', sam2Model)
  if (yoloModel) form.append('yolo_model', yoloModel)
  const res = await fetch('/api/ai/detect', { method: 'POST', body: form })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

/**
 * Text / class detect — Grounding DINO (open-vocab) or Ultralytics YOLO (COCO).
 * @returns {{ boxes: Array<{x,y,w,h,score,label}>, engine: string, mask_png_base64?: string }}
 */
export async function detectWithGroundingDino({
  imageCanvas,
  prompt,
  imageBlob,
  confidence = 0.35,
  refineSam2 = true,
  engine = 'auto',
  dinoModel,
  sam2Model,
  yoloModel,
}) {
  const blob = imageBlob || await new Promise((resolve, reject) => {
    imageCanvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not read canvas'))), 'image/png')
  })

  // Server path is primary (DINO + YOLO + optional SAM2 refine).
  if (!groundingDinoConfigured() || engine === 'yolo' || engine === 'ultralytics') {
    return viaServer(blob, prompt, {
      confidence, refineSam2, engine, dinoModel, sam2Model, yoloModel,
    })
  }

  const ctx = imageCanvas.getContext('2d', { willReadFrequently: true })
  const imageData = ctx.getImageData(0, 0, imageCanvas.width, imageCanvas.height)
  const session = await getOnnxSession(MODEL_URL)
  const tensor = imageDataToFloatTensor(imageData, { size: 800 })
  // Full tokenizer wiring depends on exported ONNX graph; server path is primary.
  const out = await session.run({ images: tensor })
  return {
    boxes: [],
    raw: out,
    engine: 'grounding-dino-onnx',
    note: 'Use the Python API for text prompts (official IDEA-Research GroundingDINO / HF).',
  }
}

/** Alias — same API; engine selects DINO vs Ultralytics YOLO. */
export const detectObjects = detectWithGroundingDino

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

export async function probeYolo() {
  try {
    const res = await fetch('/api/health', { signal: AbortSignal.timeout(1500) })
    if (!res.ok) return false
    const info = await res.json()
    return Boolean(info.yolo)
  } catch {
    return false
  }
}
