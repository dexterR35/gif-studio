import { describe, it, expect, beforeEach } from 'vitest'
import { createEmptyProjectV2, migrateV1ToV2, resetFeatureFlags, setFeatureFlags } from '../../src/domain/index.js'
import { buildUnifiedLayerList } from '../../src/domain/layers/unified-layer-list.js'
import { createEmptyProject } from '../../src/lib/project-document.js'

describe('buildUnifiedLayerList', () => {
  beforeEach(() => {
    resetFeatureFlags()
    setFeatureFlags({ projectV2: true, unifiedLayers: true })
  })

  it('orders front-first from V2 rootLayerIds and maps cutouts', () => {
    const v1 = createEmptyProject()
    v1.source = { name: 'a.png', width: 32, height: 32, url: null, kind: 'image' }
    v1.elements = [
      { id: 'cut-1', name: 'Cut A', motion: 'None', visible: true, locked: false },
      { id: 'cut-2', name: 'Cut B', motion: 'None', visible: true, locked: false },
    ]
    const { project: v2 } = migrateV1ToV2(v1)
    const rows = buildUnifiedLayerList(v2, v1)
    expect(rows.length).toBeGreaterThanOrEqual(2)
    const names = rows.map((r) => r.name)
    expect(names).toContain('Cut B')
    expect(names).toContain('Cut A')
    // Front of stack listed first among cutouts (cut-2 after cut-1 in array = higher z)
    const iA = rows.findIndex((r) => r.legacyId === 'cut-1' || r.name === 'Cut A')
    const iB = rows.findIndex((r) => r.legacyId === 'cut-2' || r.name === 'Cut B')
    expect(iB).toBeGreaterThanOrEqual(0)
    expect(iA).toBeGreaterThanOrEqual(0)
    expect(iB).toBeLessThan(iA)
  })

  it('returns empty for non-v2', () => {
    expect(buildUnifiedLayerList(createEmptyProject(), {})).toEqual([])
    expect(buildUnifiedLayerList(null, {})).toEqual([])
  })

  it('empty v2 still builds without crash', () => {
    const v2 = createEmptyProjectV2()
    const rows = buildUnifiedLayerList(v2, createEmptyProject())
    expect(Array.isArray(rows)).toBe(true)
  })
})
