import { describe, it, expect, beforeEach } from 'vitest'
import { createLegacyImportFixture } from '../../src/lib/project-document.js'
import {
  createEmptyProjectV2,
  validateProjectV2,
  migrateV1ToV2,
  projectRevision,
  resetFeatureFlags,
} from '../../src/domain/index.js'

describe('ProjectDocumentV2', () => {
  beforeEach(() => {
    resetFeatureFlags()
  })

  it('empty v2 validates', () => {
    const doc = createEmptyProjectV2({ name: 'Test', projectSeed: 'seed-fixed' })
    const result = validateProjectV2(doc)
    expect(result.ok).toBe(true)
    expect(result.project.schemaVersion).toBe(2)
    expect(result.project.timeline.durationUs).toBeGreaterThan(0)
  })

  it('legacy import migrates to v2 with backup note', () => {
    const legacy = createLegacyImportFixture()
    legacy.name = 'Legacy'
    legacy.settings = { ...legacy.settings, width: 320, height: 200, duration: 2, fps: 12 }
    legacy.source = {
      storageKey: 'fixtures/static_opaque.png',
      mimeType: 'image/png',
      width: 320,
      height: 200,
      byteLength: 100,
      checksumSha256: 'abc',
    }
    legacy.enhancedLayer = {
      storageKey: 'fixtures/enhanced.png',
      mimeType: 'image/png',
      width: 640,
      height: 400,
      byteLength: 200,
      checksumSha256: 'def',
    }
    legacy.censor = { enabled: true, x: 10, y: 10, w: 20, h: 20, pixelSize: 8 }
    legacy.textLayers = [{
      id: 't1',
      text: 'Hello',
      font: 'Arial',
      size: 24,
      x: 50,
      y: 50,
      opacity: 100,
    }]

    const { project, backup, notes, warnings } = migrateV1ToV2(legacy)
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

  it('migrates cutouts with live canvas bitmaps without wiping layers', () => {
    const fakeCanvas = Object.assign(Object.create(null), {
      width: 8,
      height: 8,
      getContext() { return null },
      toDataURL() { return 'data:image/png;base64,xx' },
    })

    const legacy = createLegacyImportFixture()
    legacy.source = {
      name: 'shot.png',
      width: 64,
      height: 48,
      url: 'blob:http://localhost/abc',
      kind: 'image',
    }
    legacy.elements = [{
      id: 'cut-lasso-1',
      name: 'Lasso cut',
      x: 4,
      y: 4,
      w: 8,
      h: 8,
      motion: 'None',
      visible: true,
      locked: false,
      bitmap: fakeCanvas,
      sourceBitmap: fakeCanvas,
      maskCanvas: fakeCanvas,
      cleanup: fakeCanvas,
    }]

    const originalClone = globalThis.structuredClone?.bind(globalThis)
    globalThis.structuredClone = (value) => {
      const walk = (v, seen = new Set()) => {
        if (v == null || typeof v !== 'object') return
        if (seen.has(v)) return
        seen.add(v)
        if (v === fakeCanvas) {
          throw new DOMException('Canvas cannot be cloned', 'DataCloneError')
        }
        if (Array.isArray(v)) v.forEach((item) => walk(item, seen))
        else Object.values(v).forEach((item) => walk(item, seen))
      }
      walk(value)
      return originalClone ? originalClone(value) : JSON.parse(JSON.stringify(value))
    }

    try {
      const { project, backup } = migrateV1ToV2(legacy)
      expect(project.schemaVersion).toBe(2)
      expect(project.layers['layer-background']).toBeTruthy()
      expect(project.layers['cut-lasso-1']).toBeTruthy()
      expect(project.layers['cut-lasso-1'].name).toBe('Lasso cut')
      expect(project.rootLayerIds).toEqual(expect.arrayContaining(['layer-background', 'cut-lasso-1']))
      expect(backup.elements?.[0]?.bitmap).toBeUndefined()
      expect(validateProjectV2(project).ok).toBe(true)
    } finally {
      if (originalClone) globalThis.structuredClone = originalClone
      else delete globalThis.structuredClone
    }
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
