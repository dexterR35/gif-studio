/**
 * Optional SceneEvaluator hook for preview draw (strangler).
 * When sceneEvaluatorV2 is on, builds a RenderPlan for the current time
 * without replacing the Canvas2D draw path yet.
 */
import { isFeatureEnabled } from '../domain/feature-flags.js'
import { evaluate } from './scene-evaluator.js'
import { useStudioStore } from '../store/studio-store.js'

/** @type {import('./render-plan.js').RenderPlan | null} */
let lastPlan = null

/**
 * @param {number} progress 0..1 playback progress
 * @returns {import('./render-plan.js').RenderPlan | null}
 */
export function evaluatePreviewPlan(progress = 0) {
  if (!isFeatureEnabled('sceneEvaluatorV2')) {
    lastPlan = null
    return null
  }
  const state = useStudioStore.getState()
  const project = state.project
  if (!project || project.schemaVersion !== 2) {
    lastPlan = null
    return null
  }
  const durationUs = project.timeline?.durationUs || 10_000_000
  const timeUs = Math.round(Math.max(0, Math.min(1, Number(progress) || 0)) * durationUs)
  try {
    lastPlan = evaluate(project, timeUs, {})
  } catch {
    lastPlan = null
  }
  return lastPlan
}

export function getLastPreviewPlan() {
  return lastPlan
}
