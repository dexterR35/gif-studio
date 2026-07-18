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

export async function loadMediaPipeSegmenter() {
  if (segmenter) return segmenter
  const vision = await FilesetResolver.forVisionTasks(WASM_ROOT)
  segmenter = await ImageSegmenter.createFromOptions(vision, {
    baseOptions: { modelAssetPath: SEGMENT_MODEL, delegate: 'GPU' },
    runningMode: 'IMAGE',
    outputCategoryMask: true,
    outputConfidenceMasks: false,
  })
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

/**
 * Segment humans from an HTMLImageElement or canvas.
 * @returns {{ maskCanvas: HTMLCanvasElement, engine: string }}
 */
export async function segmentHuman(imageLike) {
  const seg = await loadMediaPipeSegmenter()
  const result = seg.segment(imageLike)
  const mask = result.categoryMask
  if (!mask) throw new Error('MediaPipe returned no mask')

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
  ctx.putImageData(imageData, 0, 0)
  mask.close?.()
  return { maskCanvas: canvas, engine: 'mediapipe-selfie' }
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
  if (segment) {
    try {
      const seg = await segmentHuman(imageLike)
      maskCanvas = seg.maskCanvas
    } catch {
      // Pose-only is still useful if segmentation fails.
    }
  }
  return { ...pose, maskCanvas }
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
