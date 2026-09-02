import { describe, expect, it, vi } from 'vitest'
import { runBackgroundRemovalUpscaleWorkflow } from '../../src/ai/layer-workflow.js'

describe('per-layer background removal and upscale workflow', () => {
  it('upscales the exact result produced by background removal', async () => {
    const calls = []
    const selectedLayerResult = { layerId: 'layer-chair', blob: new Blob(['cutout']) }
    const enhancedLayerResult = { layerId: 'layer-chair', blob: new Blob(['enhanced']) }

    const removeBackground = vi.fn(async () => {
      calls.push('remove')
      return selectedLayerResult
    })
    const upscale = vi.fn(async ({ source, scale }) => {
      calls.push('upscale')
      expect(source).toBe(selectedLayerResult)
      expect(source.layerId).toBe('layer-chair')
      expect(scale).toBe(4)
      return enhancedLayerResult
    })

    const result = await runBackgroundRemovalUpscaleWorkflow({
      scale: '4',
      removeBackground,
      upscale,
    })

    expect(calls).toEqual(['remove', 'upscale'])
    expect(result).toEqual({
      removed: selectedLayerResult,
      enhanced: enhancedLayerResult,
    })
  })

  it('short-circuits before upscale when background removal fails', async () => {
    const error = new Error('matte failed')
    const upscale = vi.fn()

    await expect(runBackgroundRemovalUpscaleWorkflow({
      removeBackground: async () => { throw error },
      upscale,
    })).rejects.toBe(error)

    expect(upscale).not.toHaveBeenCalled()
  })

  it('does not restrict either standalone callback outside the combined workflow', async () => {
    const removeBackground = vi.fn(async ({ layerId }) => ({ layerId, kind: 'cutout' }))
    const upscale = vi.fn(async ({ layerId, scale }) => ({ layerId, scale, kind: 'enhanced' }))

    await expect(removeBackground({ layerId: 'base-image' })).resolves.toEqual({
      layerId: 'base-image',
      kind: 'cutout',
    })
    await expect(upscale({ layerId: 'overlay-2', scale: 2 })).resolves.toEqual({
      layerId: 'overlay-2',
      scale: 2,
      kind: 'enhanced',
    })
  })

  it('validates the combined scale before starting either operation', async () => {
    const removeBackground = vi.fn()
    const upscale = vi.fn()

    await expect(runBackgroundRemovalUpscaleWorkflow({
      scale: 3,
      removeBackground,
      upscale,
    })).rejects.toThrow('scale must be 2 or 4')

    expect(removeBackground).not.toHaveBeenCalled()
    expect(upscale).not.toHaveBeenCalled()
  })
})
