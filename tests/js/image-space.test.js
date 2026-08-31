import { describe, expect, it } from 'vitest'
import {
  cropRectByPixelBounds,
  sourceFromStageMatrix,
  transformPoint,
} from '../../src/lib/image-space.js'

function expectPoint(point, x, y) {
  expect(point.x).toBeCloseTo(x, 6)
  expect(point.y).toBeCloseTo(y, 6)
}

describe('stage-to-source image coordinates', () => {
  it('maps an identity image one-to-one', () => {
    const matrix = sourceFromStageMatrix({
      box: { x: 0, y: 0, w: 1, h: 1, rotation: 0 },
      stageWidth: 100,
      stageHeight: 50,
      sourceWidth: 100,
      sourceHeight: 50,
    })
    expectPoint(transformPoint(matrix, { x: 25, y: 20 }), 25, 20)
  })

  it('removes contain-fit letterboxing', () => {
    const matrix = sourceFromStageMatrix({
      box: { x: 0, y: 0.25, w: 1, h: 0.5, rotation: 0 },
      stageWidth: 100,
      stageHeight: 100,
      sourceWidth: 100,
      sourceHeight: 50,
    })
    expectPoint(transformPoint(matrix, { x: 0, y: 25 }), 0, 0)
    expectPoint(transformPoint(matrix, { x: 100, y: 75 }), 100, 50)
  })

  it('inverts rotation around the canvas anchor', () => {
    const matrix = sourceFromStageMatrix({
      box: { x: 0, y: 0, w: 1, h: 1, rotation: 90 },
      stageWidth: 100,
      stageHeight: 100,
      sourceWidth: 100,
      sourceHeight: 100,
    })
    expectPoint(transformPoint(matrix, { x: 100, y: 0 }), 0, 0)
  })

  it('inverts horizontal flips', () => {
    const matrix = sourceFromStageMatrix({
      box: { x: 0, y: 0, w: 1, h: 1, rotation: 0 },
      stageWidth: 100,
      stageHeight: 100,
      sourceWidth: 100,
      sourceHeight: 100,
      flipX: true,
    })
    expectPoint(transformPoint(matrix, { x: 100, y: 20 }), 0, 20)
  })

  it('keeps source coordinates aligned when a bitmap is trimmed', () => {
    const cropped = cropRectByPixelBounds(
      { x: 0.2, y: 0.1, w: 0.4, h: 0.6 },
      { minX: 25, minY: 10, nw: 50, nh: 60, w: 100, h: 100 },
    )
    expectPoint(cropped, 0.3, 0.16)
    expect(cropped.w).toBeCloseTo(0.2, 6)
    expect(cropped.h).toBeCloseTo(0.36, 6)
  })
})
