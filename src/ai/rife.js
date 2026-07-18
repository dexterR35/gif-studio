/**
 * RIFE frame interpolation — primarily a server/Celery job (heavy models).
 * Optional ONNX path when VITE_RIFE_ONNX is set.
 */
import { getOnnxSession } from './onnx'

const MODEL_URL = import.meta.env.VITE_RIFE_ONNX || ''

export function rifeConfigured() {
  return Boolean(MODEL_URL)
}

/**
 * Insert mid-frames between PNG blobs.
 * @param {Blob[]} frames
 * @param {{ factor?: number }} opts  factor=2 → one mid frame between each pair
 */
export async function interpolateFrames(frames, { factor = 2, onProgress } = {}) {
  if (frames.length < 2) return frames

  const form = new FormData()
  frames.forEach((f, i) => form.append('frames', f, `frame_${i}.png`))
  form.append('factor', String(factor))
  const res = await fetch('/api/ai/interpolate', { method: 'POST', body: form })
  if (!res.ok) throw new Error(await res.text())
  const data = await res.json()
  onProgress?.(1)
  if (data.job_id) return { jobId: data.job_id, engine: data.engine || 'rife-celery' }
  return {
    frames: data.frames || [],
    engine: data.engine || 'rife',
  }
}

export async function probeRife() {
  if (rifeConfigured()) {
    try {
      await getOnnxSession(MODEL_URL)
      return true
    } catch {
      return false
    }
  }
  try {
    const res = await fetch('/api/health', { signal: AbortSignal.timeout(1500) })
    if (!res.ok) return false
    const info = await res.json()
    return Boolean(info.rife)
  } catch {
    return false
  }
}
