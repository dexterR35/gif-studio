/**
 * Short-lived rollout flags.
 * Domain strangler paths default on; heavier runtime flags stay opt-in.
 */

const DEFAULT_FLAGS = Object.freeze({
  unifiedLayers: true,
  commandHistory: true,
  sceneEvaluatorV2: true,
  workerDecode: false,
  taskManagerV2: true,
  serverJobsV2: false,
})

/** @type {Record<string, boolean>} */
let overrides = Object.create(null)

/**
 * @param {Partial<typeof DEFAULT_FLAGS>} [partial]
 */
export function setFeatureFlags(partial = {}) {
  overrides = { ...overrides, ...partial }
}

export function resetFeatureFlags() {
  overrides = Object.create(null)
}

/**
 * @param {keyof typeof DEFAULT_FLAGS} name
 * @returns {boolean}
 */
export function isFeatureEnabled(name) {
  if (Object.prototype.hasOwnProperty.call(overrides, name)) {
    return Boolean(overrides[name])
  }
  return Boolean(DEFAULT_FLAGS[name])
}

/** @returns {Readonly<typeof DEFAULT_FLAGS & Record<string, boolean>>} */
export function getFeatureFlags() {
  return { ...DEFAULT_FLAGS, ...overrides }
}
