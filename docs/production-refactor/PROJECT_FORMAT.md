# PROJECT FORMAT

**Authority:** CURSOR plan Phase 1 · [ADR 0001](../adr/0001-project-v2-schema.md)

## V1 (runtime UI today)

- Code: `src/lib/project-document.js` (`schemaVersion: 1`)
- Store slot: `useStudioStore.project`
- Shape: type-specific arrays — `elements`, `overlays`, `textLayers`, `enhancedLayer`, `gifEffects`, `imageEdits`, `censor`, `parallax`, `keyframes`

## V2 (canonical domain)

- Schema JSON: `schemas/project-v2.schema.json`
- Create / validate / migrate: `src/domain/project/{create-empty-v2,validate-project,migrate-v1-to-v2,invariants,revision}.js`
- Layers: `src/domain/layers/{migrate-layers,layer-order}.js`
- Bridge: `src/store/project-v2-bridge.js` → `projectV2` alongside V1 when flag on
- Flags: `src/domain/feature-flags.js` (`projectV2`, `unifiedLayers` default **true**)

## Migration notes

- Blob URLs are **not** durable assets; migration warns and omits them.
- `enhancedLayer` → replace + rollback asset IDs (not underlay).
- `censor` → pixelate layer (not secure redaction).

Tests: `tests/js/project-v2.test.js`, `tests/js/layer-order.test.js`.
