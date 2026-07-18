#!/usr/bin/env node
/**
 * Resolve a Python interpreter and start the FastAPI server.
 * Order: VIRTUAL_ENV → .venv → venv → python3 → python
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const isWin = process.platform === 'win32'
const bin = isWin ? 'Scripts' : 'bin'
const exe = isWin ? 'python.exe' : 'python'

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
  console.error('No Python interpreter found. Create .venv or set VIRTUAL_ENV.')
  process.exit(1)
}

console.log(`API python: ${python}`)
const child = spawn(python, ['run_web_api.py'], {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
  shell: isWin,
})
child.on('exit', (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0))
})
