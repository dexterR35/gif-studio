/**
 * Minimal OpenAPI-backed fetch client (JavaScript, no codegen).
 * Paths mirror schemas/api/openapi.json.
 */
import { mapApiError, readErrorBody } from './error-mapping.js'

/** Paths documented in schemas/api/openapi.json */
export const API_PATHS = {
  health: '/api/health',
  jobs: '/api/v1/jobs',
  job: (jobId) => `/api/v1/jobs/${encodeURIComponent(jobId)}`,
  jobCancel: (jobId) => `/api/v1/jobs/${encodeURIComponent(jobId)}/cancel`,
  jobResult: (jobId) => `/api/v1/jobs/${encodeURIComponent(jobId)}/result`,
  export: '/api/export',
  aiMatte: '/api/ai/matte',
  aiDetect: '/api/ai/detect',
  aiDepth: '/api/ai/depth',
  aiUpscale: '/api/ai/upscale',
  aiInterpolate: '/api/ai/interpolate',
}

/**
 * @param {string} [prefix]
 */
export function createRequestId(prefix = 'req') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

/**
 * @param {{
 *   baseUrl?: string,
 *   fetchImpl?: typeof fetch,
 *   getRequestId?: () => string,
 * }} [options]
 */
export function createApiClient(options = {}) {
  const baseUrl = (options.baseUrl || '').replace(/\/$/, '')
  const fetchImpl = options.fetchImpl || globalThis.fetch
  const getRequestId = options.getRequestId || (() => createRequestId())

  /**
   * @param {string} path
   * @param {RequestInit & { parseJson?: boolean }} [init]
   */
  async function request(path, init = {}) {
    const requestId = getRequestId()
    const headers = new Headers(init.headers || {})
    if (!headers.has('X-Request-Id')) {
      headers.set('X-Request-Id', requestId)
    }
    const { parseJson = true, ...rest } = init
    const url = path.startsWith('http') ? path : `${baseUrl}${path}`
    const response = await fetchImpl(url, { ...rest, headers })
    const responseRequestId = response.headers.get('X-Request-Id') || requestId

    if (!response.ok) {
      const body = await readErrorBody(response)
      throw mapApiError(response, body, responseRequestId)
    }

    if (response.status === 204) {
      return { data: null, response, requestId: responseRequestId }
    }

    if (!parseJson) {
      return { data: response, response, requestId: responseRequestId }
    }

    const ct = response.headers.get('content-type') || ''
    if (ct.includes('application/json') || ct.includes('+json')) {
      const data = await response.json()
      return { data, response, requestId: responseRequestId }
    }
    return { data: response, response, requestId: responseRequestId }
  }

  return {
    paths: API_PATHS,
    request,
    getHealth: () => request(API_PATHS.health),
    createJob: (body) => request(API_PATHS.jobs, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    getJob: (jobId) => request(API_PATHS.job(jobId)),
    cancelJob: (jobId) => request(API_PATHS.jobCancel(jobId), { method: 'POST' }),
    getJobResult: (jobId) => request(API_PATHS.jobResult(jobId)),
    postAiMatte: (formData, init = {}) => request(API_PATHS.aiMatte, {
      method: 'POST',
      body: formData,
      ...init,
    }),
    postExport: (formData, init = {}) => request(API_PATHS.export, {
      method: 'POST',
      body: formData,
      parseJson: false,
      ...init,
    }),
  }
}

export const apiClient = createApiClient()
