/**
 * Undo/redo stack with coalesceKey support and a soft entry budget.
 */

const DEFAULT_MAX_ENTRIES = 100

export class HistoryService {
  /**
   * @param {{ maxEntries?: number }} [opts]
   */
  constructor(opts = {}) {
    this.maxEntries = opts.maxEntries ?? DEFAULT_MAX_ENTRIES
    /** @type {Array<{ command: object, inverse: object, coalesceKey?: string }>} */
    this.undoStack = []
    /** @type {Array<{ command: object, inverse: object, coalesceKey?: string }>} */
    this.redoStack = []
  }

  /**
   * @param {{ command: object, inverse: object, coalesceKey?: string }} entry
   */
  push(entry) {
    const key = entry.coalesceKey ?? entry.command?.coalesceKey
    if (key && this.undoStack.length > 0) {
      const top = this.undoStack[this.undoStack.length - 1]
      if (top.coalesceKey === key) {
        // Keep earliest inverse; replace command with latest
        top.command = entry.command
        this.redoStack = []
        return
      }
    }
    this.undoStack.push({
      command: entry.command,
      inverse: entry.inverse,
      coalesceKey: key,
    })
    if (this.undoStack.length > this.maxEntries) {
      this.undoStack.shift()
    }
    this.redoStack = []
  }

  canUndo() {
    return this.undoStack.length > 0
  }

  canRedo() {
    return this.redoStack.length > 0
  }

  /**
   * @returns {{ command: object, inverse: object }|null}
   */
  popUndo() {
    const entry = this.undoStack.pop()
    if (!entry) return null
    this.redoStack.push(entry)
    return entry
  }

  /**
   * @returns {{ command: object, inverse: object }|null}
   */
  popRedo() {
    const entry = this.redoStack.pop()
    if (!entry) return null
    this.undoStack.push(entry)
    return entry
  }

  clear() {
    this.undoStack = []
    this.redoStack = []
  }
}
