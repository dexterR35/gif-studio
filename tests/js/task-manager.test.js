import { describe, expect, it } from 'vitest'
import { createTaskManager } from '../../src/tasks/task-manager.js'
import { revisionsEqual } from '../../src/tasks/task-revision.js'
import { resolveRoute, assertNoSilentSwap } from '../../src/tasks/routing-policy.js'
import { buildModelRegistry } from '../../src/tasks/model-registry.js'

function waitFor(predicate, timeoutMs = 1000) {
  const start = Date.now()
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (predicate()) return resolve()
      if (Date.now() - start > timeoutMs) return reject(new Error('timeout'))
      setTimeout(tick, 5)
    }
    tick()
  })
}

describe('task-revision', () => {
  it('compares scalar and object revisions', () => {
    expect(revisionsEqual(3, 3)).toBe(true)
    expect(revisionsEqual(3, 4)).toBe(false)
    expect(revisionsEqual({ id: 'a', version: 1 }, { id: 'a', version: 1 })).toBe(true)
    expect(revisionsEqual({ id: 'a', version: 1 }, { id: 'a', version: 2 })).toBe(false)
  })
})

describe('task-manager', () => {
  it('runs a task to succeeded', async () => {
    const tm = createTaskManager({ initialRevision: 1 })
    const task = tm.createTask({
      kind: 'test',
      sourceRevision: 1,
      run: async ({ setProgress }) => {
        setProgress(0.5)
        return { ok: true }
      },
    })
    await waitFor(() => tm.getTask(task.id)?.state === 'succeeded')
    expect(tm.getTask(task.id).result).toEqual({ ok: true })
    expect(tm.getTask(task.id).progress).toBe(1)
  })

  it('cancels via AbortController', async () => {
    const tm = createTaskManager({ initialRevision: 1 })
    const task = tm.createTask({
      kind: 'slow',
      run: async ({ signal }) => {
        await new Promise((resolve, reject) => {
          const t = setTimeout(resolve, 500)
          signal.addEventListener('abort', () => {
            clearTimeout(t)
            reject(new DOMException('Aborted', 'AbortError'))
          })
        })
        return 'done'
      },
    })
    await waitFor(() => tm.getTask(task.id)?.state === 'running')
    expect(tm.cancelTask(task.id)).toBe(true)
    await waitFor(() => tm.getTask(task.id)?.state === 'cancelled')
  })

  it('marks stale when sourceRevision changes before completion', async () => {
    const tm = createTaskManager({ initialRevision: 1 })
    let release
    const gate = new Promise((r) => {
      release = r
    })
    const task = tm.createTask({
      kind: 'ai',
      sourceRevision: 1,
      getSourceRevision: () => tm.getCurrentRevision(),
      run: async () => {
        await gate
        return { mask: true }
      },
    })
    await waitFor(() => tm.getTask(task.id)?.state === 'running')
    tm.setCurrentRevision(2)
    release()
    await waitFor(() => tm.getTask(task.id)?.state === 'stale')
    expect(tm.getTask(task.id).result).toBe(null)
  })
})

describe('routing-policy', () => {
  it('routes Best and export to local-backend when API available', () => {
    const best = resolveRoute({
      kind: 'matte',
      qualityTier: 'best',
      apiAvailable: true,
    })
    expect(best.target).toBe('local-backend')
    expect(best.degraded).toBe(false)

    const exp = resolveRoute({
      kind: 'export',
      apiAvailable: true,
    })
    expect(exp.target).toBe('local-backend')
  })

  it('never silent-swaps without approval', () => {
    const planned = resolveRoute({
      kind: 'export',
      apiAvailable: false,
      allowBrowserFallback: true,
      userApprovedFallback: false,
    })
    expect(planned.target).toBe('unavailable')
    expect(planned.requiresApproval).toBe(true)
    expect(assertNoSilentSwap(planned, 'offline-encoder').ok).toBe(false)
  })
})

describe('model-registry', () => {
  it('builds structured engines from health', () => {
    const reg = buildModelRegistry({
      status: 'ok',
      rembg: true,
      sam2: false,
      engines: {
        realesrgan: { available: true, qualityTier: 'best', runtime: 'server' },
      },
    })
    expect(reg.apiAvailable).toBe(true)
    const rembg = reg.engines.find((e) => e.id === 'rembg')
    expect(rembg.status).toBe('available')
    const esr = reg.engines.find((e) => e.id === 'realesrgan')
    expect(esr.qualityTier).toBe('best')
    expect(esr.runtime).toBe('server')
  })
})
