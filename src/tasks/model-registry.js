/**
 * Model / engine capability registry shaped from GET /api/health.
 * Prefer structured engines over bare booleans.
 */

const ENGINE_KEYS = [
  'rembg',
  'sam2',
  'sam3',
  'grounding_dino',
  'matte',
  'depth',
  'realesrgan',
  'rife',
  'gfpgan',
  'gifsicle',
  'oxipng',
]

/**
 * @param {Record<string, unknown>|null|undefined} health
 * @returns {{
 *   apiAvailable: boolean,
 *   engines: Array<{
 *     id: string,
 *     task: string,
 *     status: 'available'|'unavailable'|'experimental',
 *     runtime: 'browser'|'server',
 *     qualityTier: 'fast'|'balanced'|'best',
 *     supportsAnimated: boolean,
 *     supportsCancellation: boolean,
 *     reasonUnavailable?: string,
 *     revision?: string,
 *     raw?: unknown,
 *   }>,
 *   device: Record<string, unknown>,
 *   models: Record<string, unknown>,
 * }}
 */
export function buildModelRegistry(health) {
  if (!health || typeof health !== 'object') {
    return {
      apiAvailable: false,
      engines: ENGINE_KEYS.map((id) => unavailableEngine(id, 'API health unavailable')),
      device: {},
      models: {},
    }
  }

  const models = (health.models && typeof health.models === 'object') ? health.models : {}
  const enginesPayload = (health.engines && typeof health.engines === 'object')
    ? health.engines
    : {}
  const device = (health.device && typeof health.device === 'object') ? health.device : {}

  const engines = ENGINE_KEYS.map((id) => {
    const structured = enginesPayload[id]
    if (structured && typeof structured === 'object') {
      return normalizeEngine(id, structured, models)
    }
    const flag = health[id]
    const available = Boolean(flag)
    return {
      id,
      task: taskForEngine(id),
      status: available ? 'available' : 'unavailable',
      runtime: 'server',
      qualityTier: qualityForEngine(id),
      supportsAnimated: animatedSupport(id),
      supportsCancellation: true,
      reasonUnavailable: available ? undefined : `${id} not available on local backend`,
      revision: models[id]?.revision || models[id]?.version || undefined,
      raw: flag,
    }
  })

  return {
    apiAvailable: health.status === 'ok' || Boolean(health.opencv),
    engines,
    device,
    models,
  }
}

function unavailableEngine(id, reason) {
  return {
    id,
    task: taskForEngine(id),
    status: 'unavailable',
    runtime: 'server',
    qualityTier: qualityForEngine(id),
    supportsAnimated: animatedSupport(id),
    supportsCancellation: true,
    reasonUnavailable: reason,
  }
}

function normalizeEngine(id, structured, models) {
  const available = structured.available !== false
    && structured.status !== 'unavailable'
    && structured.status !== 'missing'
  const status = structured.status
    || (available ? 'available' : 'unavailable')
  return {
    id,
    task: structured.task || taskForEngine(id),
    status: status === 'experimental' ? 'experimental' : (available ? 'available' : 'unavailable'),
    runtime: structured.runtime || 'server',
    qualityTier: structured.qualityTier || qualityForEngine(id),
    supportsAnimated: structured.supportsAnimated ?? animatedSupport(id),
    supportsCancellation: structured.supportsCancellation !== false,
    reasonUnavailable: available
      ? undefined
      : (structured.reason || structured.reasonUnavailable || `${id} unavailable`),
    revision: structured.revision
      || models[id]?.revision
      || models[id]?.version
      || undefined,
    raw: structured,
  }
}

function taskForEngine(id) {
  const map = {
    rembg: 'matte',
    matte: 'matte',
    sam2: 'segment',
    sam3: 'segment',
    grounding_dino: 'detect',
    depth: 'depth',
    realesrgan: 'upscale',
    rife: 'interpolate',
    gfpgan: 'enhance',
    gifsicle: 'export',
    oxipng: 'optimize',
  }
  return map[id] || id
}

function qualityForEngine(id) {
  if (id === 'realesrgan' || id === 'sam2' || id === 'sam3' || id === 'matte') return 'best'
  if (id === 'rife' || id === 'depth') return 'balanced'
  return 'fast'
}

function animatedSupport(id) {
  return id === 'rife' || id === 'gifsicle' || id === 'realesrgan'
}

/**
 * @param {ReturnType<typeof buildModelRegistry>} registry
 * @param {string} engineId
 */
export function getEngine(registry, engineId) {
  return registry?.engines?.find((e) => e.id === engineId) || null
}

/**
 * @param {ReturnType<typeof buildModelRegistry>} registry
 * @param {string} task
 * @param {'fast'|'balanced'|'best'} [tier]
 */
export function enginesForTask(registry, task, tier) {
  const list = (registry?.engines || []).filter((e) => e.task === task)
  if (!tier) return list
  return list.filter((e) => e.qualityTier === tier)
}
