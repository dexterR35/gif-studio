/** Interpolate a property across keyframes (time in seconds). */
export function sampleKeyframes(keyframes, time, prop) {
  const sorted = [...(keyframes || [])]
    .filter((k) => k.prop === prop || k[prop] != null)
    .sort((a, b) => a.time - b.time)
  if (!sorted.length) return undefined
  if (time <= sorted[0].time) return sorted[0].value ?? sorted[0][prop]
  if (time >= sorted[sorted.length - 1].time) {
    const last = sorted[sorted.length - 1]
    return last.value ?? last[prop]
  }
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const a = sorted[i]
    const b = sorted[i + 1]
    if (time >= a.time && time <= b.time) {
      const u = (time - a.time) / Math.max(1e-6, b.time - a.time)
      const av = a.value ?? a[prop]
      const bv = b.value ?? b[prop]
      if (typeof av === 'number' && typeof bv === 'number') return av + (bv - av) * u
      return u < 0.5 ? av : bv
    }
  }
  return undefined
}
