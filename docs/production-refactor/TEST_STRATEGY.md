# TEST STRATEGY

**Authority:** CURSOR plan §11–12

## Layers

| Layer | Runner | Location |
|-------|--------|----------|
| Domain / FE unit | Vitest | `tests/js/*.test.js` — `npm test` / `npm run test:unit` |
| OpenAPI drift | Node script | `npm run check:openapi` |
| Desktop / CLI / API | pytest | `tests/test_*.py` |
| Fixtures | Binary assets | `tests/fixtures/` |

## FE coverage map (representative)

| Area | Test file |
|------|-----------|
| Project V2 | `project-v2.test.js` |
| Layer order | `layer-order.test.js` |
| Scene / seeds | `scene-evaluator.test.js`, `seeded-random.test.js` |
| Commands | `command-bus.test.js` |
| Tools | `tool-state.test.js` |
| Tasks | `task-manager.test.js` |
| Export preflight | `export-preflight.test.js` |
| GIF cache | `gif-frame-cache.test.js` |
| API client | `openapi-client.test.js` |
| Analytics privacy | `analytics-privacy.test.js` |
| A11y capability | `capability-honesty.test.js` |

## CI

`.github/workflows/ci.yml` — run Vitest + OpenAPI check (+ pytest where configured).

## Gaps (honest)

- Few React component / visual regression tests.
- Preview/export pixel parity not automated end-to-end.
- Provider integration still mostly manual.
