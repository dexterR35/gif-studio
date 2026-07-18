/**
 * Body pose joints + skeleton — MediaPipe Pose Landmarker (33 points).
 * Coords are normalized 0–1 of the canvas.
 */

export const POSE_JOINT_NAMES = [
  'nose',
  'left_eye_inner', 'left_eye', 'left_eye_outer',
  'right_eye_inner', 'right_eye', 'right_eye_outer',
  'left_ear', 'right_ear',
  'mouth_left', 'mouth_right',
  'left_shoulder', 'right_shoulder',
  'left_elbow', 'right_elbow',
  'left_wrist', 'right_wrist',
  'left_pinky', 'right_pinky',
  'left_index', 'right_index',
  'left_thumb', 'right_thumb',
  'left_hip', 'right_hip',
  'left_knee', 'right_knee',
  'left_ankle', 'right_ankle',
  'left_heel', 'right_heel',
  'left_foot_index', 'right_foot_index',
]

/** Skeleton edges as [fromIndex, toIndex] for drawing. */
export const POSE_BONES = [
  [11, 12], // shoulders
  [11, 13], [13, 15], // left arm
  [12, 14], [14, 16], // right arm
  [11, 23], [12, 24], // torso
  [23, 24], // hips
  [23, 25], [25, 27], // left leg
  [24, 26], [26, 28], // right leg
  [15, 19], [16, 20], // hands (index)
  [27, 31], [28, 32], // feet
  [0, 11], [0, 12], // head to shoulders
]

/** Major joints highlighted in the UI / used for animation. */
export const POSE_KEY_JOINTS = [
  'nose',
  'left_shoulder', 'right_shoulder',
  'left_elbow', 'right_elbow',
  'left_wrist', 'right_wrist',
  'left_hip', 'right_hip',
  'left_knee', 'right_knee',
  'left_ankle', 'right_ankle',
]

export const POSE_RIG_DEFAULT = {
  joints: [],
  /** Frozen bind pose for mesh warp (never overwritten by drag). */
  restJoints: [],
  visible: true,
  driveMotion: true,
  score: 0,
  engine: null,
  /** Opens the joint animation inspector after detect. */
  panelOpen: false,
  selectedJoint: null,
  /**
   * Per-joint clip keys — offsets in normalized canvas units (0–1).
   * Interpolated from start → end across the clip (progress 0–1).
   * { [jointName]: { startDx, startDy, endDx, endDy } }
   */
  jointKeys: {},
  /** Bumps when keys change so warp caches invalidate. */
  keysVersion: 0,
}

/** Ease in-out for production-feeling joint motion. */
export function easeInOutCubic(t) {
  const x = Math.max(0, Math.min(1, t))
  return x < 0.5 ? 4 * x * x * x : 1 - ((-2 * x + 2) ** 3) / 2
}

/** Sample start→end offset for one joint at clip progress (0–1). */
export function sampleJointKey(key, progress = 0) {
  if (!key) return { dx: 0, dy: 0 }
  const u = easeInOutCubic(progress)
  return {
    dx: (key.startDx ?? 0) * (1 - u) + (key.endDx ?? 0) * u,
    dy: (key.startDy ?? 0) * (1 - u) + (key.endDy ?? 0) * u,
  }
}

/** Return joints with keyed offsets applied at clip progress. */
export function applyJointKeys(joints, jointKeys = {}, progress = 0) {
  if (!joints?.length) return joints || []
  return joints.map((j) => {
    const key = jointKeys[j.name]
    if (!key) return j
    const { dx, dy } = sampleJointKey(key, progress)
    if (!dx && !dy) return j
    return {
      ...j,
      x: Math.max(0, Math.min(1, j.x + dx)),
      y: Math.max(0, Math.min(1, j.y + dy)),
    }
  })
}

export function emptyJointKey() {
  return { startDx: 0, startDy: 0, endDx: 0, endDy: 0 }
}

export function jointByName(joints, name) {
  return (joints || []).find((j) => j.name === name) || null
}

export function midpoint(a, b) {
  if (!a || !b) return null
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, score: Math.min(a.score ?? 1, b.score ?? 1) }
}

/** Hip / shoulder centers from a joint list (normalized). */
export function poseCenters(joints) {
  const ls = jointByName(joints, 'left_shoulder')
  const rs = jointByName(joints, 'right_shoulder')
  const lh = jointByName(joints, 'left_hip')
  const rh = jointByName(joints, 'right_hip')
  return {
    shoulder: midpoint(ls, rs),
    hip: midpoint(lh, rh),
    leftShoulder: ls,
    rightShoulder: rs,
    leftHip: lh,
    rightHip: rh,
  }
}

/**
 * Smooth body sway from detected joints.
 * Returns { tx, ty, rotationRad, scale, anchorX, anchorY } in pixel / % terms
 * relative to an element box (x,y,w,h in pixels).
 */
export function samplePoseSway(joints, {
  phase = 0,
  amplitude = 8,
  boxX = 0,
  boxY = 0,
  boxW = 1,
  boxH = 1,
  canvasW = 1,
  canvasH = 1,
} = {}) {
  const { shoulder, hip } = poseCenters(joints)
  const ampX = (amplitude / 100) * canvasW
  const ampY = (amplitude / 100) * canvasH

  // Soft organic motion — not robotic spins.
  const breath = Math.sin(phase) * 0.5 + Math.sin(phase * 0.5) * 0.5
  const sway = Math.sin(phase * 0.85)

  let rotationRad = sway * (amplitude / 100) * 0.18
  let tx = sway * ampX * 0.35
  let ty = breath * ampY * 0.45
  let scale = 1 + breath * (amplitude / 100) * 0.04

  if (shoulder && hip) {
    const dx = (shoulder.x - hip.x) * canvasW
    const dy = (shoulder.y - hip.y) * canvasH
    const lean = Math.atan2(dx, Math.max(8, Math.abs(dy)))
    rotationRad += lean * 0.35 * Math.sin(phase * 0.6)
    tx += Math.sin(phase) * ampX * 0.15
  }

  // Anchor at hip center inside the element box when possible.
  let anchorX = 50
  let anchorY = 62
  if (hip && boxW > 0 && boxH > 0) {
    anchorX = ((hip.x * canvasW - boxX) / boxW) * 100
    anchorY = ((hip.y * canvasH - boxY) / boxH) * 100
    anchorX = Math.max(5, Math.min(95, anchorX))
    anchorY = Math.max(5, Math.min(95, anchorY))
  }

  return { tx, ty, rotationRad, scale, anchorX, anchorY }
}

/** Draw skeleton + joint dots on a 2D context (normalized joints → canvas px). */
export function drawPoseSkeleton(ctx, joints, {
  width,
  height,
  color = '#d8ff3e',
  lineWidth = 2,
  jointRadius = 3.5,
  alpha = 0.92,
  highlight = null,
} = {}) {
  if (!joints?.length || !width || !height) return
  const byIndex = new Map(joints.map((j) => [j.index, j]))
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = lineWidth
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  for (const [a, b] of POSE_BONES) {
    const ja = byIndex.get(a)
    const jb = byIndex.get(b)
    if (!ja || !jb) continue
    if ((ja.score ?? 1) < 0.25 || (jb.score ?? 1) < 0.25) continue
    ctx.beginPath()
    ctx.moveTo(ja.x * width, ja.y * height)
    ctx.lineTo(jb.x * width, jb.y * height)
    ctx.stroke()
  }

  for (const j of joints) {
    if ((j.score ?? 1) < 0.25) continue
    const key = POSE_KEY_JOINTS.includes(j.name)
    const selected = highlight && j.name === highlight
    const r = selected ? jointRadius * 1.55 : key ? jointRadius : jointRadius * 0.65
    ctx.beginPath()
    ctx.arc(j.x * width, j.y * height, r, 0, Math.PI * 2)
    ctx.fillStyle = selected ? '#ffffff' : color
    ctx.fill()
    if (key || selected) {
      ctx.strokeStyle = selected ? color : 'rgba(0,0,0,0.55)'
      ctx.lineWidth = selected ? 2 : 1
      ctx.stroke()
      ctx.strokeStyle = color
      ctx.lineWidth = lineWidth
      ctx.fillStyle = color
    }
  }
  ctx.restore()
}
