/**
 * GIF decode via gifuct-js — import animated GIFs as frame bitmaps.
 */
import { parseGIF, decompressFrames } from 'gifuct-js'

export async function decodeGifFile(file) {
  const buffer = await file.arrayBuffer()
  return decodeGifBuffer(buffer, file.name || 'animation.gif')
}

export async function decodeGifBuffer(buffer, name = 'animation.gif') {
  const gif = parseGIF(buffer)
  const frames = decompressFrames(gif, true)
  if (!frames.length) throw new Error('GIF contains no frames')

  const width = gif.lsd?.width || frames[0].dims.width
  const height = gif.lsd?.height || frames[0].dims.height
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const imageData = ctx.createImageData(width, height)

  const decoded = []
  for (const frame of frames) {
    const { left, top, width: fw, height: fh } = {
      left: frame.dims.left,
      top: frame.dims.top,
      width: frame.dims.width,
      height: frame.dims.height,
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
    })

    // Disposal 2: clear only this frame's rect before the next frame composites.
    if (frame.disposalType === 2) {
      ctx.clearRect(left, top, fw, fh)
    }
    // imageData reserved for future disposal=3 (restore previous)
    imageData.data.set(ctx.getImageData(0, 0, width, height).data)
  }

  return {
    name,
    width,
    height,
    frameCount: decoded.length,
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
