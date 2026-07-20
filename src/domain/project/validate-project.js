import Ajv2020 from 'ajv/dist/2020.js'
import { z } from 'zod'
import projectV2Schema from '../../../schemas/project-v2.schema.json'
import { StudioError } from '../errors/studio-error.js'
import { checkProjectInvariants } from './invariants.js'

let _ajvValidate = null

function loadSchema() {
  // Bundled JSON import (browser + Node); clone so we can strip $schema for Ajv.
  const schema = structuredClone(projectV2Schema)
  delete schema.$schema
  return schema
}

function getAjvValidate() {
  if (_ajvValidate) return _ajvValidate
  const ajv = new Ajv2020({ allErrors: true, strict: false })
  _ajvValidate = ajv.compile(loadSchema())
  return _ajvValidate
}

/** Lightweight Zod shape for quick structural checks (not full oneOf depth). */
export const ProjectV2Zod = z.object({
  schemaVersion: z.literal(2),
  id: z.string().min(1),
  projectSeed: z.string().min(1),
  metadata: z.object({
    name: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
    appVersion: z.string(),
  }),
  canvas: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    background: z.union([
      z.object({ kind: z.literal('transparent') }),
      z.object({ kind: z.literal('solid'), color: z.string() }),
    ]),
    colorSpace: z.literal('srgb'),
  }),
  assets: z.record(z.string(), z.object({
    id: z.string(),
    kind: z.enum(['image', 'animated-image', 'mask', 'depth', 'font', 'video']),
    mimeType: z.string(),
    checksumSha256: z.string(),
    byteLength: z.number().int().nonnegative(),
    storageKey: z.string().min(1),
  }).passthrough()),
  rootLayerIds: z.array(z.string()),
  layers: z.record(z.string(), z.object({
    id: z.string(),
    type: z.string(),
  }).passthrough()),
  timeline: z.object({
    durationUs: z.number().int().nonnegative(),
    loopMode: z.enum(['once', 'loop', 'ping-pong']),
    tracks: z.record(z.string(), z.any()),
    trackOrder: z.array(z.string()),
  }),
  exportSettings: z.object({
    format: z.enum(['gif', 'png', 'webp']),
    fps: z.number().positive(),
    quality: z.string(),
    loop: z.number().int().nonnegative(),
    paletteSize: z.number().int().min(2).max(256),
    dither: z.union([z.boolean(), z.string()]),
  }).passthrough(),
  extensions: z.record(z.string(), z.unknown()).optional(),
})

/**
 * Validate ProjectDocumentV2 with Ajv JSON Schema + invariants.
 * @param {unknown} doc
 * @returns {{ ok: true, project: object } | { ok: false, errors: string[] }}
 */
export function validateProjectV2(doc) {
  const errors = []

  const zodResult = ProjectV2Zod.safeParse(doc)
  if (!zodResult.success) {
    for (const issue of zodResult.error.issues) {
      errors.push(`zod: ${issue.path.join('.')}: ${issue.message}`)
    }
  }

  try {
    const validate = getAjvValidate()
    const valid = validate(doc)
    if (!valid) {
      for (const err of validate.errors || []) {
        errors.push(`schema: ${err.instancePath || '/'} ${err.message}`)
      }
    }
  } catch (e) {
    errors.push(`schema load failed: ${e instanceof Error ? e.message : String(e)}`)
  }

  if (errors.length === 0) {
    const inv = checkProjectInvariants(/** @type {object} */ (doc))
    if (!inv.ok) errors.push(...inv.errors)
  }

  if (errors.length) return { ok: false, errors }
  return { ok: true, project: /** @type {object} */ (doc) }
}

/**
 * @param {unknown} doc
 * @throws {StudioError}
 */
export function assertValidProjectV2(doc) {
  const result = validateProjectV2(doc)
  if (!result.ok) {
    throw new StudioError('PROJECT_VALIDATION_FAILED', 'Project document failed validation', {
      details: { errors: result.errors },
    })
  }
  return result.project
}
