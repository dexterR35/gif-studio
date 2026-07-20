# RENDERING CONTRACT

**Authority:** CURSOR plan Phase 7 · MEGA preview/export parity

## Intent

One scene evaluation path should drive both preview and export so timing, transforms, and effects match.

## Code paths today

| Role | Path |
|------|------|
| Preview loop | `StudioProvider` `draw(t)` → main canvas |
| Export frames | Same `draw` into work canvas → `src/export/export-service.js` |
| Scene evaluator (domain) | `src/domain/timeline/evaluate-tracks.js`, `procedural-motion.js` |
| Feature flag | `sceneEvaluatorV2` (default on for new code; Provider still owns draw) |
| Effect nodes | `src/domain/effects/effect-nodes.js` |

## Guarantees / gaps

- **Guarantee target:** same transform stack, timebase (µs in V2), and effect order for preview vs export.
- **Current gap:** Provider `draw` is still the authority; domain evaluator is not fully wired into the canvas path (strangler).
- GIF disposal semantics: `src/engine/gif-disposal.js` + decode worker/cache under `src/engine/`.

Tests: `tests/js/scene-evaluator.test.js`, `tests/js/seeded-random.test.js`.
