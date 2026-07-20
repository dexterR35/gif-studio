# Production readiness report (Phases 0–14)

Recorded: 2026-07-20  
**Verdict:** Domain and infrastructure modules for Phases 0–14 are largely **implemented**; the web UI remains a **strangler** with `StudioProvider` as god object. Not a full production cutover.

## Phase checklist

| Phase | Status | Implemented (evidence) | Still strangler / incomplete |
|------:|--------|------------------------|------------------------------|
| 0 Baseline | **done** | [BASELINE.md](./BASELINE.md), `perf-instrumentation.js`, Vitest config | — |
| 1 Domain V2 | **modules done** | `src/domain/project/*`, `schemas/project-v2.schema.json`, [ADR 0001](../adr/0001-project-v2-schema.md), `tests/js/project-v2.test.js` | UI still mutates V1 arrays; bridge only |
| 2 Assets | **modules done** | `src/runtime/assets/*` (registry, IDB, memory budget); migration builds `assets` map | Provider still holds many blob URLs; UI not fully on registry |
| 3 Scene graph | **modules done** | `src/domain/layers/*`, [ADR 0013](../adr/0013-enhanced-replace-rollback.md) | Layers aside still type-specific V1 |
| 4 Commands | **modules done** | `src/commands/*`, `tests/js/command-bus.test.js` | Not sole mutation path through Provider |
| 5 Tools / masks | **partial** | Tool state + [ADR 0015](../adr/0015-pixelate-vs-redact.md), `tool-state.test.js` | Mask/redact UX still Provider-centric |
| 6 Time / anim | **modules done** | `src/domain/timeline/*`, seeded RNG tests | GSAP/Provider playback still primary |
| 7 Render parity | **partial** | Evaluator modules + [RENDERING_CONTRACT.md](./RENDERING_CONTRACT.md) | Single `draw` still in Provider; parity not proven |
| 8 Decode / perf | **modules done** | `gif-decode`, disposal, frame-cache, worker, memory-admission | `workerDecode` flag default off |
| 9 TaskManager / AI | **modules done** | `src/tasks/*`, [ADR 0010](../adr/0010-ai-local-backend-routing.md) | Not all AI entry points routed through TaskManager |
| 10 FastAPI jobs | **modules done** | `src/gif_studio/api/*`, OpenAPI schema, drift script | UI may still call sync `/api/ai/*` |
| 11 Export | **modules done** | `src/export/*`, `export-preflight.test.js` | Provider `exportGif` still orchestrates heavily |
| 12 Observability | **done** | `src/observability/*`, `analytics-privacy.test.js` | Call-site coverage incremental |
| 13 Accessibility | **done** | `src/a11y/*`, live regions in layout, tools-rail names, `capability-honesty.test.js` | Full keyboard wiring / focus traps incomplete |
| 14 Release docs | **done** | This report + filled production-refactor docs + ADRs | Legacy dual docs under `docs/` still exist |

## Feature freeze

Phases **0–7 domain gates** are met at the **module** level (schema, migrate, layers, commands, timeline, evaluator tests).  
**UI strangler continues** — do not treat freeze as lifted for new model families / export formats until Provider is thin and V2 is authoritative in the editor.

## Top residual risks

1. `StudioProvider` ownership of draw / import / AI / export.
2. Dual V1+V2 documents without dual-write discipline everywhere.
3. Preview/export parity unproven automatically.
4. Localhost API without auth — acceptable for single-user, not multi-tenant.

## Track D (models)

Tiny local catalog installed and visible on `/api/health`: SAM2 tiny, Grounding DINO, YOLOv8n, Depth Anything V2 Small, RIFE, Real-ESRGAN family, rembg matte, OpenCV Telea. SAM3 / FILM / GFPGAN / LaMa weights remain slots (deferred).

## Recommended next strangler steps

1. Route import / cutout / export through analytics + TaskManager.
2. Make Layers aside read `getActiveProjectDocument()` when `unifiedLayers` on.
3. Move `draw` to consume scene evaluator output.
4. Delete dead V1-only paths only after parity tests pass.
