# ARCHITECTURE

**Authority:** [CURSOR_PRODUCTION_BUILD_PLAN.md](./CURSOR_PRODUCTION_BUILD_PLAN.md) · overlays: [../GIF_STUDIO_MEGA_SENIOR_BUILD.md](../GIF_STUDIO_MEGA_SENIOR_BUILD.md) §2  
**Status:** filled (Phases 0–14 modules present; UI strangler continues)

## Dual stack

| Surface | Stack | Entry |
|---------|-------|-------|
| Desktop | Python 3.11+ / PySide6 | `run.py`, `src/gif_studio/app.py` |
| Web editor | **JavaScript** (Vite + React 18) — **no TypeScript requirement** | `npm run dev`, `src/App.jsx` |
| Local AI / export API | FastAPI | `npm run api` → `src/gif_studio/web_api.py` |

Product rule: **local-backend-first** for Best AI quality and export when the FastAPI process is healthy ([ADR 0010](../adr/0010-ai-local-backend-routing.md)). Browser ONNX / gifenc are degraded or offline paths only.

## Frontend layers

```text
src/
├── domain/          # Pure project V2, layers, timeline, effects, feature flags
├── commands/        # History / autosave services (strangler)
├── engine/          # GIF decode, disposal, frame cache, memory admission
├── tasks/           # TaskManager, routing policy, model registry
├── export/          # Preflight + export service
├── api/             # OpenAPI-aligned JS client, error mapping
├── observability/   # Analytics, telemetry, tracing, perf instrumentation
├── a11y/            # Live regions, keyboard map, capability honesty
├── store/           # Zustand V1 project + thin projectV2 bridge
├── context/         # StudioProvider (still large composition root)
├── layout/          # Shell, tools rail, asides
└── ai/              # Client AI helpers calling /api/*
```

## Backend layout

```text
src/gif_studio/
├── web_api.py           # FastAPI app (legacy + /api/v1 mounts)
├── api/                 # jobs_router, schemas, job_store, errors
├── ai/                  # SAM2, Grounding DINO, Real-ESRGAN, RIFE runners
├── engine.py / models   # Desktop/CLI animation engine
└── security_limits.py   # Upload / concurrency caps
```

## Data flow (web)

1. UI mutates Zustand V1 arrays via `StudioProvider` / store setters.
2. When `projectV2` flag is on, `src/store/project-v2-bridge.js` keeps a migrated V2 document alongside V1 (`getActiveProjectDocument()`).
3. AI / export tasks consult `src/tasks/routing-policy.js` → prefer local `/api/*`.
4. Long work targets `/api/v1/jobs` (`src/gif_studio/api/jobs_router.py`); sync routes remain compatibility surfaces.
5. Preview uses canvas `draw(t)`; export reuses draw into a work canvas then `/api/export` or offline encoder.

## Honesty invariants (MEGA §2)

- GrabCut vs rembg = **explicit UI method**, never silent fallback.
- Enhanced = replace source + `rollbackAssetId` (see [ADR 0013](../adr/0013-enhanced-replace-rollback.md)).
- Pixelate ≠ secure redact ([ADR 0015](../adr/0015-pixelate-vs-redact.md)).
- HF downloads opt-in via `GIF_STUDIO_ALLOW_HF`; weights under `models/`.

## Strangler reality

Domain, engine, tasks, export, observability, and a11y **modules exist**. `StudioProvider` remains a god-object composition root (~3k lines). Full UI migration onto V2 scene graph + command bus is incomplete — see [PRODUCTION_READINESS_REPORT.md](./PRODUCTION_READINESS_REPORT.md).
