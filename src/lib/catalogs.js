/**
 * Shared UI / product catalogs — single source for option lists.
 */
export const EASING_OPTIONS = [
  'Linear', 'Ease in', 'Ease out', 'Ease in-out', 'Smoothstep', 'Spring',
]

export const FIT_MODES = ['Contain', 'Cover', 'Stretch', 'Original size']

export const QUALITY_PROFILES = ['Low / small', 'Balanced', 'High quality', 'Custom']

export const QUALITY_PROFILE_MAP = {
  'Low / small': { palette: 64, dither: false, lossy: 80, compressionMethod: 'Lossy LZW' },
  Balanced: { palette: 128, dither: true, lossy: 30, compressionMethod: 'Lossy LZW' },
  'High quality': { palette: 256, dither: true, lossy: 0, compressionMethod: 'Lossless' },
}

export const LAYER_MOTION_OPTIONS = [
  'None', 'Float', 'Drift', 'Bounce', 'Pulse', 'Spin', 'Wobble', 'Orbit', 'Pose sway',
]

export const TEXT_ENTRANCE_OPTIONS = [
  'None', 'Fade', 'Slide up', 'Slide down', 'Scale in', 'Typewriter',
]

export const TEXT_LOOP_OPTIONS = [
  'None', 'Float', 'Pulse', 'Wobble',
]

export const TEXT_EXIT_OPTIONS = [
  'None', 'Fade', 'Slide up', 'Slide down', 'Scale out',
]

export const COLOR_FILTER_PRESETS = [
  'None', 'Grayscale', 'Sepia', 'Monochrome', 'Gotham', 'Lomo', 'Nashville', 'Toaster', 'Vignette', 'Polaroid',
]

export const DISTORTION_TYPES = [
  'None', 'Bloat', 'Pucker', 'Twirl', 'Push', 'Swirl', 'Implode', 'Wave',
]

export const HEALTH_TIMEOUT_MS = 1800
