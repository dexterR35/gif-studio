/**
 * Thin V1 ↔ V2 project bridge for strangler migration (Phases 1–14).
 * Does not rewrite StudioProvider — keeps V2 alongside V1 when flagged.
 */

import {
  isFeatureEnabled,
  createEmptyProjectV2,
  migrateV1ToV2,
} from '../domain/index.js'
import { createEmptyProject } from '../lib/project-document.js'

/**
 * @param {object | null | undefined} v1
 * @param {object | null | undefined} [previousV2] keep on failure so Layers panel is not wiped
 * @returns {object | null}
 */
export function ensureProjectV2(v1, previousV2 = null) {
  if (!isFeatureEnabled('projectV2')) {
    return null
  }
  if (v1 && typeof v1 === 'object' && v1.schemaVersion === 2) {
    return v1
  }
  try {
    const { project } = migrateV1ToV2(v1 || createEmptyProject())
    return project
  } catch (err) {
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[project-v2] migrateV1ToV2 failed; keeping previous projection', err)
    }
    if (previousV2 && previousV2.schemaVersion === 2) {
      return previousV2
    }
    return createEmptyProjectV2({
      name: v1?.name,
      width: v1?.settings?.width,
      height: v1?.settings?.height,
    })
  }
}

/**
 * Active document for new code paths.
 * When projectV2 flag is on and a V2 doc exists, return it; else V1.
 *
 * @param {{ project?: object, projectV2?: object | null }} state
 * @returns {object}
 */
export function getActiveProjectDocument(state) {
  if (!state) return createEmptyProject()
  if (isFeatureEnabled('projectV2') && state.projectV2 && state.projectV2.schemaVersion === 2) {
    return state.projectV2
  }
  return state.project || createEmptyProject()
}

/**
 * Sync helper after V1 mutations: refresh V2 projection when flag is on.
 * @param {object} v1
 * @param {object | null | undefined} previousV2
 * @returns {object | null}
 */
export function syncProjectV2FromV1(v1, previousV2) {
  if (!isFeatureEnabled('projectV2')) return previousV2 ?? null
  return ensureProjectV2(v1, previousV2)
}

/**
 * Load raw JSON into { project (V1), projectV2 }.
 * @param {object} raw
 * @returns {{ project: object, projectV2: object | null }}
 */
export function loadProjectPair(raw) {
  if (raw && raw.schemaVersion === 2) {
    const v2 = raw
    // Keep legacy V1 slot as empty shell + name; UI still reads V1 arrays until strangler completes.
    const v1 = createEmptyProject()
    v1.name = v2.metadata?.name || v1.name
    v1.id = v2.id || v1.id
    if (isFeatureEnabled('projectV2')) {
      return { project: v1, projectV2: v2 }
    }
    return { project: v1, projectV2: null }
  }

  const project = raw && typeof raw === 'object' ? raw : createEmptyProject()
  const projectV2 = isFeatureEnabled('projectV2') ? ensureProjectV2(project) : null
  return { project, projectV2 }
}
