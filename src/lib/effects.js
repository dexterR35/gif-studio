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

export const presetFilter = (preset) => ({
  Gotham: 'grayscale(.25) contrast(1.35) brightness(.9) saturate(.8)',
  Lomo: 'contrast(1.3) saturate(1.35) brightness(.95)',
  Nashville: 'sepia(.25) contrast(1.15) brightness(1.08) saturate(1.15)',
  Toaster: 'sepia(.35) contrast(1.25) saturate(1.4) brightness(.95)',
  Polaroid: 'sepia(.18) contrast(1.08) brightness(1.1) saturate(.85)',
  Grayscale: 'grayscale(1)', Sepia: 'sepia(1)', Monochrome: 'grayscale(1) contrast(1.8)',
}[preset] || 'none')

export const convolveCanvas = (canvas, kernel, mix = 1) => {
  const context = canvas.getContext('2d', { willReadFrequently: true }), width = canvas.width, height = canvas.height
  const source = context.getImageData(0, 0, width, height), output = context.createImageData(width, height), side = Math.sqrt(kernel.length), half = Math.floor(side / 2)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const target = (y * width + x) * 4
    for (let channel = 0; channel < 3; channel++) {
      let value = 0
      for (let ky = 0; ky < side; ky++) for (let kx = 0; kx < side; kx++) {
        const sx = Math.max(0, Math.min(width - 1, x + kx - half)), sy = Math.max(0, Math.min(height - 1, y + ky - half))
        value += source.data[(sy * width + sx) * 4 + channel] * kernel[ky * side + kx]
      }
      output.data[target + channel] = source.data[target + channel] * (1 - mix) + value * mix
    }
    output.data[target + 3] = source.data[target + 3]
  }
  context.putImageData(output, 0, 0)
}

/**
 * Photoshop-like liquify / warp. Options:
 *   type, amount (0–100), x/y (%), radius (% of min side), angle (Push direction °)
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

export const applyPixelEffects = (canvas, effects) => {
  if (!effects) return canvas
  const context = canvas.getContext('2d', { willReadFrequently: true }), width = canvas.width, height = canvas.height
  if (effects.distortion !== 'None' && effects.distortionAmount > 0) {
    applyDistortion(canvas, {
      type: effects.distortion === 'Implode' ? 'ImplodeLegacy' : effects.distortion,
      amount: effects.distortionAmount,
      x: effects.distortX ?? 50,
      y: effects.distortY ?? 50,
      radius: effects.distortRadius ?? 100,
      angle: effects.distortAngle ?? 0,
    })
  }
  const pixels = context.getImageData(0, 0, width, height), data = pixels.data
  const tint = [parseInt(effects.tintColor.slice(1, 3), 16), parseInt(effects.tintColor.slice(3, 5), 16), parseInt(effects.tintColor.slice(5, 7), 16)]
  const key = [parseInt(effects.transparentColor.slice(1, 3), 16), parseInt(effects.transparentColor.slice(3, 5), 16), parseInt(effects.transparentColor.slice(5, 7), 16)]
  const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i], g = data[i + 1], b = data[i + 2]
    if (effects.invert) { const amount = effects.invert / 100; r += (255 - 2 * r) * amount; g += (255 - 2 * g) * amount; b += (255 - 2 * b) * amount }
    if (effects.tint) { const amount = effects.tint / 100; r = r * (1 - amount) + tint[0] * amount; g = g * (1 - amount) + tint[1] * amount; b = b * (1 - amount) + tint[2] * amount }
    if (effects.posterize) { const levels = Math.max(2, Math.round(16 - effects.posterize / 7)); r = Math.round(r / 255 * (levels - 1)) * 255 / (levels - 1); g = Math.round(g / 255 * (levels - 1)) * 255 / (levels - 1); b = Math.round(b / 255 * (levels - 1)) * 255 / (levels - 1) }
    if (effects.solarize) { const threshold = 255 - effects.solarize * 2.2; if (r > threshold) r = 255 - r; if (g > threshold) g = 255 - g; if (b > threshold) b = 255 - b }
    if (effects.noise) { const noise = (Math.sin(i * 12.9898) * 43758.5453 % 1 - .5) * effects.noise * 2; r += noise; g += noise; b += noise }
    if (effects.dither === 'Ordered') { const p = (i / 4), x = p % width, y = Math.floor(p / width), threshold = (bayer[(y % 4) * 4 + (x % 4)] / 16 - .5) * 32; r += threshold; g += threshold; b += threshold }
    if (effects.transparentEnabled) { const distance = Math.hypot(r - key[0], g - key[1], b - key[2]); if (distance <= effects.fuzz * 4.42) data[i + 3] = 0; else if (distance <= (effects.fuzz + effects.edgeCleanup) * 4.42) data[i + 3] *= (distance - effects.fuzz * 4.42) / Math.max(1, effects.edgeCleanup * 4.42) }
    data[i] = r; data[i + 1] = g; data[i + 2] = b
  }
  context.putImageData(pixels, 0, 0)
  if (effects.dither === 'Error diffusion') {
    const palette = []
    for (let r = 0; r < 4; r++) for (let g = 0; g < 4; g++) for (let b = 0; b < 4; b++) palette.push([r * 85, g * 85, b * 85])
    const dithered = ditherToPalette(context.getImageData(0, 0, width, height).data, width, height, palette)
    context.putImageData(new ImageData(dithered, width, height), 0, 0)
  }
  if (effects.sharpen) convolveCanvas(canvas, [0, -1, 0, -1, 5, -1, 0, -1, 0], effects.sharpen / 100)
  if (effects.emboss) convolveCanvas(canvas, [-2, -1, 0, -1, 1, 1, 0, 1, 2], effects.emboss / 100)
  if (effects.oilPaint) {
    const copy = document.createElement('canvas'); copy.width = width; copy.height = height; copy.getContext('2d').drawImage(canvas, 0, 0)
    context.clearRect(0, 0, width, height); context.filter = `blur(${effects.oilPaint / 35}px) contrast(${1 + effects.oilPaint / 120}) saturate(${1 + effects.oilPaint / 160})`; context.drawImage(copy, 0, 0); context.filter = 'none'
  }
  return canvas
}
