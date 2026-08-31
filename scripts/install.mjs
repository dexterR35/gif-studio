#!/usr/bin/env node
/**
 * Full project setup after clone: npm deps, Python API, AI, and models.
 * Skips steps that are already present unless --force is passed.
 *
 * Usage:
 *   npm run setup                 # everything (default after clone)
 *   npm install                   # also runs this via postinstall
 *   node scripts/install.mjs --minimal   # web + image API only (no heavy AI/models)
 *   node scripts/install.mjs --force     # reinstall even when already set up
 */
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const isWin = process.platform === 'win32'
const skipForFrontendBuild = process.env.VERCEL || process.env.CI
const bin = isWin ? 'Scripts' : 'bin'
const pyExe = isWin ? 'python.exe' : 'python'
const force = process.argv.includes('--force')
const minimal = process.argv.includes('--minimal') || process.argv.includes('--no-ai')
const skipModels = process.argv.includes('--skip-models')
const setupMarker = path.join(root, 'models', '.setup-complete')
const cudaTorchFailureMarker = path.join(root, 'models', '.cuda-torch-unavailable')

function log(step) {
  console.log(`\n→ ${step}`)
}

function skip(step) {
  console.log(`\n✓ ${step} — already present, skipping`)
}

function fail(step, code) {
  console.error(`\nSetup failed during: ${step}`)
  process.exit(code ?? 1)
}

function capture(cmd, args, opts = {}) {
  return spawnSync(cmd, args, {
    cwd: root,
    encoding: 'utf8',
    shell: isWin,
    ...opts,
  })
}

function run(step, cmd, args, opts = {}) {
  log(step)
  const result = spawnSync(cmd, args, {
    cwd: root,
    stdio: 'inherit',
    shell: isWin,
    ...opts,
  })
  if (result.status !== 0) {
    fail(step, result.status)
  }
}

function runIfNeeded(step, skipLabel, isReady, cmd, args) {
  if (!force && isReady()) {
    skip(skipLabel)
    return
  }
  run(step, cmd, args)
}

function findSystemPython() {
  const candidates = isWin
    ? [['py', ['-3', '--version']], ['python', ['--version']]]
    : [['python3', ['--version']], ['python', ['--version']]]

  for (const [cmd, args] of candidates) {
    const result = capture(cmd, args)
    if (result.status === 0) {
      return isWin && cmd === 'py' ? ['py', '-3'] : [cmd]
    }
  }
  return null
}

function venvPython() {
  return path.join(root, '.venv', bin, pyExe)
}

function pipRequirementsSatisfied(vpy, reqFile) {
  const result = capture(vpy, [
    '-m',
    'pip',
    'install',
    '-r',
    reqFile,
    '--dry-run',
    '--disable-pip-version-check',
  ])
  if (result.status !== 0) {
    return false
  }
  const output = `${result.stdout || ''}\n${result.stderr || ''}`
  return !/^Collecting /m.test(output) && !/^Downloading /m.test(output)
}

function pipPackageInstalled(vpy, packageName) {
  return capture(vpy, ['-m', 'pip', 'show', packageName]).status === 0
}

function pythonImportOk(vpy, snippet) {
  return capture(vpy, ['-c', snippet]).status === 0
}

function nvidiaGpuPresent() {
  const result = capture('nvidia-smi', ['-L'])
  return result.status === 0 && /GPU\s+\d+/i.test(result.stdout || '')
}

function torchCudaReady(vpy) {
  return pythonImportOk(
    vpy,
    "import torch; x = torch.ones(1, device='cuda'); raise SystemExit(0 if x.item() == 1 else 1)",
  )
}

function defaultTorchIndex() {
  const result = capture('nvidia-smi', [
    '--query-gpu=compute_cap',
    '--format=csv,noheader,nounits',
  ])
  const capability = Number.parseFloat((result.stdout || '').trim().split(/\s+/)[0])
  // Current cu128 wheels require Turing (7.5) or newer. CUDA 12.6 wheels
  // retain Pascal support for cards such as the GTX 1080 Ti (6.1).
  const channel = Number.isFinite(capability) && capability < 7.5 ? 'cu126' : 'cu128'
  return `https://download.pytorch.org/whl/${channel}`
}

function onnxCudaReady(vpy) {
  return pythonImportOk(
    vpy,
    "from importlib.metadata import version; import onnxruntime as ort; raise SystemExit(0 if version('onnxruntime-gpu').startswith('1.26.') and 'CUDAExecutionProvider' in ort.get_available_providers() else 1)",
  )
}

function installOnnxRuntime(vpy, preferCuda) {
  if (preferCuda && onnxCudaReady(vpy)) {
    skip('ONNX Runtime CUDA provider')
    return
  }

  if (!preferCuda && pythonImportOk(vpy, 'import onnxruntime')) {
    skip('ONNX Runtime CPU provider')
    return
  }

  // ORT 1.27+ targets CUDA 13, which drops Pascal. The 1.26 line targets
  // CUDA 12.8 and its extras install the matching CUDA/cuDNN runtime DLLs.
  const wanted = preferCuda
    ? 'onnxruntime-gpu[cuda,cudnn]==1.26.0'
    : 'onnxruntime'
  log(`Installing ${preferCuda ? 'CUDA' : 'CPU'} ONNX Runtime`)
  const result = spawnSync(vpy, ['-m', 'pip', 'install', '--upgrade', wanted], {
    cwd: root,
    stdio: 'inherit',
    shell: isWin,
  })
  if (result.status === 0) {
    return
  }

  if (preferCuda) {
    console.warn('\n! CUDA ONNX Runtime install failed; installing CPU fallback.')
    run('Installing CPU ONNX Runtime fallback', vpy, [
      '-m',
      'pip',
      'install',
      '--upgrade',
      'onnxruntime',
    ])
    return
  }
  fail('Installing CPU ONNX Runtime', result.status)
}

function preferCuda() {
  const requested = (process.env.IMAGE_STUDIO_TORCH_DEVICE || '').trim().toLowerCase()
  return requested !== 'cpu' && nvidiaGpuPresent()
}

function pipUpToDate(vpy, venvExisted) {
  if (capture(vpy, ['-m', 'pip', '--version']).status !== 0) {
    return false
  }
  return venvExisted
}

function nodeDepsInstalled() {
  const modules = path.join(root, 'node_modules')
  if (!existsSync(modules)) {
    return false
  }
  return (
    existsSync(path.join(modules, 'vite', 'package.json')) &&
    existsSync(path.join(modules, 'react', 'package.json'))
  )
}

function modelsReady() {
  if (!existsSync(setupMarker)) {
    return false
  }
  const markers = [
    path.join(root, 'models', 'sam2', 'sam2.1_hiera_large.pt'),
    path.join(root, 'models', 'groundingdino', 'groundingdino_swinb_cogcoor.pth'),
    path.join(root, 'models', 'groundingdino', 'GroundingDINO_SwinB_cfg.py'),
    path.join(root, 'models', 'groundingdino', 'bert-base-uncased', 'config.json'),
    path.join(root, 'models', 'groundingdino', 'bert-base-uncased', 'model.safetensors'),
    path.join(root, 'models', 'groundingdino', 'bert-base-uncased', 'vocab.txt'),
    path.join(root, 'models', 'matte', 'birefnet-general.onnx'),
    path.join(root, 'models', 'realesrgan', 'RealESRGAN_x2plus.pth'),
    path.join(root, 'models', 'realesrgan', 'RealESRGAN_x4plus.pth'),
    path.join(root, 'models', 'lama', 'big-lama.pt'),
  ]
  return markers.every((file) => existsSync(file))
}

function sam2Ready(vpy) {
  return pythonImportOk(vpy, 'import sam2')
}

function groundingDinoReady(vpy) {
  return pythonImportOk(vpy, 'import groundingdino')
}

if (skipForFrontendBuild) {
  console.log('Skipping full local setup during frontend-only build.')
  process.exit(0)
}

console.log('Image Studio setup')
if (minimal) {
  console.log('  mode: minimal (web + image API only)')
} else {
  console.log('  mode: default (web + AI deps + fixed local model stack)')
}

const systemPython = findSystemPython()
if (!systemPython) {
  console.error('Python 3.11+ is required. Install python3 and run setup again.')
  process.exit(1)
}

const vpy = venvPython()
const venvExisted = existsSync(vpy)

runIfNeeded(
  'Creating .venv',
  'Virtual environment (.venv)',
  () => venvExisted,
  systemPython[0],
  [...systemPython.slice(1), '-m', 'venv', '.venv'],
)

runIfNeeded(
  'Upgrading pip',
  'pip (already up to date)',
  () => pipUpToDate(vpy, venvExisted),
  vpy,
  ['-m', 'pip', 'install', '--upgrade', 'pip'],
)

runIfNeeded(
  'Installing web API dependencies (FastAPI, uvicorn, OpenCV, rembg, …)',
  'Web API dependencies (requirements-web.txt)',
  () => pipRequirementsSatisfied(vpy, 'requirements-web.txt'),
  vpy,
  ['-m', 'pip', 'install', '-r', 'requirements-web.txt'],
)

runIfNeeded(
  'Installing image-studio package (editable)',
  'Editable image-studio package',
  () => pipPackageInstalled(vpy, 'image-studio-local'),
  vpy,
  ['-m', 'pip', 'install', '-e', '.'],
)

const cudaPreferred = preferCuda()
installOnnxRuntime(vpy, cudaPreferred)

if (!minimal) {
  runIfNeeded(
    'Installing AI dependencies (PyTorch, transformers, …)',
    'AI dependencies (requirements-ai.txt)',
    () => pipRequirementsSatisfied(vpy, 'requirements-ai.txt'),
    vpy,
    ['-m', 'pip', 'install', '-r', 'requirements-ai.txt'],
  )

  const retryCudaTorch = force || !existsSync(cudaTorchFailureMarker)
  if (cudaPreferred && retryCudaTorch && !torchCudaReady(vpy)) {
    const torchIndex = process.env.IMAGE_STUDIO_TORCH_INDEX_URL
      || defaultTorchIndex()
    log(`NVIDIA detected; installing CUDA PyTorch from ${torchIndex}`)
    const cudaTorch = spawnSync(vpy, [
      '-m',
      'pip',
      'install',
      '--force-reinstall',
      '--no-deps',
      'torch',
      'torchvision',
      '--index-url',
      torchIndex,
    ], {
      cwd: root,
      stdio: 'inherit',
      shell: isWin,
    })
    if (cudaTorch.status !== 0 || !torchCudaReady(vpy)) {
      console.warn(
        '\n! CUDA PyTorch is unavailable for this Python/platform; '
        + 'restoring the CPU PyTorch fallback.',
      )
      run('Restoring CPU PyTorch fallback', vpy, [
        '-m',
        'pip',
        'install',
        '--force-reinstall',
        '--no-deps',
        'torch',
        'torchvision',
      ])
      writeFileSync(
        cudaTorchFailureMarker,
        'CUDA PyTorch failed its kernel probe; use npm run setup -- --force to retry.\n',
        'utf8',
      )
    }
  } else if (cudaPreferred && !retryCudaTorch) {
    console.log(
      '\n✓ CUDA PyTorch previously failed its kernel probe — using CPU fallback '
      + '(run setup with --force to retry)',
    )
  } else if (cudaPreferred) {
    skip('CUDA PyTorch')
  } else {
    console.log('\n✓ No usable NVIDIA GPU requested/detected — PyTorch will use CPU')
  }

  runIfNeeded(
    'Installing SAM 2 (facebookresearch/sam2)',
    'SAM 2 Python package',
    () => sam2Ready(vpy),
    vpy,
    [
      '-m',
      'pip',
      'install',
      'git+https://github.com/facebookresearch/sam2.git',
    ],
  )

  if (!skipModels) {
    const modelArgs = ['-X', 'utf8', 'scripts/setup_ai_models.py']
    if (!force && modelsReady() && groundingDinoReady(vpy)) {
      skip('AI model weights (models/)')
    } else {
      run(
        'Downloading fixed AI model weights (may take a while)',
        vpy,
        modelArgs,
      )
      writeFileSync(
        setupMarker,
        'setup=fixed-selection-large\n',
        'utf8',
      )
    }
  } else {
    skip('AI model downloads (--skip-models)')
  }
} else {
  skip('AI stack (--minimal)')
  skip('SAM 2 package (--minimal)')
  skip('AI model downloads (--minimal)')
}

const npm = isWin ? 'npm.cmd' : 'npm'
runIfNeeded(
  'Installing Node dependencies (npm install)',
  'Node dependencies (node_modules)',
  nodeDepsInstalled,
  npm,
  ['install'],
)

const envPath = path.join(root, '.env')
const envExample = path.join(root, '.env.example')
if (!existsSync(envPath) && existsSync(envExample)) {
  copyFileSync(envExample, envPath)
  console.log('\n→ Created .env from .env.example')
} else if (existsSync(envPath)) {
  console.log('\n✓ .env already exists — skipping')
}

console.log('\n✓ Setup complete.\n')
console.log('Start the studio:')
console.log('  npm run start          # API + web at http://127.0.0.1:5173')
if (minimal) {
  console.log('\nFull AI stack later:  npm run setup')
}
if (!force) {
  console.log('Force reinstall:      npm run setup -- --force')
}
