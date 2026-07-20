import { HistoryService } from './history-service.js'

/**
 * Command bus: execute / undo / redo against an in-memory document.
 */
export class CommandBus {
  /**
   * @param {{
   *   document: object,
   *   history?: HistoryService,
   *   onChange?: (doc: object, meta: object) => void,
   * }} opts
   */
  constructor(opts) {
    this.document = opts.document
    this.history = opts.history || new HistoryService()
    this.onChange = opts.onChange || null
  }

  getDocument() {
    return this.document
  }

  /**
   * @param {{ id: string, label: string, coalesceKey?: string, execute: Function }} command
   */
  execute(command) {
    const result = command.execute(this.document)
    this.document = result.document
    this.history.push({
      command,
      inverse: result.inverse,
      coalesceKey: command.coalesceKey,
    })
    this.onChange?.(this.document, { type: 'execute', command, result })
    return result
  }

  undo() {
    const entry = this.history.popUndo()
    if (!entry) return null
    const result = entry.inverse.execute(this.document)
    this.document = result.document
    // Keep redo stack's forward command; inverse of undo becomes new forward via history service
    this.onChange?.(this.document, { type: 'undo', entry, result })
    return result
  }

  redo() {
    const entry = this.history.popRedo()
    if (!entry) return null
    const result = entry.command.execute(this.document)
    this.document = result.document
    this.onChange?.(this.document, { type: 'redo', entry, result })
    return result
  }

  canUndo() {
    return this.history.canUndo()
  }

  canRedo() {
    return this.history.canRedo()
  }
}
