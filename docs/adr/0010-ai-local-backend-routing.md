# ADR 0010 — AI local-backend-first routing (Best + export)

**Status:** Accepted  
**Phase:** 9  
**Date:** 2026-07-20

## Context

GIF Studio has two execution surfaces: a local Python FastAPI backend (OpenCV, rembg, Real-ESRGAN, RIFE, export encoders) and browser-side paths (ONNX Runtime Web, gifenc, ffmpeg.wasm). Early UI treated these as interchangeable. That caused silent quality and capability swaps and made Best/export results non-reproducible.

Cloud APIs are out of scope for production Best/export. “Server” in older docs means the **local Python backend**, not a multi-tenant cloud.

## Decision

1. **Local-backend-first for Best quality and all export.** When `/api/health` is available and the required engine is ready, Best AI and export MUST use the local Python API.
2. **Browser ONNX / gifenc / ffmpeg.wasm are degraded or offline-only.** They are allowed for Fast/Balanced experimentation, or when the user explicitly approves fallback after the local backend is unavailable.
3. **Never silent engine swap.** If the planned route cannot run, the task fails or asks for approval. Provenance must record the actual engine and `degraded` flag.
4. Routing policy lives in `src/tasks/routing-policy.js` and is consulted by AI/export task entry points. Model capabilities are shaped from `/api/health` via `src/tasks/model-registry.js` as structured engines, not bare booleans alone.

## Consequences

- Export preflight + `export-service` prefer `POST /api/export`; offline encoders are labeled (`gifenc-offline`, `ffmpeg-wasm-offline`).
- UI must surface “local backend unavailable” instead of quietly producing a browser-ONNX Best result.
- Long work migrates toward `/api/v1/jobs` while keeping existing `/api/ai/*` and `/api/export` as compatibility surfaces.

## Rejected alternatives

- **Equal client/server Best:** rejected — quality and feature parity are not equal.
- **Cloud Best default:** rejected — product is local-first; no cloud dependency for Best/export.
- **Silent browser fallback:** rejected — violates honesty and provenance requirements.
