import { afterEach, describe, expect, it, vi } from 'vitest'
import { createEmptyProjectV2 } from '../../src/domain/project/create-empty-v2.js'
import { StudioSessionPersistence } from '../../src/persistence/studio-session-persistence.js'
import { IndexedDbAssetStore } from '../../src/runtime/assets/indexeddb-asset-store.js'

function memoryStorage() {
  const values = new Map()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  }
}

function fakeCanvas(bytes) {
  return {
    toBlob(callback) {
      callback(new Blob([Uint8Array.from(bytes)], { type: 'image/png' }))
    },
  }
}

describe('StudioSessionPersistence', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('round-trips project state and every binary surface', async () => {
    const storage = memoryStorage()
    const assetStore = new IndexedDbAssetStore({ indexedDB: null })
    const persistence = new StudioSessionPersistence({ storage, assetStore })
    vi.stubGlobal('fetch', vi.fn(async (url) => ({
      ok: true,
      blob: async () => new Blob(
        [url.includes('overlay') ? Uint8Array.from([4, 5]) : Uint8Array.from([1, 2, 3])],
        { type: 'image/png' },
      ),
    })))

    const project = createEmptyProjectV2({ name: 'Remember me', width: 640, height: 360 })
    const saved = await persistence.save({
      project,
      editor: {
        source: { url: 'blob:source', name: 'source.png', width: 640, height: 360 },
        enhancedLayer: {
          url: 'blob:enhanced',
          name: 'Enhanced 2x',
          width: 1280,
          height: 720,
          fit: 'Cover',
          scale: 2,
          engine: 'test',
        },
        overlays: [{ id: 'ov-1', name: 'Overlay', url: 'blob:overlay' }],
        elements: [{
          id: 'el-1',
          bitmap: fakeCanvas([10]),
          sourceBitmap: fakeCanvas([11]),
          maskCanvas: fakeCanvas([12]),
          cleanup: fakeCanvas([13]),
        }],
      },
      selection: { imageLocked: true, selectedElements: ['el-1'] },
      tools: {
        selectionTool: 'Lasso',
        extractTolerance: 17,
        maskBrush: { mode: 'Hide', size: 22 },
        selectionPurpose: 'cutout',
        selection: { x: 1 },
      },
      ui: { lockAspect: false, toast: { message: 'do not persist' } },
      fonts: new Map([['Custom', {
        family: 'Custom',
        name: 'custom.woff2',
        mimeType: 'font/woff2',
        buffer: Uint8Array.from([20, 21]).buffer,
      }]]),
    })

    expect(saved).toBe(true)
    const snapshot = await persistence.load()
    expect(snapshot.project.metadata.name).toBe('Remember me')
    expect(snapshot.selection).toMatchObject({ imageLocked: true, selectedElements: ['el-1'] })
    expect(snapshot.tools).toMatchObject({ selectionTool: 'Lasso', extractTolerance: 17 })
    expect(snapshot.tools.selection).toBeUndefined()
    expect(snapshot.ui).toEqual({ lockAspect: false })
    expect(snapshot.assets.enhanced.layer).toMatchObject({ fit: 'Cover', scale: 2, engine: 'test' })

    const source = await persistence.readBlob(snapshot.assets.source)
    const mask = await persistence.readBlob(snapshot.assets.elements['el-1'].maskCanvas)
    const font = await persistence.readBlob(snapshot.assets.fonts.Custom)
    expect([...new Uint8Array(await source.arrayBuffer())]).toEqual([1, 2, 3])
    expect([...new Uint8Array(await mask.arrayBuffer())]).toEqual([12])
    expect([...new Uint8Array(await font.arrayBuffer())]).toEqual([20, 21])
  })

  it('queues clear after an in-flight save so reset cannot be resurrected', async () => {
    const storage = memoryStorage()
    const assetStore = new IndexedDbAssetStore({ indexedDB: null })
    const persistence = new StudioSessionPersistence({ storage, assetStore })
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      blob: async () => new Blob([Uint8Array.from([7])], { type: 'image/png' }),
    })))

    const project = createEmptyProjectV2()
    const saving = persistence.save({
      project,
      editor: { source: { url: 'blob:source', name: 'source.png' }, overlays: [], elements: [] },
    })
    const clearing = persistence.clear()
    await Promise.all([saving, clearing])

    expect(await persistence.load()).toBeNull()
    expect(await assetStore.has('workspace:source')).toBe(false)
  })
})
