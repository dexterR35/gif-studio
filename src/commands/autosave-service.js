/**
 * Debounced JSON snapshot save to localStorage.
 */

export class AutosaveService {
  /**
   * @param {{
   *   storageKey?: string,
   *   debounceMs?: number,
   *   storage?: { getItem(k: string): string|null, setItem(k: string, v: string): void, removeItem?(k: string): void },
   * }} [opts]
   */
  constructor(opts = {}) {
    this.storageKey = opts.storageKey || 'gif-studio:autosave:v2'
    this.debounceMs = opts.debounceMs ?? 500
    this.storage = opts.storage || (typeof localStorage !== 'undefined' ? localStorage : null)
    this._timer = null
    this._pending = null
  }

  /**
   * @param {object} project
   */
  scheduleSave(project) {
    this._pending = project
    if (this._timer) clearTimeout(this._timer)
    this._timer = setTimeout(() => {
      this.flush()
    }, this.debounceMs)
  }

  flush() {
    if (this._timer) {
      clearTimeout(this._timer)
      this._timer = null
    }
    if (!this._pending || !this.storage) return false
    const snapshot = JSON.stringify(this._pending)
    this.storage.setItem(this.storageKey, snapshot)
    this._pending = null
    return true
  }

  /**
   * @returns {object|null}
   */
  load() {
    if (!this.storage) return null
    const raw = this.storage.getItem(this.storageKey)
    if (!raw) return null
    try {
      return JSON.parse(raw)
    } catch {
      return null
    }
  }

  clear() {
    if (this._timer) {
      clearTimeout(this._timer)
      this._timer = null
    }
    this._pending = null
    this.storage?.removeItem?.(this.storageKey)
  }

  dispose() {
    this.flush()
  }
}
