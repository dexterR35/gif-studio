#!/usr/bin/env node
/**
 * Start FastAPI + Vite together (npm run start).
 * Preflight checks, fixed ports, direct child processes. Ctrl+C stops both.
 */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const isWin = process.platform === 'win32'
const bin = isWin ? 'Scripts' : 'bin'
const pyExe = isWin ? 'python.exe' : 'python'
const WEB_HOST = '127.0.0.1'
const WEB_PORT = 5173

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

function portAvailable(host, port) {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.once('error', () => resolve(false))
    server.once('listening', () => {
      server.close(() => resolve(true))
    })
    server.listen(port, host)
  })
}

function venvPython() {
  return path.join(root, '.venv', bin, pyExe)
}

function ensureSetup() {
  const vpy = venvPython()
  if (!existsSync(vpy)) {
    console.error('Missing .venv. Run setup first:\n  npm run setup')
    process.exit(1)
  }
  if (!existsSync(path.join(root, 'node_modules', 'vite', 'package.json'))) {
    console.error('Missing node_modules. Run setup first:\n  npm run setup')
    process.exit(1)
  }
  const check = spawnSync(
    vpy,
    ['-c', 'import cv2, fastapi, uvicorn; import gif_studio.web_api'],
    { cwd: root, encoding: 'utf8', shell: isWin },
  )
  if (check.status !== 0) {
    console.error('Python API dependencies are missing or broken.')
    if (check.stderr) {
      console.error(check.stderr.trim())
    }
    console.error('\nRun setup first:\n  npm run setup')
    process.exit(1)
  }
  return vpy
}

function buildEnv() {
  const fileEnv = loadDotEnv()
  const venvDir = path.join(root, '.venv')
  return {
    ...process.env,
    ...fileEnv,
    VIRTUAL_ENV: process.env.VIRTUAL_ENV || venvDir,
  }
}

async function preflight(env) {
  const apiHost = env.GIF_STUDIO_API_HOST || '127.0.0.1'
  const apiPort = Number(env.GIF_STUDIO_API_PORT || '8000')

  if (!(await portAvailable(apiHost, apiPort))) {
    console.error(
      `API port ${apiHost}:${apiPort} is already in use.\n` +
        'Stop the other process or change GIF_STUDIO_API_PORT in .env',
    )
    process.exit(1)
  }
  if (!(await portAvailable(WEB_HOST, WEB_PORT))) {
    console.error(
      `Web port ${WEB_HOST}:${WEB_PORT} is already in use.\n` +
        'Stop the other Vite dev server before running npm run start.',
    )
    process.exit(1)
  }

  return { apiHost, apiPort }
}

const children = []
let shuttingDown = false

function run(name, cmd, args, env, color) {
  const child = spawn(cmd, args, {
    cwd: root,
    stdio: ['inherit', 'pipe', 'pipe'],
    env,
    shell: isWin,
  })
  const tag = (stream) => {
    stream.on('data', (buf) => {
      const text = buf.toString()
      for (const line of text.split(/\r?\n/)) {
        if (line.length) {
          process.stdout.write(`${color}[${name}]\x1b[0m ${line}\n`)
        }
      }
    })
  }
  tag(child.stdout)
  tag(child.stderr)
  child.on('exit', (code, signal) => {
    if (shuttingDown) {
      return
    }
    console.error(`[${name}] exited (${signal || code}) — stopping the other process`)
    shutdown(code ?? 1)
  })
  children.push(child)
  return child
}

function shutdown(code = 0) {
  if (shuttingDown) {
    return
  }
  shuttingDown = true
  for (const child of children) {
    try {
      child.kill('SIGTERM')
    } catch {
      /* ignore */
    }
  }
  setTimeout(() => process.exit(code), 200)
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

const vpy = ensureSetup()
const env = buildEnv()
const { apiHost, apiPort } = await preflight(env)
const viteBin = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js')

console.log(`Starting API + web…`)
console.log(`  web  http://${WEB_HOST}:${WEB_PORT}`)
console.log(`  api  http://${apiHost}:${apiPort}`)

run('api', vpy, ['run_web_api.py'], env, '\x1b[35m')
run('web', process.execPath, [viteBin, '--host', WEB_HOST, '--port', String(WEB_PORT), '--strictPort'], env, '\x1b[36m')
