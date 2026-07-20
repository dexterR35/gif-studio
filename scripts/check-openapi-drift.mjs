#!/usr/bin/env node
/**
 * Assert schemas/api/openapi.json documents required API paths.
 * Exit 1 if any required path is missing.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const openapiPath = join(root, 'schemas', 'api', 'openapi.json')

const REQUIRED_PATHS = [
  '/api/health',
  '/api/v1/jobs',
  '/api/v1/jobs/{job_id}',
  '/api/v1/jobs/{job_id}/cancel',
  '/api/v1/jobs/{job_id}/result',
  '/api/export',
  '/api/ai/matte',
]

let doc
try {
  doc = JSON.parse(readFileSync(openapiPath, 'utf8'))
} catch (err) {
  console.error(`Failed to load ${openapiPath}:`, err.message)
  process.exit(1)
}

const paths = doc.paths && typeof doc.paths === 'object' ? doc.paths : {}
const missing = REQUIRED_PATHS.filter((p) => !(p in paths))

if (missing.length) {
  console.error('OpenAPI drift: missing required paths:')
  for (const p of missing) console.error(`  - ${p}`)
  process.exit(1)
}

console.log(`OpenAPI OK: ${REQUIRED_PATHS.length} required paths present in ${openapiPath}`)
process.exit(0)
