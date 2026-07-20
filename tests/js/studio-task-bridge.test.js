import { describe, it, expect, beforeEach } from 'vitest'
import { resetFeatureFlags, setFeatureFlags } from '../../src/domain/feature-flags.js'
import { runStudioTask, getStudioTaskManager } from '../../src/tasks/studio-task-bridge.js'
import { clearAnalyticsBuffer, getAnalyticsBuffer, trackImportCommitted } from '../../src/observability/analytics.js'

describe('studio-task-bridge', () => {
  beforeEach(() => {
    resetFeatureFlags()
    setFeatureFlags({ taskManagerV2: true })
    clearAnalyticsBuffer()
    getStudioTaskManager().clear()
  })

  it('runs work through TaskManager and resolves result', async () => {
    const result = await runStudioTask({
      kind: 'upscale',
      backend: 'server',
      run: async ({ setProgress }) => {
        setProgress(0.5)
        return { ok: true }
      },
    })
    expect(result).toEqual({ ok: true })
    const tasks = getStudioTaskManager().listTasks()
    expect(tasks.some((t) => t.kind === 'upscale' && t.state === 'succeeded')).toBe(true)
  })

  it('bypasses TaskManager when flag off', async () => {
    setFeatureFlags({ taskManagerV2: false })
    const result = await runStudioTask({
      kind: 'matte',
      run: async () => 42,
    })
    expect(result).toBe(42)
  })

  it('tracks import without denylisted urls', () => {
    trackImportCommitted({ kind: 'gif', frameCount: 3, url: 'blob:http://evil' })
    const buf = getAnalyticsBuffer()
    expect(buf[0].name).toBe('import_committed')
    expect(buf[0].props.url).toBeUndefined()
    expect(buf[0].props.frameCount).toBe(3)
  })
})
