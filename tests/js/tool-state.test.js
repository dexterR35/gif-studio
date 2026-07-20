import { describe, it, expect } from 'vitest'
import {
  createInitialToolState,
  transitionTool,
  isGestureActive,
} from '../../src/tools/index.js'

describe('ToolState machine', () => {
  it('prevents illegal transitions', () => {
    const idle = createInitialToolState('move')
    const bad = transitionTool(idle, { type: 'pointerup' })
    expect(bad.ok).toBe(false)
    expect(bad.state.phase).toBe('idle')

    const drawing = transitionTool(
      createInitialToolState('select-rect'),
      { type: 'pointerdown', point: { x: 0, y: 0 } },
    )
    expect(drawing.ok).toBe(true)
    expect(drawing.state.phase).toBe('drawing')
    const illegal = transitionTool(drawing.state, { type: 'pointerdown', point: { x: 1, y: 1 } })
    expect(illegal.ok).toBe(false)
  })

  it('escape cancels gesture', () => {
    let state = createInitialToolState('select-lasso')
    state = transitionTool(state, { type: 'pointerdown', point: { x: 1, y: 2 } }).state
    expect(isGestureActive(state)).toBe(true)
    state = transitionTool(state, { type: 'add-point', point: { x: 3, y: 4 } }).state
    expect(state.points.length).toBe(2)

    const cancelled = transitionTool(state, { type: 'escape' })
    expect(cancelled.ok).toBe(true)
    expect(cancelled.state.phase).toBe('ready')
    expect(cancelled.state.points).toEqual([])
    expect(isGestureActive(cancelled.state)).toBe(false)
  })

  it('supports select-pen and redact tools', () => {
    const pen = createInitialToolState('select-pen')
    expect(pen.kind).toBe('select-pen')
    const redact = createInitialToolState('redact')
    const started = transitionTool(redact, { type: 'pointerdown', point: { x: 0, y: 0 } })
    expect(started.ok).toBe(true)
    expect(started.state.phase).toBe('drawing')
  })
})
