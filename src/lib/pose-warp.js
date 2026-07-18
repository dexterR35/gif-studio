/**
 * Skeleton-driven image warp — rest joints → posed joints.
 * Inverse-distance weighted mesh (CPU) so GIF export matches the preview.
 */

function bilinearSample(data, w, h, x, y) {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const x1 = Math.min(w - 1, x0 + 1)
  const y1 = Math.min(h - 1, y0 + 1)
  const fx = x - x0
  const fy = y - y0
  const i00 = (y0 * w + x0) * 4
  const i10 = (y0 * w + x1) * 4
  const i01 = (y1 * w + x0) * 4
  const i11 = (y1 * w + x1) * 4
  const out = [0, 0, 0, 0]
  for (let c = 0; c < 4; c += 1) {
    const v00 = data[i00 + c]
    const v10 = data[i10 + c]
    const v01 = data[i01 + c]
    const v11 = data[i11 + c]
    out[c] = (
      v00 * (1 - fx) * (1 - fy)
      + v10 * fx * (1 - fy)
      + v01 * (1 - fx) * fy
      + v11 * fx * fy
    )
  }
  return out
}

function displacementAt(x, y, ctrls, power = 2.2) {
  let wsum = 0
  let dx = 0
  let dy = 0
  for (let i = 0; i < ctrls.length; i += 1) {
    const c = ctrls[i]
    const d2 = (x - c.rx) * (x - c.rx) + (y - c.ry) * (y - c.ry) + 4
    const w = 1 / (d2 ** (power / 2))
    wsum += w
    dx += w * c.dx
    dy += w * c.dy
  }
  if (wsum < 1e-8) return { dx: 0, dy: 0 }
  return { dx: dx / wsum, dy: dy / wsum }
}

/**
 * Warp a body cutout bitmap so pixels follow joint motion (arm/hand etc.).
 * @param {HTMLCanvasElement} srcCanvas element bitmap
 * @param {object} opts
 * @returns {HTMLCanvasElement} warped canvas (or src if no motion)
 */
export function warpElementByJoints(srcCanvas, {
  restJoints = [],
  posedJoints = [],
  canvasW = 1,
  canvasH = 1,
  boxX = 0,
  boxY = 0,
  boxW = 1,
  boxH = 1,
} = {}) {
  if (!srcCanvas?.width || !restJoints?.length || !posedJoints?.length) return srcCanvas
  if (!(boxW > 1) || !(boxH > 1)) return srcCanvas

  const W = srcCanvas.width
  const H = srcCanvas.height
  const posedByName = new Map(posedJoints.map((j) => [j.name, j]))
  const ctrls = []
  let maxMove = 0

  for (const rest of restJoints) {
    if ((rest.score ?? 1) < 0.25) continue
    const posed = posedByName.get(rest.name)
    if (!posed) continue
    const rxCanvas = rest.x * canvasW
    const ryCanvas = rest.y * canvasH
    const pxCanvas = posed.x * canvasW
    const pyCanvas = posed.y * canvasH
    // Local pixels inside the element bitmap
    const rx = ((rxCanvas - boxX) / boxW) * W
    const ry = ((ryCanvas - boxY) / boxH) * H
    const px = ((pxCanvas - boxX) / boxW) * W
    const py = ((pyCanvas - boxY) / boxH) * H
    const dx = px - rx
    const dy = py - ry
    const move = Math.hypot(dx, dy)
    if (move < 0.35) continue
    // Keep controls slightly outside the crop too — they still pull the limb.
    if (rx < -W * 0.35 || ry < -H * 0.35 || rx > W * 1.35 || ry > H * 1.35) continue
    maxMove = Math.max(maxMove, move)
    ctrls.push({ rx, ry, dx, dy, name: rest.name })
  }

  if (!ctrls.length || maxMove < 0.6) return srcCanvas

  const srcCtx = srcCanvas.getContext('2d', { willReadFrequently: true })
  const srcData = srcCtx.getImageData(0, 0, W, H).data
  const dest = document.createElement('canvas')
  dest.width = W
  dest.height = H
  const destCtx = dest.getContext('2d')
  const out = destCtx.createImageData(W, H)
  const outData = out.data

  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const { dx, dy } = displacementAt(x, y, ctrls)
      const sx = x - dx
      const sy = y - dy
      const i = (y * W + x) * 4
      if (sx < 0 || sy < 0 || sx >= W - 1 || sy >= H - 1) {
        outData[i + 3] = 0
        continue
      }
      const sample = bilinearSample(srcData, W, H, sx, sy)
      outData[i] = sample[0]
      outData[i + 1] = sample[1]
      outData[i + 2] = sample[2]
      outData[i + 3] = sample[3]
    }
  }

  destCtx.putImageData(out, 0, 0)
  return dest
}

/** True when joint keys produce meaningful motion at this progress. */
export function poseHasWarp(restJoints, posedJoints) {
  if (!restJoints?.length || !posedJoints?.length) return false
  const posedByName = new Map(posedJoints.map((j) => [j.name, j]))
  for (const rest of restJoints) {
    const posed = posedByName.get(rest.name)
    if (!posed) continue
    if (Math.hypot(posed.x - rest.x, posed.y - rest.y) > 0.004) return true
  }
  return false
}
