import { describe, expect, it } from 'vitest'
import { coreModelsMissing, summarizeMissingModels } from '../../src/ai/models-install.js'

describe('summarizeMissingModels', () => {
  it('counts missing core weights', () => {
    const summary = summarizeMissingModels({
      sam2: [
        { id: 'sam2.1_hiera_tiny', label: 'SAM2.1 Tiny', ready: false },
        { id: 'sam2.1_hiera_small', label: 'SAM2.1 Small', ready: true },
      ],
      yolo: [{ id: 'yolov8n', label: 'YOLOv8n', ready: false }],
      upscale: [
        { id: 'bicubic', label: 'Bicubic', ready: true },
        { id: 'realesrgan', label: 'Real-ESRGAN', ready: false },
      ],
    })
    expect(summary.missing).toBe(3)
    expect(summary.labels).toContain('SAM2.1 Tiny')
    expect(summary.labels).toContain('YOLOv8n')
  })

  it('ignores empty catalog', () => {
    expect(summarizeMissingModels(null)).toEqual({ missing: 0, total: 0, labels: [] })
  })
})

describe('coreModelsMissing', () => {
  it('is true when sam2 engine flag is false', () => {
    expect(coreModelsMissing({ api: true, sam2: false, models: {} })).toBe(true)
  })

  it('is false when api offline', () => {
    expect(coreModelsMissing({ api: false, sam2: false })).toBe(false)
  })
})
