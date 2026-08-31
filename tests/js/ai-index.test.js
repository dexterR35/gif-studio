import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  inpaintRegion,
  inpaintWithLama,
  probeInpaint,
  probeLama,
  probePromptSelection,
  selectByPrompt,
} from '../../src/ai/index.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AI public exports', () => {
  it('only exposes implemented inpaint and detect helpers', () => {
    expect(inpaintRegion).toBeTypeOf('function')
    expect(inpaintWithLama).toBe(inpaintRegion)
    expect(probeInpaint).toBeTypeOf('function')
    expect(probeLama).toBeTypeOf('function')
    expect(probePromptSelection).toBeTypeOf('function')
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
})
