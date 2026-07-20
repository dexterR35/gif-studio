import { describe, expect, it, vi } from 'vitest'
import { createApiClient, API_PATHS, createRequestId } from '../../src/api/js-client.js'
import { mapApiError, isProblemJson } from '../../src/api/error-mapping.js'
import { postMatte } from '../../src/api/ai-fetch.js'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')

describe('openapi paths', () => {
  it('js-client paths match openapi.json required routes', () => {
    const doc = JSON.parse(readFileSync(join(root, 'schemas/api/openapi.json'), 'utf8'))
    expect(doc.paths[API_PATHS.health]).toBeTruthy()
    expect(doc.paths[API_PATHS.jobs]).toBeTruthy()
    expect(doc.paths['/api/v1/jobs/{job_id}']).toBeTruthy()
    expect(doc.paths['/api/v1/jobs/{job_id}/cancel']).toBeTruthy()
    expect(doc.paths['/api/v1/jobs/{job_id}/result']).toBeTruthy()
    expect(doc.paths[API_PATHS.export]).toBeTruthy()
    expect(doc.paths[API_PATHS.aiMatte]).toBeTruthy()
  })
})

describe('js-client', () => {
  it('sends X-Request-Id and parses JSON success', async () => {
    const fetchImpl = vi.fn(async (url, init) => {
      expect(url).toBe('/api/health')
      expect(init.headers.get('X-Request-Id')).toBeTruthy()
      return new Response(JSON.stringify({ status: 'ok' }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'X-Request-Id': init.headers.get('X-Request-Id'),
        },
      })
    })
    const client = createApiClient({ fetchImpl })
    const { data, requestId } = await client.getHealth()
    expect(data.status).toBe('ok')
    expect(requestId).toBeTruthy()
  })

  it('maps problem+json errors', async () => {
    const fetchImpl = vi.fn(async () => new Response(
      JSON.stringify({
        title: 'Not Found',
        status: 404,
        detail: 'Job missing',
        code: 'JOB_NOT_FOUND',
        request_id: 'abc',
      }),
      {
        status: 404,
        headers: { 'Content-Type': 'application/problem+json' },
      },
    ))
    const client = createApiClient({ fetchImpl })
    await expect(client.getJob('missing')).rejects.toMatchObject({
      name: 'ApiError',
      code: 'JOB_NOT_FOUND',
      status: 404,
      requestId: 'abc',
    })
  })

  it('createJob posts to /api/v1/jobs', async () => {
    const fetchImpl = vi.fn(async (url, init) => {
      expect(url).toBe('/api/v1/jobs')
      expect(init.method).toBe('POST')
      const body = JSON.parse(init.body)
      expect(body.kind).toBe('export')
      return new Response(JSON.stringify({
        job_id: 'j1',
        kind: 'export',
        status: 'queued',
        progress: 0,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })
    const client = createApiClient({ fetchImpl })
    const { data } = await client.createJob({ kind: 'export', params: {} })
    expect(data.job_id).toBe('j1')
  })
})

describe('error-mapping', () => {
  it('detects problem json and maps status codes', () => {
    expect(isProblemJson({ detail: 'x', title: 'y' })).toBe(true)
    const err = mapApiError({ status: 429 }, { detail: 'slow down', title: 'Rate' }, 'rid')
    expect(err.retryable).toBe(true)
    expect(err.requestId).toBe('rid')
    expect(createRequestId().startsWith('req_')).toBe(true)
  })
})

describe('ai-fetch / matte proof', () => {
  it('postMatte uses js-client path', async () => {
    const fetchImpl = vi.fn(async (url, init) => {
      expect(url).toBe('/api/ai/matte')
      expect(init.headers.get('X-Request-Id')).toBeTruthy()
      return new Response(JSON.stringify({ mask: 'data:...' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })
    const form = new FormData()
    form.append('image', new Blob(['x']), 'frame.png')
    const data = await postMatte(form, { fetchImpl })
    expect(data.mask).toBe('data:...')
  })
})
