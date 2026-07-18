/**
 * ffmpeg.wasm — video / GIF import & export.
 * Uses single-thread core to avoid SharedArrayBuffer / COOP requirements in Vite.
 */
import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'

let ffmpeg = null
let loading = null

const CORE_BASE = import.meta.env.VITE_FFMPEG_CORE_BASE
  || 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm'

export async function loadFFmpeg(onLog) {
  if (ffmpeg?.loaded) return ffmpeg
  if (loading) return loading
  loading = (async () => {
    ffmpeg = new FFmpeg()
    if (onLog) ffmpeg.on('log', ({ message }) => onLog(message))
    const coreURL = await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, 'text/javascript')
    const wasmURL = await toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, 'application/wasm')
    await ffmpeg.load({ coreURL, wasmURL })
    return ffmpeg
  })()
  try {
    return await loading
  } finally {
    loading = null
  }
}

export async function probeFFmpeg() {
  try {
    await loadFFmpeg()
    return true
  } catch {
    return false
  }
}

/**
 * Encode PNG frame blobs → GIF via ffmpeg.
 * @param {Blob[]} pngFrames
 * @param {{ fps?: number, onProgress?: (p:number)=>void }} opts
 */
export async function encodeGifWithFFmpeg(pngFrames, { fps = 24, onProgress } = {}) {
  const ff = await loadFFmpeg()
  for (let i = 0; i < pngFrames.length; i += 1) {
    const name = `frame_${String(i).padStart(5, '0')}.png`
    await ff.writeFile(name, await fetchFile(pngFrames[i]))
    onProgress?.(i / Math.max(1, pngFrames.length))
  }
  const pattern = 'frame_%05d.png'
  await ff.exec([
    '-framerate', String(fps),
    '-i', pattern,
    '-gifflags', '+transdiff',
    '-y', 'out.gif',
  ])
  const data = await ff.readFile('out.gif')
  onProgress?.(1)
  return new Blob([data], { type: 'image/gif' })
}

/**
 * Extract frames from a video/GIF file into PNG blobs.
 */
export async function extractFramesWithFFmpeg(file, { fps = 12, maxFrames = 120 } = {}) {
  const ff = await loadFFmpeg()
  const input = 'input' + (file.name.match(/\.[^.]+$/)?.[0] || '.mp4')
  await ff.writeFile(input, await fetchFile(file))
  await ff.exec([
    '-i', input,
    '-vf', `fps=${fps}`,
    '-frames:v', String(maxFrames),
    'frame_%05d.png',
  ])
  const frames = []
  for (let i = 1; i <= maxFrames; i += 1) {
    const name = `frame_${String(i).padStart(5, '0')}.png`
    try {
      const data = await ff.readFile(name)
      frames.push(new Blob([data], { type: 'image/png' }))
    } catch {
      break
    }
  }
  return frames
}

/**
 * Transcode GIF → MP4 (H.264).
 */
export async function gifToMp4(gifBlob, { onProgress } = {}) {
  const ff = await loadFFmpeg()
  await ff.writeFile('in.gif', await fetchFile(gifBlob))
  onProgress?.(0.2)
  await ff.exec([
    '-i', 'in.gif',
    '-movflags', 'faststart',
    '-pix_fmt', 'yuv420p',
    '-y', 'out.mp4',
  ])
  onProgress?.(1)
  const data = await ff.readFile('out.mp4')
  return new Blob([data], { type: 'video/mp4' })
}
