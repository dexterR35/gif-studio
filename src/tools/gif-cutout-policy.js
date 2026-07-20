/**
 * GIF cutout policy (MEGA / Phase 5): static snapshot only, clearly labeled.
 */

export const GIF_CUTOUT_MODE = Object.freeze({
  STATIC_SNAPSHOT: 'static-snapshot',
})

export const GIF_CUTOUT_LABEL = 'Static snapshot only'
export const GIF_CUTOUT_HELP =
  'Cutouts from animated GIFs use a single frame snapshot. Temporal cutouts are not available in P0.'

/**
 * @param {{ kind?: string, frameCount?: number, animated?: boolean }|null|undefined} assetMeta
 * @returns {boolean}
 */
export function isAnimatedSource(assetMeta) {
  if (!assetMeta) return false
  if (assetMeta.animated === true) return true
  if (assetMeta.kind === 'animated-image') return true
  if (Number(assetMeta.frameCount) > 1) return true
  return false
}

/**
 * Policy decision for cutout from a source asset.
 * @param {object|null|undefined} assetMeta
 * @returns {{ allowed: boolean, mode: string, label: string, help: string }}
 */
export function resolveGifCutoutPolicy(assetMeta) {
  if (!isAnimatedSource(assetMeta)) {
    return {
      allowed: true,
      mode: 'still',
      label: 'Still image',
      help: 'Full-resolution still cutout.',
    }
  }
  return {
    allowed: true,
    mode: GIF_CUTOUT_MODE.STATIC_SNAPSHOT,
    label: GIF_CUTOUT_LABEL,
    help: GIF_CUTOUT_HELP,
  }
}

/**
 * UI badge / aria label helpers.
 * @param {object|null|undefined} assetMeta
 */
export function gifCutoutBadgeText(assetMeta) {
  const policy = resolveGifCutoutPolicy(assetMeta)
  return policy.mode === GIF_CUTOUT_MODE.STATIC_SNAPSHOT ? policy.label : null
}
