import { describe, it, expect, beforeEach } from 'vitest'
import { createEmptyProject } from '../../src/lib/project-document.js'
import {
  createEmptyProjectV2,
  validateProjectV2,
  migrateV1ToV2,
  projectRevision,
  resetFeatureFlags,
  setFeatureFlags,
  isFeatureEnabled,
} from '../../src/domain/index.js'

describe('ProjectDocumentV2', () => {
  beforeEach(() => {
    resetFeatureFlags()
  })

  it('feature flags default projectV2 on for new domain paths', () => {
    expect(isFeatureEnabled('projectV2')).toBe(true)
    setFeatureFlags({ projectV2: false })
    expect(isFeatureEnabled('projectV2')).toBe(false)
    setFeatureFlags({ projectV2: true })
    expect(isFeatureEnabled('projectV2')).toBe(true)
  })

  it('empty v2 validates', () => {
    const doc = createEmptyProjectV2({ name: 'Test', projectSeed: 'seed-fixed' })
    const result = validateProjectV2(doc)
    expect(result.ok).toBe(true)
    expect(result.project.schemaVersion).toBe(2)
    expect(result.project.timeline.durationUs).toBeGreaterThan(0)
  })

  it('v1 migrates to v2 with backup note', () => {
    const v1 = createEmptyProject()
    v1.name = 'Legacy'
    v1.settings = { ...v1.settings, width: 320, height: 200, duration: 2, fps: 12 }
    v1.source = {
      storageKey: 'fixtures/static_opaque.png',
      mimeType: 'image/png',
      width: 320,
      height: 200,
      byteLength: 100,
      checksumSha256: 'abc',
    }
    v1.enhancedLayer = {
      storageKey: 'fixtures/enhanced.png',
      mimeType: 'image/png',
      width: 640,
      height: 400,
      byteLength: 200,
      checksumSha256: 'def',
    }
    v1.censor = { enabled: true, x: 10, y: 10, w: 20, h: 20, pixelSize: 8 }
    v1.textLayers = [{
      id: 't1',
      text: 'Hello',
      font: 'Arial',
      size: 24,
      x: 50,
      y: 50,
      opacity: 100,
    }]

    const { project, backup, notes, warnings } = migrateV1ToV2(v1)
    expect(backup.schemaVersion).toBe(1)
    expect(notes.some((n) => n.includes('backup'))).toBe(true)
    expect(project.schemaVersion).toBe(2)
    expect(project.layers['layer-background']).toBeTruthy()
    expect(project.layers['layer-background'].assetId).toBe('asset-enhanced')
    expect(project.layers['layer-background'].rollbackAssetId).toBe('asset-source')
    expect(project.layers['layer-pixelate-censor']?.type).toBe('pixelate')
    expect(project.layers.t1?.type).toBe('text')
    expect(Array.isArray(warnings)).toBe(true)

    const v = validateProjectV2(project)
    expect(v.ok).toBe(true)
  })

  it('serialize hydrate round-trip preserves revision', () => {
    const doc = createEmptyProjectV2({ projectSeed: 'round-trip' })
    doc.assets['a1'] = {
      id: 'a1',
      kind: 'image',
      mimeType: 'image/png',
      checksumSha256: '00',
      byteLength: 4,
      storageKey: 'mem:a1',
      width: 2,
      height: 2,
    }
    doc.layers['l1'] = {
      id: 'l1',
      type: 'raster',
      name: 'R',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'source-over',
      transform: {
        x: 0, y: 0, scaleX: 1, scaleY: 1, rotationDeg: 0, anchorX: 0.5, anchorY: 0.5,
      },
      effects: [],
      animationTrackIds: [],
      assetId: 'a1',
      cutoutMotion: 'None',
    }
    doc.rootLayerIds = ['l1']

    const rev1 = projectRevision(doc)
    const json = JSON.stringify(doc)
    const hydrated = JSON.parse(json)
    const rev2 = projectRevision(hydrated)
    expect(rev1).toBe(rev2)
    expect(validateProjectV2(hydrated).ok).toBe(true)
  })
})
