/**
 * Session-only runtime surfaces keyed by layer id.
 * Cutouts: canvases. Overlays: url + HTMLImageElement.
 * Never serialize into Project V2 JSON.
 */

const CUTOUT_KEYS = ['bitmap', 'sourceBitmap', 'maskCanvas', 'cleanup']

export class LayerBitmapRegistry {
  constructor() {
    /** @type {Map<string, { bitmap?: unknown, sourceBitmap?: unknown, maskCanvas?: unknown, cleanup?: unknown }>} */
    this._cutouts = new Map()
    /** @type {Map<string, { url?: string | null, image?: unknown }>} */
    this._overlays = new Map()
  }

  /**
   * @param {string} layerId
   * @param {{ bitmap?: unknown, sourceBitmap?: unknown, maskCanvas?: unknown, cleanup?: unknown }} surfaces
   */
  set(layerId, surfaces = {}) {
    if (!layerId) return
    const prev = this._cutouts.get(layerId) || {}
    this._cutouts.set(layerId, {
      bitmap: surfaces.bitmap !== undefined ? surfaces.bitmap : prev.bitmap,
      sourceBitmap: surfaces.sourceBitmap !== undefined ? surfaces.sourceBitmap : prev.sourceBitmap,
      maskCanvas: surfaces.maskCanvas !== undefined ? surfaces.maskCanvas : prev.maskCanvas,
      cleanup: surfaces.cleanup !== undefined ? surfaces.cleanup : prev.cleanup,
    })
  }

  /**
   * @param {string} layerId
   */
  get(layerId) {
    return this._cutouts.get(layerId) || null
  }

  has(layerId) {
    return this._cutouts.has(layerId)
  }

  /**
   * @param {string} layerId
   */
  delete(layerId) {
    this._cutouts.delete(layerId)
  }

  clear() {
    this._cutouts.clear()
    this._overlays.clear()
  }

  ids() {
    return [...this._cutouts.keys()]
  }

  /**
   * @param {object[]} elements
   */
  syncFromElements(elements) {
    const keep = new Set()
    for (const el of elements || []) {
      if (!el?.id) continue
      keep.add(el.id)
      const hasRuntime = CUTOUT_KEYS.some((k) => el[k] != null)
      if (hasRuntime) {
        this.set(el.id, {
          bitmap: el.bitmap,
          sourceBitmap: el.sourceBitmap,
          maskCanvas: el.maskCanvas,
          cleanup: el.cleanup,
        })
      }
    }
    for (const id of this.ids()) {
      if (!keep.has(id)) this.delete(id)
    }
  }

  /**
   * @param {object[]} elements
   * @returns {object[]}
   */
  attachToElements(elements) {
    return (elements || []).map((el) => {
      if (!el?.id) return el
      const surfaces = this.get(el.id)
      if (!surfaces) return el
      return { ...el, ...surfaces }
    })
  }

  /**
   * @param {string} layerId
   * @param {{ url?: string | null, image?: unknown }} surfaces
   */
  setOverlay(layerId, surfaces = {}) {
    if (!layerId) return
    const prev = this._overlays.get(layerId) || {}
    this._overlays.set(layerId, {
      url: surfaces.url !== undefined ? surfaces.url : prev.url,
      image: surfaces.image !== undefined ? surfaces.image : prev.image,
    })
  }

  /**
   * @param {string} layerId
   */
  getOverlay(layerId) {
    return this._overlays.get(layerId) || null
  }

  /**
   * @param {object[]} overlays
   */
  syncFromOverlays(overlays) {
    const keep = new Set()
    for (const ov of overlays || []) {
      if (!ov?.id) continue
      keep.add(ov.id)
      if (ov.url != null || ov.image != null) {
        this.setOverlay(ov.id, { url: ov.url, image: ov.image })
      }
    }
    for (const id of [...this._overlays.keys()]) {
      if (!keep.has(id)) this._overlays.delete(id)
    }
  }

  /**
   * @param {object[]} overlays
   * @returns {object[]}
   */
  attachToOverlays(overlays) {
    return (overlays || []).map((ov) => {
      if (!ov?.id) return ov
      const surfaces = this.getOverlay(ov.id)
      if (!surfaces) return ov
      return {
        ...ov,
        url: ov.url ?? surfaces.url ?? null,
        image: ov.image ?? surfaces.image,
      }
    })
  }
}

/** Process-wide singleton used by the studio store. */
export const layerBitmapRegistry = new LayerBitmapRegistry()
