/**
 * Simple IndexedDB put/get/delete for ArrayBuffer bytes.
 * Falls back to an in-memory Map when IndexedDB is unavailable (Node tests).
 */

const DB_NAME = 'gif-studio-assets'
const STORE_NAME = 'assets'
const DB_VERSION = 1

function openDb(indexedDB, dbName = DB_NAME) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error || new Error('IndexedDB open failed'))
  })
}

function idbRequest(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error || new Error('IndexedDB request failed'))
  })
}

export class IndexedDbAssetStore {
  /**
   * @param {{ dbName?: string, indexedDB?: IDBFactory|null }} [opts]
   */
  constructor(opts = {}) {
    this.dbName = opts.dbName || DB_NAME
    this._indexedDB = opts.indexedDB !== undefined
      ? opts.indexedDB
      : (typeof globalThis !== 'undefined' ? globalThis.indexedDB : null)
    /** @type {Map<string, ArrayBuffer>} */
    this._memory = new Map()
    this._dbPromise = null
  }

  async _db() {
    if (!this._indexedDB) return null
    if (!this._dbPromise) {
      this._dbPromise = openDb(this._indexedDB, this.dbName)
    }
    return this._dbPromise
  }

  /**
   * @param {string} key
   * @param {ArrayBuffer} buffer
   */
  async put(key, buffer) {
    const db = await this._db()
    if (!db) {
      this._memory.set(key, buffer)
      return
    }
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    await idbRequest(store.put(buffer, key))
  }

  /**
   * @param {string} key
   * @returns {Promise<ArrayBuffer|null>}
   */
  async get(key) {
    const db = await this._db()
    if (!db) {
      return this._memory.get(key) || null
    }
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const result = await idbRequest(store.get(key))
    return result || null
  }

  /**
   * @param {string} key
   */
  async delete(key) {
    const db = await this._db()
    if (!db) {
      this._memory.delete(key)
      return
    }
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    await idbRequest(store.delete(key))
  }

  async has(key) {
    const buf = await this.get(key)
    return buf != null
  }
}
