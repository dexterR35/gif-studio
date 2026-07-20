# PERFORMANCE BUDGETS

**Authority:** CURSOR plan Phase 8 · [BASELINE.md](./BASELINE.md)

## Targets (dev instrumentation)

| Metric | Soft budget | Code |
|--------|-------------|------|
| Preview frame | ≤ ~33.5 ms (count drops) | `src/observability/perf-instrumentation.js` |
| Decode | Recorded when `VITE_STUDIO_PERF=1` | same + `src/engine/gif-decode.js` |
| Export phase | Debug timers | `recordExportPhase` |
| Frame cache | Bounded | `src/engine/gif-frame-cache.js` |
| Memory admission | Reject oversized decode | `src/engine/memory-admission.js` |
| Worker decode | Flag `workerDecode` | `src/engine/gif-decode-worker.js` |

## Operational caps (backend)

- Upload / dimension / concurrency: `src/gif_studio/security_limits.py` (see BASELINE).
- Desktop export memory guard remains in Python engine (~1.8 GB / 1200 frames — README).

Tests: `tests/js/gif-frame-cache.test.js`.
