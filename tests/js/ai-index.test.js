import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  inpaintRegion,
  inpaintWithLama,
  probeInpaint,
  probeLama,
  probePromptSelection,
  selectAtPoint,
  selectByPrompt,
  upscaleWithRealESRGAN,
} from '../../src/ai/index.js'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('AI public exports', () => {
  it('only exposes implemented inpaint and detect helpers', () => {
    expect(inpaintRegion).toBeTypeOf('function')
    expect(inpaintWithLama).toBe(inpaintRegion)
    expect(probeInpaint).toBeTypeOf('function')
    expect(probeLama).toBeTypeOf('function')
    expect(probePromptSelection).toBeTypeOf('function')
    expect(selectAtPoint).toBeTypeOf('function')
  })

  it('sends only image, prompt, and confidence to the selection backend', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ boxes: [] }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await selectByPrompt({
      imageBlob: new Blob(['image'], { type: 'image/png' }),
      prompt: 'chair',
      confidence: 0.4,
    })

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, request] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/ai/detect')
    expect(request.method).toBe('POST')
    expect([...request.body.keys()]).toEqual(['image', 'prompt', 'confidence'])
  })

  it('sends only image and canvas-space click coordinates to point cut', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ cutout_png_base64: 'cutout' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await selectAtPoint({
      imageBlob: new Blob(['image'], { type: 'image/png' }),
      canvasWidth: 100,
      canvasHeight: 50,
      point: { x: 0.25, y: 0.5 },
    })

    const [url, request] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/ai/point-cut')
    expect(request.method).toBe('POST')
    expect([...request.body.keys()]).toEqual(['image', 'x', 'y'])
    expect(request.body.get('x')).toBe('25')
    expect(request.body.get('y')).toBe('25')
  })

  it('sends only image and a fixed Real-ESRGAN scale to upscale', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      new Blob(['upscaled'], { type: 'image/png' }),
      {
        status: 200,
        headers: {
          'Content-Type': 'image/png',
          'X-Upscale-Engine': 'realesrgan-x4-spandrel',
        },
      },
    ))
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:upscaled')

    const result = await upscaleWithRealESRGAN({
      imageBlob: new Blob(['image'], { type: 'image/png' }),
      scale: 4,
    })

    const [url, request] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/ai/upscale')
    expect(request.method).toBe('POST')
    expect([...request.body.keys()]).toEqual(['image', 'scale'])
    expect(request.body.get('scale')).toBe('4')
    expect(result.engine).toBe('realesrgan-x4-spandrel')
  })

  it('rejects unsupported upscale scales before calling the API', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(upscaleWithRealESRGAN({
      imageBlob: new Blob(['image'], { type: 'image/png' }),
      scale: 3,
    })).rejects.toThrow('scale must be 2 or 4')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
