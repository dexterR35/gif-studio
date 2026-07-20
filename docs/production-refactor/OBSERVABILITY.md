# OBSERVABILITY

**Authority:** CURSOR plan Phase 12

## Modules

| Module | Purpose |
|--------|---------|
| `src/observability/analytics.js` | Privacy-safe product events |
| `src/observability/telemetry.js` | Counters / timers + request-id correlation |
| `src/observability/tracing.js` | Local span start/end (`VITE_STUDIO_TRACE=1`) |
| `src/observability/perf-instrumentation.js` | Preview/decode/export samples (`VITE_STUDIO_PERF=1`) |
| `src/observability/index.js` | Barrel exports |

## Product events

- `import_committed`
- `cutout_applied`
- `export_succeeded`
- `timeline_edit_committed`

Payloads: numeric / short safe enums only after `sanitizeAnalyticsProps`.

## Wiring status

Libraries are ready; call sites in Provider/export/import are incremental (strangler). Prefer importing from `src/observability/index.js`.

Tests: `tests/js/analytics-privacy.test.js`.
