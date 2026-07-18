/**
 * PixiJS GPU preview — composites the 2D draw canvas via WebGL for playback.
 *
 * Important: never Texture.destroy(true) every frame — that nulls style and
 * triggers addressModeU crashes in Pixi v8 GlTextureSystem.
 */
import { Application, Sprite, Texture, Container } from 'pixi.js'

let app = null
let sprite = null
let texture = null
let root = null

export async function createPixiRenderer({ width, height, canvas } = {}) {
  await destroyPixiRenderer()
  app = new Application()
  await app.init({
    width: Math.max(1, width || 480),
    height: Math.max(1, height || 300),
    canvas: canvas || undefined,
    backgroundAlpha: 0,
    antialias: true,
    preference: 'webgl',
    autoStart: false,
  })
  root = new Container()
  app.stage.addChild(root)
  return app
}

export function getPixiApp() {
  return app
}

export async function destroyPixiRenderer() {
  if (sprite) {
    try {
      root?.removeChild(sprite)
      sprite.destroy({ children: true, texture: false, textureSource: false })
    } catch { /* ignore */ }
    sprite = null
  }
  texture = null
  root = null
  if (!app) return
  try {
    await app.destroy(true, { children: true })
  } catch { /* ignore */ }
  app = null
}

export function resizePixiRenderer(width, height) {
  if (!app) return
  app.renderer.resize(Math.max(1, width), Math.max(1, height))
}

/**
 * Upload an HTMLCanvasElement into the GPU stage and render one frame.
 * Reuses one Texture and calls source.update() — safe for GSAP ticks.
 */
export function blitCanvasToPixi(imageLike) {
  if (!app || !imageLike) return false
  try {
    if (!texture) {
      texture = Texture.from(imageLike)
      sprite = new Sprite(texture)
      sprite.anchor.set(0.5)
      root?.addChild(sprite)
    } else {
      // Same canvas resource — refresh GPU upload without recreating style
      const source = texture.source
      if (source?.resource && source.resource !== imageLike) {
        // Different element: rebuild texture once (not every frame)
        const next = Texture.from(imageLike)
        sprite.texture = next
        try {
          texture.destroy(false)
        } catch { /* ignore */ }
        texture = next
      } else {
        source?.update?.()
        texture.update?.()
      }
    }

    sprite.x = app.screen.width / 2
    sprite.y = app.screen.height / 2
    sprite.width = app.screen.width
    sprite.height = app.screen.height
    app.render()
    return true
  } catch (err) {
    console.warn('[pixi] blit failed', err)
    return false
  }
}

export function setPixiSource(imageLike, { x = 0, y = 0, scale = 1, rotation = 0, alpha = 1 } = {}) {
  if (!app) throw new Error('Pixi renderer not initialized')
  if (!root) {
    root = new Container()
    app.stage.removeChildren()
    app.stage.addChild(root)
  }
  root.removeChildren()
  texture = Texture.from(imageLike)
  sprite = new Sprite(texture)
  sprite.anchor.set(0.5)
  sprite.x = app.screen.width / 2 + x
  sprite.y = app.screen.height / 2 + y
  sprite.scale.set(scale)
  sprite.rotation = (rotation * Math.PI) / 180
  sprite.alpha = alpha
  root.addChild(sprite)
  app.render()
  return sprite
}

export async function readPixiFrame() {
  if (!app) throw new Error('Pixi renderer not initialized')
  return app.renderer.extract.canvas(app.stage)
}

export async function probePixi() {
  try {
    const probe = new Application()
    await probe.init({ width: 4, height: 4, preference: 'webgl', autoStart: false })
    await probe.destroy(true)
    return true
  } catch {
    return false
  }
}
