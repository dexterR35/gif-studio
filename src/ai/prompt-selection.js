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
  const blob = imageBlob || await new Promise((resolve, reject) => {
    imageCanvas.toBlob(
      (value) => (value ? resolve(value) : reject(new Error('Could not read canvas'))),
      'image/png',
    )
  })

  return viaServer(blob, prompt, { confidence, signal })
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
