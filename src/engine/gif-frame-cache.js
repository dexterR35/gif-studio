/**
 * Bounded LRU cache for composited GIF frames, keyed by frame index.
 * Evicts by estimated byte size, not frame count alone.
 */

/**
 * Estimate RGBA bytes for a frame (canvas / ImageData / bitmap-like).
 * @param {{ width?: number, height?: number, canvas?: { width: number, height: number }, estimatedBytes?: number }|null} frame
 * @returns {number}
 */
export function estimateFrameBytes(frame) {
  if (!frame) return 0
  if (typeof frame.estimatedBytes === 'number') return Math.max(0, frame.estimatedBytes)
  const w = frame.width ?? frame.canvas?.width ?? frame.dims?.width ?? 0
  const h = frame.height ?? frame.canvas?.height ?? frame.dims?.height ?? 0
  return Math.max(0, w * h * 4)
}

/**
 * @param {{ maxBytes?: number, maxEntries?: number }} [options]
 */
export function createGifFrameCache(options = {}) {
  const maxBytes = options.maxBytes ?? 64 * 1024 * 1024
  const maxEntries = options.maxEntries ?? 256
  /** @type {Map<string|number, { value: unknown, bytes: number }>} */
  const map = new Map()
  let totalBytes = 0

  function touch(key) {
    const entry = map.get(key)
    if (!entry) return
    map.delete(key)
    map.set(key, entry)
  }

  function disposeValue(value) {
    if (!value || typeof value !== 'object') return
    if (typeof value.dispose === 'function') {
      try {
        value.dispose()
      } catch {
        /* ignore */
      }
    }
    if (typeof value.close === 'function') {
      try {
        value.close()
      } catch {
        /* ignore */
      }
    }
    if (value.canvas && typeof value.canvas.width === 'number') {
      try {
        value.canvas.width = 0
        value.canvas.height = 0
      } catch {
        /* ignore */
      }
    }
  }

  function evictOne() {
    const oldest = map.keys().next().value
    if (oldest === undefined) return false
    const entry = map.get(oldest)
    map.delete(oldest)
    if (entry) {
      totalBytes -= entry.bytes
      disposeValue(entry.value)
    }
    return true
  }

  function enforceLimits() {
    while (map.size > maxEntries || totalBytes > maxBytes) {
      if (!evictOne()) break
    }
  }

  return {
    get maxBytes() {
      return maxBytes
    },
    get size() {
      return map.size
    },
    get totalBytes() {
      return totalBytes
    },
    has(key) {
      return map.has(key)
    },
    get(key) {
      if (!map.has(key)) return undefined
      touch(key)
      return map.get(key).value
    },
    /**
     * @param {string|number} key
     * @param {unknown} value
     * @param {number} [bytes]
     */
    set(key, value, bytes) {
      if (map.has(key)) {
        const prev = map.get(key)
        totalBytes -= prev.bytes
        disposeValue(prev.value)
        map.delete(key)
      }
      const est = typeof bytes === 'number' ? bytes : estimateFrameBytes(value)
      map.set(key, { value, bytes: est })
      totalBytes += est
      enforceLimits()
    },
    delete(key) {
      const entry = map.get(key)
      if (!entry) return false
      map.delete(key)
      totalBytes -= entry.bytes
      disposeValue(entry.value)
      return true
    },
    clear() {
      for (const entry of map.values()) {
        disposeValue(entry.value)
      }
      map.clear()
      totalBytes = 0
    },
    /** Release all cached frames (alias for clear). */
    dispose() {
      this.clear()
    },
  }
}
