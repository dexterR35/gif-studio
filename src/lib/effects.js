/** Quantize RGBA to a palette with Floyd–Steinberg dithering (GIF export). */
export const ditherToPalette = (rgba, width, height, palette) => {
  const output = new Uint8ClampedArray(rgba), cache = new Map()
  const nearest = (r, g, b) => {
    const key = (r >> 3) << 10 | (g >> 3) << 5 | (b >> 3)
    if (cache.has(key)) return cache.get(key)
    let best = 0, bestDistance = Infinity
    for (let i = 0; i < palette.length; i++) {
      const color = palette[i], dr = r - color[0], dg = g - color[1], db = b - color[2]
      const distance = dr * dr * .30 + dg * dg * .59 + db * db * .11
      if (distance < bestDistance) { bestDistance = distance; best = i }
    }
    cache.set(key, best); return best
  }
  const spread = (x, y, er, eg, eb, factor) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return
    const index = (y * width + x) * 4
    if (output[index + 3] < 128) return
    output[index] += er * factor; output[index + 1] += eg * factor; output[index + 2] += eb * factor
  }
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const index = (y * width + x) * 4
    if (output[index + 3] < 128) continue
    const oldR = output[index], oldG = output[index + 1], oldB = output[index + 2]
    const color = palette[nearest(oldR, oldG, oldB)]
    output[index] = color[0]; output[index + 1] = color[1]; output[index + 2] = color[2]
    const er = oldR - color[0], eg = oldG - color[1], eb = oldB - color[2]
    spread(x + 1, y, er, eg, eb, 7 / 16); spread(x - 1, y + 1, er, eg, eb, 3 / 16)
    spread(x, y + 1, er, eg, eb, 5 / 16); spread(x + 1, y + 1, er, eg, eb, 1 / 16)
  }
  return output
}

/**
 * Photoshop-like liquify / warp for Motion timeline clips.
 * Options: type, amount (0–100), x/y (%), radius (% of min side), angle (Push direction °)
 */
export const applyDistortion = (canvas, {
  type = 'None',
  amount = 0,
  x = 50,
  y = 50,
  radius = 50,
  angle = 0,
  phase = 0,
} = {}) => {
  if (!type || type === 'None' || !(amount > 0)) return canvas
  const context = canvas.getContext('2d', { willReadFrequently: true })
  const width = canvas.width
  const height = canvas.height
  const source = document.createElement('canvas')
  source.width = width
  source.height = height
  source.getContext('2d').drawImage(canvas, 0, 0)
  const original = source.getContext('2d').getImageData(0, 0, width, height)
  const output = context.createImageData(width, height)
  const cx = (x / 100) * width
  const cy = (y / 100) * height
  const brush = Math.max(4, (Math.min(width, height) * Math.max(5, radius)) / 100)
  const maxRadius = Math.hypot(Math.max(cx, width - cx), Math.max(cy, height - cy))
  const strength = amount / 100
  const pushRad = (angle * Math.PI) / 180
  const pushX = Math.cos(pushRad)
  const pushY = Math.sin(pushRad)
  const spin = (angle * Math.PI) / 180

  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      let sx = px
      let sy = py
      const dx = px - cx
      const dy = py - cy
      const dist = Math.hypot(dx, dy)
      const falloff = dist < brush ? 1 - (dist / brush) ** 2 : 0

      if (type === 'Swirl') {
        const r = Math.hypot(dx, dy)
        let a = Math.atan2(dy, dx)
        a -= (strength * 3 + spin * 0.35) * (1 - Math.min(1, r / maxRadius))
        sx = cx + Math.cos(a) * r
        sy = cy + Math.sin(a) * r
      } else if (type === 'Implode' || type === 'Pucker') {
        if (falloff > 0) {
          const mapped = dist * (1 + strength * 1.6 * falloff)
          const a = Math.atan2(dy, dx)
          sx = cx + Math.cos(a) * mapped
          sy = cy + Math.sin(a) * mapped
        }
      } else if (type === 'Bloat') {
        if (falloff > 0) {
          const mapped = dist * Math.max(0.05, 1 - strength * 0.85 * falloff)
          const a = Math.atan2(dy, dx)
          sx = cx + Math.cos(a) * mapped
          sy = cy + Math.sin(a) * mapped
        }
      } else if (type === 'Twirl') {
        if (falloff > 0) {
          const a = Math.atan2(dy, dx) - (strength * 4.2 + spin) * falloff
          sx = cx + Math.cos(a) * dist
          sy = cy + Math.sin(a) * dist
        }
      } else if (type === 'Push') {
        if (falloff > 0) {
          const shift = strength * brush * 0.55 * falloff
          sx = px - pushX * shift
          sy = py - pushY * shift
        }
      } else if (type === 'Wave') {
        const wavelength = Math.max(4, 24 - strength * 18)
        sx -= Math.sin(py / wavelength + phase) * strength * 24
        sy -= Math.cos(px / (wavelength * 1.35) + phase * 0.85) * strength * 10
      } else if (type === 'ImplodeLegacy') {
        const mapped = maxRadius * Math.pow(Math.min(1, dist / maxRadius), 1 + strength * 2)
        const a = Math.atan2(dy, dx)
        sx = cx + Math.cos(a) * mapped
        sy = cy + Math.sin(a) * mapped
      }

      const sourceIndex = (
        Math.max(0, Math.min(height - 1, Math.round(sy))) * width
        + Math.max(0, Math.min(width - 1, Math.round(sx)))
      ) * 4
      const targetIndex = (py * width + px) * 4
      output.data[targetIndex] = original.data[sourceIndex]
      output.data[targetIndex + 1] = original.data[sourceIndex + 1]
      output.data[targetIndex + 2] = original.data[sourceIndex + 2]
      output.data[targetIndex + 3] = original.data[sourceIndex + 3]
    }
  }
  context.putImageData(output, 0, 0)
  return canvas
}
