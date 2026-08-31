import { partitionRedactionLast } from '../domain/layers/layer-order.js'
import { EVAL_ORDER_STEPS } from './eval-order.js'
import { appendPass, createRenderPlan } from './render-plan.js'

/**
 * Pure scene evaluation → RenderPlan.
 * No DOM, React, Math.random, or mutable runtime canvases.
 *
 * @param {object} project ProjectDocumentV2
 * @param {Record<string, object>} [assetsMeta] optional runtime metadata by assetId
 * @returns {import('./render-plan.js').RenderPlan}
 */
export function evaluate(project, assetsMeta = {}) {
  let plan = createRenderPlan({
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
          transform: layer.transform,
          opacity: layer.opacity ?? 1,
          blendMode: layer.blendMode || 'source-over',
          effects: [],
          mediaMeta: meta
            ? {
                width: meta.width,
                height: meta.height,
                kind: meta.kind,
              }
            : null,
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
          transform: layer.transform,
          opacity: layer.opacity ?? 1,
          blendMode: layer.blendMode || 'source-over',
          effects: [],
        },
      })
    }
  }

  // Secure redaction last (after scene)
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
      format: 'png',
      reducePalette: Boolean(project.exportSettings?.reducePalette),
    },
  })

  return plan
}
