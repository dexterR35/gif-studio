export const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0))

/** How many decimal places a control step implies (1 → 0, 0.1 → 1, 0.01 → 2). */
export const decimalsFromStep = (step = 1) => {
  const n = Number(step)
  if (!Number.isFinite(n) || n <= 0 || n >= 1) return 0
  const text = String(n)
  if (text.includes('e-') || text.includes('E-')) {
    return Math.min(6, Math.ceil(-Math.log10(n)))
  }
  const dot = text.indexOf('.')
  return dot === -1 ? 0 : Math.min(6, text.length - dot - 1)
}

/** Round UI numbers so inputs never show 212.75675675765 junk. */
export const nice = (value, decimals = 1) => {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  const places = Math.max(0, Math.min(6, Number(decimals) || 0))
  const factor = 10 ** places
  const rounded = Math.round((n + Number.EPSILON) * factor) / factor
  return Object.is(rounded, -0) ? 0 : rounded
}

export const clampNice = (value, min, max, decimals = 1) =>
  nice(clamp(value, min, max), decimals)

/** Safety cap for canvas width/height (matches Python desktop). */
export const MAX_CANVAS = 8192

/** Source upload limits (matches Python `validate_uploaded_image`). */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024
export const MAX_UPLOAD_DIMENSION = 5000
export const ALLOWED_UPLOAD_TYPES = new Set([
  'image/png', 'image/jpeg', 'image/gif',
  'video/mp4', 'video/webm', 'video/quicktime',
])
export const ALLOWED_UPLOAD_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.mp4', '.webm', '.mov',
])

export const uploadImageError = (file) => {
  if (!file) return 'An image file is required.'
  const name = (file.name || '').toLowerCase()
  const ext = name.includes('.') ? `.${name.split('.').pop()}` : ''
  const typeOk = ALLOWED_UPLOAD_TYPES.has(file.type) || ALLOWED_UPLOAD_EXTENSIONS.has(ext)
  if (!typeOk) return 'Only PNG, JPG, GIF, MP4, and WebM are allowed.'
  if (file.size > MAX_UPLOAD_BYTES) return 'File exceeds the 20 MB upload limit.'
  return null
}

export const fmtBytes = (bytes) =>
  bytes > 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : `${Math.round(bytes / 1024 ** 2)} MB`

export const ease = (t, type) => {
  if (type === 'Linear') return t
  if (type === 'Ease in') return t * t
  if (type === 'Ease out') return 1 - (1 - t) ** 2
  if (type === 'Smoothstep') return t * t * (3 - 2 * t)
  if (type === 'Spring') return 1 - Math.exp(-4.5 * t) * Math.cos(t * Math.PI * 2.5)
  return t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2
}
