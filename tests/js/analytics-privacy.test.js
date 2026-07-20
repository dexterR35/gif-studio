import { describe, it, expect, beforeEach } from 'vitest'
import {
  ANALYTICS_DENYLIST,
  sanitizeAnalyticsProps,
  trackProductEvent,
  clearAnalyticsBuffer,
  getAnalyticsBuffer,
  PRODUCT_EVENTS,
} from '../../src/observability/analytics.js'

describe('analytics privacy denylist', () => {
  beforeEach(() => {
    clearAnalyticsBuffer()
  })

  it('exposes required denylist keys', () => {
    expect(ANALYTICS_DENYLIST).toContain('pixels')
    expect(ANALYTICS_DENYLIST).toContain('prompt')
    expect(ANALYTICS_DENYLIST).toContain('text')
    expect(ANALYTICS_DENYLIST).toContain('filePath')
    expect(ANALYTICS_DENYLIST).toContain('blobUrl')
  })

  it('strips denylisted and unsafe fields', () => {
    const clean = sanitizeAnalyticsProps({
      format: 'gif',
      width: 480,
      height: 300,
      pixels: new Uint8Array([1, 2, 3]),
      prompt: 'remove the background carefully',
      text: 'Hello secret caption',
      layerText: 'full layer string',
      filePath: '/home/dexter/Desktop/secret.png',
      path: 'C:\\Users\\dexter\\img.png',
      blobUrl: 'blob:http://127.0.0.1/abc',
      url: 'blob:http://localhost/xyz',
      dataUrl: 'data:image/png;base64,AAAA',
      engine: 'rembg',
      degraded: false,
    })

    expect(clean).toEqual({
      format: 'gif',
      width: 480,
      height: 300,
      engine: 'rembg',
      degraded: false,
    })
    expect(clean.pixels).toBeUndefined()
    expect(clean.prompt).toBeUndefined()
    expect(clean.text).toBeUndefined()
    expect(clean.filePath).toBeUndefined()
    expect(clean.blobUrl).toBeUndefined()
  })

  it('drops long free-form strings and home-like paths', () => {
    const clean = sanitizeAnalyticsProps({
      note: 'x'.repeat(100),
      sourceName: '/Users/alice/Pictures/vacation.jpg',
      method: 'grabcut',
    })
    expect(clean.note).toBeUndefined()
    expect(clean.sourceName).toBeUndefined()
    expect(clean.method).toBe('grabcut')
  })

  it('tracks only sanitized props for product events', () => {
    trackProductEvent(PRODUCT_EVENTS.EXPORT_SUCCEEDED, {
      format: 'gif',
      prompt: 'should not appear',
      pixels: [1, 2, 3],
      durationMs: 1200,
    })
    const buf = getAnalyticsBuffer()
    expect(buf).toHaveLength(1)
    expect(buf[0].name).toBe('export_succeeded')
    expect(buf[0].props).toEqual({ format: 'gif', durationMs: 1200 })
  })
})
