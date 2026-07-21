import { describe, it, expect, beforeEach } from 'vitest'
import {
  createEmptyProjectV2,
  migrateV1ToV2,
  applyElementsToProjectV2,
  applyOverlaysToProjectV2,
  applyTextLayersToProjectV2,
  projectToEditorView,
  resetFeatureFlags,
} from '../../src/domain/index.js'
import { createLegacyImportFixture } from '../../src/lib/project-document.js'
import {
  commitElements,
  commitOverlays,
  commitTextLayers,
  createEmptyProjectPair,
  loadProjectPair,
} from '../../src/store/project-v2-bridge.js'

describe('V2-only store bridge', () => {
  beforeEach(() => {
    resetFeatureFlags()
  })

  it('empty pair is V2 project + editor view', () => {
    const pair = createEmptyProjectPair()
    expect(pair.project.schemaVersion).toBe(2)
    expect(pair.editor.elements).toEqual([])
    expect(pair.editor.settings).toBeTruthy()
  })

  it('round-trips cutout rect through V2 mediaMapping', () => {
    const legacy = createLegacyImportFixture()
    legacy.source = { name: 'a.png', width: 64, height: 48, url: 'blob:x', kind: 'image' }
    legacy.elements = [{
      id: 'cut-1',
      name: 'Lasso',
      x: 0.1,
      y: 0.2,
      w: 0.3,
      h: 0.4,
      scaleX: 100,
      scaleY: 100,
      rotation: 15,
      opacity: 80,
      motion: 'Float',
      amplitude: 7,
      visible: true,
      locked: false,
    }]

    const { project: v2 } = migrateV1ToV2(legacy)
    expect(v2.layers['cut-1'].mediaMapping.w).toBe(0.3)
    expect(v2.layers['cut-1'].mediaMapping.h).toBe(0.4)

    const back = projectToEditorView(v2, { previousEditor: legacy })
    expect(back.elements).toHaveLength(1)
    expect(back.elements[0].id).toBe('cut-1')
    expect(back.elements[0].w).toBe(0.3)
    expect(back.elements[0].h).toBe(0.4)
    expect(back.elements[0].motion).toBe('Float')
    expect(back.elements[0].amplitude).toBe(7)
  })

  it('applyElementsToProjectV2 upserts and removes cutouts without wiping background', () => {
    const legacy = createLegacyImportFixture()
    legacy.source = { name: 'a.png', width: 32, height: 32, storageKey: 'fixtures/a.png' }
    legacy.elements = [{ id: 'a', name: 'A', x: 0, y: 0, w: 0.2, h: 0.2, motion: 'None' }]
    const { project: v2 } = migrateV1ToV2(legacy)
    expect(v2.layers['layer-background']).toBeTruthy()

    const next = applyElementsToProjectV2(v2, [
      { id: 'a', name: 'A2', x: 0.1, y: 0.1, w: 0.2, h: 0.2, motion: 'Bounce' },
      { id: 'b', name: 'B', x: 0.5, y: 0.5, w: 0.1, h: 0.1, motion: 'None' },
    ])
    expect(next.layers['layer-background']).toBeTruthy()
    expect(next.layers.a.name).toBe('A2')
    expect(next.layers.a.cutoutMotion).toBe('Bounce')
    expect(next.layers.b).toBeTruthy()
    expect(next.rootLayerIds).toContain('a')
    expect(next.rootLayerIds).toContain('b')

    const removed = applyElementsToProjectV2(next, [
      { id: 'b', name: 'B', x: 0.5, y: 0.5, w: 0.1, h: 0.1, motion: 'None' },
    ])
    expect(removed.layers.a).toBeUndefined()
    expect(removed.layers.b).toBeTruthy()
    expect(removed.layers['layer-background']).toBeTruthy()
  })

  it('commitElements keeps bitmaps and patches durable V2 project', () => {
    const bitmap = { width: 4, height: 4, tag: 'canvas' }
    const legacy = createLegacyImportFixture()
    legacy.source = { name: 'a.png', width: 32, height: 32, storageKey: 'fixtures/a.png' }
    const { project: v2 } = migrateV1ToV2(legacy)
    const editor = projectToEditorView(v2, { previousEditor: legacy })

    const state = { project: v2, editor: { ...editor, elements: [] } }
    const result = commitElements(state, [{
      id: 'cut-reg',
      name: 'Reg',
      x: 0,
      y: 0,
      w: 0.5,
      h: 0.5,
      motion: 'None',
      bitmap,
      sourceBitmap: bitmap,
      maskCanvas: bitmap,
    }])

    expect(result.project.schemaVersion).toBe(2)
    expect(result.editor.elements[0].bitmap).toBe(bitmap)
    expect(result.project.layers['cut-reg']).toBeTruthy()
    expect(result.project.layers['cut-reg'].mediaMapping.w).toBe(0.5)
    expect(result.project.rootLayerIds).toContain('cut-reg')
  })

  it('loadProjectPair returns V2 project + editor view', () => {
    const v2 = createEmptyProjectV2({ name: 'FromV2', width: 100, height: 80 })
    v2.assets['asset-c1'] = {
      id: 'asset-c1',
      kind: 'image',
      mimeType: 'image/png',
      checksumSha256: 'pending',
      byteLength: 0,
      storageKey: 'session:asset-c1',
    }
    v2.layers.c1 = {
      id: 'c1',
      name: 'Cut',
      type: 'raster',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'source-over',
      transform: {
        x: 0.2, y: 0.3, scaleX: 1, scaleY: 1, rotationDeg: 0, anchorX: 0.5, anchorY: 0.5,
      },
      effects: [],
      animationTrackIds: [],
      assetId: 'asset-c1',
      cutoutMotion: 'None',
      mediaMapping: {
        kind: 'cutout-rect',
        legacyKind: 'element',
        x: 0.2,
        y: 0.3,
        w: 0.4,
        h: 0.5,
      },
    }
    v2.rootLayerIds = ['c1']

    const pair = loadProjectPair(v2)
    expect(pair.project.schemaVersion).toBe(2)
    expect(pair.editor.elements).toHaveLength(1)
    expect(pair.editor.elements[0].id).toBe('c1')
    expect(pair.editor.elements[0].w).toBe(0.4)
    expect(pair.editor.name).toBe('FromV2')
  })

  it('loadProjectPair migrates legacy files once into V2', () => {
    const legacy = createLegacyImportFixture()
    legacy.name = 'Legacy'
    legacy.source = { name: 'a.png', width: 32, height: 32, storageKey: 'fixtures/a.png' }
    legacy.elements = [{ id: 'e1', name: 'Cut', x: 0, y: 0, w: 0.2, h: 0.2, motion: 'None' }]
    const pair = loadProjectPair(legacy)
    expect(pair.project.schemaVersion).toBe(2)
    expect(pair.project.layers.e1).toBeTruthy()
    expect(pair.editor.elements.some((e) => e.id === 'e1')).toBe(true)
  })

  it('applyOverlaysToProjectV2 keeps cutouts and inserts overlays after them', () => {
    const legacy = createLegacyImportFixture()
    legacy.source = { name: 'a.png', width: 32, height: 32, storageKey: 'fixtures/a.png' }
    legacy.elements = [{ id: 'cut-a', name: 'Cut', x: 0, y: 0, w: 0.2, h: 0.2, motion: 'None' }]
    const { project: v2 } = migrateV1ToV2(legacy)

    const next = applyOverlaysToProjectV2(v2, [{
      id: 'ov-1',
      name: 'Sticker',
      x: 10,
      y: 20,
      scale: 50,
      rotation: 0,
      opacity: 100,
      url: 'https://example.com/o.png',
    }])

    expect(next.layers['cut-a']).toBeTruthy()
    expect(next.layers['ov-1']).toBeTruthy()
    expect(next.layers['ov-1'].mediaMapping.legacyKind).toBe('overlay')
    const roots = next.rootLayerIds
    expect(roots.indexOf('cut-a')).toBeLessThan(roots.indexOf('ov-1'))
  })

  it('commitOverlays and commitTextLayers patch V2', () => {
    const legacy = createLegacyImportFixture()
    legacy.source = { name: 'a.png', width: 32, height: 32, storageKey: 'fixtures/a.png' }
    const { project: v2 } = migrateV1ToV2(legacy)
    const editor = projectToEditorView(v2, { previousEditor: legacy })
    const state = { project: v2, editor: { ...editor, overlays: [], textLayers: [] } }

    const withOv = commitOverlays(state, [{
      id: 'ov-x',
      name: 'O',
      x: 1,
      y: 2,
      scale: 80,
      url: 'blob:http://localhost/x',
      image: { tag: 'img' },
    }])
    expect(withOv.editor.overlays[0].image.tag).toBe('img')
    expect(withOv.project.layers['ov-x']).toBeTruthy()

    const withText = commitTextLayers(withOv, [{
      id: 'tx-1',
      text: 'Hi',
      x: 50,
      y: 50,
      size: 24,
    }])
    expect(withText.editor.textLayers[0].text).toBe('Hi')
    expect(withText.project.layers['tx-1']?.type).toBe('text')
    expect(withText.project.layers['ov-x']).toBeTruthy()
  })
})
