/**
 * GIF decode via gifuct-js — import animated GIFs as frame bitmaps.
 * Applies disposal 0/1/2/3 via gif-disposal helpers; runs memory admission first.
 */
import { parseGIF, decompressFrames } from 'gifuct-js'
import {
  applyDisposal,
  capturePreviousBuffer,
  needsPreviousBuffer,
  normalizeDisposal,
} from './gif-disposal.js'
import { admitDecode } from './memory-admission.js'

export async function decodeGifFile(file, options = {}) {
  const buffer = await file.arrayBuffer()
  return decodeGifBuffer(buffer, file.name || 'animation.gif', options)
}

export async function decodeGifBuffer(buffer, name = 'animation.gif', options = {}) {
  const gif = parseGIF(buffer)
  const frames = decompressFrames(gif, true)
  if (!frames.length) throw new Error('GIF contains no frames')

  const width = gif.lsd?.width || frames[0].dims.width
  const height = gif.lsd?.height || frames[0].dims.height

  const admission = admitDecode({
    width,
    height,
    frameCount: frames.length,
    sourceBytes: buffer.byteLength,
    budgetBytes: options.budgetBytes,
    maxFrames: options.maxFrames,
    maxDimension: options.maxDimension,
  })
  if (!admission.admitted) {
    const err = new Error(admission.reason || 'Decode rejected by memory admission')
    err.code = admission.code
    err.estimatedBytes = admission.estimatedBytes
    throw err
  }

  if (typeof document === 'undefined') {
    // Headless / worker without DOM: return metadata + patches only.
    return {
      name,
      width,
      height,
      frameCount: frames.length,
      estimatedBytes: admission.estimatedBytes,
      frames: frames.map((frame) => ({
        delay: Math.max(20, frame.delay || 100),
        dims: { width, height },
        patchDims: { ...frame.dims },
        disposalType: normalizeDisposal(frame.disposalType),
        patch: frame.patch,
      })),
      async firstFrameUrl() {
        throw new Error('firstFrameUrl requires a DOM canvas environment')
      },
    }
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })

  const decoded = []
  for (const frame of frames) {
    const left = frame.dims.left
    const top = frame.dims.top
    const fw = frame.dims.width
    const fh = frame.dims.height
    const disposalType = normalizeDisposal(frame.disposalType)

    let previousImageData = null
    if (needsPreviousBuffer(disposalType)) {
      previousImageData = capturePreviousBuffer(ctx, width, height)
    }

    const patch = new ImageData(new Uint8ClampedArray(frame.patch), fw, fh)
    const temp = document.createElement('canvas')
    temp.width = fw
    temp.height = fh
    temp.getContext('2d').putImageData(patch, 0, 0)
    ctx.drawImage(temp, left, top)

    const snapshot = document.createElement('canvas')
    snapshot.width = width
    snapshot.height = height
    snapshot.getContext('2d').drawImage(canvas, 0, 0)

    decoded.push({
      canvas: snapshot,
      delay: Math.max(20, frame.delay || 100),
      dims: { width, height },
      disposalType,
      estimatedBytes: width * height * 4,
    })

    applyDisposal(ctx, {
      disposalType,
      left,
      top,
      width: fw,
      height: fh,
      previousImageData,
    })
  }

  return {
    name,
    width,
    height,
    frameCount: decoded.length,
    estimatedBytes: admission.estimatedBytes,
    frames: decoded,
    /** First frame as blob URL for studio source */
    async firstFrameUrl() {
      return new Promise((resolve, reject) => {
        decoded[0].canvas.toBlob((blob) => {
          if (!blob) {
            reject(new Error('Could not encode GIF first frame'))
            return
          }
          resolve(URL.createObjectURL(blob))
        }, 'image/png')
      })
    },
  }
}
