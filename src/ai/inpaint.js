/** Inpaint — LaMa / OpenCV via /api/ai/inpaint */

export async function inpaintRegion({
  imageCanvas,
  imageBlob,
  maskCanvas,
  maskPngBase64,
  model = 'auto',
}) {
  const blob = imageBlob || await new Promise((resolve, reject) => {
    imageCanvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not read canvas'))), 'image/png')
  })
  const form = new FormData()
  form.append('image', blob, 'frame.png')
  form.append('model', model || 'auto')
  if (maskPngBase64) {
    form.append('mask_png_base64', maskPngBase64)
  } else if (maskCanvas) {
    const maskBlob = await new Promise((resolve, reject) => {
      maskCanvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not read mask'))), 'image/png')
    })
    form.append('mask', maskBlob, 'mask.png')
  }
  const res = await fetch('/api/ai/inpaint', { method: 'POST', body: form })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function probeInpaint() {
  try {
    const res = await fetch('/api/health', { signal: AbortSignal.timeout(1500) })
    if (!res.ok) return false
    const info = await res.json()
    return Boolean(info.inpaint)
  } catch {
    return false
  }
}
