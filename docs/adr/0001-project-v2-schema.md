# ADR 0001 — Project schema V2

**Status:** Accepted  
**Phase:** 1  
**Date:** 2026-07-20

## Context

The web editor persisted a loosely shaped V1 document (`schemaVersion: 1`) with parallel arrays (`elements`, `overlays`, `textLayers`, …) and runtime blob URLs. That blocked deterministic migration, undo, and preview/export parity.

## Decision

1. Canonical document is **ProjectDocumentV2** (`schemaVersion: 2`) with `assets`, `layers`, `rootLayerIds`, `timeline` (µs), and `exportSettings`.
2. JSON Schema lives at `schemas/project-v2.schema.json`; runtime validation in `src/domain/project/validate-project.js`.
3. V1 → V2 is a pure function `migrateV1ToV2` retaining an immutable backup; blob URLs are not durable assets.
4. UI strangler keeps V1 projections in Zustand while `projectV2` is maintained via `src/store/project-v2-bridge.js` when the `projectV2` flag is on.

## Consequences

- New domain code targets V2; legacy UI may still write V1 until cutover.
- Feature flags gate evaluator / unified layers without a big-bang rewrite.

## Rejected alternatives

- TypeScript-only schema as the sole gate — rejected; FE remains JavaScript with Zod/JSON Schema.
- Big-bang delete of V1 — rejected; strangler required.
