/**
 * Worker-capable GIF decode entry.
 *
 * In browsers with Worker support this can be loaded as a module worker.
 * In Vitest / Node (no DOM canvas), `decodeGifInWorker` falls back to the
 * main-thread decoder with the same result shape.
 */
import { decodeGifBuffer } from './gif-decode.js'
import { admitDecode } from './memory-admission.js'

/**
 * Decode a GIF ArrayBuffer, optionally via Worker.
 * Same API whether Worker is used or stubbed.
 *
 * @param {ArrayBuffer} buffer
 * @param {{
 *   name?: string,
 *   preferWorker?: boolean,
 *   budgetBytes?: number,
 *   maxFrames?: number,
 * }} [options]
 */
export async function decodeGifInWorker(buffer, options = {}) {
  const name = options.name || 'animation.gif'
  // Probe with gifuct on main thread for admission (cheap metadata path).
  // Full decode still goes through decodeGifBuffer which applies disposal.
  const { parseGIF, decompressFrames } = await import('gifuct-js')
  const gif = parseGIF(buffer)
  const frames = decompressFrames(gif, true)
  const width = gif.lsd?.width || frames[0]?.dims?.width || 0
  const height = gif.lsd?.height || frames[0]?.dims?.height || 0
  const admission = admitDecode({
    width,
    height,
    frameCount: frames.length,
    sourceBytes: buffer.byteLength,
    budgetBytes: options.budgetBytes,
    maxFrames: options.maxFrames,
  })
  if (!admission.admitted) {
    const err = new Error(admission.reason || 'Decode rejected by memory admission')
    err.code = admission.code
    err.estimatedBytes = admission.estimatedBytes
    throw err
  }

  const canWorker = typeof Worker !== 'undefined'
    && options.preferWorker === true
    && typeof document !== 'undefined'

  if (!canWorker) {
    // Stub / test / Node path — same public API.
    return decodeGifBuffer(buffer, name)
  }

  // Optional real worker: for now still decode on main thread with same API.
  // A dedicated worker bundle can replace this body without changing callers.
  return decodeGifBuffer(buffer, name)
}

/**
 * Message handler shape for a future dedicated worker entry.
 * @param {MessageEvent} event
 */
export async function onWorkerMessage(event) {
  const { id, buffer, name, options } = event.data || {}
  try {
    const result = await decodeGifInWorker(buffer, { ...options, name, preferWorker: false })
    // Workers cannot transfer canvas elements; return metadata + transferable patches later.
    const transferable = {
      name: result.name,
      width: result.width,
      height: result.height,
      frameCount: result.frameCount,
      frames: result.frames.map((f) => ({
        delay: f.delay,
        dims: f.dims,
        disposalType: f.disposalType,
      })),
    }
    return { id, ok: true, result: transferable }
  } catch (err) {
    return {
      id,
      ok: false,
      error: { message: err?.message || String(err), code: err?.code },
    }
  }
}
