/**
 * Unified TaskManager — lifecycle owner for long-running studio operations.
 * States: queued | running | succeeded | failed | cancelled | stale
 */
import { assertRevisionMatch } from './task-revision.js'

/** @typedef {'queued'|'running'|'succeeded'|'failed'|'cancelled'|'stale'} TaskState */

let _seq = 0

/**
 * @param {string} [prefix]
 * @returns {string}
 */
function nextId(prefix = 'task') {
  _seq += 1
  return `${prefix}_${Date.now().toString(36)}_${_seq}`
}

/**
 * @returns {{
 *   createTask: Function,
 *   cancelTask: Function,
 *   getTask: Function,
 *   listTasks: Function,
 *   getCurrentRevision: Function,
 *   setCurrentRevision: Function,
 *   clear: Function,
 * }}
 */
export function createTaskManager(options = {}) {
  /** @type {Map<string, object>} */
  const tasks = new Map()
  let currentRevision = options.initialRevision ?? 0
  const onChange = typeof options.onChange === 'function' ? options.onChange : null

  function emit() {
    onChange?.(listTasks())
  }

  function getCurrentRevision() {
    return currentRevision
  }

  function setCurrentRevision(rev) {
    currentRevision = rev
  }

  /**
   * @param {{
   *   kind: string,
   *   sourceRevision?: unknown,
   *   backend?: 'local'|'browser'|'server',
   *   run: (ctx: { signal: AbortSignal, taskId: string, setProgress: (n:number)=>void }) => Promise<unknown>,
   *   getSourceRevision?: () => unknown,
   * }} spec
   */
  function createTask(spec) {
    if (!spec || typeof spec.run !== 'function') {
      throw new Error('createTask requires a run() function')
    }
    const controller = new AbortController()
    const sourceRevision = spec.sourceRevision ?? currentRevision
    const task = {
      id: nextId(spec.kind || 'op'),
      kind: spec.kind || 'unknown',
      state: /** @type {TaskState} */ ('queued'),
      progress: 0,
      sourceRevision,
      backend: spec.backend || 'local',
      error: null,
      result: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      startedAt: null,
      finishedAt: null,
      controller,
      get signal() {
        return controller.signal
      },
    }
    tasks.set(task.id, task)
    emit()

    const setProgress = (n) => {
      if (task.state !== 'running' && task.state !== 'queued') return
      task.progress = Math.max(0, Math.min(1, Number(n) || 0))
      task.updatedAt = Date.now()
      emit()
    }

    queueMicrotask(async () => {
      if (task.state === 'cancelled') return
      task.state = 'running'
      task.startedAt = Date.now()
      task.updatedAt = task.startedAt
      emit()
      try {
        if (controller.signal.aborted) {
          task.state = 'cancelled'
          task.finishedAt = Date.now()
          task.updatedAt = task.finishedAt
          emit()
          return
        }
        const result = await spec.run({
          signal: controller.signal,
          taskId: task.id,
          setProgress,
        })
        if (controller.signal.aborted || task.state === 'cancelled') {
          task.state = 'cancelled'
          task.finishedAt = Date.now()
          task.updatedAt = task.finishedAt
          emit()
          return
        }
        const live = typeof spec.getSourceRevision === 'function'
          ? spec.getSourceRevision()
          : currentRevision
        const match = assertRevisionMatch(sourceRevision, live)
        if (!match.ok) {
          task.state = 'stale'
          task.error = { code: 'STALE_REVISION', message: match.reason }
          task.result = null
          task.finishedAt = Date.now()
          task.updatedAt = task.finishedAt
          emit()
          return
        }
        task.state = 'succeeded'
        task.result = result
        task.progress = 1
        task.finishedAt = Date.now()
        task.updatedAt = task.finishedAt
        emit()
      } catch (err) {
        if (controller.signal.aborted || (err && err.name === 'AbortError')) {
          task.state = 'cancelled'
          task.error = { code: 'CANCELLED', message: 'Task cancelled' }
        } else {
          task.state = 'failed'
          task.error = {
            code: err?.code || 'TASK_FAILED',
            message: err?.message || String(err),
          }
        }
        task.finishedAt = Date.now()
        task.updatedAt = task.finishedAt
        emit()
      }
    })

    return task
  }

  /**
   * @param {string} taskId
   * @returns {boolean}
   */
  function cancelTask(taskId) {
    const task = tasks.get(taskId)
    if (!task) return false
    if (task.state === 'succeeded' || task.state === 'failed' || task.state === 'stale') {
      return false
    }
    task.state = 'cancelled'
    task.error = { code: 'CANCELLED', message: 'Task cancelled' }
    task.finishedAt = Date.now()
    task.updatedAt = task.finishedAt
    try {
      task.controller.abort()
    } catch {
      /* ignore */
    }
    emit()
    return true
  }

  function getTask(taskId) {
    return tasks.get(taskId) || null
  }

  function listTasks() {
    return Array.from(tasks.values()).map((t) => ({ ...t, signal: t.signal }))
  }

  function clear() {
    for (const t of tasks.values()) {
      if (t.state === 'queued' || t.state === 'running') {
        try {
          t.controller.abort()
        } catch {
          /* ignore */
        }
      }
    }
    tasks.clear()
    emit()
  }

  return {
    createTask,
    cancelTask,
    getTask,
    listTasks,
    getCurrentRevision,
    setCurrentRevision,
    clear,
  }
}

/** Default singleton for app wiring (tests should call createTaskManager). */
export const taskManager = createTaskManager()
