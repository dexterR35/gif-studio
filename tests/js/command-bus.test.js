import { describe, it, expect } from 'vitest'
import { createEmptyProjectV2 } from '../../src/domain/index.js'
import {
  CommandBus,
  createCommitEnhancedAssetCommand,
  createSetLayerTransformCommand,
} from '../../src/commands/index.js'

function projectWithRaster() {
  const doc = createEmptyProjectV2({ projectSeed: 'cmd' })
  doc.assets['orig'] = {
    id: 'orig',
    kind: 'image',
    mimeType: 'image/png',
    checksumSha256: 'aa',
    byteLength: 10,
    storageKey: 'mem:orig',
    width: 10,
    height: 10,
  }
  doc.layers['bg'] = {
    id: 'bg',
    type: 'raster',
    name: 'Background',
    visible: true,
    locked: true,
    opacity: 1,
    blendMode: 'source-over',
    transform: {
      x: 0, y: 0, scaleX: 1, scaleY: 1, rotationDeg: 0, anchorX: 0.5, anchorY: 0.5,
    },
    effects: [],
    animationTrackIds: [],
    assetId: 'orig',
    cutoutMotion: 'None',
  }
  doc.rootLayerIds = ['bg']
  return doc
}

describe('CommandBus', () => {
  it('undo/redo enhanced replace + rollback', () => {
    const bus = new CommandBus({ document: projectWithRaster() })

    bus.execute(createCommitEnhancedAssetCommand({
      layerId: 'bg',
      enhancedAssetId: 'enh',
      enhancedAsset: {
        id: 'enh',
        kind: 'image',
        mimeType: 'image/png',
        checksumSha256: 'bb',
        byteLength: 40,
        storageKey: 'mem:enh',
        width: 20,
        height: 20,
      },
    }))

    let layer = bus.getDocument().layers.bg
    expect(layer.assetId).toBe('enh')
    expect(layer.rollbackAssetId).toBe('orig')
    expect(bus.getDocument().assets.enh).toBeTruthy()

    bus.undo()
    layer = bus.getDocument().layers.bg
    expect(layer.assetId).toBe('orig')
    expect(layer.rollbackAssetId).toBeUndefined()
    expect(bus.getDocument().assets.enh).toBeUndefined()

    bus.redo()
    layer = bus.getDocument().layers.bg
    expect(layer.assetId).toBe('enh')
    expect(layer.rollbackAssetId).toBe('orig')
  })

  it('coalesces transform commands with same coalesceKey', () => {
    const bus = new CommandBus({ document: projectWithRaster() })
    bus.execute(createSetLayerTransformCommand({
      layerId: 'bg',
      transform: { x: 1 },
      coalesceKey: 'transform:bg',
    }))
    bus.execute(createSetLayerTransformCommand({
      layerId: 'bg',
      transform: { x: 5 },
      coalesceKey: 'transform:bg',
    }))
    expect(bus.history.undoStack.length).toBe(1)
    expect(bus.getDocument().layers.bg.transform.x).toBe(5)
    bus.undo()
    expect(bus.getDocument().layers.bg.transform.x).toBe(0)
  })
})
