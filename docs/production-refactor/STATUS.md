# Production refactor — STATUS

**Authority:** [CURSOR_PRODUCTION_BUILD_PLAN.md](./CURSOR_PRODUCTION_BUILD_PLAN.md) (procedure) · [GIF_STUDIO_MEGA_SENIOR_BUILD.md](../GIF_STUDIO_MEGA_SENIOR_BUILD.md) §2 (locked overlays)

**Current phase:** 14 (docs + observability + a11y landed; UI strangler ongoing)  
**Feature freeze:** **Domain gates 0–7 met at module level.** No new model families / effect types / export formats until Provider is thin. **UI strangler continues.**

## Overlays in force

- Local-backend-first Best AI + server-default export ([ADR 0010](../adr/0010-ai-local-backend-routing.md))
- Enhanced = replace source + rollback original ([ADR 0013](../adr/0013-enhanced-replace-rollback.md))
- GIF cutouts P0 = static snapshot labeled
- Pixelate ≠ Redact ([ADR 0015](../adr/0015-pixelate-vs-redact.md))
- Cutout motion default = None
- No dual-write of enhance underlay + source
- GrabCut = explicit UI method (not silent fallback)
- HF downloads opt-in (`GIF_STUDIO_ALLOW_HF`); models under `models/`

## Phase checklist

| Phase | Status | Evidence link | Notes |
|------:|--------|---------------|-------|
| 0 Baseline | done | [BASELINE.md](./BASELINE.md), `src/observability/perf-instrumentation.js` | JS-only FE lock |
| 1 Domain V2 | modules done | [ADR 0001](../adr/0001-project-v2-schema.md), `tests/js/project-v2.test.js`, `schemas/project-v2.schema.json` | Bridge: `project-v2-bridge.js` |
| 2 Assets | modules done | `src/runtime/assets/*` (registry, IDB store, memory budget), migrate assets in `migrate-layers.js` | Provider still holds many blob URLs |
| 3 Scene graph | modules done | `src/domain/layers/*`, [ADR 0013](../adr/0013-enhanced-replace-rollback.md), `layer-order.test.js` | UI still V1 arrays |
| 4 Commands | modules done | `src/commands/*`, `command-bus.test.js` | Not sole mutation path |
| 5 Tools / masks | partial | `tool-state.test.js`, [ADR 0015](../adr/0015-pixelate-vs-redact.md) | Provider-centric tools |
| 6 Time / anim | modules done | `src/domain/timeline/*`, `scene-evaluator.test.js` | GSAP still in Provider |
| 7 Render parity | partial | [RENDERING_CONTRACT.md](./RENDERING_CONTRACT.md) | `draw` still god-path |
| 8 Decode / perf | modules done | `src/engine/*`, `gif-frame-cache.test.js` | `workerDecode` opt-in |
| 9 TaskManager / AI | modules done | `src/tasks/*`, [ADR 0010](../adr/0010-ai-local-backend-routing.md), `task-manager.test.js` | Partial call-site adoption |
| 10 FastAPI jobs | modules done | `src/gif_studio/api/*`, `tests/test_api_v1_jobs.py`, `check:openapi` | Legacy routes remain |
| 11 Export | modules done | `src/export/*`, `export-preflight.test.js` | Provider still orchestrates |
| 12 Observability | done | `src/observability/*`, [OBSERVABILITY.md](./OBSERVABILITY.md), `analytics-privacy.test.js` | Wire call sites incrementally |
| 13 A11y | done | `src/a11y/*`, live regions in `studio-layout.jsx`, `capability-honesty.test.js` | Full keyboard model TBD |
| 14 Release | done | [PRODUCTION_READINESS_REPORT.md](./PRODUCTION_READINESS_REPORT.md), filled `*.md` stubs | Honest: modules ≠ cutover |

## Track D — models / installs

| Item | Status |
|------|--------|
| `pip install -r requirements-ai.txt` + torch | done |
| `pip install sam2` + `ultralytics` + `rembg` | done |
| `python scripts/setup_ai_models.py --tiny-only` | done |
| Ready on `/api/health` | sam2 tiny, grounding_dino swint, yolo n, depth v2-small, rife, realesrgan family, matte/rembg, opencv telea |
| Not ready (expected) | larger SAM2 variants, SAM3, FILM, GFPGAN, LaMa weights, YOLO s/m |
| `GIF_STUDIO_ALLOW_HF` | default off (local-only) |
| `third_party/Practical-RIFE` | cloned |

## Latest session log

**2026-07-20 — UI strangler wiring**

- Layers aside uses V2 document order when `unifiedLayers` on (`buildUnifiedLayerList`).
- StudioProvider: import/cutout/export analytics; upscale via `runStudioTask`; preview calls `evaluatePreviewPlan`; cutout default motion **None**; GIF cutout label.
- Flags: `taskManagerV2` default on.
- Tests: `unified-layer-list`, `studio-task-bridge`.

**2026-07-20 — Track D + closeout**

- Downloaded tiny model catalog; installed AI Python stack; verified `/api/health` readiness flags.
- Fixed review doc relative links to COMPLETE manual.
- CI: `.github/workflows/ci.yml`; smoke: `tests/js/smoke-import-edit-export.test.js`.
- Commands: `npx vitest run`, `npm run check:openapi`, `pytest tests/test_api_v1_jobs.py tests/test_engine.py`.

**2026-07-20 — Phases 12–14**

- Added analytics / telemetry / tracing + a11y helpers; live region in studio layout.
- Feature flags: `projectV2`, `unifiedLayers`, `commandHistory`, `sceneEvaluatorV2` default **true**; thin `projectV2` store bridge.
- Filled production-refactor docs; ADRs 0001, 0013, 0015; readiness report.
- Leftover legacy: `StudioProvider` god object; V1 arrays remain UI source of truth with V2 projection.
