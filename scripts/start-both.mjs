#!/usr/bin/env node
/**
 * Start FastAPI + Vite together (npm run start).
 * Ctrl+C stops both.
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'

const children = []

function run(name, args, color) {
  const child = spawn(npm, args, {
    cwd: root,
    stdio: ['inherit', 'pipe', 'pipe'],
    env: process.env,
    shell: process.platform === 'win32',
  })
  const tag = (stream) => {
    stream.on('data', (buf) => {
      const text = buf.toString()
      for (const line of text.split(/\r?\n/)) {
        if (line.length) process.stdout.write(`${color}[${name}]\x1b[0m ${line}\n`)
      }
    })
  }
  tag(child.stdout)
  tag(child.stderr)
  child.on('exit', (code, signal) => {
    if (shuttingDown) return
    console.error(`[${name}] exited (${signal || code}) — stopping the other process`)
    shutdown(code ?? 1)
  })
  children.push(child)
  return child
}

let shuttingDown = false
function shutdown(code = 0) {
  if (shuttingDown) return
  shuttingDown = true
  for (const child of children) {
    try {
      child.kill('SIGTERM')
    } catch { /* ignore */ }
  }
  setTimeout(() => process.exit(code), 200)
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

console.log('Starting API + web…  http://127.0.0.1:5173')
run('api', ['run', 'api'], '\x1b[35m')
run('web', ['run', 'dev'], '\x1b[36m')
