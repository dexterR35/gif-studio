/**
 * MediaPipe — human segmentation + body pose joints (browser).
 */
import { ImageSegmenter, PoseLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'
import { POSE_JOINT_NAMES } from '../lib/pose'

let segmenter = null
let poseLandmarker = null

const WASM_ROOT = import.meta.env.VITE_MEDIAPIPE_WASM
  || 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm'
const SEGMENT_MODEL = import.meta.env.VITE_MEDIAPIPE_MODEL
  || 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite'
const POSE_MODEL = import.meta.env.VITE_MEDIAPIPE_POSE_MODEL
  || 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task'

function segmenterOptions(delegate) {
  return {
    baseOptions: { modelAssetPath: SEGMENT_MODEL, delegate },
    runningMode: 'IMAGE',
    outputCategoryMask: true,
    outputConfidenceMasks: false,
  }
}

export async function loadMediaPipeSegmenter({ forceCpu = false } = {}) {
  if (segmenter && !forceCpu) return segmenter
  if (forceCpu && segmenter) {
    try { segmenter.close?.() } catch { /* ignore */ }
    segmenter = null
  }
  const vision = await FilesetResolver.forVisionTasks(WASM_ROOT)
  if (forceCpu) {
    segmenter = await ImageSegmenter.createFromOptions(vision, segmenterOptions('CPU'))
    return segmenter
  }
  try {
    segmenter = await ImageSegmenter.createFromOptions(vision, segmenterOptions('GPU'))
  } catch {
    // GPU delegate can fail on some machines — retry CPU (same as pose).
    segmenter = await ImageSegmenter.createFromOptions(vision, segmenterOptions('CPU'))
  }
  return segmenter
}

export async function loadPoseLandmarker() {
  if (poseLandmarker) return poseLandmarker
  const vision = await FilesetResolver.forVisionTasks(WASM_ROOT)
  try {
    poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: POSE_MODEL, delegate: 'GPU' },
      runningMode: 'IMAGE',
      numPoses: 1,
      minPoseDetectionConfidence: 0.4,
      minPosePresenceConfidence: 0.4,
      minTrackingConfidence: 0.4,
    })
  } catch {
    // GPU delegate can fail on some machines — retry CPU.
    poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: POSE_MODEL, delegate: 'CPU' },
      runningMode: 'IMAGE',
      numPoses: 1,
      minPoseDetectionConfidence: 0.4,
      minPosePresenceConfidence: 0.4,
      minTrackingConfidence: 0.4,
    })
  }
  return poseLandmarker
}

/** Count how many confident joints land on “person” (R > 24) in a mask ImageData. */
export function countJointMaskHits(imageData, width, height, joints = []) {
  const samples = joints.filter((j) => (j.score ?? 1) >= 0.35)
  let hits = 0
  for (const j of samples) {
    const x = Math.min(width - 1, Math.max(0, Math.round(j.x * width)))
    const y = Math.min(height - 1, Math.max(0, Math.round(j.y * height)))
    if (imageData.data[(y * width + x) * 4] > 24) hits += 1
  }
  return { hits, samples: samples.length }
}

function invertMaskImageData(imageData) {
  const { data } = imageData
  for (let i = 0; i < data.length; i += 4) {
    const v = data[i] > 24 ? 0 : 255
    data[i] = v
    data[i + 1] = v
    data[i + 2] = v
  }
}

function maskForegroundRatio(imageData) {
  const { data } = imageData
  let fg = 0
  const n = data.length / 4
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] > 24) fg += 1
  }
  return n ? fg / n : 0
}

function scorePersonMask(imageData, width, height, joints) {
  const ratio = maskForegroundRatio(imageData)
  if (ratio < 0.001 || ratio > 0.995) {
    return { score: 0, ratio }
  }
  if (joints?.length) {
    const { hits, samples } = countJointMaskHits(imageData, width, height, joints)
    if (samples >= 3) return { score: hits / samples, ratio }
  }
  // Typical portrait: person is a minority of the frame.
  if (ratio > 0.02 && ratio < 0.85) return { score: 0.55, ratio }
  return { score: 0.2, ratio }
}

/** Build a binary person mask canvas from a MediaPipe category mask (or null if unusable). */
function maskCanvasFromCategory(mask, joints) {
  const { width, height } = mask
  const data = mask.getAsUint8Array()
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  const imageData = ctx.createImageData(width, height)
  for (let i = 0; i < data.length; i += 1) {
    const v = data[i] > 0 ? 255 : 0
    imageData.data[i * 4] = v
    imageData.data[i * 4 + 1] = v
    imageData.data[i * 4 + 2] = v
    imageData.data[i * 4 + 3] = 255
  }

  // Selfie segmenter is usually 0=bg / >0=person, but some builds invert.
  // Keep the polarity that best matches pose joints (or a sane FG ratio).
  const normal = scorePersonMask(imageData, width, height, joints)
  invertMaskImageData(imageData)
  const flipped = scorePersonMask(imageData, width, height, joints)
  let inverted = true
  if (normal.score >= flipped.score) {
    invertMaskImageData(imageData) // revert to normal
    inverted = false
  }
  const best = inverted ? flipped : normal
  if (best.score < 0.35 || best.ratio < 0.001) {
    return null
  }

  ctx.putImageData(imageData, 0, 0)
  return {
    maskCanvas: canvas,
    engine: inverted ? 'mediapipe-selfie-inv' : 'mediapipe-selfie',
  }
}

/**
 * Segment humans from an HTMLImageElement or canvas.
 * @param {HTMLImageElement|HTMLCanvasElement|ImageBitmap} imageLike
 * @param {{ joints?: Array<{x:number,y:number,score?:number}> }} [opts]
 * @returns {{ maskCanvas: HTMLCanvasElement, engine: string }}
 */
export async function segmentHuman(imageLike, { joints = null } = {}) {
  const seg = await loadMediaPipeSegmenter()
  const result = seg.segment(imageLike)
  const mask = result.categoryMask
  if (!mask) throw new Error('MediaPipe returned no mask')

  let built = maskCanvasFromCategory(mask, joints)
  mask.close?.()
  if (built) return built

  // GPU path sometimes yields an empty/useless mask — rebuild on CPU once.
  const cpuSeg = await loadMediaPipeSegmenter({ forceCpu: true })
  const retry = cpuSeg.segment(imageLike)
  const retryMask = retry.categoryMask
  if (!retryMask) throw new Error('MediaPipe returned no mask')
  built = maskCanvasFromCategory(retryMask, joints)
  retryMask.close?.()
  if (!built) {
    throw new Error('Body mask was empty — try Human segment or another photo')
  }
  return built
}

/**
 * Detect body pose landmarks (joints) on an image/canvas.
 * @returns {{ joints: Array<{index,name,x,y,score}>, score: number, engine: string }}
 */
export async function detectBodyPose(imageLike) {
  const landmarker = await loadPoseLandmarker()
  const result = landmarker.detect(imageLike)
  const pose = result.landmarks?.[0]
  if (!pose?.length) {
    throw new Error('No body detected — try a clearer full-body or upper-body photo')
  }
  const world = result.worldLandmarks?.[0] || []
  const joints = pose.map((pt, index) => ({
    index,
    name: POSE_JOINT_NAMES[index] || `joint_${index}`,
    x: pt.x,
    y: pt.y,
    z: pt.z ?? 0,
    score: typeof pt.visibility === 'number'
      ? pt.visibility
      : (typeof world[index]?.visibility === 'number' ? world[index].visibility : 1),
  }))
  const avg = joints.reduce((s, j) => s + (j.score || 0), 0) / Math.max(1, joints.length)
  return {
    joints,
    score: avg,
    engine: 'mediapipe-pose-lite',
  }
}

/**
 * Detect pose + optional human cutout mask in one click.
 */
export async function detectBodyAndJoints(imageLike, { segment = true } = {}) {
  const pose = await detectBodyPose(imageLike)
  let maskCanvas = null
  let segmentError = null
  if (segment) {
    try {
      const seg = await segmentHuman(imageLike, { joints: pose.joints })
      maskCanvas = seg.maskCanvas
    } catch (err) {
      // Pose-only is still useful if segmentation fails — caller should surface this.
      segmentError = err?.message || 'Body cutout failed'
    }
  }
  return { ...pose, maskCanvas, segmentError }
}

export async function probeMediaPipe() {
  try {
    await loadMediaPipeSegmenter()
    return true
  } catch {
    return false
  }
}

export async function probePose() {
  try {
    await loadPoseLandmarker()
    return true
  } catch {
    return false
  }
}
