/**
 * Map HTTP / problem+json responses to typed client errors.
 */

/**
 * @param {unknown} body
 * @returns {body is { status?: number, title?: string, detail?: string, type?: string, code?: string, request_id?: string, requestId?: string }}
 */
export function isProblemJson(body) {
  return Boolean(
    body
    && typeof body === 'object'
    && (body.title != null || body.detail != null || body.type != null || body.code != null),
  )
}

/**
 * @param {Response} response
 * @param {unknown} body
 * @param {string} [requestId]
 */
export function mapApiError(response, body, requestId) {
  const status = response?.status || 0
  const problem = isProblemJson(body) ? body : null
  const code = problem?.code
    || problem?.type
    || statusToCode(status)
  const message = problem?.detail
    || problem?.title
    || (typeof body === 'string' && body)
    || `Request failed (${status})`
  const rid = problem?.request_id || problem?.requestId || requestId || null

  const err = new Error(message)
  err.name = 'ApiError'
  err.code = code
  err.status = status
  err.requestId = rid
  err.retryable = Boolean(problem?.retryable) || status === 429 || status >= 500
  err.problem = problem
  err.fieldErrors = problem?.errors || problem?.field_errors || null
  return err
}

function statusToCode(status) {
  if (status === 400) return 'BAD_REQUEST'
  if (status === 401) return 'UNAUTHORIZED'
  if (status === 403) return 'FORBIDDEN'
  if (status === 404) return 'NOT_FOUND'
  if (status === 409) return 'CONFLICT'
  if (status === 413) return 'PAYLOAD_TOO_LARGE'
  if (status === 422) return 'VALIDATION_ERROR'
  if (status === 429) return 'RATE_LIMITED'
  if (status >= 500) return 'SERVER_ERROR'
  return 'HTTP_ERROR'
}

/**
 * Parse response body as JSON or text.
 * @param {Response} response
 */
export async function readErrorBody(response) {
  const ct = response.headers.get('content-type') || ''
  if (ct.includes('json')) {
    try {
      return await response.json()
    } catch {
      return null
    }
  }
  try {
    return await response.text()
  } catch {
    return null
  }
}
