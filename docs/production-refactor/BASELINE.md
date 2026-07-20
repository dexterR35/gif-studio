# Phase 0 — Repository baseline

Recorded: 2026-07-20  
Reference env: Linux, Node from `package-lock.json`, Python `.venv`, npm.

## Package manager and scripts

- Lockfile: **npm** (`package-lock.json`)
- Scripts: `setup`, `postinstall`, `dev`, `api`, `start`, `build`, `preview`
- Added in Phase 0: `test`, `test:unit` (Vitest). No TypeScript build gate (JS-only FE lock).

## StudioProvider dependency graph

| Item | Path |
|------|------|
| Provider | `src/context/studio-provider.jsx` (~3383 lines) |
| Mount | `src/App.jsx` → `<StudioProvider>` |
| Hook | `useStudio()` |

**Owns:** canvas/pixi refs, `draw()`, import (`loadFile`/`replaceSource`), layer CRUD, AI orchestration, `exportGif` / `saveCurrentPng`, GSAP playback glue, pose runtime state.

**Delegates to Zustand:** `project`, `selection`, `tools`, `ui`, `session`, `capabilities` (`src/store/studio-store.js`).

## State owners and duplicates

| Owner | Contents |
|-------|----------|
| Zustand `project` | V1 document (`schemaVersion: 1`) — elements, overlays, textLayers, enhancedLayer, gifEffects, imageEdits, censor, parallax, keyframes |
| Zustand `selection` / `tools` / `ui` / `session` | Editor chrome |
| Provider local | `image`, `poseRig`, GIF frame buffers, object URLs |

Duplicates: pose joints (provider vs project keys); enhanced underlay vs source; type-specific layer arrays vs future unified graph.

## Project mutation entry points

- Store: `setSource`, `setSettings`, `setElements`, `setOverlays`, `setTextLayers`, `setEnhancedLayer`, `setGifEffects`, `setImageEdits`, `setCensor`, `setParallax`, keyframe helpers, `patchProject`, `resetStudio`
- `loadProject` / `exportDocument` exist in store but **no UI callers**
- Provider: `loadFile`, `replaceSource`, `reset`, AI apply paths, export

Persistence: in-memory + blob URLs; serialize strips `blob:` unless `includeBlobs`.

## Runtime resources

- `URL.createObjectURL` / `revokeObjectURL` — provider, gif-decode, realesrgan, output MP4
- No `createImageBitmap` in app code
- No dedicated decode `Worker` yet (Phase 8); ffmpeg.wasm / onnxruntime use internal workers
- Per-frame canvases in GIF decode and export loops

## Preview vs export

- Preview: `draw(t)` → `canvasRef` (chrome when preview target)
- Export: `exportGif` → `draw(..., workCanvas)` then `/api/export` or gifenc or ffmpeg.wasm
- Same `draw` function; different target/scale and chrome flags (parity risk)

## AI / export call graph

FE `src/ai/*.js` → `/api/ai/{segment,detect,matte,depth,inpaint,upscale,interpolate}` plus `/api/segment`, `/api/health`, `/api/export`.  
MediaPipe is browser-local. Optional ONNX when env URLs set.

## Project schema (current)

`src/lib/project-document.js` — `PROJECT_SCHEMA_VERSION = 1`.  
No assets map, no `rootLayerIds`, no timeline document, enhanced is underlay semantics (overridden by MEGA: replace+rollback).

## GIF timing / disposal

`src/engine/gif-decode.js` — gifuct-js; delay `max(20, frame.delay||100)`; disposal **2** cleared; disposal **3** not implemented.

## Security / auth assumptions

Localhost FastAPI; no authn. Limits in `security_limits.py` (20 MB, 5k edge, AI concurrent 1). Media stays on machine.

## Known test status (pre Phase 0)

| Suite | Status |
|-------|--------|
| pytest `tests/test_engine.py`, `test_cli.py`, `test_ui_smoke.py` | Existing desktop/CLI |
| Vitest / FE smoke | Missing before Phase 0 — added in this phase |
| Fixtures | Present under `tests/fixtures/` |

## Feature freeze

Active until Phases 0–7 gates (MEGA / STATUS). No new model families / effect types / export formats.

## Instrumentation flag

`VITE_STUDIO_PERF=1` → `src/observability/perf-instrumentation.js` records preview/export timings (dev only).
