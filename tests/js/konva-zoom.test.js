import { describe, expect, it } from 'vitest'
import {
  fitArtboard,
  clampArtboardPan,
  artboardDragBoundFunc,
} from '../../src/engine/konva-zoom.js'

describe('konva-zoom artboard helpers', () => {
  it('fitArtboard centers the board in the viewport', () => {
    const f = fitArtboard(1000, 800, 500, 400, 0)
    expect(f.scale).toBe(2)
    expect(f.x).toBe(0)
    expect(f.y).toBe(0)
    expect(f.zoomPct).toBe(200)
  })

  it('fitArtboard applies padding and centers', () => {
    const f = fitArtboard(1000, 800, 2000, 1600, 40)
    expect(f.scale).toBeCloseTo(0.45, 5)
    expect(f.x).toBeCloseTo((1000 - 2000 * f.scale) / 2, 5)
    expect(f.y).toBeCloseTo((800 - 1600 * f.scale) / 2, 5)
  })

  it('clampArtboardPan locks small artboards to center', () => {
    const pos = clampArtboardPan(10, 20, 0.5, 1000, 800, 400, 300)
    expect(pos.x).toBe((1000 - 200) / 2)
    expect(pos.y).toBe((800 - 150) / 2)
  })

  it('clampArtboardPan keeps large artboards from leaving the viewport', () => {
    const pos = clampArtboardPan(-5000, -5000, 2, 1000, 800, 800, 600)
    expect(pos.x).toBe(1000 - 1600)
    expect(pos.y).toBe(800 - 1200)
    const pos2 = clampArtboardPan(5000, 5000, 2, 1000, 800, 800, 600)
    expect(pos2.x).toBe(0)
    expect(pos2.y).toBe(0)
  })

  it('artboardDragBoundFunc clamps pivots into the artboard', () => {
    const bound = artboardDragBoundFunc(100, 80)
    expect(bound({ x: -10, y: 40 })).toEqual({ x: 0, y: 40 })
    expect(bound({ x: 150, y: 90 })).toEqual({ x: 100, y: 80 })
  })
})
