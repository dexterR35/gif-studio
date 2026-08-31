/** Server-backed LaMa erase inpaint (LaMa required). */
import { postInpaint } from '../api/ai-fetch.js'

async function pngBlob(value, label) {
  if (value instanceof Blob) return value
  if (!value || typeof value.toBlob !== 'function') {
    throw new TypeError(`${label} canvas or blob is required`)
  }
  return new Promise((resolve, reject) => {
    value.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error(`Could not read ${label.toLowerCase()}`))),
      'image/png',
    )
  })
}

/**
 * @param {{
 *   imageCanvas?: HTMLCanvasElement,
 *   imageBlob?: Blob,
 *   maskCanvas?: HTMLCanvasElement,
 *   maskBlob?: Blob,
 *   model?: string,
 *   signal?: AbortSignal,
 * }} opts
 */
export async function inpaintRegion({
  imageCanvas,
  imageBlob,
  maskCanvas,
  maskBlob,
  model = 'big-lama',
  signal,
} = {}) {
  const [plate, mask] = await Promise.all([
    pngBlob(imageBlob || imageCanvas, 'Image'),
    pngBlob(maskBlob || maskCanvas, 'Mask'),
  ])
  const form = new FormData()
  form.append('image', plate, 'plate.png')
  form.append('mask', mask, 'mask.png')
  if (model) form.append('model', model)
  return postInpaint(form, { signal })
}

export async function probeInpaint() {
  const info = await inpaintHealth()
  return Boolean(info?.status === 'ok')
}

async function inpaintHealth() {
  try {
    const res = await fetch('/api/health', { signal: AbortSignal.timeout(1500) })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

/** Alias for {@link inpaintRegion}. */
export const inpaintWithLama = inpaintRegion

/** True when LaMa weights are ready on the local API. */
export async function probeLama() {
  const info = await inpaintHealth()
  return Boolean(info?.status === 'ok' && info.lama)
}
