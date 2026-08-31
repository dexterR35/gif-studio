/** Lightweight fallback catalogs used before the local API health check resolves. */

export const UPSCALE_MODELS = [
  { id: 'esrgan', label: 'ESRGAN', ready: false },
  { id: 'realesrgan', label: 'Real-ESRGAN', ready: false },
  { id: 'realesrgan-x2', label: 'Real-ESRGAN x2', ready: false },
  { id: 'a-esrgan', label: 'A-ESRGAN (anime)', ready: false },
]
