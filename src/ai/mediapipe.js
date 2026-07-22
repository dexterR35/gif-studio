/**
 * MediaPipe — body pose joints (browser). Human cutout/segment removed.
 */
import { PoseLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'
import { POSE_JOINT_NAMES } from '../lib/pose'

let poseLandmarker = null

const WASM_ROOT = import.meta.env.VITE_MEDIAPIPE_WASM
  || 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm'
const POSE_MODEL = import.meta.env.VITE_MEDIAPIPE_POSE_MODEL
  || 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task'

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

/** Pose-only detect (no human cutout). */
export async function detectBodyAndJoints(imageLike) {
  return detectBodyPose(imageLike)
}

export async function probePose() {
  try {
    await loadPoseLandmarker()
    return true
  } catch {
    return false
  }
}

/** @deprecated use probePose — kept for capability probes that expected mediapipe */
export async function probeMediaPipe() {
  return probePose()
}
