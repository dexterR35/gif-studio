/**
 * Runtime handles keyed by assetId. Never put blob URLs in project JSON.
 */

export class RuntimeAssetRegistry {
  constructor() {
    /** @type {Map<string, { handle: unknown, kind: string, byteLength: number, disposed: boolean }>} */
    this._entries = new Map()
  }

  /**
   * @param {string} assetId
   * @param {unknown} handle
   * @param {{ kind?: string, byteLength?: number }} [meta]
   */
  set(assetId, handle, meta = {}) {
    const prev = this._entries.get(assetId)
    if (prev && !prev.disposed) {
      this._disposeHandle(prev.handle)
    }
    this._entries.set(assetId, {
      handle,
      kind: meta.kind || 'unknown',
      byteLength: meta.byteLength ?? 0,
      disposed: false,
    })
  }

  /**
   * @param {string} assetId
   * @returns {unknown|undefined}
   */
  get(assetId) {
    const e = this._entries.get(assetId)
    if (!e || e.disposed) return undefined
    return e.handle
  }

  has(assetId) {
    const e = this._entries.get(assetId)
    return Boolean(e && !e.disposed)
  }

  /**
   * @param {string} assetId
   */
  dispose(assetId) {
    const e = this._entries.get(assetId)
    if (!e || e.disposed) return
    this._disposeHandle(e.handle)
    e.disposed = true
    e.handle = null
    this._entries.delete(assetId)
  }

  disposeAll() {
    for (const id of [...this._entries.keys()]) {
      this.dispose(id)
    }
  }

  /**
   * Approximate resident bytes.
   */
  totalBytes() {
    let sum = 0
    for (const e of this._entries.values()) {
      if (!e.disposed) sum += e.byteLength || 0
    }
    return sum
  }

  ids() {
    return [...this._entries.keys()]
  }

  _disposeHandle(handle) {
    if (!handle) return
    if (typeof handle.close === 'function') {
      try { handle.close() } catch { /* ignore */ }
    }
    if (typeof handle.dispose === 'function') {
      try { handle.dispose() } catch { /* ignore */ }
    }
    // Revoke object URLs only if explicitly tagged — never store them in project JSON
    if (handle && typeof handle === 'object' && handle.__objectUrl) {
      try {
        if (typeof URL !== 'undefined' && URL.revokeObjectURL) {
          URL.revokeObjectURL(handle.__objectUrl)
        }
      } catch { /* ignore */ }
    }
  }
}
