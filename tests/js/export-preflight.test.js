import { describe, expect, it, vi } from 'vitest'
import { runExportPreflight, GIF_MAX_COLORS } from '../../src/export/export-preflight.js'
import { exportGif } from '../../src/export/export-service.js'

describe('export-preflight', () => {
  it('passes a normal GIF export and warns about palette limit', () => {
    const result = runExportPreflight({
      width: 320,
      height: 240,
      frameCount: 12,
      fps: 12,
      format: 'gif',
      fonts: [{ family: 'Inter', available: true }],
    })
    expect(result.ok).toBe(true)
    expect(result.warnings.some((w) => w.code === 'GIF_PALETTE_LIMIT')).toBe(true)
    expect(result.warnings[0].message).toContain(String(GIF_MAX_COLORS))
    expect(result.estimates.frameCount).toBe(12)
  })

  it('fails on missing fonts, duration, and frame limits', () => {
    const result = runExportPreflight({
      width: 100,
      height: 100,
      delays: Array.from({ length: 300 }, () => 100),
      fonts: [{ family: 'Custom', available: false }],
      maxFrames: 240,
      maxDurationMs: 10_000,
    })
    expect(result.ok).toBe(false)
    const codes = result.errors.map((e) => e.code)
    expect(codes).toContain('MISSING_FONT')
    expect(codes).toContain('FRAME_LIMIT')
    expect(codes).toContain('DURATION_LIMIT')
  })

  it('estimates memory and rejects over budget', () => {
    const result = runExportPreflight({
      width: 4000,
      height: 4000,
      frameCount: 100,
      memoryBudgetBytes: 1024 * 1024,
    })
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.code === 'MEMORY_BUDGET')).toBe(true)
  })
})

describe('export-service', () => {
  it('prefers API export when available', async () => {
    const exportViaApi = vi.fn(async () => ({
      blob: new Blob(['gif'], { type: 'image/gif' }),
      encoder: 'imageio',
    }))
    const result = await exportGif({
      apiAvailable: true,
      preflightInput: { width: 64, height: 64, frameCount: 2, fps: 10 },
      exportViaApi,
      exportViaGifenc: vi.fn(),
    })
    expect(exportViaApi).toHaveBeenCalled()
    expect(result.offline).toBe(false)
    expect(result.degraded).toBe(false)
    expect(result.encoder).toBe('imageio')
  })

  it('uses labeled offline fallback only with approval', async () => {
    await expect(
      exportGif({
        apiAvailable: false,
        preflightInput: { width: 64, height: 64, frameCount: 2 },
        userApprovedOffline: false,
        exportViaGifenc: vi.fn(),
      }),
    ).rejects.toMatchObject({ code: 'FALLBACK_REQUIRES_APPROVAL' })

    const exportViaGifenc = vi.fn(async () => ({
      blob: new Blob(['x'], { type: 'image/gif' }),
      encoder: 'gifenc-offline',
    }))
    const result = await exportGif({
      apiAvailable: false,
      preflightInput: { width: 64, height: 64, frameCount: 2 },
      userApprovedOffline: true,
      exportViaGifenc,
    })
    expect(result.offline).toBe(true)
    expect(result.degraded).toBe(true)
    expect(result.label).toContain('offline')
  })
})
