/**
 * Shared AI fetch helper — uses OpenAPI js-client for consistent errors / request IDs.
 */
import { createApiClient, API_PATHS } from './js-client.js'

const client = createApiClient()

/**
 * POST multipart to an /api/ai/* route.
 * @param {string} path — one of API_PATHS.ai*
 * @param {FormData} formData
 * @param {{ signal?: AbortSignal, fetchImpl?: typeof fetch }} [opts]
 */
export async function aiPost(path, formData, opts = {}) {
  const c = opts.fetchImpl
    ? createApiClient({ fetchImpl: opts.fetchImpl })
    : client
  const { data } = await c.request(path, {
    method: 'POST',
    body: formData,
    signal: opts.signal,
  })
  return data
}

/**
 * Soft matte via js-client (proof that hand clients can share the wrapper).
 * @param {FormData} formData
 * @param {{ signal?: AbortSignal, fetchImpl?: typeof fetch }} [opts]
 */
export async function postMatte(formData, opts = {}) {
  return aiPost(API_PATHS.aiMatte, formData, opts)
}

export { API_PATHS }
