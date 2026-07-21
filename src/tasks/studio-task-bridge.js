/**
 * Shared TaskManager + analytics hooks for StudioProvider strangler.
 */
import { createTaskManager } from './task-manager.js'
import { isFeatureEnabled } from '../domain/feature-flags.js'
import {
  trackImportCommitted,
  trackCutoutApplied,
  trackExportSucceeded,
} from '../observability/analytics.js'
import { projectRevision } from '../domain/project/revision.js'
import { useStudioStore } from '../store/studio-store.js'

export { trackImportCommitted, trackCutoutApplied, trackExportSucceeded }

/** @type {ReturnType<typeof createTaskManager> | null} */
let manager = null

export function getStudioTaskManager() {
  if (!manager) {
    manager = createTaskManager({
      initialRevision: 0,
    })
  }
  return manager
}

export function syncTaskRevisionFromStore() {
  const state = useStudioStore.getState()
  const doc = state.project
  const rev = projectRevision(doc || {})
  getStudioTaskManager().setCurrentRevision(rev)
  return rev
}

/**
 * Run work through TaskManager when taskManagerV2 is on; otherwise run directly.
 * @param {{
 *   kind: string,
 *   backend?: 'local'|'browser'|'server',
 *   run: (ctx: { signal: AbortSignal, setProgress: (n:number)=>void }) => Promise<unknown>,
 * }} spec
 */
export async function runStudioTask(spec) {
  if (!isFeatureEnabled('taskManagerV2')) {
    return spec.run({
      signal: new AbortController().signal,
      setProgress: () => {},
    })
  }
  const tm = getStudioTaskManager()
  const sourceRevision = syncTaskRevisionFromStore()
  const task = tm.createTask({
    kind: spec.kind,
    backend: spec.backend || 'local',
    sourceRevision,
    getSourceRevision: () => syncTaskRevisionFromStore(),
    run: ({ signal, setProgress }) => spec.run({ signal, setProgress }),
  })
  // Wait until terminal state
  return new Promise((resolve, reject) => {
    const check = () => {
      const t = tm.getTask(task.id)
      if (!t) {
        reject(new Error('Task missing'))
        return
      }
      if (t.state === 'succeeded') {
        resolve(t.result)
        return
      }
      if (t.state === 'failed') {
        reject(t.error || new Error('Task failed'))
        return
      }
      if (t.state === 'cancelled' || t.state === 'stale') {
        reject(Object.assign(new Error(t.state), { code: t.state.toUpperCase() }))
        return
      }
      setTimeout(check, 16)
    }
    check()
  })
}
