# GIF Studio - Production-Grade Build Plan for Cursor Agent

> **Implement from:** [GIF_STUDIO_MEGA_SENIOR_BUILD.md](./GIF_STUDIO_MEGA_SENIOR_BUILD.md)  
> **Archive (includes this file as Part G):** [GIF_STUDIO_COMPLETE_PRODUCTION_MANUAL.md](./GIF_STUDIO_COMPLETE_PRODUCTION_MANUAL.md)

> Executable refactor and hardening specification derived from both senior reviews:
>
> - `GIF_STUDIO_SENIOR_ARCHITECTURE_REVIEW.md`
> - `GIF_STUDIO_CRITICAL_SENIOR_REVIEW.md`
>
> This is not a feature wishlist. It is the ordered engineering plan for converting the current GIF Studio prototype into a reliable, testable, secure, observable, and maintainable production editor.

## Table of contents

1. [Executive instruction](#0-executive-instruction-to-cursor)
2. [Current Good / Mixed / Bad verdict](#1-what-is-good-mixed-and-bad-today)
3. [Cursor Agent operating contract](#2-cursor-agent-operating-contract)
4. [Production architecture invariants](#3-production-architecture-invariants)
5. [Target module layout](#4-target-module-layout)
6. [Canonical data contracts](#5-canonical-data-contracts)
7. [Migration strategy](#6-migration-strategy-no-big-bang-rewrite)
8. [Phase-by-phase implementation plan](#7-phase-by-phase-implementation-plan)
   - [Phase 0 - Baseline](#phase-0---baseline-safety-net-and-architecture-evidence)
   - [Phase 1 - Project V2](#phase-1---type-safe-domain-kernel-strict-schema-and-migrations)
   - [Phase 2 - Assets](#phase-2---asset-manifest-persistence-runtime-registry-and-lifecycle)
   - [Phase 3 - Scene graph](#phase-3---unified-scene-graph-and-layer-behavior)
   - [Phase 4 - Commands/history](#phase-4---command-bus-undoredo-transactions-autosave-and-recovery)
   - [Phase 5 - Tools/masks/redaction](#phase-5---tool-state-machine-selection-masks-animated-source-semantics-and-redaction)
   - [Phase 6 - Time/animation](#phase-6---canonical-time-animation-tracks-procedural-motion-and-pose-persistence)
   - [Phase 7 - Render parity](#phase-7---render-contract-pure-scene-evaluation-and-previewexport-parity)
   - [Phase 8 - Decode/performance](#phase-8---gif-decode-correctness-bounded-caches-workers-and-adaptive-preview)
   - [Phase 9 - Tasks/AI](#phase-9---unified-taskmanager-ai-model-registry-routing-provenance-and-stale-result-safety)
   - [Phase 10 - FastAPI](#phase-10---fastapi-production-boundary-jobs-storage-security-and-generated-contracts)
   - [Phase 11 - Export](#phase-11---export-preflight-deterministic-frame-streaming-fonts-and-format-contracts)
   - [Phase 12 - Analytics/observability](#phase-12---product-analytics-technical-telemetry-tracing-and-privacy-controls)
   - [Phase 13 - Accessibility](#phase-13---accessibility-keyboard-model-resilient-ux-and-capability-honesty)
   - [Phase 14 - Release hardening](#phase-14---legacy-removal-production-release-gates-deployment-hardening-and-documentation-completion)
9. [Rendering contract](#8-exact-animation-and-rendering-contract)
10. [Performance and memory](#9-performance-and-memory-specification)
11. [Security and privacy](#10-security-and-privacy-specification)
12. [Test strategy](#11-complete-test-strategy)
13. [CI and quality gates](#12-ci-and-quality-gates)
14. [Existing-file migration map](#13-existing-file-migration-map)
15. [PR sequence](#14-recommended-pr--commit-sequence)
16. [ADRs](#15-architecture-decision-records-required)
17. [Risk register](#16-risk-register-and-mitigation)
18. [Production release gates](#17-production-release-gates)
19. [Copy-ready Cursor prompt](#18-copy-ready-master-prompt-for-cursor-agent)
20. [Status template](#19-statusmd-template-for-cursor)
21. [Deferred P2 backlog](#20-deferred-p2-backlog---only-after-production-gates)
22. [Complete definition of done](#21-definition-of-done-for-the-complete-build)
23. [Final senior instruction](#22-final-senior-instruction)

---

## 0. Executive instruction to Cursor

**Build mode:** incremental strangler migration. Do not rewrite the application in one patch.

**Primary objective:** preserve the current user workflows while replacing the architectural foundations that make the editor fragile:

1. one serializable project document;
2. one ordered scene graph;
3. one runtime asset registry;
4. one deterministic time and scene evaluator;
5. one command/history path;
6. one cancellable task model;
7. one preview/export rendering contract;
8. bounded memory and explicit resource ownership;
9. strict validation, migrations, and typed errors;
10. privacy-safe analytics and production observability.

**Feature freeze while P0 is active:** do not add new AI model families, effect types, export formats, or timeline features until Phases 0-7 pass their gates. Existing features may be migrated and fixed.

**Current senior verdict:** good prototype coverage, weak production foundations. The current architecture is approximately **4.6-4.8/10 for production readiness**. Product analytics and technical observability are currently **Bad / missing**.

---

## 1. What is good, mixed, and bad today

| Area | Current verdict | Production action |
|---|---|---|
| Product concept and workflow coverage | Good | Preserve behavior during refactor |
| Source mapping and documentation inventory | Good | Convert inventory into enforceable contracts |
| Reusable UI primitives | Good | Add accessibility, validation, and visual tests |
| AI behind client/server boundaries | Good direction | Add task lifecycle, routing policy, provenance, and security |
| Versioned project document | Good start, incomplete | Add strict validation, migrations, assets, and round-trip tests |
| `StudioProvider` ownership | Critical / Bad | Reduce to a thin composition root |
| State ownership | Critical / Bad | Separate project, editor session, environment, and runtime cache |
| Layer model | Bad | Replace type-specific arrays with one ordered scene graph |
| Runtime objects in entities | Critical / Bad | Replace canvases/bitmaps/blob URLs with asset IDs |
| Animation architecture | Critical / Mixed | Define one timebase, track model, precedence, and deterministic seed |
| Preview/export parity | Critical / Bad | Use one scene evaluator and render plan for both |
| GIF frame caching | Critical / Bad | Add bounded decode caches, admission checks, and workers |
| Undo/redo, transactions, autosave | Missing / Critical | Build before more authoring features |
| Async AI/export lifecycle | Bad | Add cancellation, progress, stale-result rejection, and typed errors |
| Import/export correctness | Mixed/Bad | Formalize timing, alpha, disposal, fonts, formats, and validation |
| Security/privacy | Mixed/Bad | Add threat model, authz, media validation, retention, and secure redaction |
| Testing | Bad / missing | Add unit, property, integration, visual, parity, perf, and security tests |
| Product analytics | Bad / missing | Add privacy-safe workflow events |
| Technical observability | Bad / missing | Add metrics, traces, correlation IDs, and release dashboards |
| Accessibility | Bad / missing | Add keyboard, focus, labels, contrast, and reduced-motion contracts |

---

## 2. Cursor Agent operating contract

Cursor must follow these rules for every phase.

### 2.1 Repository discovery before modification

Before changing code:

1. Detect the package manager from the lockfile. Do not replace it.
2. Read all existing build, lint, test, and typecheck scripts.
3. Inspect the actual implementation of the files named in the reviews. Treat documentation as a guide, not proof.
4. Inventory every mutation of project state, every place that creates a canvas/bitmap/object URL, every long-running task, and every preview/export render entry point.
5. Record the baseline in `docs/production-refactor/BASELINE.md`.
6. Record current test results and existing failures before attributing failures to new work.
7. Create or update `docs/production-refactor/STATUS.md` with phase checkboxes and evidence links.

### 2.2 Non-negotiable engineering rules

- Keep the application bootable and the main import-edit-preview-export flow working after every phase.
- Never maintain two writable sources of truth. Temporary compatibility layers may derive old shapes from the new document, but must not dual-write.
- Do not store `Canvas`, `OffscreenCanvas`, `ImageBitmap`, `HTMLImageElement`, DOM nodes, functions, model sessions, workers, or blob URLs in the durable project document.
- Do not use ambient `Math.random()` or wall-clock time inside frame evaluation.
- Do not let UI components call AI or export endpoints directly.
- Do not let asynchronous completion handlers mutate a project unless the task revision still matches the source revision.
- Do not bypass tests with broad skips, `any`, ignored promise rejections, disabled lint rules, or silent catches.
- Do not add a GPU rewrite until profiling proves the current renderer is the bottleneck and parity tests exist.
- Do not silently fall back to a different AI model. Show and record fallback behavior.
- Do not call pixelation secure redaction.
- Do not log media, masks, filenames, text-layer contents, prompts, project names, filesystem paths, or raw user exceptions.
- All persistent edits must flow through commands or transactions.
- All long operations must accept cancellation and release resources in `finally` paths.
- Add an ADR for every irreversible architectural decision.

### 2.3 Required evidence after each phase

Update `docs/production-refactor/STATUS.md` with:

- completed work and unresolved work;
- changed files;
- schema or API changes;
- migrations and rollback path;
- exact commands executed;
- passing and failing test counts;
- benchmark or memory delta when relevant;
- screenshots or visual-diff artifacts when relevant;
- risks intentionally deferred;
- legacy code still in use.

Never claim a phase is complete when required tests were not run.

---

## 3. Production architecture invariants

These invariants are release-blocking.

### 3.1 State ownership

| State class | Authoritative owner | Persisted | Examples |
|---|---|---:|---|
| Project document | `ProjectStore` | Yes | canvas, assets, ordered layers, timeline, export settings, committed pose keys |
| Editor session | `EditorSessionStore` | No | active tool, selection, hover, drag, lasso draft, viewport, open panels |
| Environment/capabilities | `EnvironmentStore` | No | browser features, server health, model registry, device tier |
| Runtime assets | `RuntimeAssetRegistry` | No | decoded frames, images, canvases, textures, font handles, model sessions |
| Long operations | `TaskManager` | Optional metadata only | AI, decode, upscale, interpolation, export, project migration |
| Playback clock | `PlaybackController` | No | play/pause, current `timeUs`, loop state, dropped frames |

A runtime cache may be deleted at any time without changing project meaning.

### 3.2 Dependency direction

```text
React UI
  -> application services and view models
     -> domain types, commands, scene evaluator interfaces
        <- infrastructure adapters implement ports

render backends -> RenderPlan + AssetResolver
AI clients       -> TaskManager ports
persistence      -> ProjectRepository and AssetStore ports
```

Forbidden dependencies:

- domain code importing React, Zustand, Konva, Pixi, browser DOM, or FastAPI concepts;
- UI components importing raw endpoint clients;
- renderer mutating project state;
- task manager depending on a mounted React component;
- project migrations loading runtime bitmaps or network resources.

### 3.3 Determinism

For identical project JSON, asset bytes, timestamp, render options, and seed, the evaluator must produce the same render plan and the renderer must produce equivalent pixels within the documented backend tolerance.

### 3.4 Preview/export parity

Preview and export must share:

- time mapping;
- layer order;
- transform order;
- keyframe and modifier evaluation;
- masks and effects order;
- text layout inputs;
- source GIF frame selection;
- redaction order;
- deterministic seed.

Preview may use reduced resolution or effect approximations only when the UI clearly indicates draft quality. Final preview mode must use the export contract.

---

## 4. Target module layout

Adapt names to the existing repository, but preserve the boundaries.

```text
src/
  domain/
    project/
      project-types.ts
      project-schema.ts
      project-invariants.ts
      project-migrations.ts
      project-fixtures.ts
    layers/
      layer-types.ts
      layer-order.ts
    timeline/
      time.ts
      tracks.ts
      easing.ts
      evaluator.ts
      procedural-motion.ts
    effects/
      effect-types.ts
      effect-validation.ts
    errors/
      studio-error.ts

  application/
    commands/
      command.ts
      command-bus.ts
      history-service.ts
      transactions.ts
      commands/
    editor-session/
      editor-session-store.ts
      tool-state-machine.ts
    projects/
      project-service.ts
      autosave-service.ts
    tasks/
      task-manager.ts
      task-types.ts
      task-revision.ts
    ai/
      ai-service.ts
      model-registry.ts
      routing-policy.ts
    export/
      export-service.ts
      export-preflight.ts
    telemetry/
      analytics-service.ts
      telemetry-service.ts

  runtime/
    assets/
      asset-registry.ts
      asset-resolver.ts
      memory-asset-cache.ts
      indexeddb-asset-store.ts
      asset-lifecycle.ts
    playback/
      playback-controller.ts
    workers/
      worker-pool.ts
      decode-worker.ts
      render-worker.ts
    capabilities/
      environment-store.ts

  render/
    core/
      scene-evaluator.ts
      render-plan.ts
      render-contract.ts
    canvas2d/
      canvas2d-renderer.ts
      effect-runtime.ts
      text-runtime.ts
    preview/
      preview-runtime.ts
      adaptive-quality.ts
    export/
      export-runtime.ts
      frame-stream.ts

  media/
    gif/
      gif-decoder.ts
      gif-time-map.ts
      gif-frame-cache.ts
      gif-disposal.ts
    image/
      image-probe.ts

  infrastructure/
    api/
      generated-client.ts
      error-mapping.ts
    persistence/
      project-repository.ts
    telemetry/
      analytics-adapter.ts
      tracing-adapter.ts

  context/
    studio-root-provider.tsx
    legacy-studio-adapter.tsx

schemas/
  project-v2.schema.json
  api/

docs/
  architecture/
  adr/
  production-refactor/
```

The exact folder names may differ, but `studio-provider` must become a thin composition root rather than a runtime brain.

---

## 5. Canonical data contracts

These examples define intent. Cursor must adapt them to the real code and use strict runtime validation.

### 5.1 Project document V2

```ts
type ProjectDocumentV2 = {
  schemaVersion: 2;
  id: string;
  projectSeed: string;
  metadata: {
    name: string;
    createdAt: string;
    updatedAt: string;
    appVersion: string;
  };
  canvas: {
    width: number;
    height: number;
    background: { kind: "transparent" } | { kind: "solid"; color: string };
    colorSpace: "srgb";
  };
  assets: Record<AssetId, AssetManifestEntry>;
  rootLayerIds: LayerId[];
  layers: Record<LayerId, Layer>;
  timeline: TimelineDocument;
  exportSettings: ExportSettings;
  extensions?: Record<string, unknown>;
};
```

Rules:

- JSON-compatible only.
- No transient selection, playback, capability, or busy state.
- No runtime resource objects or blob URLs.
- Unknown extension fields are namespaced and preserved only when safe.
- Every referenced layer and asset must exist.
- Every layer appears exactly once in the scene graph.
- Cycles are invalid.

### 5.2 Assets

```ts
type AssetManifestEntry = {
  id: AssetId;
  kind: "image" | "animated-image" | "mask" | "depth" | "font" | "video";
  mimeType: string;
  checksumSha256: string;
  byteLength: number;
  width?: number;
  height?: number;
  frameCount?: number;
  durationUs?: number;
  storageKey: string;
  provenance?: {
    sourceAssetIds: AssetId[];
    operation: string;
    parametersHash: string;
    modelId?: string;
    modelRevision?: string;
    createdAt: string;
  };
};
```

Binary data belongs in an `AssetStore`, not inline JSON. Derived assets are immutable. Replacing an image creates a new asset and updates the layer reference through a command.

### 5.3 Unified layer model

```ts
type VisualLayerCommon = {
  id: LayerId;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  blendMode: BlendMode;
  transform: Transform2D;
  effects: EffectNode[];
  animationTrackIds: TrackId[];
};

type SecureRedactionLayer = {
  id: LayerId;
  type: "redaction";
  name: string;
  visible: boolean;
  locked: boolean;
  region: Shape;
  fill: string;
  secure: true;
};

type Layer =
  | (VisualLayerCommon & {
      type: "raster";
      assetId: AssetId;
      maskAssetId?: AssetId;
      mediaMapping?: MediaTimeMapping;
      pose?: PoseBinding;
    })
  | (VisualLayerCommon & {
      type: "text";
      text: string;
      style: TextStyle;
      fontAssetId?: AssetId;
    })
  | (VisualLayerCommon & {
      type: "group";
      childIds: LayerId[];
    })
  | (VisualLayerCommon & {
      type: "adjustment";
      scope: "below" | "group";
    })
  | (VisualLayerCommon & {
      type: "pixelate";
      region: Shape;
      pixelSize: number;
    })
  | SecureRedactionLayer;
```

The artboard is document metadata, not a layer. The source/background is a normal locked raster layer. An upscaled result is a derived asset variant, not an always-active hidden underlay unless the user explicitly creates a second creative layer.

### 5.4 Timeline and canonical time

Use integer microseconds for project and media time.

```ts
type TimelineDocument = {
  durationUs: number;
  loopMode: "once" | "loop" | "ping-pong";
  tracks: Record<TrackId, Track>;
  trackOrder: TrackId[];
};

type Track = {
  id: TrackId;
  target: { layerId: LayerId; property: AnimatableProperty };
  mode: "absolute" | "additive" | "multiply";
  keyframes: Keyframe[];
  modifiers: MotionModifier[];
};
```

### 5.5 Tool state machine

Replace combinations of booleans with a discriminated union.

```ts
type ToolState =
  | { kind: "move"; phase: "idle" | "dragging"; pointerId?: number }
  | { kind: "select-rect"; phase: "ready" | "drawing"; draft?: Rect }
  | { kind: "select-lasso"; phase: "ready" | "drawing"; points: Point[] }
  | { kind: "select-polygon"; phase: "placing"; points: Point[] }
  | { kind: "mask-brush"; phase: "ready" | "painting"; stroke?: MaskStroke }
  | { kind: "pixelate"; phase: "ready" | "drawing"; draft?: Rect }
  | { kind: "redact"; phase: "ready" | "drawing"; draft?: Rect };
```

Illegal combinations become unrepresentable. Escape cancels the current gesture. Pointer capture loss must end or cancel the gesture predictably.

### 5.6 Commands and history

```ts
type EditorCommand = {
  id: string;
  label: string;
  coalesceKey?: string;
  execute(document: ProjectDocumentV2): CommandResult;
};

type CommandResult = {
  document: ProjectDocumentV2;
  inverse: EditorCommand;
  assetRefDelta?: AssetRefDelta;
  telemetry?: CommandTelemetry;
};
```

Implementation may use immutable patches rather than hand-written inverse commands, but the observable guarantees must remain:

- transforms coalesce from pointer-down to pointer-up;
- one brush stroke is one history entry;
- async AI output is one atomic apply command;
- stale/cancelled results never enter history;
- history has a byte budget and checkpointing;
- undo/redo updates asset reference counts safely.

### 5.7 Task model

```ts
type StudioTask = {
  id: string;
  kind: "decode" | "segment" | "matte" | "depth" | "upscale" | "interpolate" | "inpaint" | "export";
  state: "queued" | "running" | "succeeded" | "failed" | "cancelled" | "stale";
  progress?: { completed: number; total?: number; message?: string };
  sourceRevision: string;
  createdAt: string;
  startedAt?: string;
  endedAt?: string;
  error?: StudioErrorData;
  provenance?: ModelProvenance;
};
```

Every task receives an `AbortSignal`. Apply handlers compare `sourceRevision` with the current project/asset revision before committing.

### 5.8 Typed error model

```ts
type StudioErrorCode =
  | "UNSUPPORTED_FORMAT"
  | "INVALID_MEDIA"
  | "DECODE_LIMIT_EXCEEDED"
  | "PROJECT_VALIDATION_FAILED"
  | "PROJECT_MIGRATION_FAILED"
  | "ASSET_MISSING"
  | "FONT_MISSING"
  | "MODEL_UNAVAILABLE"
  | "MODEL_OUT_OF_MEMORY"
  | "TASK_CANCELLED"
  | "STALE_RESULT_DISCARDED"
  | "EXPORT_MEMORY_BUDGET_EXCEEDED"
  | "ENCODER_UNAVAILABLE"
  | "EXPORT_RENDER_FAILED"
  | "EXPORT_ENCODE_FAILED"
  | "UNAUTHORIZED"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";
```

User messages are actionable and safe. Internal causes, stack traces, and request payloads remain in protected logs.

---

## 6. Migration strategy: no big-bang rewrite

### 6.1 Strangler sequence

1. Add tests and baseline measurements around current behavior.
2. Introduce V2 domain types and schema without changing UI behavior.
3. Add a pure V1 -> V2 migration and compatibility selectors that project V2 into legacy view models.
4. Make V2 the only writable project model.
5. Move binary/runtime resources into the asset registry.
6. Migrate authoring actions to commands.
7. Migrate render evaluation and preview/export behind adapters.
8. Migrate each UI panel away from the legacy provider API.
9. Remove compatibility projections and dead legacy state.

### 6.2 Prohibited migration pattern

Do not write changes to both `elements[]` and `layers` or both old and new timeline systems. Dual writes will diverge. During transition, derive legacy arrays from the V2 scene graph as read-only projections.

### 6.3 Project migration safety

When opening a V1 project:

1. validate the input as V1;
2. retain an immutable backup of the original document;
3. run ordered pure migrations;
4. validate the V2 result and all references;
5. report recoverable missing assets/fonts;
6. do not overwrite the original until the migrated project has been saved successfully;
7. include migration fixtures in CI.

### 6.4 Feature flags

Use short-lived flags for controlled rollout:

- `projectV2`;
- `unifiedLayers`;
- `commandHistory`;
- `sceneEvaluatorV2`;
- `rendererV2`;
- `workerDecode`;
- `taskManagerV2`;
- `serverJobsV2`.

Every flag needs an owner, removal condition, and expiry phase. Do not leave permanent dual architecture.

---

## 7. Phase-by-phase implementation plan

Each phase must be independently reviewable and leave the repository in a working state.

---

## Phase 0 - Baseline, safety net, and architecture evidence

### Goal

Create objective evidence before refactoring and establish the minimum test/CI harness needed to prevent accidental regressions.

### Required work

1. Create `docs/production-refactor/BASELINE.md` containing:
   - actual dependency graph around `StudioProvider`;
   - actual state owners and duplicate values;
   - all project mutation entry points;
   - all runtime resource creation/disposal points;
   - preview and export call graphs;
   - AI/export request call graph;
   - current project schema and persistence behavior;
   - current source GIF timing/disposal behavior;
   - current browser/server export differences;
   - current security/auth assumptions.
2. Create representative, legally usable test fixtures:
   - static opaque PNG;
   - transparent PNG with soft alpha;
   - small JPEG with EXIF orientation;
   - animated GIF with variable delays;
   - GIF fixtures covering disposal modes 0/1/2/3;
   - palette/transparency edge cases;
   - bundled test font;
   - malformed and oversized media fixtures generated during tests.
3. Add smoke tests for:
   - application boot;
   - image import;
   - GIF import and scrub;
   - add/move/resize a layer;
   - apply a basic effect;
   - add text;
   - preview playback;
   - export a small GIF.
4. Add a deterministic benchmark project fixture.
5. Add baseline instrumentation behind a development flag:
   - preview frame duration;
   - dropped frames;
   - decode duration;
   - export phase timings;
   - estimated cache bytes;
   - live object URL count;
   - active worker count.
6. Create CI jobs for the tests that already exist. Do not hide pre-existing failures; document them.
7. Add architecture documentation placeholders:
   - `ARCHITECTURE.md`;
   - `PROJECT_FORMAT.md`;
   - `RENDERING_CONTRACT.md`;
   - `ASYNC_TASKS.md`;
   - `PERFORMANCE_BUDGETS.md`;
   - `SECURITY_PRIVACY.md`;
   - `OBSERVABILITY.md`;
   - `TEST_STRATEGY.md`;
   - `docs/adr/`.

### Tests and evidence

- Existing build passes or known failures are documented.
- Smoke test exercises one complete import -> edit -> export flow.
- Baseline frame-time and memory estimates are recorded on a named reference environment.
- No product behavior change in this phase.

### Exit gate

Do not start schema migration without a reproducible baseline and at least one end-to-end smoke test.

---

## Phase 1 - Type-safe domain kernel, strict schema, and migrations

### Goal

Create a JSON-only V2 project document with strict invariants and a tested V1 migration. Begin TypeScript at the domain boundary without forcing an immediate whole-UI conversion.

### Required work

1. Add TypeScript support if the repository does not already have it.
2. Select one canonical project schema source. Default:
   - checked-in JSON Schema under `schemas/`;
   - generated or schema-derived TypeScript types;
   - Python validation against the same schema or generated compatible models.
3. Implement:
   - `ProjectDocumentV2`;
   - layer union;
   - asset manifest;
   - timeline types;
   - export settings;
   - project validator;
   - invariant validator;
   - ordered migration pipeline;
   - typed migration errors.
4. Implement V1 -> V2 migration mapping:
   - `source` -> locked raster background layer and asset manifest entry;
   - `elements[]`, `overlays[]`, `textLayers[]` -> normalized `layers` and `rootLayerIds`;
   - `enhancedLayer` -> derived asset variant with explicit active/alternate semantics;
   - `imageEdits` and `gifEffects` -> ordered effect nodes or adjustment layer;
   - `fontOptions[]` -> environment font catalog; project data keeps only selected font references/assets;
   - `censor` -> visual pixelate layer, not secure redaction;
   - `parallax`, keyframes, base motion, and motion clips -> timeline tracks/modifiers;
   - persisted pose/joint authoring data -> layer pose binding or timeline tracks;
   - export settings -> dedicated export section;
   - blob URLs and runtime fields -> rejected or resolved through an import adapter, never copied into V2.
5. Add current-version creation, validation, serialize, hydrate, clone, and migration APIs.
6. Add `assertNever` exhaustive handling for discriminated unions.
7. Add a `ProjectRevision` hash/fingerprint used by tasks and autosave.
8. Add migration backup and corruption reporting behavior.
9. Keep legacy UI working through read-only compatibility selectors.

### Required invariants

- JSON serialization succeeds with no custom replacer.
- `rootLayerIds` and group child IDs contain no duplicates.
- Every layer ID resolves exactly once.
- Every asset reference resolves.
- Layer graph has no cycles.
- Timeline targets reference existing layers and supported properties.
- All numeric values are finite and within validated ranges.
- Timestamps are integer microseconds.
- Secure redaction cannot be represented as a reversible blur or pixelate effect.

### Tests

- V1 -> V2 fixture migrations.
- Invalid/corrupt project cases.
- Unknown schema version.
- Missing asset and missing font reporting.
- Serialize/hydrate semantic round trip.
- Property-based valid-document generation and invariant checking.
- Migration determinism.
- Forward-extension preservation rules.

### Exit gate

The application may still render through legacy adapters, but V2 must be the only writable project state before Phase 2 completes.

---

## Phase 2 - Asset manifest, persistence, runtime registry, and lifecycle

### Goal

Remove runtime media objects from project entities and make all binary resource ownership explicit, bounded, disposable, and testable.

### Required work

1. Create four separate concepts:
   - `AssetManifest` in the project document;
   - persistent `AssetStore` for bytes;
   - `RuntimeAssetRegistry` for decoded/runtime handles;
   - bounded `AssetCache` for disposable derived resources.
2. Add adapters:
   - in-memory test store;
   - IndexedDB browser store;
   - server asset store interface;
   - optional project-bundle adapter later.
3. On import:
   - sniff actual file signature;
   - compute checksum;
   - normalize EXIF orientation before authoring dimensions are committed;
   - define color handling explicitly, with sRGB as the initial project/output contract;
   - detect animated WebP/APNG rather than silently treating them as static; support or reject with a typed message;
   - strip or retain metadata according to the documented privacy policy;
   - probe dimensions/frame count/duration before full decode where possible;
   - enforce pixel/frame/memory admission rules;
   - store bytes once;
   - create immutable manifest entry;
   - create layer through a command.
4. On extraction, mask, inpaint, upscale, interpolation, or AI result:
   - write a new immutable derived asset;
   - record source asset IDs, operation parameters hash, model ID/revision, and timestamp;
   - commit the new reference atomically.
5. Runtime registry must own and dispose:
   - `ImageBitmap.close()`;
   - object URL creation/revocation;
   - canvas pool entries;
   - decoded GIF frame objects;
   - GPU textures if retained;
   - font handles;
   - model sessions;
   - workers and temporary files.
6. Add reference counting across:
   - current project;
   - undo/redo history;
   - in-flight tasks;
   - autosave snapshots.
7. Add orphan cleanup only after all references expire.
8. Add deduplication by checksum and safe content type.
9. Add cache keys containing asset revision, operation parameters, time bucket, and render scale.
10. Add an observable cache/memory status API for development and telemetry.

### Required design decisions

- Object URLs are runtime-only and never persisted.
- Assets are immutable; modifications produce new asset IDs.
- Cache entries can be evicted without changing the project.
- A derived asset does not silently overwrite its source.
- Enhanced/upscaled output is an alternate asset version unless the user explicitly creates another layer.

### Tests

- Asset add/read/delete and checksum dedupe.
- Runtime resource disposal on project close and source replacement.
- Undo/redo keeps required assets alive.
- Cancelled task releases temporary assets.
- Cache LRU eviction.
- Repeated open/close does not monotonically leak object URLs, bitmaps, canvases, or workers.
- Missing asset recovery flow.
- IndexedDB transaction failure and rollback.

### Exit gate

No durable project field contains a canvas, bitmap, DOM object, model handle, worker, function, or blob URL.

---

## Phase 3 - Unified scene graph and layer behavior

### Goal

Replace `elements[]`, `overlays[]`, `textLayers[]`, special enhanced state, and fixed category draw order with one normalized and ordered layer graph.

### Required work

1. Make `layers` + `rootLayerIds` authoritative.
2. Add common operations for all supported visual layers:
   - select;
   - rename;
   - duplicate;
   - delete;
   - show/hide;
   - lock/unlock;
   - reorder;
   - transform;
   - opacity;
   - blend mode;
   - effects;
   - animation bindings.
3. Update the Layers panel to render the actual scene graph order.
4. Define constraints explicitly:
   - background starts locked but may be unlocked;
   - secure redaction is rendered in a protected final pass and shown in a reserved top section;
   - debug overlays such as pose skeleton are session state unless explicitly converted to authoring content;
   - artboard is not a layer.
5. Migrate source, cutouts, overlays, and enhanced images to raster layers sharing one transform/effect model.
6. Change new extracted-layer motion default from `Float` to `None` unless product research proves otherwise.
7. Replace arbitrary hard caps such as three motion effects and five text layers with:
   - documented performance budgets;
   - soft UX warnings;
   - capability limits derived from project complexity;
   - hard safety limits only when technically necessary.
8. Define group behavior, even if group authoring remains disabled initially, so the data model does not require another rewrite.
9. Make selection and timeline IDs use canonical layer IDs.
10. Remove duplicated layer-type mutation branches as panels migrate.

### Enhanced asset decision

Implement one of these explicit modes, with the default being the first:

1. **Alternate source asset:** layer references original and enhanced variants; user chooses active version and can A/B compare.
2. **Explicit second raster layer:** only when the user intentionally creates a composited layer.

Do not automatically draw a full-resolution enhanced image underneath an opaque source.

### Tests

- Cross-type reorder is preserved after save/reload.
- Duplicate/delete/reorder never loses or duplicates IDs.
- Layer order exactly matches render plan order.
- Locked layers reject authoring transforms.
- Hidden layers do not render or participate in hit testing.
- Group graph cycle rejection.
- V1 layer migration preserves visible appearance for representative fixtures.

### Exit gate

The UI must not offer an ordering operation the document cannot preserve.

---

## Phase 4 - Command bus, undo/redo, transactions, autosave, and recovery

### Goal

Make all persistent authoring actions reversible, atomic, observable, and safe to autosave.

### Required work

1. Add `CommandBus` and `HistoryService`.
2. Route all project mutations through commands, including:
   - import/replace asset;
   - add/delete/duplicate/reorder layer;
   - transform and opacity;
   - effect edits;
   - text edits;
   - timeline edits;
   - mask strokes and mask operations;
   - pose edits;
   - AI result apply;
   - inpaint/upscale/interpolation apply;
   - export-setting changes if considered project state.
3. Coalesce high-frequency gestures:
   - transform drag -> one command;
   - slider drag -> one command when interaction commits;
   - mask stroke -> one command;
   - timeline trim/drag -> one command.
4. Store compact mask history as tile or region deltas rather than full-canvas snapshots.
5. Add transaction boundaries for multi-step operations.
6. Add history byte budget, checkpointing, and clear-history behavior when required by migration.
7. Integrate asset reference deltas with history.
8. Add autosave after committed transactions, never on transient pointer moves.
9. Store autosave atomically with:
   - project revision;
   - schema version;
   - asset references;
   - app version;
   - clean/dirty shutdown marker.
10. Add crash recovery UI:
    - recover autosave;
    - open last stable save;
    - discard recovery;
    - report missing assets without crashing.
11. Add keyboard shortcuts with platform-aware labels:
    - undo;
    - redo;
    - save;
    - delete;
    - duplicate;
    - escape/cancel.

### Tests

- Every authoring command has undo/redo coverage.
- Undo then redo restores semantically equal document and asset references.
- Drag coalescing creates one entry.
- Brush stroke creates one entry.
- Cancelled/stale AI task creates no entry.
- Autosave excludes transient selection/tool state.
- Simulated crash restores the last committed transaction.
- History eviction does not delete still-referenced assets.
- Autosave failure is non-destructive and user-visible.

### Exit gate

No UI module may mutate the project store directly outside command infrastructure.

---

## Phase 5 - Tool state machine, selection, masks, animated-source semantics, and redaction

### Goal

Eliminate invalid tool combinations and formalize selection/mask behavior across coordinate spaces, history, animated media, and security-sensitive output.

### Required work

1. Replace `selectMode`, `maskEditing`, `censorSelecting`, and related booleans with the discriminated tool state machine.
2. Define coordinate spaces:
   - viewport/screen;
   - artboard/world;
   - layer-local;
   - source-pixel;
   - mask-pixel.
3. Centralize coordinate conversion and test it under zoom, pan, rotation, scale, flip, anchor changes, and HiDPI.
4. Split the current extraction tolerance into explicit controls:
   - color-distance threshold;
   - edge feather radius;
   - edge decontamination/spill cleanup;
   - connectivity/region selection when applicable.
5. Define mask representation and resolution:
   - source-aligned mask by default;
   - immutable mask asset on commit;
   - draft strokes in session state;
   - brush hardness/opacity/feather semantics;
   - tile-delta undo.
6. Define animated-source behavior in UI and schema. Until temporal tracking exists, support and label only explicit modes:
   - `current-frame-static`: extraction creates a static layer from the selected source frame;
   - `shared-mask`: one source-aligned mask is applied to every source frame only when the user accepts that limitation;
   - `tracked-mask` and `per-frame-mask`: experimental/disabled until implemented and tested.
7. Apply the same explicit semantics to animated inpaint. Do not imply temporal inpainting when only one frame is processed.
8. Rename the current censor tool to **Pixelate** or **Mosaic**.
9. Add a distinct **Secure Redact** tool:
   - opaque solid fill only for the production MVP;
   - composited after visual effects;
   - flattened into final output;
   - no hidden source pixels in exported layered/project delivery;
   - clear warning that blur and pixelation are visual effects, not guaranteed privacy protection.
10. Support multiple pixelate/redaction regions as layers, not one global rectangle.
11. Add pointer capture, cancel, lost-focus, and touch behavior.
12. Add keyboard-only creation, movement, resizing, and cancellation where practical.

### Tests

- Tool state cannot represent conflicting modes.
- Escape reliably cancels drafts without document mutation.
- Coordinate round trips under transforms stay within tolerance.
- Mask strokes align after layer transform and reload.
- Animated-source mode is persisted and rendered consistently.
- Secure redaction is always the final protected render pass.
- Pixelate and redaction are visually and semantically distinct.
- Undo/redo covers extraction, mask edits, pixelate, and redaction.

### Exit gate

There is no security-facing UI text that calls pixelation secure redaction.

---

## Phase 6 - Canonical time, animation tracks, procedural motion, and pose persistence

### Goal

Replace competing animation systems with one deterministic evaluation model that supports source media timing, project timing, keyframes, presets, parallax, text animation, pose deformation, and motion effects without ambiguous precedence.

### Required work

1. Use integer microseconds throughout the domain and evaluator.
2. Separate these concepts:
   - project time;
   - output sample time;
   - clip-local time;
   - source media time;
   - source frame index.
3. Preserve original GIF frame delays. Project FPS controls output sampling; it must not silently rewrite source media timing.
4. Implement explicit time mapping:

```text
output timestamp
  -> project loop/ping-pong mapping
  -> layer clip mapping and speed/trim
  -> source media timestamp
  -> source GIF frame by cumulative delay table
```

5. Build a pure `SceneEvaluator` input layer for animation values.
6. Normalize animation precedence. Recommended contract:
   1. static/base property from layer;
   2. absolute track value overrides the base property when present;
   3. multiplicative tracks apply in track order;
   4. additive tracks/modifiers apply in track order;
   5. constraints and finite-value clamping;
   6. local pose/deformation parameters;
   7. local-to-world transform composition.
7. Represent motion presets as generated tracks or deterministic modifiers, not hidden transform fields with special draw-loop logic.
8. Represent text entrance/loop/exit as tracks/modifiers with explicit time windows.
9. Represent parallax as a deterministic modifier using layer depth.
10. Persist pose/joint authoring data if it changes exported pixels. Keep only visibility/debug selection in session state.
11. Define pose warp order:
    - resolve source frame;
    - resolve local pose deformation;
    - apply layer-local mask/effects as specified by render contract;
    - apply world transform;
    - composite.
12. Seed procedural/random motion using stable identifiers:

```text
seed = hash(projectSeed, layerId, trackId, modifierId)
```

13. Never call `Math.random()` during evaluation.
14. Add per-keyframe interpolation/easing and define boundary behavior.
15. Define loops, ping-pong, reverse, speed, trim, and zero-duration behavior.
16. Replace magic caps with validated complexity budgets.

### Tests

- Easing boundaries and monotonicity where expected.
- Ping-pong and loop mapping at exact boundaries.
- Variable-delay GIF frame lookup.
- Absolute/additive/multiply precedence.
- Stable seeded procedural values across runs.
- No NaN/Infinity for valid input.
- Text entrance/loop/exit overlap rules.
- Pose and parallax order.
- Same project/time/seed returns equal evaluated scene.
- Old preset projects migrate to visually equivalent tracks within tolerance.

### Exit gate

All exported animation values are produced by the canonical evaluator; no renderer-specific animation logic remains.

---

## Phase 7 - Render contract, pure scene evaluation, and preview/export parity

### Goal

Create one backend-neutral render plan and one documented compositing contract used by both preview and export.

### Required work

1. Implement:
   - `SceneEvaluator(project, timeUs, seed, assetMetadata) -> RenderPlan`;
   - `Canvas2DRenderer.render(plan, target, assetResolver, options)`;
   - preview adapter;
   - export adapter.
2. `SceneEvaluator` must be pure and must not access React, Zustand, DOM, network, random globals, or mutable runtime canvases.
3. `RenderPlan` references asset IDs and resolved parameters, not live image objects.
4. Document and implement the exact per-layer pipeline:

```text
resolve source asset/frame
-> source crop/fit/media mapping
-> local deformation (when applicable)
-> source-aligned mask/matte
-> ordered layer effects
-> layer opacity and blend mode
-> local-to-world transform
-> composite in scene graph order
```

5. Document and implement the whole-scene pipeline:

```text
canvas background
-> normal scene layers in document order
-> adjustment/global effect layers in defined scope
-> visual pixelate layers
-> secure redaction final protected pass
-> optional preview-only debug overlays
-> presentation/encoding conversion
```

6. Unify `imageEdits`, per-layer effects, and whole-GIF effects into ordered `EffectNode` implementations. Remove duplicate brightness/contrast/hue logic.
7. Validate effect parameters and version effect semantics.
8. Ensure every preview/export renderer either supports an effect or reports it as unsupported before export. No silent omissions.
9. Create final-quality preview mode using export settings at preview scale.
10. Add render feature capability matrix by backend.
11. Evaluate Pixi honestly:
    - measure whether it only blits an already-rendered Canvas 2D frame;
    - remove or disable it if it does not reduce the expensive work;
    - keep it only behind a renderer adapter with measured benefit and parity coverage.
12. Do not start a full WebGL rewrite in this phase.
13. Make text layout deterministic:
    - wait for font readiness;
    - use project font asset when required;
    - define missing-font fallback/warning;
    - use the same font bytes for browser and server rendering when parity is required.
14. Add a renderer snapshot/freeze API for export.

### Golden and parity tests

Create fixed-timestamp fixtures for:

- static image transforms and anchors;
- alpha edges and masks;
- text with bundled font;
- effect ordering;
- distortion;
- layer blend modes;
- parallax;
- pose warp;
- visual pixelate;
- secure redaction order;
- variable-delay GIF;
- GIF disposal modes;
- transparency and matte behavior;
- enhanced asset variant.

For each fixture:

1. render through preview final-quality path;
2. render through export frame path at the same resolution/time;
3. compare pixels with a documented tolerance;
4. store approved images and diff artifacts;
5. fail CI when drift exceeds tolerance.

### Exit gate

Preview/export parity tests pass for the representative fixture matrix. A project frame can be rendered without mounting React.

---

## Phase 8 - GIF decode correctness, bounded caches, workers, and adaptive preview

### Goal

Prevent UI jank and memory exhaustion while preserving correct GIF timing and disposal behavior.

### Required work

1. Replace unbounded full-frame canvas retention with:
   - source patch/disposal metadata where practical;
   - cumulative timestamp table;
   - bounded LRU of composited frames around the playhead;
   - separate small thumbnail cache;
   - deterministic eviction.
2. Support and test disposal modes 0/1/2/3 and transparency interactions.
3. Decode/probe in a worker where browser support permits.
4. Transfer `ImageBitmap` or transferable buffers rather than cloning large pixel arrays where possible.
5. Add a `MemoryBudgetService` that estimates before allocation:

```text
source decode cache
+ active render targets
+ masks/depth buffers
+ effect intermediates
+ renderer back buffers
+ encoder buffers
+ model working memory
+ safety margin
```

6. Use device tier and configured limits; do not trust `deviceMemory` as exact truth.
7. Add import/export preflight that rejects or downscales before large allocation.
8. Add explicit low-memory mode.
9. Preview quality policy:
   - render to viewport-scaled resolution during interaction;
   - approximate or bypass explicitly marked expensive effects during drag;
   - refine after interaction stops;
   - use exact final-quality path on demand;
   - skip frames rather than allowing the event loop to accumulate lag.
10. Add dirty-region or dirty-layer caching only after correctness tests exist.
11. Move CPU-heavy effect work off the main thread when feasible.
12. Stream export frames to the encoder; do not retain the whole output sequence unless the selected encoder requires it and preflight proves it fits.
13. Release caches on:
   - source replacement;
   - project close;
   - scale change invalidation;
   - task cancellation;
   - renderer backend switch;
   - memory pressure signal or configured threshold.
14. Add user-facing explanations when a project is downscaled, switched to low-memory mode, or rejected.

### Initial performance budgets

Treat these as initial release gates to tune after Phase 0 profiling, not universal promises:

| Metric | Standard target |
|---|---|
| Interactive preview frame time | p95 <= 33 ms on reference project/device tier |
| Dropped preview frames | < 5% over a 30-second reference playback |
| Main-thread long tasks during steady playback | no repeated tasks > 100 ms |
| Decode cache | bounded by configured budget; never unbounded by frame count |
| Import admission | decision before full decoded allocation |
| Client export working set | bounded; route to server when estimate exceeds budget |
| Browser task cancellation acknowledgement | target <= 250 ms for cooperative tasks |
| Repeated project open/close | no monotonic retained-resource growth |

Define low/standard/high device tiers and record actual budgets in `PERFORMANCE_BUDGETS.md`.

### Tests

- Variable delay and disposal correctness.
- Cache LRU and deterministic eviction.
- Memory estimate includes all known surface classes.
- Oversized/decompression-bomb assets rejected before full decode.
- Worker cancellation and cleanup.
- Adaptive preview selects expected scale/quality.
- Export streams frames under bounded memory.
- Repeated import/close leak test.
- Performance regression benchmark in CI or scheduled pipeline.

### Exit gate

Long GIFs no longer allocate every full composited frame indefinitely, and all caches expose byte budgets and cleanup behavior.

---

## Phase 9 - Unified TaskManager, AI model registry, routing, provenance, and stale-result safety

### Goal

Make decode, AI, upscale, interpolation, inpaint, and export operations cancellable, observable, reproducible, and safe under concurrent editor changes.

### Required work

1. Introduce `TaskManager` as the only lifecycle owner for long operations.
2. Each task must provide:
   - unique task ID;
   - operation kind;
   - source project/asset revision;
   - queued/running/succeeded/failed/cancelled/stale state;
   - progress;
   - `AbortSignal`;
   - typed error;
   - timestamps;
   - local/server backend;
   - model provenance when applicable.
3. Replace generic global busy booleans with task-derived UI state. Allow compatible tasks concurrently; define exclusive resource groups when necessary.
4. On completion, verify:
   - task not cancelled;
   - source asset still exists;
   - source revision matches;
   - target layer/project still exists;
   - result metadata matches expected task.
5. If verification fails, mark stale, release result assets, and do not mutate history.
6. Build a model registry with entries such as:

```ts
type ModelCapability = {
  id: string;
  task: AiTaskKind;
  status: "available" | "unavailable" | "experimental" | "installing";
  runtime: "browser" | "server";
  revision: string;
  qualityTier: "fast" | "balanced" | "best";
  supportsAnimated: boolean;
  supportsCancellation: boolean;
  maxPixels?: number;
  estimatedMemoryMb?: number;
  reasonUnavailable?: string;
};
```

7. Separate user-facing choices from implementation model names:
   - default UI: Fast / Balanced / Best;
   - advanced UI: exact engine/model/revision;
   - production UI hides unwired FILM/GFPGAN or other catalog-only entries.
8. Add explicit routing policy:
   - user preference;
   - capability and model status;
   - input size/animation support;
   - privacy/local-only mode;
   - device/server capacity;
   - no silent fallback.
9. If fallback occurs:
   - obtain user approval when quality/semantics materially change;
   - record fallback in task/provenance;
   - show result source in UI.
10. Store provenance for committed outputs:
    - task type;
    - model ID and revision;
    - local/server runtime;
    - normalized parameters hash;
    - source asset checksums;
    - output asset checksum.
11. Do not rerun AI during export. Export committed assets only.
12. Add retry policy only for safe/idempotent operations.
13. Map server errors into typed client errors with request/correlation IDs.

### Tests

- Start AI task, replace source, finish task -> stale result rejected.
- Cancel each task kind -> no project mutation and resources released.
- Retry behavior for transient vs permanent errors.
- Routing chooses expected backend by capability/input/privacy policy.
- Fallback is visible and recorded.
- Model revision/provenance persists with derived asset.
- Experimental/unavailable models are hidden or disabled with reason.
- Multiple compatible tasks do not corrupt busy/progress UI.

### Exit gate

No AI/export/decode promise completion mutates project state outside a revision-checked command apply path.

---

## Phase 10 - FastAPI production boundary, jobs, storage, security, and generated contracts

### Goal

Turn the Python service from a collection of endpoints into a versioned, authenticated, resource-bounded application boundary.

### Required work

1. Introduce versioned routes, preferably `/api/v1`.
2. Split current monolithic route code into:
   - routers;
   - request/response schemas;
   - application services;
   - model runners;
   - job service;
   - asset/project repositories;
   - auth/authz;
   - resource guard;
   - structured error mapping.
3. Make OpenAPI authoritative for request/response contracts and generate the client used by the frontend. Do not hand-maintain divergent payload types.
4. Use Pydantic validation for every request and response boundary.
5. Standardize errors using `application/problem+json`-style fields:
   - status;
   - stable error code;
   - safe detail;
   - request ID;
   - operation/job ID;
   - retryable flag;
   - optional field errors.
6. Convert long operations to jobs:
   - create job;
   - query or subscribe to progress;
   - cancel job;
   - fetch result;
   - expire result;
   - idempotency key support.
7. Implement cooperative cancellation through model/pre/post-processing boundaries where possible.
8. Authenticate project, asset, and job endpoints in production deployments.
9. Authorize every object by user/tenant/project; never trust opaque IDs alone.
10. Generate storage keys server-side. Never use client paths or filenames as storage paths.
11. Validate actual signatures and decoded metadata, not only extension or MIME header.
12. Bound:
    - upload bytes;
    - total pixels;
    - width/height;
    - frame count;
    - duration;
    - decoded memory;
    - concurrent jobs;
    - per-user queue depth;
    - execution time;
    - temporary disk.
13. Protect against:
    - decompression bombs;
    - malformed GIF metadata;
    - path traversal;
    - command injection in FFmpeg/gifsicle invocations;
    - SSRF through remote asset/model URLs;
    - unauthorized job/asset enumeration;
    - arbitrary model download in production.
14. Pin model artifacts by version and checksum. Disable untrusted runtime downloads in production unless an allowlisted model service is explicitly designed.
15. Isolate temporary files by job and delete them in success, failure, cancellation, and startup recovery paths.
16. Define CORS and CSRF behavior explicitly.
17. Add per-user rate/concurrency limits and global worker capacity controls.
18. Define media retention, deletion, backup, and log redaction policy.
19. Add health and readiness endpoints that distinguish API availability from model readiness.
20. Add correlation IDs propagated from browser -> API -> job -> worker logs.

### Tests

- OpenAPI contract generation and client compatibility.
- Invalid, malformed, spoofed, oversized, and decompression-bomb media.
- Unauthorized cross-user asset/job/project access.
- Rate limit and concurrency behavior.
- Job cancellation and temporary-file cleanup.
- Worker crash and startup orphan cleanup.
- Model checksum mismatch.
- FFmpeg argument safety and timeout.
- CORS/CSRF policy.
- Error payload contains safe detail and correlation ID without media/user text.

### Exit gate

Production endpoints cannot be used to access another user's assets/jobs, launch unbounded work, or download arbitrary model code.

---

## Phase 11 - Export preflight, deterministic frame streaming, fonts, and format contracts

### Goal

Make export predictable, cancellable, memory-bounded, and visually consistent with final-quality preview.

### Required work

1. Export begins by freezing:
   - immutable project snapshot;
   - asset manifest revision;
   - exact asset bytes/checksums;
   - renderer/effect versions;
   - font assets;
   - export settings;
   - deterministic seed.
2. Add export preflight before frame allocation:
   - validate project and references;
   - resolve fonts;
   - verify renderer support for every effect/layer;
   - estimate frame count and timestamps;
   - estimate peak memory;
   - choose client or server backend;
   - show unsupported-feature and downscale warnings;
   - confirm transparent-output limitations.
3. Generate exact output timestamps from duration and requested FPS using integer arithmetic. Define final-frame inclusion and rounding.
4. At each timestamp:
   - evaluate with the canonical scene evaluator;
   - render with the same render contract as final-quality preview;
   - stream the frame to the encoder;
   - release reusable/intermediate buffers.
5. Report progress by phase:
   - preflight;
   - frame evaluation;
   - rendering;
   - quantization;
   - encoding;
   - optimization;
   - final validation;
   - upload/download where applicable.
6. Support cancellation in every phase and clean temporary resources.
7. Define an explicit format capability matrix. Initial production contract:

| Format | Alpha | Variable frame delay | Typical backend | Required warnings |
|---|---:|---:|---|---|
| GIF | limited indexed transparency | encoder-dependent output sampling | client or server | palette, alpha edge, size, frame count |
| PNG snapshot | yes | n/a | client or server | current timestamp/frame |
| MP4/H.264 | no alpha in current path | fixed output sampling | FFmpeg client/server | background flattening, codec availability |
| Project package | preserves source assets/project | n/a | browser/server | not a flattened media export |

APNG/WebM are P2 only after the contract and tests exist.
8. Replace ambiguous quality labels with measurable profiles and explain tradeoffs. Do not imply that a generic `lossy` number has identical meaning across encoders.
9. Record selected encoder, version, settings, and backend in export diagnostics.
10. Verify completed output:
    - parseable media;
    - expected dimensions;
    - expected frame count/duration tolerance;
    - loop metadata;
    - non-empty bytes;
    - no missing font/assets;
    - secure redaction present at sampled frames.
11. Font policy:
    - project stores a font asset or an explicit system-font dependency;
    - export preflight blocks or warns on missing fonts;
    - bundled/custom font bytes are used consistently where licensed;
    - font-loading completion is awaited before render;
    - server export has access to identical font bytes when used.
12. Keep source GIF variable timing through media-time mapping even when output is sampled at a fixed FPS.
13. Distinguish visual export from project save. A flattened export must never be treated as a reversible project backup.

### Tests

- Preview/export same-timestamp pixel parity.
- Frame timestamp count and boundary rounding.
- Variable-delay source timing.
- GIF palette/transparency/disposal fixtures.
- Missing font preflight.
- Unsupported effect/backend preflight.
- Memory budget route to server or refusal.
- Cancellation in render/encode/optimize phases.
- Output metadata validation.
- Secure redaction sampled in final output.
- Export failure identifies the exact phase.

### Exit gate

The exporter never silently drops a feature and never starts an impossible job without preflight.

---

## Phase 12 - Product analytics, technical telemetry, tracing, and privacy controls

### Goal

Move analytics from **Bad / missing** to useful and privacy-safe, while separating product behavior measurement from technical observability.

### Current verdict

- Product analytics: **Bad / missing**.
- Technical observability: **Bad / missing**.
- AI quality measurement: **Bad / missing**.
- Analytics privacy contract: **Not defined**.

These ratings remain Bad until event schemas, tests, dashboards, and privacy controls are implemented.

### 12.1 Product analytics events

Implement a versioned analytics adapter. UI/domain code emits typed events; the vendor adapter is replaceable.

Recommended events:

```text
project_created
project_opened
project_saved
project_autosaved
project_recovered
project_migrated
project_migration_failed
asset_import_started
asset_import_succeeded
asset_import_failed
asset_downscaled
selection_started
selection_committed
selection_cancelled
mask_refinement_started
mask_refinement_committed
ai_task_started
ai_task_succeeded
ai_task_failed
ai_task_cancelled
ai_task_stale
ai_result_applied
ai_result_reverted
ai_result_deleted
layer_added
layer_reordered
layer_duplicated
layer_deleted
timeline_edit_committed
playback_started
playback_stopped
playback_degraded
export_started
export_succeeded
export_failed
export_cancelled
crash_recovery_offered
crash_recovery_succeeded
```

Allowed coarse dimensions:

- event schema version;
- anonymous/pseudonymous session ID;
- app version;
- browser/device tier;
- source type;
- static vs animated;
- width/height/frame-count/byte-size buckets;
- tool category;
- model ID/revision only when policy allows;
- local vs server runtime;
- quality tier;
- duration bucket;
- latency bucket;
- output format and size bucket;
- stable typed error code;
- fallback/cancelled/stale flags;
- memory estimate bucket.

### 12.2 Prohibited analytics payloads

Do not collect by default:

- image/video pixels or thumbnails;
- masks, depth maps, cutouts, or model outputs;
- filenames, filesystem paths, asset storage keys, or project titles;
- text-layer content;
- prompts, detection queries, or class text that may contain personal data;
- exact selection/mask coordinates;
- EXIF metadata;
- raw exception objects or request bodies;
- authentication tokens;
- exact project document JSON.

Analytics failure must never block editing, save, task completion, or export. Add opt-out/consent behavior required by deployment jurisdiction and product policy.

### 12.3 Technical metrics

Instrument at minimum:

- app startup and editor-ready duration;
- project open/migration duration;
- import probe/decode duration;
- preview frame time p50/p95/p99;
- dropped frames and long tasks;
- preview quality/degradation tier;
- renderer backend and fallback;
- Canvas pixel readbacks and duration;
- decoded/effect/cache bytes and hit rate;
- worker count, queue depth, crash, restart;
- task queue, preprocess, inference, postprocess duration;
- model load/warm-up duration;
- AI fallback/cancel/stale rate;
- export phase timings;
- export peak-memory estimate and backend selection;
- API latency/error rate by endpoint/model;
- server job queue depth and duration;
- temp-file cleanup failures;
- project migration success/failure;
- autosave/recovery success;
- preview/export parity failures in CI;
- retained resource counts in leak tests.

### 12.4 Tracing and correlation

1. Create an operation ID in the browser for each import, task, migration, and export.
2. Propagate it through API request, server job, worker logs, and error responses.
3. Use structured logs, not concatenated strings.
4. Redact user media and text from attributes.
5. Use OpenTelemetry-compatible concepts or equivalent vendor-neutral interfaces.
6. Sample high-volume traces and keep errors/slow operations at a higher rate.

### 12.5 Quality analytics

Use privacy-preserving behavior proxies, never silent media upload:

- AI result immediately refined;
- AI result undone/deleted;
- alternate model retried;
- time spent refining mask;
- export completed with result present;
- export retried after failure;
- predicted vs actual export size;
- automated preview/export pixel-diff score in CI.

Treat these as product signals, not ground-truth model quality.

### 12.6 Dashboards and alerts

Create dashboards for:

- import success and decode limit failures;
- preview frame time and dropped-frame rate by device tier;
- AI success/latency/fallback by task/model;
- export success/latency/failure phase;
- memory admission failures;
- migration/autosave/recovery health;
- server queue saturation;
- unauthorized/rate-limited requests;
- client crash rate.

Alert on sustained regressions, not one noisy event.

### Tests

- Typed event schema compile/runtime validation.
- Analytics adapter failure is non-blocking.
- Payload denylist tests prove sensitive fields are absent.
- Correlation ID propagates browser -> API -> worker -> error.
- Metrics emitted at phase boundaries.
- Opt-out prevents vendor transmission.
- No event contains raw project document or binary asset content.

### Exit gate

Analytics becomes **Good** only when the team can answer workflow, failure, performance, and quality questions without collecting user media or sensitive text.

---

## Phase 13 - Accessibility, keyboard model, resilient UX, and capability honesty

### Goal

Make the editor operable without relying entirely on pointer input and make failures recoverable without a full reload.

### Required work

1. Define and document keyboard behavior:
   - workspace navigation;
   - select/move tools;
   - escape/cancel;
   - delete/duplicate;
   - undo/redo;
   - play/pause;
   - frame/time nudging;
   - layer reorder;
   - transform nudge with modifiers;
   - zoom/fit;
   - open/close inspector/modal.
2. Add visible focus styles and logical focus order.
3. Add accessible names and state for all icon buttons, sliders, toggles, canvas controls, layers, timeline tracks, and dialogs.
4. Add keyboard alternatives for essential canvas operations or inspector equivalents.
5. Implement modal focus trap and focus restoration.
6. Support reduced motion:
   - UI transitions respect preference;
   - preview animation does not auto-play unexpectedly;
   - provide pause controls.
7. Ensure high-contrast and non-color-only status cues.
8. Announce task progress, completion, failure, and cancellation through non-disruptive live regions.
9. Make error UI actionable:
   - retry;
   - choose another model/backend;
   - lower resolution;
   - open recovery copy;
   - report request ID;
   - cancel.
10. Replace generic reload-first error recovery with scoped boundaries and recoverable service reset.
11. Capability honesty:
    - distinguish available, unavailable, experimental, installing, and degraded;
    - show why unavailable;
    - hide catalog-only model slots in production;
    - do not report `inpaint: true` as one experience when only a low-quality fallback exists.
12. Add touch target and gesture checks for supported mobile/tablet layouts.
13. Localize user-facing errors and controls through a message catalog even if only one locale ships initially.

### Tests

- Automated accessibility checks on primary workspaces and dialogs.
- Keyboard-only smoke flow: import -> select layer -> transform via inspector -> add text -> play -> export.
- Focus trap/restoration.
- Escape cancels tools/tasks/dialogs according to context.
- Reduced-motion behavior.
- Screen-reader labels for controls and task status.
- No unavailable model can be selected and silently fail.

### Exit gate

All essential authoring/export actions have a non-pointer path or documented accessible inspector equivalent.

---

## Phase 14 - Legacy removal, production release gates, deployment hardening, and documentation completion

### Goal

Delete the temporary dual architecture, prove the system against release gates, and leave a maintainable production baseline.

### Required work

1. Remove migrated responsibilities from `StudioProvider` until it only:
   - constructs stable services;
   - provides narrow hooks/facades;
   - performs lifecycle setup/teardown;
   - contains no draw loop, project mutation logic, endpoint orchestration, or giant context value.
2. Delete:
   - writable legacy arrays;
   - legacy animation evaluation;
   - legacy direct AI calls from UI/provider;
   - unbounded frame caches;
   - unused Pixi path if profiling did not justify it;
   - duplicate effect implementations;
   - stale feature flags;
   - dead capability/model catalog entries;
   - reload-only error paths where scoped recovery exists.
3. Run a dependency scan proving domain/render core do not import UI/runtime infrastructure.
4. Complete architecture docs and ADRs.
5. Add production build hardening:
   - source-map handling policy;
   - secure headers;
   - CSP compatible with required workers/WASM;
   - environment configuration validation;
   - health/readiness checks;
   - secret handling;
   - frontend/backend version compatibility check;
   - database/storage migrations where used;
   - backup/restore and retention runbooks;
   - worker graceful shutdown and job recovery.
6. Run full test matrix and record evidence.
7. Run performance/memory benchmark matrix across defined device tiers.
8. Run security test suite and threat-model review.
9. Run accessibility audit.
10. Produce `docs/production-refactor/PRODUCTION_READINESS_REPORT.md` with pass/fail evidence for every release gate.
11. Define rollback:
    - application version rollback;
    - project schema compatibility policy;
    - migration backups;
    - job/storage compatibility;
    - feature flag kill switches for high-risk runtime paths.
12. Do not mark production-ready while any P0 gate is waived without an explicit signed risk acceptance.

### Exit gate

All release gates in Section 17 pass and legacy architecture is no longer an active writable path.

---

## 8. Exact animation and rendering contract

Cursor must write `RENDERING_CONTRACT.md` from these rules and implement tests against it.

### 8.1 Time

- Domain time is integer microseconds.
- Floating progress is a UI convenience only.
- Output frame timestamps are generated deterministically from duration and requested FPS.
- Source animated assets preserve their own frame-delay table.
- Loop/ping-pong is applied at project time before layer media mapping.
- Layer trim/speed/reverse maps project time to media time.
- Boundary behavior at exactly `durationUs` is defined and tested.

### 8.2 Transform order

Recommended 2D order, documented in matrix terms:

1. source/crop origin normalization;
2. anchor translation to local origin;
3. local deformation output bounds;
4. scale/flip;
5. rotation;
6. anchor translation back;
7. layer position;
8. parent/group transform;
9. canvas transform.

Do not rely on implicit Canvas/Konva order. Use shared matrix helpers and tests.

### 8.3 Animation precedence

For each property:

1. static layer value;
2. absolute track, if present;
3. multiplicative tracks in stable order;
4. additive tracks/modifiers in stable order;
5. constraints/clamping;
6. conversion to render units.

Presets are authored as tracks/modifiers. They are not a parallel hidden system.

### 8.4 Effects

- Effect nodes are ordered and versioned.
- Each effect declares supported backends and preview approximation.
- Cache key includes effect version and normalized parameters.
- Global adjustments use adjustment layers or explicit output effects, not duplicate code paths.
- Secure redaction is not an ordinary reversible effect and runs in the protected final pass.

### 8.5 Text

- Text layout inputs are explicit: font bytes/identity, size, weight, style, line height, letter spacing, alignment, wrapping width, direction, casing, stroke, shadow.
- Missing fonts produce preflight warning/error, not silent substitution in final export.
- Test fixtures use bundled fonts.

### 8.6 Animated cutout and inpaint

- Every operation records whether it targets current frame, shared mask, tracked sequence, or per-frame output.
- Unsupported temporal modes are disabled or clearly marked experimental.
- A one-frame result must never be presented as a temporally coherent animated edit.

---

## 9. Performance and memory specification

### 9.1 Memory admission

Before import, AI, interpolation, upscale, or export, calculate a conservative peak estimate:

```text
peakBytes =
  sourceCompressedBytes
  + sourceDecodeWorkingSet
  + decodedFrameCacheBudget
  + activeSourceFrames
  + layerMaskAndDepthBuffers
  + effectIntermediateBuffers
  + previewBackBuffers
  + exportBackBuffers
  + encoderWorkingSet
  + modelWorkingSet
  + temporaryTransferCopies
  + safetyMargin
```

Do not use `width * height * 4` as the entire estimate. Account for every simultaneous surface and duplicate transfer.

### 9.2 Required policies

- Every cache has a byte budget, item budget, eviction strategy, and owner.
- Every worker has an idle/shutdown policy.
- Every task declares estimated memory and exclusive resource groups.
- Client export routes to server or refuses before allocation when over budget.
- Upscale validates output pixels and model working memory before inference.
- RIFE/interpolation does not materialize all new frames at once unless budgeted.
- Preview resolution is independent from export resolution.
- Expensive effects may use a documented draft approximation during direct manipulation.
- All approximations are disabled in final-quality preview/export.
- No cache key is based only on layer ID; include asset revision, time, parameters, and scale.

### 9.3 Reference benchmark projects

Maintain fixtures for at least:

1. **Small static:** 480 x 300, five layers, text, two effects.
2. **Standard animated:** 960 x 540, 120 source GIF frames, masks, text, parallax.
3. **Heavy animated:** 1920 x 1080, variable delays, multiple effects, pose warp.
4. **Memory adversarial:** large dimensions, many frames, masks/depth, export preflight only.
5. **AI workflow:** still image -> segment -> refine -> upscale -> export.

Record:

- time to first preview;
- frame p50/p95/p99;
- dropped-frame ratio;
- main-thread long tasks;
- cache bytes/hit rate;
- peak estimated and observed memory where available;
- export seconds per output second;
- cancellation latency;
- retained resources after close.

### 9.4 Regression policy

- A statistically meaningful p95 frame-time regression above the configured threshold blocks release.
- Any unbounded cache or monotonic resource leak blocks release.
- Benchmark thresholds are stored in version control and changed only with documented rationale.
- CI may run a small deterministic performance smoke test; the full matrix can run on scheduled, controlled hardware.

---

## 10. Security and privacy specification

### 10.1 Threat model

Treat all imported media, project files, fonts, model outputs, filenames, metadata, API parameters, and remote service responses as untrusted.

Threats include:

- malformed image/GIF structures;
- decompression and frame-count bombs;
- oversized dimensions or duration;
- MIME/extension spoofing;
- malicious project JSON and graph cycles;
- path traversal and storage-key injection;
- unauthorized cross-project or cross-tenant access;
- job-ID enumeration;
- command injection into FFmpeg/gifsicle/subprocesses;
- SSRF through remote asset/model URLs;
- arbitrary model-code or weight download;
- resource exhaustion and GPU queue starvation;
- sensitive media or text leaking through logs/analytics;
- stale temporary files and retained uploads;
- misleading visual pixelation marketed as privacy redaction;
- hidden original pixels surviving a supposedly flattened secure export.

### 10.2 Required controls

- Signature sniffing and decoder probe before full processing.
- Pixel/frame/duration/decoded-memory limits.
- Safe generated IDs and isolated storage prefixes.
- Per-object authorization.
- Authenticated production APIs.
- Explicit CORS/CSRF policy.
- Per-user rate and concurrency limits.
- Subprocess arguments passed as arrays; never interpolate user strings into shell commands.
- Job and worker timeouts, memory limits, and temporary disk quotas.
- Model allowlist, pinned revision, and checksum verification.
- No arbitrary Hugging Face or remote model download in production unless an isolated allowlisted service is explicitly approved.
- Encryption in transit and at rest where deployment requires it.
- Configurable media retention and deletion with orphan cleanup.
- No media/text in ordinary logs, traces, analytics, or exception reporting.
- Secrets only through environment/secret manager, validated at startup.
- Project package import protected against zip-slip and zip bombs if introduced.
- Content Security Policy designed for workers/WASM without broad unsafe exceptions where avoidable.

### 10.3 Secure redaction contract

- `Pixelate` and `Blur` are visual effects only.
- `Secure Redact` uses irreversible opaque replacement in the final protected render pass.
- Export validation samples redacted regions.
- Flattened output contains no separate hidden source layer.
- Saving the editable project may retain the original asset; UI must explain that the project is not a sanitized deliverable.
- A secure deliverable is the flattened verified export, not the editable project file.

### 10.4 Privacy documentation

Document:

- what media is uploaded;
- which operations are local vs server;
- retention duration;
- deletion behavior;
- model/provider data handling;
- analytics collection and opt-out;
- whether prompts/class queries are transmitted;
- how users create a sanitized final export.

---

## 11. Complete test strategy

### 11.1 Unit tests

Cover pure domain and application behavior:

- project validation and migrations;
- layer graph order/cycle detection;
- transform matrices and anchors;
- coordinate conversion;
- easing, keyframes, modifiers, and time mapping;
- GIF delay lookup and disposal state;
- effect parameter validation;
- deterministic seeds;
- command execute/undo/redo/coalescing;
- task revision and stale-result guards;
- memory estimates;
- capability routing and fallback policy;
- export timestamp generation;
- error mapping;
- analytics payload sanitization.

### 11.2 Property-based tests

Use an appropriate JS and Python property-testing library for:

- valid generated documents always satisfy invariants;
- migrations produce current valid documents;
- serialize/hydrate preserves semantics;
- layer reorder never loses/duplicates IDs;
- transforms remain finite;
- time mapping remains inside defined ranges;
- seeded evaluation is deterministic;
- undo then redo restores semantic equality;
- cache eviction never removes pinned/referenced resources;
- memory estimates are monotonic as surfaces are added.

### 11.3 Golden image tests

Use small deterministic fixtures and bundled fonts. Cover:

- source fit/crop/stretch;
- anchors, rotation, flip, opacity;
- masks and alpha edges;
- text layout;
- ordered effects;
- distortions;
- blend modes;
- parallax;
- pose warp;
- pixelate and secure redaction;
- GIF timing/disposal/transparency;
- export quality profiles.

Store expected images, actual images, and diff images. Document pixel tolerance and platform strategy.

### 11.4 Preview/export parity tests

At fixed timestamps, render through both paths at the same dimensions and options. Fail when drift exceeds documented tolerance. This suite is release-blocking.

### 11.5 Integration tests

- import -> select -> extract -> mask refine -> animate -> save -> reload -> export;
- import animated GIF -> scrub -> edit -> export with timing preserved;
- AI task -> replace source -> stale result rejected;
- cancel AI, upscale, interpolation, and export;
- undo/redo transform, reorder, mask, text, timeline, AI apply;
- autosave -> simulated crash -> recovery;
- V1 project migration with missing asset/font;
- asset dedupe and orphan cleanup;
- worker crash/restart;
- client/server generated API compatibility.

### 11.6 End-to-end tests

Use browser automation for the primary workflows and keyboard-only variants. Avoid asserting implementation details; assert user-visible behavior and output metadata.

### 11.7 Performance and leak tests

- frame-time benchmark by project tier;
- long GIF cache bounds;
- export peak working set;
- repeated project open/close;
- repeated AI task cancel/retry;
- worker lifecycle;
- object URL and ImageBitmap cleanup;
- IndexedDB growth/orphan cleanup;
- server temp-file cleanup and worker memory.

### 11.8 API/security tests

- malformed/spoofed/oversized media;
- decompression bombs;
- invalid schema/project graphs;
- auth/authz and cross-tenant access;
- rate/concurrency limits;
- job cancellation/idempotency;
- FFmpeg command safety;
- model checksum failure;
- CORS/CSRF;
- log/telemetry redaction.

### 11.9 Accessibility tests

- automated static checks;
- focus order and modal behavior;
- keyboard workflow;
- screen-reader labels/live regions;
- reduced motion;
- high contrast/non-color cues.

---

## 12. CI and quality gates

Detect the existing package manager and tools. Prefer existing test libraries; when absent, recommended defaults for this stack are TypeScript, Vitest, Playwright, a pixel-diff library, and pytest on Python. Do not replace equivalent working tools merely for preference.

### 12.1 Frontend pipeline

Run, using repository-specific commands:

1. dependency integrity/lockfile check;
2. formatting check;
3. lint;
4. TypeScript typecheck;
5. unit/property tests;
6. schema generation drift check;
7. production build;
8. e2e smoke tests;
9. golden/parity tests;
10. accessibility checks;
11. dependency/security scan.

### 12.2 Backend pipeline

1. formatting/lint;
2. static typing;
3. unit/property tests;
4. API contract tests;
5. security/resource-limit tests;
6. OpenAPI generation drift check;
7. container/package build;
8. startup health/readiness smoke test;
9. dependency/security scan.

### 12.3 Scheduled pipeline

- full performance benchmark matrix;
- memory/leak suite;
- large media adversarial tests;
- visual baseline matrix across supported browsers;
- model availability/checksum verification;
- backup/restore and orphan cleanup drills.

### 12.4 Merge requirements

- No new type, lint, or test failure.
- No skipped release-blocking parity/security test.
- Schema/API generated artifacts are current.
- New behavior has tests and docs.
- Performance-sensitive changes include before/after evidence.
- New telemetry includes privacy review and payload test.
- New persistent fields include migration and round-trip tests.
- New long operation includes cancellation and stale-result tests.

---

## 13. Existing-file migration map

Cursor must confirm actual content before moving code. This map expresses the target responsibility.

| Current area | Target action |
|---|---|
| `src/context/studio-provider.jsx` | Reduce to composition root plus temporary compatibility adapter; extract draw, playback, tasks, selection, export, assets, history |
| `src/store/studio-store.js` | Split authoritative V2 project store from editor session and environment/capability stores |
| `src/lib/project-document.js` | Replace/extend with strict V2 schema, invariants, migrations, serialization, revision hashing |
| `src/lib/presets.js` | Convert motion presets to track/modifier generators; keep UI catalogs separate from domain semantics |
| `src/lib/keyframes.js` | Move to canonical timeline evaluator with microsecond time and per-key easing |
| `src/lib/motion-effects.js` | Convert to versioned effect/modifier tracks; remove independent hidden time logic |
| `src/lib/effects.js` | Split effect definitions/validation from Canvas 2D runtime; remove duplicate global/base implementations |
| `src/lib/pose.js`, `pose-warp.js` | Persist authoring data; make evaluation deterministic and renderer-independent |
| `src/engine/gif-decode.js` | Add probe, correct disposal/time mapping, worker decode, bounded frame cache |
| `src/engine/gsap-playback.js` | Keep only as a clock adapter or replace with `PlaybackController`; it must not define project time semantics |
| `src/engine/pixi-renderer.js` | Measure; retain only as a real renderer adapter with benefit and parity, otherwise remove |
| `src/engine/konva-editor.jsx` | Treat as interaction surface/view; committed transforms flow through commands; Konva nodes are never authoritative |
| `src/engine/ffmpeg-export.js` | Put behind export/encoder adapter with cancellation, preflight, resource cleanup, typed errors |
| `src/ai/*` | Convert raw wrappers into adapters called only by `AiService`/`TaskManager`; generate API types where applicable |
| `src/layout/preview-stage.jsx` | Use playback/preview services and view models; remove render-state ownership |
| `src/layout/layers-aside.jsx` | Render unified scene graph; generic layer commands |
| `src/layout/inspector-aside.jsx` | Split into target-specific inspector modules using typed selection view models |
| `src/layout/tools-rail.jsx` | Dispatch tool-state-machine events; no direct project mutation |
| `src/components/studio/effects-panel.jsx` | Edit ordered effect nodes through commands; show backend support/draft approximation |
| `src/components/studio/effect-timeline.jsx` | Render canonical tracks; no independent clip truth |
| `src/timeline/keyframe-timeline.jsx` | Command-based track editing, microsecond time, keyboard accessibility |
| `src/gif_studio/web_api.py` | Split into versioned routers/services/jobs/error middleware; keep thin app composition |
| `src/gif_studio/ai_pipeline.py` | Model registry/routing execution adapter with provenance and cancellation |
| `src/gif_studio/jobs.py`, `worker.py` | Formal job states, cancellation, idempotency, cleanup, metrics, correlation IDs |
| `src/gif_studio/storage.py`, `db.py` | Tenant-aware repositories, generated storage keys, retention/orphan cleanup |
| `src/gif_studio/resource_guard.py`, `security_limits.py` | Central admission and resource policies tested against malformed/oversized input |

### Inspector decomposition target

The current selection-priority tree should become explicit modules:

```text
InspectorRoot
  -> RedactionInspector
  -> MaskInspector
  -> SelectionDraftInspector
  -> PoseInspector
  -> ArtboardInspector
  -> EffectStackInspector
  -> TextInspector
  -> MultiLayerInspector
  -> RasterLayerInspector
  -> BackgroundInspector
```

Use a typed selection view model rather than a long implicit priority chain.

---

## 14. Recommended PR / commit sequence

Do not submit one giant patch. Use small, reversible, passing changes. A practical sequence is:

1. **Baseline docs and smoke tests** - no product change.
2. **Domain TypeScript foundation and error types**.
3. **Project V2 schema, validator, invariants, fixtures**.
4. **V1 -> V2 migration and compatibility selectors**.
5. **Asset manifest and in-memory asset store**.
6. **IndexedDB asset store and runtime registry lifecycle**.
7. **Unified scene graph read path and Layers panel adapter**.
8. **V2-only project write path; remove dual mutations**.
9. **Command bus and transform/layer commands**.
10. **History coalescing, mask deltas, asset refs**.
11. **Autosave and crash recovery**.
12. **Tool state machine and coordinate-space utilities**.
13. **Pixelate rename and secure redaction layer**.
14. **Canonical microsecond time and GIF time map**.
15. **Track/modifier evaluator and preset migration**.
16. **Pose/parallax/text animation migration**.
17. **Pure SceneEvaluator and RenderPlan**.
18. **Canvas2D renderer adapter and effect normalization**.
19. **Final-quality preview path and golden tests**.
20. **Export path on shared evaluator; parity tests**.
21. **GIF worker decoder and bounded LRU cache**.
22. **Adaptive preview and memory admission**.
23. **TaskManager and revision guards**.
24. **AI model registry/routing/provenance**.
25. **Generated API client and typed server errors**.
26. **Server jobs, cancellation, authz, resource controls**.
27. **Export preflight, streaming, output verification**.
28. **Analytics/telemetry/tracing with privacy tests**.
29. **Accessibility and keyboard workflow**.
30. **Legacy provider/state removal and production readiness report**.

A PR may combine adjacent items only when the diff remains understandable, independently testable, and reversible.

---

## 15. Architecture decision records required

Create ADRs for at least:

1. Project V2 schema source of truth.
2. Unified scene graph and redaction ordering.
3. Asset persistence and checksum/deduplication strategy.
4. Command/history implementation and mask-delta storage.
5. Canonical microsecond timebase.
6. Animation precedence and modifier order.
7. Preview/export shared render contract.
8. Canvas2D as initial canonical renderer and criteria for GPU migration.
9. GIF decode/cache strategy.
10. AI local/server routing and fallback policy.
11. Server job model and cancellation.
12. Analytics privacy contract.
13. Enhanced image semantics.
14. Font portability and export policy.
15. Project package format if introduced.

Each ADR must include context, decision, alternatives, consequences, migration impact, and reversal cost.

---

## 16. Risk register and mitigation

| Risk | Severity | Mitigation |
|---|---:|---|
| Big-bang rewrite breaks workflows | Critical | Strangler adapters, feature flags, small PRs, smoke tests |
| V1 migration corrupts projects | Critical | Original backup, pure migrations, fixtures, validation before write |
| Dual state diverges | Critical | V2-only writes; legacy shapes are derived read-only |
| Renderer refactor changes visuals | Critical | Golden tests, final-quality preview, parity gates |
| History retains huge assets | High | Asset ref counts, byte budgets, checkpoints, mask tile deltas |
| IndexedDB quota failure loses work | High | Atomic writes, error UI, stable-save fallback, exportable project package |
| Worker/bitmap resources leak | High | Registry ownership, `finally` cleanup, leak tests |
| Long GIF remains too heavy | High | Probe/admission, patch decode, LRU, low-memory mode, server route |
| AI result applies to wrong source | Critical | Revision fingerprint and stale-result rejection |
| Server job overload | Critical | Per-user/global concurrency, memory admission, timeouts, cancellation |
| Browser/server renderer drift | High | Shared evaluator, common effect semantics, cross-backend golden tests |
| Font drift changes export | High | Font assets, readiness checks, preflight, bundled test font |
| Pixelation misleads users | Critical privacy risk | Rename, secure opaque redaction, export verification |
| Telemetry leaks media/text | Critical privacy risk | Typed allowlist events, denylist tests, opt-out, redaction |
| Experimental models look supported | High | Registry status, production filtering, explicit fallback |
| GPU rewrite consumes effort without benefit | Medium/High | Measure first, renderer abstraction, ADR and parity requirement |
| Compatibility flags remain forever | High | Owner/removal phase/expiry for each flag |
| Security controls differ by deployment | High | Deployment profiles, startup validation, production-safe defaults |

---

## 17. Production release gates

Do not call GIF Studio production-grade until all applicable boxes pass with evidence.

### 17.1 Project and state

- [ ] Project V2 is strictly validated and JSON-only.
- [ ] V1 migrations are pure, ordered, tested, and preserve backups.
- [ ] No durable field contains canvas, bitmap, DOM object, worker, model session, function, or blob URL.
- [ ] Project, editor session, environment, runtime assets, tasks, and playback have distinct owners.
- [ ] V2 is the only writable project model.
- [ ] Autosave and crash recovery are tested.

### 17.2 Layers and editing

- [ ] One ordered scene graph defines z-order.
- [ ] Layer panel order survives save/reload.
- [ ] Source, cutout, overlay, enhanced variant, and text use normalized primitives.
- [ ] All persistent edits use commands/transactions.
- [ ] Undo/redo covers transforms, masks, text, effects, timeline, AI apply, reorder, and delete.
- [ ] Tool state cannot enter invalid combinations.
- [ ] Pixelate and secure redaction are distinct.

### 17.3 Time, animation, and rendering

- [ ] One microsecond time model is used.
- [ ] Source GIF variable delays and disposal modes are tested.
- [ ] Animation precedence is documented and deterministic.
- [ ] Random/procedural motion is seeded.
- [ ] Pose/joint edits that affect export are persisted.
- [ ] A pure scene evaluator creates the render plan.
- [ ] Preview final-quality and export share the render contract.
- [ ] Golden and parity tests pass.
- [ ] Unsupported renderer features fail preflight rather than disappear.

### 17.4 Assets, memory, and performance

- [ ] Asset bytes, manifests, runtime resources, and caches are separated.
- [ ] Every runtime resource has an owner and disposal path.
- [ ] Frame/effect caches are byte-bounded and tested.
- [ ] Large jobs are admitted, downscaled, routed, or rejected before allocation.
- [ ] Long GIFs do not retain all full composited frames indefinitely.
- [ ] Export streams frames or proves the full buffer fits.
- [ ] Repeated open/close and cancel tests show no monotonic leak.
- [ ] Reference performance budgets pass.

### 17.5 Tasks, AI, and API

- [ ] All long tasks support cancellation and typed progress/errors.
- [ ] Stale results cannot mutate the project.
- [ ] Model status, revision, runtime, limits, and provenance are recorded.
- [ ] Fallback is explicit and visible.
- [ ] Experimental/unwired models are hidden in production.
- [ ] API contracts are versioned and generated/shared.
- [ ] Long server operations use jobs with cancellation and cleanup.
- [ ] Project/asset/job endpoints are authenticated and authorized in production.
- [ ] Resource, rate, and concurrency limits are enforced per user and globally.

### 17.6 Export

- [ ] Export freezes a project/asset/font snapshot.
- [ ] Preflight validates support, memory, fonts, assets, and timing.
- [ ] Export phase progress and cancellation work.
- [ ] Output metadata is verified.
- [ ] Missing fonts and unsupported effects are explicit.
- [ ] Secure redaction is verified in flattened output.
- [ ] Error codes identify render, quantize, encode, optimize, and delivery phases.

### 17.7 Security, privacy, analytics, and operations

- [ ] Media signature/decompression-bomb/malformed input tests pass.
- [ ] FFmpeg/model workers have resource and timeout controls.
- [ ] Model files are pinned and checksum-verified.
- [ ] Retention/deletion policy is implemented and documented.
- [ ] Analytics/logs/traces contain no user media or sensitive text by default.
- [ ] Product analytics and technical telemetry schemas are versioned and tested.
- [ ] Correlation IDs connect browser, API, job, and worker.
- [ ] Dashboards expose import, playback, AI, export, memory, migration, and crash health.
- [ ] Accessibility keyboard/focus/reduced-motion gates pass.
- [ ] Rollback and recovery runbooks exist.

### 17.8 Legacy removal

- [ ] `StudioProvider` is a thin composition root.
- [ ] Legacy writable arrays and duplicate animation/effect paths are deleted.
- [ ] Temporary feature flags are removed or have active expiry ownership.
- [ ] Architecture docs and ADRs match the implementation.
- [ ] `PRODUCTION_READINESS_REPORT.md` contains evidence, not unsupported claims.

---

## 18. Copy-ready master prompt for Cursor Agent

Paste the prompt below into Cursor from the repository root after adding this file to the repository.

```text
You are the staff engineer responsible for converting GIF Studio from a feature-rich prototype into a production-grade editor.

Read these files first:
1. GIF_STUDIO_CURSOR_PRODUCTION_BUILD_PLAN.md
2. GIF_STUDIO_SENIOR_ARCHITECTURE_REVIEW.md
3. GIF_STUDIO_CRITICAL_SENIOR_REVIEW.md
4. the current architecture/source reference docs
5. all existing repository instructions, package scripts, and test configuration

Your authority:
- You may refactor application architecture, add tests, add strict schemas, introduce TypeScript at domain boundaries, split modules, add migration adapters, and harden the FastAPI service.
- Preserve existing user workflows unless this build plan explicitly changes misleading or unsafe behavior.
- Do not add new model families, effects, export formats, or unrelated UI redesign while P0 foundations are incomplete.

Execution mode:
- Use an incremental strangler migration.
- Work through phases in the exact order in the build plan.
- Keep the app bootable and the import -> edit -> preview -> export smoke path working after every phase.
- Do not create a single giant patch.
- Do not dual-write old and new state. New V2 state is authoritative; legacy shapes may be derived read-only during migration.
- Run the required tests before marking a phase complete.
- If a phase is blocked, document the blocker and evidence. Do not claim success and do not hide failures.

First action - no production code changes yet:
1. Detect package manager and existing toolchain.
2. Inspect the actual implementation; verify review assumptions.
3. Create docs/production-refactor/BASELINE.md.
4. Create docs/production-refactor/STATUS.md from the template in this plan.
5. Run and record existing build/lint/test results.
6. Add the minimum smoke test and benchmark fixtures required by Phase 0.

Non-negotiable invariants:
- Durable projects are strict JSON and contain no Canvas, ImageBitmap, HTMLImageElement, DOM node, worker, function, model session, or blob URL.
- One ordered scene graph defines visual order.
- All persistent edits use commands/transactions and support undo/redo.
- One microsecond time model and one pure SceneEvaluator define animation.
- Preview final-quality and export share the same render plan and effect semantics.
- Procedural animation is seeded; no ambient Math.random() in evaluation.
- All long operations support cancellation and stale-result rejection.
- Every runtime resource has an owner, byte budget where relevant, and disposal path.
- Pixelation is not secure redaction. Secure redaction is an opaque protected final pass.
- Analytics/logs/traces never include user media, masks, filenames, text content, prompts, project names, paths, or raw project JSON by default.
- Production APIs authenticate and authorize project, asset, and job access.

Implementation quality rules:
- Prefer pure functions at domain/render boundaries.
- Use strict runtime validation at every persistence/API boundary.
- Use exhaustive discriminated unions; avoid any in domain, task, render, schema, and API code.
- Keep React components as views/adapters, not domain services.
- Use AbortSignal through browser task adapters and cooperative cancellation on the server.
- Clean up resources in finally blocks.
- Never silently ignore unsupported effects, missing fonts, failed fallbacks, or migration errors.
- Add an ADR for irreversible decisions.
- Add tests with every persistent field, task type, render feature, migration, or API change.

For each phase:
1. State the phase goal and files likely to change.
2. Implement the smallest complete vertical slice.
3. Add/update tests before removing legacy behavior.
4. Run formatting, lint, typecheck, unit, integration, build, and phase-specific tests.
5. Record exact commands and results in STATUS.md.
6. Record schema/API migration and rollback behavior.
7. Record benchmark/memory evidence when relevant.
8. Remove temporary compatibility code as soon as its consumers migrate.
9. Continue only when the phase exit gate passes.

Required completion report for every phase:
- Summary
- Architecture decisions/ADRs
- Files changed
- Migrations/API changes
- Tests added
- Commands run and results
- Performance/memory evidence
- Security/privacy impact
- Remaining legacy code
- Known risks/blockers
- Next phase

Begin with Phase 0. Do not skip directly to renderer, AI, or UI feature work.
```

---

## 19. `STATUS.md` template for Cursor

```md
# GIF Studio Production Refactor Status

## Repository baseline

- Package manager:
- Frontend framework/build:
- Backend/runtime:
- Existing test tools:
- Current branch/commit:
- Baseline build result:
- Baseline test result:
- Known pre-existing failures:

## Phase status

| Phase | State | Gate | Evidence |
|---|---|---|---|
| 0 Baseline | Not started | Baseline and smoke path | |
| 1 Project V2 | Not started | V2 only writable model | |
| 2 Assets | Not started | No runtime objects in document | |
| 3 Scene graph | Not started | One ordered layer model | |
| 4 Commands/history | Not started | All persistent edits command-based | |
| 5 Tools/masks/redaction | Not started | Valid tool state and secure redaction | |
| 6 Time/animation | Not started | Canonical deterministic evaluator | |
| 7 Render parity | Not started | Golden/parity suite passes | |
| 8 Decode/performance | Not started | Bounded caches and admission | |
| 9 Task/AI | Not started | Cancel/stale/provenance complete | |
| 10 FastAPI | Not started | Versioned secure job boundary | |
| 11 Export | Not started | Preflight/stream/verify complete | |
| 12 Observability | Not started | Privacy-safe events/metrics/traces | |
| 13 Accessibility | Not started | Keyboard/focus/reduced-motion gates | |
| 14 Release | Not started | All release gates evidenced | |

## Current phase

### Goal

### Files changed

### Decisions / ADRs

### Migration and rollback

### Tests added

### Commands executed

```text
command
result
```

### Performance and memory evidence

### Security/privacy review

### Remaining legacy code

### Risks and blockers

### Exit gate result

- [ ] Passed
- [ ] Failed

### Next action
```

---

## 20. Deferred P2 backlog - only after production gates

Do not start these items until the production foundation is stable and measured:

1. GPU-native rendering/effect pipeline, only with benchmark evidence and parity tests.
2. Full group editing, clipping masks, adjustment layers, and reusable compositions.
3. Tracked/per-frame animated segmentation and temporal inpainting.
4. APNG/WebM or additional export formats.
5. Background/cloud render queue and resumable exports.
6. Real-time collaboration or cloud project sharing.
7. Plugin/extension architecture.
8. More AI model families through the established registry/task/provenance contract.
9. Diffusion generative fill, with explicit safety, resource, provenance, and privacy controls.
10. Multi-user asset libraries and organization administration.

The normalized document, command model, asset IDs, and deterministic renderer should make these possible without another foundational rewrite.

---

## 21. Definition of done for the complete build

The complete build is done only when:

- the source architecture and both reviews have been resolved into tested implementation contracts;
- every P0/P1 item is implemented or explicitly rejected through an ADR with evidence;
- all Section 17 release gates pass;
- the legacy god-provider path and duplicate writable state are removed;
- a V1 project can migrate, save, reopen, undo/redo, autosave/recover, and export correctly;
- preview/export parity passes for the fixture matrix;
- long GIFs operate within bounded cache and memory policy;
- AI/export tasks cancel and reject stale results;
- production APIs enforce authz and resource controls;
- analytics is no longer rated Bad because typed privacy-safe events, metrics, traces, dashboards, and tests exist;
- accessibility basics pass automated and keyboard smoke tests;
- the production readiness report contains reproducible evidence;
- documentation matches the code and no critical behavior exists only in tribal knowledge.

---

## 22. Final senior instruction

The central failure mode to avoid is moving the same complexity into differently named files without changing ownership. Splitting `StudioProvider` is not complete if every new service still shares mutable state, reaches directly into UI stores, or duplicates rendering rules.

The architectural success condition is stronger:

```text
ProjectDocument + AssetSet + timeUs + seed
              -> pure SceneEvaluator
              -> RenderPlan
              -> preview/export renderer
```

All authoring changes reach the document through commands. All long-running work reaches it through revision-checked task completion commands. All binary resources live behind asset IDs and disposable runtime registries. All production claims are supported by tests, metrics, and release evidence.

Until those statements are true, add fewer features and finish the foundation.
