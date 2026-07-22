import { partitionRedactionLast } from '../domain/layers/layer-order.js'
import { evaluateLayerTracks } from '../domain/timeline/evaluate-tracks.js'
import { clampTime, mapLoopTime } from '../domain/timeline/time.js'
import { hashSeed } from '../domain/timeline/seeded-random.js'
import { EVAL_ORDER_STEPS } from './eval-order.js'
import { appendPass, createRenderPlan } from './render-plan.js'

/**
 * Pure scene evaluation → RenderPlan.
 * No DOM, React, Math.random, or mutable runtime canvases.
 *
 * @param {object} project ProjectDocumentV2
 * @param {number} timeUs
 * @param {Record<string, object>} [assetsMeta] optional runtime metadata by assetId
 * @param {{ frameIndex?: number }} [opts]
 * @returns {import('./render-plan.js').RenderPlan}
 */
export function evaluate(project, timeUs, assetsMeta = {}, opts = {}) {
  const timeline = project.timeline || { durationUs: 0, loopMode: 'once', tracks: {}, trackOrder: [] }
  const mapped = mapLoopTime(timeUs, timeline.durationUs, timeline.loopMode || 'once')
  const t = clampTime(mapped, timeline.durationUs)
  const projectSeed = project.projectSeed || '0'
  const frameIndex = opts.frameIndex ?? Math.floor(t / Math.max(1, Math.round(1_000_000 / (project.exportSettings?.fps || 24))))

  let plan = createRenderPlan({
    timeUs: t,
    projectSeed,
    frameIndex,
    canvas: {
      width: project.canvas?.width ?? 1,
      height: project.canvas?.height ?? 1,
      background: project.canvas?.background ?? { kind: 'transparent' },
      colorSpace: project.canvas?.colorSpace ?? 'srgb',
    },
    evalOrder: [...EVAL_ORDER_STEPS],
  })

  plan = appendPass(plan, {
    kind: 'background',
    payload: { background: plan.canvas.background },
  })

  const layers = project.layers || {}
  const { sceneIds, redactionIds } = partitionRedactionLast(
    project.rootLayerIds || [],
    layers,
  )

  for (const layerId of sceneIds) {
    const layer = layers[layerId]
    if (!layer || layer.visible === false) continue

    if (layer.type === 'adjustment') {
      plan = appendPass(plan, {
        kind: 'adjustment',
        layerId,
        payload: {
          scope: layer.scope,
          effects: [],
          opacity: layer.opacity ?? 1,
          blendMode: layer.blendMode || 'source-over',
        },
      })
      continue
    }

    if (layer.type === 'pixelate') {
      plan = appendPass(plan, {
        kind: 'pixelate',
        layerId,
        payload: {
          region: layer.region,
          pixelSize: layer.pixelSize,
          opacity: layer.opacity ?? 1,
        },
      })
      continue
    }

    const evaluated = evaluateLayerTracks(layer, timeline, t, {
      projectSeed,
      frameIndex,
    })

    const seed = hashSeed(projectSeed, layerId, frameIndex)

    if (layer.type === 'raster') {
      const meta = assetsMeta[layer.assetId] || project.assets?.[layer.assetId] || null
      plan = appendPass(plan, {
        kind: 'layer',
        layerId,
        payload: {
          type: 'raster',
          assetId: layer.assetId,
          rollbackAssetId: layer.rollbackAssetId,
          maskAssetId: layer.maskAssetId,
          transform: evaluated.transform,
          opacity: evaluated.opacity,
          blendMode: layer.blendMode || 'source-over',
          effects: [],
          mediaMeta: meta
            ? {
                width: meta.width,
                height: meta.height,
                frameCount: meta.frameCount,
                durationUs: meta.durationUs,
                kind: meta.kind,
              }
            : null,
          seed,
        },
      })
      continue
    }

    if (layer.type === 'text') {
      plan = appendPass(plan, {
        kind: 'layer',
        layerId,
        payload: {
          type: 'text',
          text: layer.text,
          style: layer.style,
          fontAssetId: layer.fontAssetId,
          transform: evaluated.transform,
          opacity: evaluated.opacity,
          blendMode: layer.blendMode || 'source-over',
          effects: [],
          seed,
        },
      })
    }
  }

  // Secure redaction last (after scene + pixelate)
  for (const layerId of redactionIds) {
    const layer = layers[layerId]
    if (!layer || layer.visible === false) continue
    plan = appendPass(plan, {
      kind: 'redaction',
      layerId,
      payload: {
        region: layer.region,
        fill: layer.fill,
        secure: true,
      },
    })
  }

  plan = appendPass(plan, {
    kind: 'export-convert',
    payload: {
      format: project.exportSettings?.format || 'gif',
      paletteSize: project.exportSettings?.paletteSize,
    },
  })

  return plan
}
