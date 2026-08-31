/** Build an editable white mask whose alpha comes from an RGBA bitmap. */
export function alphaMaskRgba(rgba) {
  const output = new Uint8ClampedArray(rgba.length)
  for (let index = 0; index < rgba.length; index += 4) {
    output[index] = 255
    output[index + 1] = 255
    output[index + 2] = 255
    output[index + 3] = rgba[index + 3]
  }
  return output
}

/**
 * Convert a visible black/white mask to white pixels with coverage in alpha.
 * Alpha-only masks are supported when their RGB channels contain no signal.
 */
export function visibleMaskRgba(rgba) {
  const output = new Uint8ClampedArray(rgba.length)
  let hasVisibleCoverage = false
  let minAlpha = 255
  let maxAlpha = 0

  for (let index = 0; index < rgba.length; index += 4) {
    const sourceAlpha = rgba[index + 3]
    const luminance = 0.299 * rgba[index] + 0.587 * rgba[index + 1] + 0.114 * rgba[index + 2]
    const coverage = Math.round(luminance * sourceAlpha / 255)
    output[index] = 255
    output[index + 1] = 255
    output[index + 2] = 255
    output[index + 3] = coverage
    if (coverage > 0) hasVisibleCoverage = true
    minAlpha = Math.min(minAlpha, sourceAlpha)
    maxAlpha = Math.max(maxAlpha, sourceAlpha)
  }

  if (!hasVisibleCoverage && minAlpha !== maxAlpha) {
    for (let index = 0; index < rgba.length; index += 4) {
      output[index + 3] = rgba[index + 3]
    }
  }
  return output
}
