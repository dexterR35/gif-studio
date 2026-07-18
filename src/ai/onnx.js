/**
 * ONNX Runtime Web — shared session loader for browser AI models.
 */
import * as ort from 'onnxruntime-web'

ort.env.wasm.numThreads = 1
ort.env.wasm.simd = true

const sessions = new Map()

export async function getOnnxSession(modelUrl, options = {}) {
  if (sessions.has(modelUrl)) return sessions.get(modelUrl)
  const session = await ort.InferenceSession.create(modelUrl, {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
    ...options,
  })
  sessions.set(modelUrl, session)
  return session
}

export async function probeOnnx() {
  try {
    return Boolean(ort)
  } catch {
    return false
  }
}

export function imageDataToFloatTensor(imageData, { size = 1024, normalize = true } = {}) {
  const { width, height, data } = imageData
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  const tmp = document.createElement('canvas')
  tmp.width = width
  tmp.height = height
  tmp.getContext('2d').putImageData(imageData, 0, 0)
  ctx.drawImage(tmp, 0, 0, size, size)
  const resized = ctx.getImageData(0, 0, size, size)
  const float = new Float32Array(3 * size * size)
  for (let i = 0; i < size * size; i += 1) {
    let r = resized.data[i * 4] / 255
    let g = resized.data[i * 4 + 1] / 255
    let b = resized.data[i * 4 + 2] / 255
    if (normalize) {
      r = (r - 0.485) / 0.229
      g = (g - 0.456) / 0.224
      b = (b - 0.406) / 0.225
    }
    float[i] = r
    float[size * size + i] = g
    float[2 * size * size + i] = b
  }
  return new ort.Tensor('float32', float, [1, 3, size, size])
}

export { ort }
