import { serializeProject } from '../lib/project-document.js'
import { IndexedDbAssetStore } from '../runtime/assets/indexeddb-asset-store.js'

export const STUDIO_SESSION_STORAGE_KEY = 'image-studio:workspace:v1'
export const STUDIO_SESSION_VERSION = 1

const assetKey = (...parts) => `workspace:${parts.map((part) => encodeURIComponent(String(part))).join(':')}`

function jsonClone(value) {
  if (value == null) return value
  return JSON.parse(JSON.stringify(value))
}

function canvasBlob(canvas, type = 'image/png') {
  return new Promise((resolve, reject) => {
    if (!canvas || typeof canvas.toBlob !== 'function') {
      reject(new Error('Canvas cannot be persisted'))
      return
    }
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Canvas encoding failed'))
    }, type)
  })
}

async function urlBlob(url) {
  if (!url) return null
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Asset fetch failed (${response.status})`)
  return response.blob()
}

function durableTools(tools = {}) {
  return {
    selectionTool: tools.selectionTool,
    extractTolerance: tools.extractTolerance,
    maskBrush: jsonClone(tools.maskBrush),
    selectionPurpose: tools.selectionPurpose,
  }
}

function durableUi(ui = {}) {
  return { lockAspect: ui.lockAspect !== false }
}

/**
 * Persists the serializable project in localStorage and all binary surfaces in IndexedDB.
 * Writes and clears are queued so an older autosave can never resurrect a reset project.
 */
export class StudioSessionPersistence {
  constructor(opts = {}) {
    this.storageKey = opts.storageKey || STUDIO_SESSION_STORAGE_KEY
    this.storage = opts.storage !== undefined
      ? opts.storage
      : (typeof localStorage !== 'undefined' ? localStorage : null)
    this.assetStore = opts.assetStore || new IndexedDbAssetStore(opts.assetStoreOptions)
    this._queue = Promise.resolve()
  }

  _enqueue(operation) {
    const result = this._queue.then(operation, operation)
    this._queue = result.catch(() => {})
    return result
  }

  async _putBlob(key, blob, metadata = {}) {
    if (!blob) return null
    const buffer = await blob.arrayBuffer()
    await this.assetStore.put(key, buffer)
    return {
      key,
      mimeType: blob.type || metadata.mimeType || 'application/octet-stream',
      byteLength: buffer.byteLength,
      ...metadata,
    }
  }

  async _putUrl(key, url, metadata = {}) {
    if (!url) return null
    return this._putBlob(key, await urlBlob(url), metadata)
  }

  /**
   * @param {{ project: object, editor: object, selection?: object, tools?: object, ui?: object, fonts?: Map<string, object>|object[] }} state
   */
  save(state) {
    return this._enqueue(async () => {
      if (!state?.editor?.source?.url || !this.storage) return false

      const editor = state.editor
      const assets = { elements: {}, overlays: {}, fonts: {} }
      assets.source = await this._putUrl(assetKey('source'), editor.source.url, {
        name: editor.source.name || 'image',
        width: editor.source.width,
        height: editor.source.height,
      })

      if (editor.enhancedLayer?.url) {
        assets.enhanced = await this._putUrl(assetKey('enhanced'), editor.enhancedLayer.url, {
          name: editor.enhancedLayer.name || 'Enhanced',
          width: editor.enhancedLayer.width,
          height: editor.enhancedLayer.height,
          layer: jsonClone(Object.fromEntries(
            Object.entries(editor.enhancedLayer)
              .filter(([key]) => key !== 'url' && key !== 'image'),
          )),
        })
      }

      for (const overlay of editor.overlays || []) {
        if (!overlay?.id || !overlay.url) continue
        assets.overlays[overlay.id] = await this._putUrl(assetKey('overlay', overlay.id), overlay.url, {
          name: overlay.name || 'Overlay',
        })
      }

      for (const element of editor.elements || []) {
        if (!element?.id) continue
        const refs = {}
        for (const field of ['bitmap', 'sourceBitmap', 'maskCanvas', 'cleanup']) {
          if (!element[field]) continue
          const blob = await canvasBlob(element[field])
          refs[field] = await this._putBlob(assetKey('element', element.id, field), blob)
        }
        if (Object.keys(refs).length) assets.elements[element.id] = refs
      }

      const fontEntries = state.fonts instanceof Map
        ? [...state.fonts.values()]
        : (Array.isArray(state.fonts) ? state.fonts : [])
      for (const font of fontEntries) {
        if (!font?.family || !font.buffer) continue
        const blob = new Blob([font.buffer], { type: font.mimeType || 'font/woff2' })
        assets.fonts[font.family] = await this._putBlob(assetKey('font', font.family), blob, {
          family: font.family,
          name: font.name || font.family,
        })
      }

      const snapshot = {
        version: STUDIO_SESSION_VERSION,
        savedAt: new Date().toISOString(),
        project: serializeProject(state.project),
        selection: jsonClone(state.selection || {}),
        tools: durableTools(state.tools),
        ui: durableUi(state.ui),
        assets,
      }
      this.storage.setItem(this.storageKey, JSON.stringify(snapshot))
      return true
    })
  }

  async load() {
    await this._queue
    if (!this.storage) return null
    const raw = this.storage.getItem(this.storageKey)
    if (!raw) return null
    try {
      const snapshot = JSON.parse(raw)
      if (snapshot?.version !== STUDIO_SESSION_VERSION || snapshot?.project?.schemaVersion !== 2) {
        return null
      }
      return snapshot
    } catch {
      return null
    }
  }

  async readBlob(ref) {
    if (!ref?.key) return null
    const buffer = await this.assetStore.get(ref.key)
    if (!buffer) return null
    return new Blob([buffer], { type: ref.mimeType || 'application/octet-stream' })
  }

  clear() {
    return this._enqueue(async () => {
      this.storage?.removeItem?.(this.storageKey)
      await this.assetStore.clear()
    })
  }
}
