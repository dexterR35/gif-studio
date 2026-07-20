import { describe, it, expect } from 'vitest'
import { createEmptyProjectV2 } from '../../src/domain/index.js'
import { evaluate, assertRedactionLast, firstRedactionPassIndex } from '../../src/render/index.js'

function sampleProject() {
  const doc = createEmptyProjectV2({ projectSeed: 'eval-seed', durationUs: 1_000_000 })
  doc.assets['img'] = {
    id: 'img',
    kind: 'image',
    mimeType: 'image/png',
    checksumSha256: '11',
    byteLength: 8,
    storageKey: 'mem:img',
    width: 32,
    height: 32,
  }
  doc.layers['bg'] = {
    id: 'bg',
    type: 'raster',
    name: 'Background',
    visible: true,
    locked: true,
    opacity: 1,
    blendMode: 'source-over',
    transform: {
      x: 0, y: 0, scaleX: 1, scaleY: 1, rotationDeg: 0, anchorX: 0.5, anchorY: 0.5,
    },
    effects: [],
    animationTrackIds: ['track-noise'],
    assetId: 'img',
    cutoutMotion: 'None',
  }
  doc.layers['redact1'] = {
    id: 'redact1',
    type: 'redaction',
    name: 'Redact',
    visible: true,
    locked: false,
    region: { kind: 'rect', x: 0, y: 0, w: 10, h: 10 },
    fill: '#000000',
    secure: true,
  }
  // Place redaction in the middle of root order — evaluator must still emit it last
  doc.rootLayerIds = ['redact1', 'bg']
  doc.timeline.tracks['track-noise'] = {
    id: 'track-noise',
    target: { layerId: 'bg', property: 'x' },
    mode: 'additive',
    keyframes: [],
    modifiers: [{ id: 'n1', type: 'Noise', amplitude: 5, speed: 1 }],
  }
  doc.timeline.trackOrder = ['track-noise']
  return doc
}

describe('SceneEvaluator', () => {
  it('seeded determinism for identical inputs', () => {
    const project = sampleProject()
    const a = evaluate(project, 250_000, {}, { frameIndex: 6 })
    const b = evaluate(project, 250_000, {}, { frameIndex: 6 })
    expect(a).toEqual(b)

    const layerPass = a.passes.find((p) => p.kind === 'layer' && p.layerId === 'bg')
    expect(layerPass.payload.seed).toBeTypeOf('number')
    expect(layerPass.payload.transform.x).toBeTypeOf('number')
  })

  it('places redaction last in plan (before export-convert)', () => {
    const project = sampleProject()
    const plan = evaluate(project, 0, {})
    expect(assertRedactionLast(plan)).toBe(true)
    const redactionIdx = firstRedactionPassIndex(plan)
    const layerIdx = plan.passes.findIndex((p) => p.kind === 'layer')
    const exportIdx = plan.passes.findIndex((p) => p.kind === 'export-convert')
    expect(redactionIdx).toBeGreaterThan(layerIdx)
    expect(redactionIdx).toBeLessThan(exportIdx)
    expect(plan.passes[redactionIdx].payload.secure).toBe(true)
  })
})
