/**
 * Disable controls when a capability is not ready, with a reason string (Phase 13).
 */

/**
 * @param {Record<string, unknown> | null | undefined} capabilities
 * @param {string} capabilityKey
 * @param {string} [label]
 * @returns {{ ready: boolean, disabled: boolean, reason: string }}
 */
export function capabilityControlState(capabilities, capabilityKey, label) {
  const name = label || capabilityKey
  if (!capabilities || typeof capabilities !== 'object') {
    return {
      ready: false,
      disabled: true,
      reason: `${name} unavailable — capabilities not loaded`,
    }
  }
  const value = capabilities[capabilityKey]
  const ready = Boolean(value)
  if (ready) {
    return { ready: true, disabled: false, reason: '' }
  }

  // Special cases with clearer copy
  if (capabilityKey === 'api' || capabilityKey === 'rembg' || capabilityKey === 'sam2') {
    return {
      ready: false,
      disabled: true,
      reason: `${name} requires the local FastAPI backend (npm run api)`,
    }
  }

  return {
    ready: false,
    disabled: true,
    reason: `${name} is not ready on this device`,
  }
}

/**
 * Props suitable for spreading onto a button/control.
 * @param {Record<string, unknown> | null | undefined} capabilities
 * @param {string} capabilityKey
 * @param {string} [label]
 * @returns {{ disabled: boolean, 'aria-disabled': boolean, title: string, 'aria-label'?: string }}
 */
export function capabilityButtonProps(capabilities, capabilityKey, label) {
  const state = capabilityControlState(capabilities, capabilityKey, label)
  /** @type {{ disabled: boolean, 'aria-disabled': boolean, title: string, 'aria-label'?: string }} */
  const props = {
    disabled: state.disabled,
    'aria-disabled': state.disabled,
    title: state.ready ? (label || capabilityKey) : state.reason,
  }
  if (!state.ready && label) {
    props['aria-label'] = `${label} (unavailable)`
  }
  return props
}

/**
 * Combine multiple capability requirements (all must be ready).
 * @param {Record<string, unknown> | null | undefined} capabilities
 * @param {string[]} keys
 * @param {string} [label]
 */
export function requireCapabilities(capabilities, keys, label) {
  for (const key of keys) {
    const state = capabilityControlState(capabilities, key, label || key)
    if (!state.ready) return state
  }
  return { ready: true, disabled: false, reason: '' }
}
