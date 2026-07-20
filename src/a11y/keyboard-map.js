/**
 * Documented studio key bindings (Phase 13).
 * Single source for help UI / tests — wiring remains in providers.
 */

/** @typedef {{ key: string, modifiers?: { ctrl?: boolean, meta?: boolean, shift?: boolean, alt?: boolean }, when?: string, description: string }} KeyBinding */

/** @type {Readonly<Record<string, KeyBinding>>} */
export const KEYBOARD_MAP = Object.freeze({
  undo: {
    key: 'z',
    modifiers: { ctrl: true },
    description: 'Undo',
  },
  redo: {
    key: 'z',
    modifiers: { ctrl: true, shift: true },
    description: 'Redo',
  },
  redoAlt: {
    key: 'y',
    modifiers: { ctrl: true },
    description: 'Redo (alternate)',
  },
  escapeCancelTool: {
    key: 'Escape',
    description: 'Cancel active tool / clear selection chrome',
  },
  playPause: {
    key: ' ',
    description: 'Play / pause timeline preview',
  },
  deleteLayer: {
    key: 'Delete',
    description: 'Delete selected layer',
  },
  deleteLayerBackspace: {
    key: 'Backspace',
    description: 'Delete selected layer (alternate)',
  },
})

/**
 * @param {KeyboardEvent | { key: string, ctrlKey?: boolean, metaKey?: boolean, shiftKey?: boolean, altKey?: boolean }} event
 * @param {KeyBinding} binding
 * @returns {boolean}
 */
export function matchesKeyBinding(event, binding) {
  if (!event || !binding) return false
  const key = event.key === 'Spacebar' ? ' ' : event.key
  if (key !== binding.key && key.toLowerCase() !== String(binding.key).toLowerCase()) {
    // Allow Delete vs Del naming
    if (!(binding.key === 'Delete' && (key === 'Del' || key === 'Delete'))) return false
  }
  const m = binding.modifiers || {}
  const ctrlOrMeta = Boolean(event.ctrlKey || event.metaKey)
  if (m.ctrl || m.meta) {
    if (!ctrlOrMeta) return false
  } else if (event.ctrlKey || event.metaKey) {
    return false
  }
  if (Boolean(m.shift) !== Boolean(event.shiftKey)) return false
  if (Boolean(m.alt) !== Boolean(event.altKey)) return false
  return true
}

/** Human-readable list for help panels. */
export function listKeyBindings() {
  return Object.entries(KEYBOARD_MAP).map(([id, b]) => ({
    id,
    ...b,
    chord: formatChord(b),
  }))
}

/**
 * @param {KeyBinding} binding
 */
function formatChord(binding) {
  const parts = []
  const m = binding.modifiers || {}
  if (m.ctrl || m.meta) parts.push('Ctrl/Cmd')
  if (m.shift) parts.push('Shift')
  if (m.alt) parts.push('Alt')
  parts.push(binding.key === ' ' ? 'Space' : binding.key)
  return parts.join('+')
}
