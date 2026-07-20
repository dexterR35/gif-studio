import { describe, it, expect } from 'vitest'
import {
  capabilityControlState,
  capabilityButtonProps,
  requireCapabilities,
} from '../../src/a11y/capability-honesty.js'

describe('capability honesty', () => {
  it('disables control when capability is missing', () => {
    const state = capabilityControlState({ api: false, rembg: false }, 'rembg', 'Soft matte')
    expect(state.ready).toBe(false)
    expect(state.disabled).toBe(true)
    expect(state.reason).toMatch(/local FastAPI/i)
  })

  it('enables control when capability is ready', () => {
    const state = capabilityControlState({ sam2: true, api: true }, 'sam2', 'SAM2')
    expect(state.ready).toBe(true)
    expect(state.disabled).toBe(false)
    expect(state.reason).toBe('')
  })

  it('builds button props with aria-disabled and reason title', () => {
    const props = capabilityButtonProps({ api: false }, 'api', 'Local backend')
    expect(props.disabled).toBe(true)
    expect(props['aria-disabled']).toBe(true)
    expect(props.title).toMatch(/FastAPI/i)
    expect(props['aria-label']).toMatch(/unavailable/i)
  })

  it('requireCapabilities fails on first missing key', () => {
    const state = requireCapabilities({ api: true, realesrgan: false }, ['api', 'realesrgan'], 'Upscale')
    expect(state.ready).toBe(false)
    expect(state.disabled).toBe(true)
  })

  it('handles null capabilities', () => {
    const state = capabilityControlState(null, 'onnx', 'ONNX')
    expect(state.disabled).toBe(true)
    expect(state.reason).toMatch(/not loaded/i)
  })
})
