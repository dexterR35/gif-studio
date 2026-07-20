/** Soft matte — BiRefNet / RMBG / rembg via /api/ai/matte */
import { postMatte } from '../api/ai-fetch.js'

export async function matteWithModel({ imageCanvas, imageBlob, model = 'rembg-isnet', signal } = {}) {
  const blob = imageBlob || await new Promise((resolve, reject) => {
    imageCanvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not read canvas'))), 'image/png')
  })
  const form = new FormData()
  form.append('image', blob, 'frame.png')
  if (model) form.append('model', model)
  return postMatte(form, { signal })
}

export async function probeMatte() {
  try {
    const res = await fetch('/api/health', { signal: AbortSignal.timeout(1500) })
    if (!res.ok) return false
    const info = await res.json()
    return Boolean(info.matte || info.rembg)
  } catch {
    return false
  }
}
