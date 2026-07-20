import { describe, it, expect } from 'vitest'
import {
  flattenLayerOrder,
  partitionRedactionLast,
  reorderRootLayers,
} from '../../src/domain/layers/layer-order.js'

describe('layer-order', () => {
  const layers = {
    g1: { id: 'g1', type: 'group', childIds: ['a', 'b'] },
    a: { id: 'a', type: 'raster' },
    b: { id: 'b', type: 'raster' },
    c: { id: 'c', type: 'text' },
    r1: {
      id: 'r1',
      type: 'redaction',
      secure: true,
      region: { kind: 'rect', x: 0, y: 0, w: 1, h: 1 },
      fill: '#000',
    },
  }

  it('flattens groups in document order', () => {
    expect(flattenLayerOrder(['g1', 'c'], layers)).toEqual(['a', 'b', 'c'])
  })

  it('partitions redaction after scene ids', () => {
    const { sceneIds, redactionIds } = partitionRedactionLast(['r1', 'g1', 'c'], layers)
    expect(sceneIds).toEqual(['a', 'b', 'c'])
    expect(redactionIds).toEqual(['r1'])
  })

  it('reorders root layers', () => {
    expect(reorderRootLayers(['a', 'b', 'c'], 'c', 0)).toEqual(['c', 'a', 'b'])
  })
})
