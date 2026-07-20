# SECURITY & PRIVACY

**Authority:** CURSOR plan §10 · Phase 12 analytics denylist

## Threat model (local product)

- FastAPI binds localhost; **no authn** by default — assume single-user machine.
- Media stays on device; no cloud Best/export.
- Hugging Face hub downloads are **opt-in**: `GIF_STUDIO_ALLOW_HF=1` (`src/gif_studio/ai/local_models.py`). Weights prefer `models/`.

## Validation & limits

- Upload size / edge / AI concurrency: `security_limits.py`
- OpenAPI contract drift check: `npm run check:openapi` → `scripts/check-openapi-drift.mjs`

## Privacy-safe analytics

- `src/observability/analytics.js` — product events only (`import_committed`, `cutout_applied`, `export_succeeded`, `timeline_edit_committed`)
- **Denylist:** pixels, prompts, full text layer content, user home paths, blob/data URLs
- Tests: `tests/js/analytics-privacy.test.js`

## Redaction honesty

Pixelate / censor UI is **not** secure redaction — [ADR 0015](../adr/0015-pixelate-vs-redact.md).
