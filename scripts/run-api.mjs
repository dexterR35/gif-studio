#!/usr/bin/env node
/**
 * Resolve a Python interpreter and start the FastAPI server.
 * Order: VIRTUAL_ENV → .venv → venv → python3 → python
 */
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const isWin = process.platform === 'win32'
const bin = isWin ? 'Scripts' : 'bin'
const exe = isWin ? 'python.exe' : 'python'

function loadDotEnv() {
  const envPath = path.join(root, '.env')
  if (!existsSync(envPath)) {
    return {}
  }
  const parsed = {}
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) {
      continue
    }
    const eq = trimmed.indexOf('=')
    if (eq === -1) {
      continue
    }
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    parsed[key] = value
  }
  return parsed
}

function candidates() {
  const list = []
  if (process.env.VIRTUAL_ENV) {
    list.push(path.join(process.env.VIRTUAL_ENV, bin, exe))
  }
  list.push(path.join(root, '.venv', bin, exe))
  list.push(path.join(root, 'venv', bin, exe))
  list.push(isWin ? 'python' : 'python3')
  list.push('python')
  return list
}

const python = candidates().find((p) => p === 'python' || p === 'python3' || existsSync(p))
if (!python) {
  console.error('No Python interpreter found. Run: npm run setup')
  process.exit(1)
}

const venvDir = path.join(root, '.venv')
const env = {
  ...process.env,
  ...loadDotEnv(),
  VIRTUAL_ENV: process.env.VIRTUAL_ENV || (existsSync(venvDir) ? venvDir : process.env.VIRTUAL_ENV),
}

console.log(`API python: ${python}`)
const child = spawn(python, ['run_web_api.py'], {
  cwd: root,
  stdio: 'inherit',
  env,
  shell: isWin,
})
child.on('exit', (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0))
})
