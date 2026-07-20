> **Canonical review path.** Sibling docs under `docs/` — use `../` for MEGA/manual links.

# GIF Studio — Critical Senior Engineering Review

> **Canonical master (includes this file as Part F):** [GIF_STUDIO_COMPLETE_PRODUCTION_MANUAL.md](../GIF_STUDIO_COMPLETE_PRODUCTION_MANUAL.md)

> **Review type:** architecture and design-document review, not a line-by-line source-code audit.
>
> **Source reviewed:** `Pasted markdown(2).md` (`GIF Studio — Senior Source Architecture`, 822 lines).
>
> The source document describes the codebase well enough to identify architectural risks, but some conclusions below must still be verified against the implementation, tests, browser profiles, and production telemetry.

---

## 1. Executive verdict

### Is this good practice?

**Partly.** It is a good prototype/vertical-slice architecture with several sensible boundaries, but it is **not yet a strong production editor architecture**.

The document shows good instincts:

- A serializable project document exists.
- Pure math and sampling logic is intended to live under `lib/`.
- Heavy AI work is separated behind a Python API.
- Rendering, decoding, encoding, UI, and AI wrappers have named modules.
- Capability probing and explicit resource limits are considered.
- The author openly documents known gaps instead of hiding them.

However, the central architecture has accumulated too many overlapping responsibilities. The most serious signal is a `StudioProvider` of roughly **3,383 lines** that coordinates drawing, playback, extraction, AI, transforms, selection, layers, pose, export, and busy state. That is not simply a large file; it indicates that the application lacks a stable application-service layer and clear ownership boundaries.

### Overall assessment

| Area | Rating | Senior assessment |
|---|---:|---|
| Feature coverage | 8/10 | Broad and impressive for a prototype |
| Documentation coverage | 8/10 | Strong inventory; weak on invariants and failure behavior |
| Folder organization | 7/10 | Reasonable top-level grouping |
| UI component reuse | 7/10 | Good reusable UI foundation |
| State ownership | 4/10 | Too many owners and mirrored concepts |
| Domain model | 4/10 | Split layer arrays and fragmented animation state |
| Runtime orchestration | 2/10 | `StudioProvider` is a god object |
| Rendering architecture | 5/10 | Good intention, unclear parity and engine ownership |
| Timeline/animation model | 4/10 | Several animation systems compete for the same properties |
| Persistence/versioning | 5/10 | Schema exists; migrations and asset persistence are incomplete |
| Performance/memory design | 3/10 | Full-frame canvas caching does not scale safely |
| Async/AI task lifecycle | 4/10 | Capabilities exist; cancellation and stale-result control are unclear |
| Export reliability | 4/10 | Multiple export paths without a documented canonical contract |
| Testing strategy | 2/10 | Essentially absent from the architecture document |
| Observability/analytics | 2/10 | No real telemetry or quality measurement model is described |
| Security/privacy | 4/10 | Some server guards exist; end-to-end policy is not defined |
| Accessibility | 3/10 | No documented keyboard, screen-reader, or reduced-motion contract |

**Overall architecture readiness: approximately 4.6/10.**

This does **not** mean the product is bad. It means the architecture is currently optimized for shipping features quickly, not for long-term correctness, predictable performance, safe persistence, or team scalability.

---

## 2. What is genuinely good

### 2.1 The system is decomposed into recognizable areas — `[GOOD]`

The top-level split between store, context, libraries, engine modules, client AI wrappers, and a Python service is understandable. A new engineer can locate most functionality from the folder map. That is valuable.

The intent that `lib/*` contains pure catalogs, samplers, schemas, and pixel math is especially good. Pure functions are easier to test, cache, run in workers, and reuse during export.

### 2.2 A versioned project document exists — `[GOOD, INCOMPLETE]`

`PROJECT_SCHEMA_VERSION = 1`, explicit defaults, serialization, and hydration are a good start. Many editor prototypes postpone persistence until too late. This project at least acknowledges that the editor state must become a durable document.

The good practice should be completed with:

- strict runtime validation;
- migration functions for every schema version;
- asset manifests instead of runtime URLs;
- round-trip tests;
- unknown-field handling rules;
- forward-compatibility behavior;
- corruption recovery.

### 2.3 Heavy AI is behind an API boundary — `[GOOD]`

Keeping segmentation, matting, depth, inpainting, upscaling, and interpolation behind a server interface is a sound direction. It prevents the React application from directly owning every model runtime and allows CPU/GPU infrastructure to change independently.

The optional local ONNX/MediaPipe path is useful for latency and privacy, but it needs a stronger policy layer so behavior is consistent across devices.

### 2.4 The product boundary for AI is sensible — `[GOOD]`

The statement that AI assists selection, matting, depth, interpolation, and upscale rather than replacing the animator or encoder is a strong product principle. It keeps the editor deterministic and user-directed.

### 2.5 Capability probing is better than assuming dependencies exist — `[GOOD]`

The explicit capability map for ONNX, MediaPipe, FFmpeg, AI models, and server availability is useful. Optional infrastructure should degrade gracefully rather than fail during an edit.

The current implementation still appears to mix capability availability with quality level. For example, an OpenCV fallback and a LaMa model should not both be represented as the same undifferentiated `inpaint: true` experience.

### 2.6 Reusable UI primitives are present — `[GOOD]`

A shared kit for fields, controls, sections, sliders, stage helpers, zoom controls, and overlays reduces visual and behavioral drift. This is a better foundation than implementing every panel independently.

### 2.7 Known gaps are documented — `[GOOD]`

The source explicitly admits limited inpaint UI, incomplete model slots, CPU-path tradeoffs, and full-frame memory pressure. That honesty is valuable. The next step is to turn each gap into an owner, decision, budget, and acceptance test.

---

## 3. Critical architectural problems

## 3.1 `StudioProvider` is a god object — `[CRITICAL]`

The document describes a provider of roughly 3.3k lines that owns or exposes:

- canvas, stage, and file refs;
- navigation and zoom;
- import and reset;
- draw and playback;
- selection and extraction;
- mask editing;
- layer mutation and reordering;
- transforms;
- AI operations;
- enhanced-image handling;
- motion clips;
- pose state;
- export;
- busy state.

This is the strongest architectural warning in the entire document.

### Why it is wrong

1. **No narrow reason to change.** A new AI model, a new transform, a rendering change, and a routing change can all modify the same module.
2. **High regression blast radius.** A change in selection can accidentally affect export because both share closures and mutable refs.
3. **Hard testing.** React context, DOM refs, async tasks, stores, and pixel rendering become inseparable.
4. **Uncontrolled dependency direction.** UI, domain state, engine state, and infrastructure all meet in one place.
5. **Performance instability.** A large provider value can cause broad rerendering unless every value is carefully memoized.
6. **Difficult team ownership.** Multiple engineers editing one central module create merge conflicts and implicit coupling.

### Required improvement

Make the provider a thin composition root. Split responsibilities into testable services:

```text
StudioRootProvider
├── EditorCommandService       project mutations and transactions
├── RuntimeAssetRegistry       ImageBitmap/canvas/font/model handles
├── SceneEvaluator             project + time -> deterministic render plan
├── RenderService              preview and export render adapters
├── PlaybackController         clock, play, pause, scrub
├── SelectionService           hit testing, masks, extraction geometry
├── AiTaskManager              jobs, progress, cancellation, stale-result guard
├── ExportService              render frames, encode, report progress
├── HistoryService             undo/redo and transactions
└── PersistenceService         save/load/migrate/assets
```

React context should expose a few stable facades or hooks, not hundreds of fields and callbacks.

---

## 3.2 There is no demonstrated single source of truth — `[CRITICAL]`

State is distributed among:

- Zustand project state;
- Zustand selection/tools/UI/session/capabilities;
- `StudioProvider` refs and derived runtime;
- `poseRig` session state;
- decoded frame canvases;
- Konva node state;
- Canvas 2D output;
- optional Pixi state;
- HTML image objects;
- server project/assets/jobs.

A complex editor can have persistent and runtime state, but every value must have exactly one authoritative owner.

### Examples of ambiguity

- Is the transform stored only in the project document, or can Konva temporarily own a newer value?
- Is `playing/progress` owned by the Zustand session or provider playback controller?
- Are pose joint edits part of the saved project or only the current browser session?
- Are decoded GIF frames assets, cache entries, or project state?
- Does the server project document contain the same normalized data as the browser document?

### Required improvement

Write and enforce an ownership table:

| Data | Authoritative owner | Persisted? | Derived/cached copies |
|---|---|---:|---|
| Project structure | `ProjectDocument` | Yes | UI selectors |
| Current selection | `EditorSession` | No | Inspector view model |
| Playback time | `PlaybackController` | No | UI display |
| Runtime bitmap | `AssetRegistry` | No | Renderer cache |
| Pose animation keys | `ProjectDocument` | Yes | Evaluated pose |
| Model session | `ModelRuntimeRegistry` | No | None |
| Export job | `TaskManager` | Optional | Progress UI |

Do not allow DOM nodes, canvases, `ImageBitmap`, `HTMLImageElement`, ONNX sessions, or blob URLs inside the durable project state.

---

## 3.3 Runtime objects are mixed with logical layer entities — `[CRITICAL]`

The described element contains fields such as `bitmap`, `sourceBitmap`, `maskCanvas`, and `cleanup`. Those are runtime resources, not document data.

### Why it is wrong

- They cannot be reliably serialized.
- They retain large memory allocations.
- They make undo/redo expensive.
- They complicate equality, selectors, persistence, and collaboration.
- They are browser-specific and cannot be interpreted by the Python renderer without a separate mapping.
- They make resource disposal unclear.

### Better model

```ts
interface ImageLayer {
  id: LayerId;
  type: "image";
  assetId: AssetId;
  maskAssetId?: AssetId;
  cleanupAssetId?: AssetId;
  transform: Transform2D;
  effects: EffectNode[];
  animation: AnimationBinding[];
  visible: boolean;
  locked: boolean;
}

interface AssetManifestEntry {
  id: AssetId;
  kind: "image" | "gif" | "mask" | "font" | "depth" | "video";
  uri: string;
  mimeType: string;
  width?: number;
  height?: number;
  checksum?: string;
}
```

Runtime decoding belongs in an `AssetRegistry`:

```ts
interface RuntimeAssetRegistry {
  getBitmap(assetId: AssetId): Promise<ImageBitmap>;
  getGifFrame(assetId: AssetId, timeUs: number): Promise<ImageBitmap>;
  release(assetId: AssetId): void;
}
```

---

## 3.4 The layer model is fragmented by type — `[HIGH]`

The project stores separate `elements[]`, `overlays[]`, and `textLayers[]`, while the UI describes a combined visual stack.

### Why this is a problem

- True cross-type z-order becomes difficult or impossible.
- Reordering needs separate functions for each array.
- Selection, duplication, deletion, visibility, locking, grouping, and history are repeated per type.
- Timeline references need `kind:id` indirection.
- New layer types require changes throughout the app.
- The draw stack may become hard-coded rather than document-driven.

### Better model

Use one ordered scene graph:

```ts
type Layer =
  | ImageLayer
  | TextLayer
  | ShapeLayer
  | GroupLayer
  | AdjustmentLayer
  | EffectLayer;

interface ProjectDocument {
  layers: Layer[];             // one authoritative z-order
  timeline: TimelineDocument;
  assets: AssetManifestEntry[];
  settings: ProjectSettings;
}
```

Special background/artboard behavior can be represented through role fields or reserved nodes, not separate unrelated arrays.

If product constraints intentionally require text to always be above image layers, document that as an invariant and prevent drag interactions that imply otherwise.

---

## 3.5 Animation is split across too many competing systems — `[CRITICAL]`

The document describes all of the following:

- base motion preset start/end channels;
- looping motion names;
- timed motion-effect clips;
- property keyframes;
- text entrance/loop/exit;
- parallax;
- pose sway;
- joint keyframes;
- animated distortion parameters;
- GIF source frame timing;
- ping-pong behavior;
- global easing;
- per-layer amplitude and speed.

Several systems can affect the same property at the same time.

### Missing questions

- Does a keyframed `x` replace base motion `x`, add to it, or multiply it?
- Is parallax applied before or after keyframes?
- Is pose motion in local space or world space?
- Does a text entrance opacity multiply a keyframed opacity or override it?
- Does `Zoom` clip multiply base scale before or after a scale keyframe?
- Does ping-pong affect source GIF playback, project time, or only preset time?
- What happens when global duration differs from imported GIF duration?
- How are random effects seeded so preview and export match?

The document lists a draw order, but that is not a complete animation-composition contract.

### Required improvement

Define a canonical evaluator with explicit composition rules:

```text
project time
  -> source media time mapping
  -> base transform
  -> authored property tracks
  -> procedural motion modifiers
  -> parallax modifier
  -> pose/deformation modifier
  -> effect parameter tracks
  -> visibility/opacity envelope
  -> final render node
```

For every channel, define one of:

- `replace`;
- `add`;
- `multiply`;
- `min/max`;
- local-space composition;
- world-space composition.

Prefer a unified property-track model over separate bespoke animation fields. Presets should generate editable tracks or modifiers, not create a second hidden animation system.

---

## 3.6 Preview and export parity is not an explicit invariant — `[CRITICAL]`

The project has Konva for interactive editing, Canvas 2D for compositing, optional Pixi for preview blitting, client GIF encoding, server GIF encoding, and FFmpeg paths.

Sharing a `draw` function between preview and export is a good intention, but the document does not prove that all paths evaluate the exact same scene, fonts, timing, effects, alpha behavior, random values, and transforms.

### Typical failure modes

- Konva transform handles show a different pivot than export.
- Browser text metrics differ from server text metrics.
- optional Pixi filtering or texture sampling changes the preview.
- server export does not implement every browser-only effect.
- GIF frame-delay rounding differs between preview and encoder.
- random motion produces different results per frame/render path.
- image smoothing and alpha premultiplication differ.
- unsupported blend modes silently degrade.

### Required improvement

Create a pure scene evaluator:

```ts
RenderPlan evaluateScene(
  project: ProjectDocument,
  timeUs: number,
  assetMetadata: AssetMetadata,
  seed: number
)
```

Then implement rendering adapters that consume the same `RenderPlan`:

```text
RenderPlan
├── Canvas2DRenderer       preview/fallback
├── WebGLRenderer          accelerated preview
├── WorkerCanvasRenderer   client export
└── ServerRenderer         optional server export
```

Add an automated parity suite that renders selected timestamps through each supported path and compares pixels within a documented tolerance.

---

## 3.7 Full-frame canvas caching is not scalable — `[CRITICAL]`

The source acknowledges that imported GIF frames are held as full canvases in memory.

Raw RGBA memory is approximately:

```text
width × height × 4 bytes × frame count
```

Examples before accounting for canvas backing stores, browser overhead, duplicate source copies, masks, effect buffers, and export buffers:

| Workload | Raw frame memory |
|---|---:|
| 480 × 300, 10 s, 24 fps (240 frames) | ~132 MiB |
| 1920 × 1080, 10 s, 30 fps (300 frames) | ~2.32 GiB |
| 1920 × 1080, 20 s, 60 fps (1,200 frames) | ~9.27 GiB |
| One 5000 × 5000 RGBA frame | ~95 MiB |

This architecture will crash tabs or trigger severe garbage collection long before the nominal 5000/8192 dimension limits are reached.

### Required improvement

- Preserve compressed source bytes.
- Decode only the frames needed around the playhead.
- Use a bounded LRU frame cache.
- Prefer `ImageBitmap` and explicitly close/release it.
- Move decode and rendering to workers where supported.
- Use `OffscreenCanvas` for export.
- Stream rendered frames to the encoder instead of retaining all output frames.
- Enforce a memory budget based on width, height, frame count, masks, and expected intermediates before import/export begins.
- Reduce preview resolution independently from export resolution.
- Dispose object URLs, canvases, textures, and model sessions deterministically.

---

## 3.8 The tool-mode state can enter invalid combinations — `[HIGH]`

The tools slice appears to use multiple booleans such as `selectMode`, `maskEditing`, and `censorSelecting`, plus a selection tool value.

Multiple booleans create states that should not exist, such as mask editing and censor selection being active simultaneously.

### Better model

```ts
type ActiveTool =
  | { type: "move" }
  | { type: "rect-select" }
  | { type: "lasso-select" }
  | { type: "polygon-select" }
  | { type: "pen-select" }
  | { type: "mask-brush"; mode: "hide" | "reveal" }
  | { type: "censor-region" }
  | { type: "sam-point" }
  | { type: "pose-edit" };
```

A discriminated union or state machine makes invalid modes unrepresentable and centralizes enter/exit cleanup.

---

## 3.9 There is no command/history architecture — `[CRITICAL]`

Undo/redo is not described. For an editor, this is not a secondary feature; it is a core architectural requirement.

Without commands or transactions:

- multi-property operations can be partially applied;
- async AI results can overwrite newer edits;
- masks and transforms are difficult to restore;
- UI actions directly mutate low-level state;
- autosave cannot distinguish committed edits from transient interaction;
- collaborative or scripted actions become much harder later.

### Required improvement

Represent user operations as commands:

```ts
interface EditorCommand {
  id: string;
  label: string;
  apply(doc: ProjectDocument): ProjectDocument;
  invert?(before: ProjectDocument, after: ProjectDocument): EditorCommand;
}
```

Use transactions for drag, resize, brush stroke, and AI apply operations. Record one history entry when the interaction commits, not one entry per pointer move.

Large binary masks should use asset snapshots, tiled deltas, or patch references rather than copying a full canvas into every history item.

---

## 3.10 Async AI and export operations need a real task model — `[HIGH]`

Busy flags such as `segmenting`, `scaleBusy`, `downloadBusy`, and `exporting` do not form a robust asynchronous architecture.

### Missing behavior

- cancellation;
- timeout;
- retry policy;
- progress events;
- job identifiers;
- stale-result protection;
- deduplication;
- concurrency limits;
- cleanup on route/project changes;
- reproducibility metadata;
- error taxonomy;
- resumability for server jobs.

### Common race condition

1. User starts segmentation on asset A.
2. User replaces the source with asset B.
3. Segmentation for A finishes.
4. Old result is inserted into project B.

A single busy boolean cannot prevent this safely.

### Better model

```ts
interface StudioTask {
  id: TaskId;
  kind: "segment" | "matte" | "depth" | "upscale" | "interpolate" | "export";
  projectRevision: number;
  inputAssetIds: AssetId[];
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  progress?: number;
  abortController?: AbortController;
}
```

Apply a result only when its project revision and input asset IDs still match.

---

## 4. Subsystem-by-subsystem Good / Mixed / Bad audit

## 4.1 System architecture — `[MIXED]`

### Good

- Recognizable layers exist.
- Heavy compute is separated from the UI.
- Pure library modules are intended.

### Bad

- Boundaries are descriptive rather than enforced.
- `StudioProvider` crosses almost every boundary.
- Runtime assets, project data, and UI orchestration are entangled.
- Dependency direction is not documented.

### Improve

Adopt explicit domain, application, infrastructure, and presentation layers. Add import rules or lint boundaries so UI cannot directly import server/runtime internals.

---

## 4.2 Folder structure — `[GOOD/MIXED]`

### Good

The folder map is understandable.

### Bad

Folders alone do not create architecture. `context/studio-provider.jsx` is effectively a whole application hidden in one file. `lib/` may become a miscellaneous bucket if ownership is not stricter.

### Improve

Organize by stable responsibility rather than only technical type:

```text
src/
├── app/
├── editor-domain/
│   ├── project/
│   ├── layers/
│   ├── timeline/
│   ├── commands/
│   └── validation/
├── editor-runtime/
│   ├── assets/
│   ├── playback/
│   ├── rendering/
│   └── workers/
├── features/
│   ├── selection/
│   ├── text/
│   ├── effects/
│   ├── pose/
│   ├── ai-tools/
│   └── export/
├── infrastructure/
│   ├── api/
│   ├── persistence/
│   └── telemetry/
└── ui/
```

---

## 4.3 Routing/workspaces — `[MIXED]`

### Good

Routes create direct entry points to major workflows.

### Bad

- Entering focus workspaces clears selection/mask/censor state. Navigation should not silently destroy or cancel user context without an explicit tool transition.
- The export route automatically starts playback, which is surprising route-side behavior.
- The Effects page returns `null` while the actual UI is elsewhere. The route and information architecture do not match.
- Locking all workspace navigation during long tasks is too coarse.

### Improve

- Treat route changes as view changes, not mutation commands.
- Centralize tool exit logic and ask only when an uncommitted operation would be lost.
- Keep Effects content owned by the Effects feature, even if rendered in a shared inspector slot.
- Allow navigation during tasks when safe; expose cancel and background progress.

---

## 4.4 Layout and inspector — `[MIXED]`

### Good

The shell has clear regions and reusable panel chrome.

### Bad

The inspector priority list is a long implicit conditional chain. As more tools are added, it becomes difficult to predict which panel wins. This is a hidden state machine without a model.

### Improve

Use explicit inspector contributions:

```ts
interface InspectorContribution {
  id: string;
  priority: number;
  isAvailable(ctx: EditorContext): boolean;
  render(): ReactNode;
}
```

Better still, derive a single `InspectorMode` from active tool and selection state.

---

## 4.5 Selection and extraction — `[MIXED]`

### Good

The system supports local selection, AI selection, masks, and refinement. Keeping the source intact and creating a new layer is nondestructive editing.

### Bad

- Local color-key extraction based on border background sampling is fragile for textured backgrounds.
- `extractTolerance` combines multiple concepts: color distance, edge softness, and perhaps alpha cleanup.
- Different extraction paths may produce incompatible mask conventions.
- A `cleanup` underlay tied to a moving cutout can create incorrect backgrounds as the layer moves far from its original location.
- No common mask coordinate-space contract is described.

### Improve

- Standardize all masks as grayscale assets in source-pixel coordinates.
- Store mask provenance and model parameters.
- Separate selection geometry from extraction/matting.
- Make hole-fill an explicit background edit, not an implicit child of the moving cutout.
- Normalize alpha edge processing across local and server paths.

---

## 4.6 Layers — `[BAD]`

### Good

Visibility, locking, selection, transforms, and reordering are present.

### Bad

- Separate arrays by type.
- Fixed draw stack limits composability.
- No groups, clipping masks, adjustment layers, blend hierarchy, or parent transforms are described.
- Runtime objects appear inside elements.
- Cross-type duplicate/delete/reorder behavior is repeated.

### Improve

Use one ordered scene graph, typed layers, parent IDs, explicit clipping/group semantics, and one command API for all layer operations.

---

## 4.7 Effects/image processing — `[MIXED]`

### Good

A centralized effect library and consistent effect defaults are good foundations.

### Bad

- Effect order is not a first-class editable concept.
- Static effects and timeline effects use different data models.
- CPU convolutions and distortions on the hot path can be expensive.
- Cache invalidation is not documented.
- Color space, premultiplied alpha, edge handling, and image smoothing are unspecified.
- OpenCV exists but is intentionally skipped, creating multiple implementations with different behavior.

### Improve

Represent effects as an ordered effect graph:

```ts
interface EffectNode {
  id: string;
  type: EffectType;
  enabled: boolean;
  params: Record<string, number | string | boolean>;
  animatedParams?: PropertyTrack[];
}
```

Make effects pure and deterministic. Cache by asset ID, effect graph hash, time bucket, render scale, and color-space configuration. Use workers/GPU only behind the same effect contract.

---

## 4.8 Motion and timeline — `[BAD/MIXED]`

### Good

The product exposes both easy presets and advanced keyframes. That is a good UX direction.

### Bad

- Presets, start/end settings, loops, clips, and keyframes overlap.
- Property keyframes support only a subset of properties.
- Linear keyframe interpolation conflicts with the existence of richer global easing.
- Locked base-motion lanes are display-only, so the user sees animation that cannot be directly edited.
- Hard caps of three motion effects and five text layers are unexplained.
- `Random` animation is not documented as seeded.
- Variable-delay GIF source timing is not reconciled with project FPS.

### Improve

- Make presets generate normal tracks/modifiers.
- Add per-keyframe interpolation and tangents/easing.
- Use integer time units, preferably microseconds or rational frame time.
- Define clip overlap rules.
- Seed every procedural/random animation from project/layer IDs.
- Document whether caps are product limits, performance limits, or temporary UI limits.

---

## 4.9 Pose/joints/warp — `[MIXED]`

### Good

Pose data and warp logic are isolated in named modules.

### Bad

- User-authored pose/joint keys are session-only according to the document.
- Preview/export cache bucketing can create temporal stepping.
- The relationship between body mask, rest pose, layer transform, and warp coordinate systems is not specified.
- No behavior is defined for low-confidence/missing joints.

### Improve

Persist the pose rig and authored joint tracks in the project. Store model/provenance and confidence. Define a stable rest-pose asset coordinate system and fallbacks for missing landmarks.

---

## 4.10 AI model architecture — `[MIXED]`

### Good

The model families are isolated behind wrappers and API endpoints.

### Bad

- The UI exposes many model implementation names directly. Most users need task modes such as Fast, Balanced, and Best, not a research-model catalog.
- Some model slots are documented as incomplete, creating dead or misleading controls.
- Local and server paths may produce different outputs for the same command.
- Model versions, checksums, preprocessing, and result provenance are not described.
- Capability flags are too broad and may become stale.

### Improve

Create a model registry:

```ts
interface ModelDescriptor {
  id: string;
  task: "segment" | "matte" | "depth" | "upscale" | "interpolate";
  version: string;
  runtime: "browser" | "server";
  qualityTier: "fast" | "balanced" | "best";
  available: boolean;
  limitations: string[];
}
```

Pin versions. Record the exact model and parameters in generated asset metadata. Hide experimental/incomplete models unless a developer flag is enabled.

---

## 4.11 Export — `[BAD/MIXED]`

### Good

The product exposes meaningful GIF controls and has both client/server options.

### Bad

- Multiple encoding paths can behave differently.
- The render path and encoder path are not cleanly separated.
- No frame-streaming contract is described.
- No output size estimate or budget is shown.
- GIF disposal and transparency behavior is complex, but only limited handling is documented.
- Font and text parity between browser and server is unresolved.
- `High quality = 256 colors + dither + lossless` is too simplistic; quality also depends on palette strategy, temporal palette stability, transparency edges, frame differencing, and content.

### Improve

Use this pipeline:

```text
ProjectDocument
  -> deterministic frame iterator
  -> canonical RGBA frames
  -> encoder adapter (GIF/APNG/WebM/MP4)
  -> optimizer adapter
  -> output artifact + metadata
```

Do not let encoders reimplement scene logic. Add a dry-run estimator for dimensions, frame count, expected memory, and rough output size. Warn when GIF is an unsuitable format for the requested duration/resolution/FPS.

---

## 4.12 Store/project schema — `[BAD/MIXED]`

### Good

A schema version and defaults exist.

### Bad

- Deep-merging known objects can hide malformed or obsolete data.
- There is no documented validation library or error report.
- No migration registry is described.
- Asset references and blob lifecycle are incomplete.
- Animation data is scattered across settings, layers, keyframes, motion effects, text, and session pose state.
- Generic update functions can bypass invariants.

### Improve

- Use runtime schema validation, such as Zod, Valibot, JSON Schema, or a Python/TypeScript shared schema.
- Keep `migrateV1ToV2`, `migrateV2ToV3`, and so on as explicit pure functions.
- Validate after every migration.
- Use domain commands instead of broad arbitrary update methods.
- Store assets by stable IDs and checksums.

---

## 4.13 Engines — `[MIXED]`

### Good

Named engine adapters are better than direct use throughout UI components.

### Bad

- Konva, Canvas 2D, Pixi, OpenCV, FFmpeg, browser GIF encoders, and Python encoders form a large technical surface.
- Pixi appears to blit a Canvas composite, which may not accelerate the expensive compositing work.
- No feature-compatibility matrix is described.
- No lifecycle/disposal contract exists.

### Improve

Choose a canonical renderer first. Treat other engines as adapters with explicit support matrices. Lazy-load large dependencies. Add `dispose()` to every engine/resource interface.

---

## 4.14 Python package — `[GOOD/MIXED]`

### Good

The server has separate AI runners, storage, DB, jobs, worker, resource guards, and security-limit modules. This is a healthier decomposition than the browser provider.

### Bad

- The documented HTTP endpoints appear mostly synchronous while a jobs/worker subsystem exists.
- Project CRUD, asset storage, AI inference, and export may have different scaling/security needs but are grouped in one API surface.
- Authentication, authorization, tenancy, retention, and cleanup are not described.

### Improve

Use a job API for long tasks, signed/stable asset IDs, explicit tenant/project authorization, retention policies, and structured error contracts. Separate request validation from inference runners.

---

## 4.15 UI kit — `[GOOD]`

The reusable controls are a strong point. Continue by adding accessibility primitives, consistent validation/error states, keyboard shortcuts, focus management, reduced-motion behavior, and visual regression tests.

---

## 5. Missing product-grade capabilities

These are not minor polish items. Several require architectural support.

### 5.1 Undo/redo and transactions — `[MISSING, CRITICAL]`

Every editor action should be reversible, including AI apply, mask strokes, reorder, transforms, delete, and inpaint.

### 5.2 Autosave and crash recovery — `[MISSING]`

A browser editor doing high-memory work will crash occasionally. Save committed document changes incrementally and restore unsaved work.

### 5.3 Project migrations — `[MISSING]`

A schema version without migrations is only a label.

### 5.4 Asset lifecycle — `[MISSING]`

Define upload, local cache, persistence, deduplication, checksum, retention, replacement, orphan cleanup, and deletion.

### 5.5 Cancellation — `[MISSING]`

Segmentation, upscale, interpolation, and export must be cancellable.

### 5.6 Error model — `[MISSING]`

A generic toast and reload-oriented error boundary are not enough. Define recoverable vs fatal errors and attach action/job IDs.

### 5.7 Keyboard and accessibility model — `[MISSING]`

At minimum: focus order, tool shortcuts, escape/cancel behavior, arrow-key nudging, screen-reader labels, high-contrast support, reduced motion, and non-pointer access.

### 5.8 Deterministic rendering — `[MISSING]`

The same project, asset set, timestamp, and seed must produce the same frame.

### 5.9 Collaboration boundaries — `[NOT REQUIRED NOW, BUT PROTECT THE DESIGN]`

Real-time collaboration may not be needed, but a normalized command/document model prevents future lock-in.

---

## 6. Performance and memory analytics

## 6.1 Current design health — `[BAD]`

The current document recognizes memory pressure but does not define budgets, admission checks, cache limits, or degradation behavior.

### Required budgets

Define targets for at least:

- preview frame time p50/p95/p99;
- dropped-frame ratio;
- maximum preview resolution;
- worker queue latency;
- decoded-frame cache memory;
- effect cache memory;
- maximum project asset memory;
- export peak memory;
- time to first preview;
- export seconds per output second;
- model warm-up time;
- AI operation p50/p95 latency;
- task cancellation latency.

### Recommended adaptive behavior

1. Render interactive preview at a reduced scale.
2. Increase quality after interaction stops.
3. Decode only nearby source frames.
4. Cache only bounded results.
5. Disable or approximate expensive effects during live drag.
6. Render final quality in a worker or server job.
7. Refuse or downscale impossible jobs before allocating memory.

### Memory admission formula

Before import/export, estimate:

```text
source decode cache
+ active frame buffers
+ mask/depth buffers
+ effect intermediates
+ renderer back buffers
+ encoder buffers
+ model working memory
+ safety margin
```

Do not estimate only the final output buffer.

---

## 7. Analytics and observability: good or bad?

### Current verdict: `[BAD / NOT DESCRIBED]`

The architecture document does not describe meaningful product analytics, technical metrics, tracing, structured logging, or quality feedback. Therefore, there is no evidence that the team can answer:

- Which tools fail most often?
- Which AI results are immediately undone or deleted?
- Which dimensions/frame counts cause crashes?
- Where export time is spent?
- How often preview differs from final export?
- Which browser/device/runtime combinations are unreliable?
- How much memory each workflow consumes?
- Which model tier produces the best accepted result?

### 7.1 Product analytics to add

Track events without uploading user media:

```text
project_created
asset_import_started / succeeded / failed
selection_started / committed / cancelled
ai_task_started / succeeded / failed / cancelled
ai_result_applied / reverted / deleted
layer_added / reordered / duplicated / deleted
playback_started / dropped_frames_detected
export_started / succeeded / failed / cancelled
project_saved / restored / migration_failed
```

Useful dimensions:

- anonymous session ID;
- app version;
- browser/device class;
- input dimensions and frame-count bucket;
- tool/model ID and version;
- local vs server runtime;
- duration bucket;
- error code;
- operation latency;
- peak-memory estimate;
- output format and size bucket.

Do **not** log source images, masks, text content, filenames, prompts, project names, or raw model outputs by default.

### 7.2 Technical observability to add

- client error reporting with source maps;
- structured logs with correlation IDs;
- distributed trace from browser task to API job and worker;
- frame-time histograms;
- dropped-frame counter;
- long-task detection;
- memory estimate and cache occupancy;
- API latency/error metrics by endpoint and model;
- model load/warm-up metrics;
- worker queue depth and task duration;
- export phase timings: evaluate, render, quantize, encode, optimize, upload/download;
- browser crash/recovery rate;
- project migration success rate;
- parity-test failures in CI.

### 7.3 Quality analytics

Use behavior-based quality signals:

- AI result accepted vs immediately reverted;
- mask refinement duration after AI result;
- number of retries with another model;
- export retry count;
- export size vs user-selected quality tier;
- preview/export pixel-diff score in automated tests.

These signals are more useful than simply counting model invocations.

---

## 8. Security and privacy review

### Current verdict: `[MIXED/BAD]`

The Python package includes resource and security-limit modules, which is good, but the architecture does not define the full threat model.

### Required controls

- Validate actual file signatures, not only extensions/MIME headers.
- Protect against decompression bombs and malformed GIF frame metadata.
- Bound pixel count, frame count, duration, and decoded memory.
- Sanitize filenames and never trust client paths.
- Use generated asset IDs and isolated storage locations.
- Authenticate project and asset endpoints.
- Authorize every asset/job access by tenant/project.
- Set explicit CORS and CSRF policies.
- Apply rate and concurrency limits per user, not only globally.
- Pin model files and verify checksums.
- Restrict or disable arbitrary remote model download in production.
- Define retention/deletion behavior for uploaded media.
- Encrypt data in transit and at rest where applicable.
- Do not log media or user-entered text.
- Isolate FFmpeg and model workers with resource limits.

### Censoring warning

Pixelation is **not secure redaction**. It can leak silhouettes, colors, shapes, or sometimes recoverable information. Label the feature as a visual mosaic effect unless the original pixels are permanently removed from the exported frame and verified.

---

## 9. Data-model recommendations

## 9.1 Canonical project document

```ts
interface ProjectDocument {
  schemaVersion: number;
  id: string;
  revision: number;
  metadata: {
    name: string;
    createdAt: string;
    updatedAt: string;
  };
  canvas: CanvasSettings;
  assets: AssetManifestEntry[];
  layers: Layer[];
  timeline: TimelineDocument;
  exportDefaults: ExportSettings;
}
```

### Invariants

- The document contains JSON-compatible data only.
- Every layer ID is unique.
- Every referenced asset exists.
- Layer order is authoritative.
- Timeline references valid layer/effect/property IDs.
- Times are stored in one integer unit.
- No `blob:` URL is a durable asset reference.
- No canvas, bitmap, DOM node, model session, or function is stored.

## 9.2 Runtime session

```ts
interface EditorSession {
  activeTool: ActiveTool;
  selection: SelectionRef[];
  playheadUs: number;
  playbackState: "stopped" | "playing" | "paused";
  viewport: ViewportState;
  inspectorMode: InspectorMode;
  runningTaskIds: TaskId[];
}
```

## 9.3 Runtime registries

```text
AssetRegistry       decoded images, GIF frames, masks, fonts
RendererRegistry    Canvas/WebGL/worker adapters
ModelRegistry       loaded ONNX/MediaPipe/model sessions
TaskRegistry        async operations and cancellation
CacheRegistry       bounded caches with memory accounting
```

---

## 10. Recommended render and time architecture

## 10.1 Time model

Use one canonical project time unit, preferably integer microseconds.

Why:

- avoids floating-point drift;
- supports variable GIF delays;
- maps cleanly to audio/video in the future;
- provides deterministic frame sampling;
- avoids confusion between progress, seconds, and frame index.

## 10.2 Scene evaluation

```text
ProjectDocument + timeUs + seed + asset metadata
        |
        v
SceneEvaluator (pure)
        |
        v
RenderPlan
  - resolved source frame
  - world transforms
  - opacity/visibility
  - text glyph runs
  - masks/clips
  - ordered effects
  - deformation parameters
        |
        +--> Preview renderer
        +--> Export renderer
        +--> Server renderer compatibility test
```

## 10.3 Deterministic procedural motion

Every random/procedural effect must derive values from a stable seed:

```text
seed = hash(projectId, layerId, effectId, projectSeed)
```

Never use ambient `Math.random()` inside frame evaluation.

## 10.4 Source GIF timing

Preserve original frame delays as source-media timing. Project FPS should define output sampling, not rewrite source timing implicitly.

```text
output timestamp -> source media timestamp -> source frame
```

Define looping, trimming, speed changes, and ping-pong as media-time mappings.

---

## 11. Testing strategy

### Current verdict: `[BAD / MISSING]`

A production editor needs several layers of testing.

## 11.1 Unit tests

- easing and interpolation;
- preset generation;
- keyframe sampling;
- time mapping;
- layer ordering;
- transform composition;
- mask coordinate conversion;
- effect parameter validation;
- project migrations;
- serialization round trips;
- memory estimates;
- task stale-result guards.

## 11.2 Property-based tests

- values remain finite and clamped;
- migrations always produce a valid current document;
- serialize/hydrate round trips preserve semantics;
- random-seeded evaluation is deterministic;
- any valid layer order renders without missing references.

## 11.3 Golden-image tests

Render representative projects at fixed timestamps and compare against approved images:

- static image;
- animated GIF with variable delays;
- transparent cutout;
- text with custom font;
- effects stack;
- parallax;
- pose warp;
- motion clips;
- transparency/disposal edge cases.

## 11.4 Preview/export parity tests

Render the same timestamps through preview and export paths. Compare pixels with a documented threshold. Fail CI when drift exceeds the threshold.

## 11.5 Integration tests

- import -> select -> extract -> animate -> save -> reload -> export;
- start AI task -> replace source -> ensure stale result is rejected;
- cancel export/model task;
- undo/redo mask and transform operations;
- migrate old project;
- missing asset recovery;
- worker crash recovery.

## 11.6 Performance tests

- frame time at representative resolutions;
- memory under long GIFs;
- cache eviction;
- export peak memory;
- AI warm-up and latency;
- repeated project open/close resource leaks.

## 11.7 Security tests

- malformed files;
- MIME spoofing;
- huge dimensions/frame counts;
- path traversal;
- unauthorized asset/job access;
- CORS/CSRF behavior;
- model-download restrictions;
- FFmpeg timeout/resource exhaustion.

---

## 12. Type safety and API contracts

The project is described as React JavaScript. For an editor with this many union types, commands, layers, tasks, assets, and render parameters, plain JavaScript raises the cost of change.

### Recommendation

Migrate the domain boundary first, not necessarily the whole UI at once:

1. project schema and migrations;
2. layer and timeline types;
3. renderer interfaces;
4. command and task models;
5. API request/response contracts;
6. feature code over time.

Generate or share schemas between TypeScript and Python where practical. Do not manually maintain slightly different request models in both runtimes.

---

## 13. Documentation quality review

### Current document quality: `[GOOD INVENTORY, WEAK SPECIFICATION]`

The source is effective as a codebase map. It is not yet a complete architecture specification.

### What it documents well

- file locations;
- feature list;
- high-level ownership;
- controls and routes;
- model catalog;
- draw order;
- known gaps.

### What it does not define

- invariants;
- authoritative state ownership;
- dependency rules;
- concurrency and cancellation;
- error contracts;
- security model;
- performance budgets;
- cache policies;
- undo/redo;
- migration behavior;
- rendering determinism;
- preview/export parity;
- accessibility;
- analytics;
- test strategy;
- release criteria.

### Documentation improvements

Create separate documents:

```text
ARCHITECTURE.md              boundaries and dependency direction
PROJECT_FORMAT.md            schema, invariants, migrations, assets
RENDERING_CONTRACT.md        time, transforms, effects, parity
ASYNC_TASKS.md               jobs, cancellation, stale-result rules
PERFORMANCE_BUDGETS.md       limits, caches, degradation behavior
SECURITY_PRIVACY.md          threat model and data handling
OBSERVABILITY.md             events, metrics, tracing, privacy
TEST_STRATEGY.md             test pyramid and parity tests
ADR/                         major decisions and rejected alternatives
```

The current file can remain the source map/reference guide.

---

## 14. Prioritized improvement plan

## P0 — fix before adding more major features

1. **Split `StudioProvider`.** Make it a thin composition layer.
2. **Define one authoritative project document.** JSON-compatible only.
3. **Create an asset registry.** Remove canvases/bitmaps from logical entities.
4. **Unify the layer model.** One ordered scene graph.
5. **Build a pure scene evaluator.** Project + time + seed -> render plan.
6. **Enforce preview/export parity.** Add golden and pixel-diff tests.
7. **Add command transactions and undo/redo.** Include async apply operations.
8. **Create a task manager.** Progress, cancellation, revision guards, errors.
9. **Replace boolean tool modes with a state machine/discriminated union.**
10. **Implement strict schema validation and migrations.**
11. **Add bounded decode/render caches and memory admission checks.**
12. **Persist pose/joint edits or clearly make them non-authoring preview state.**

## P1 — reliability and production hardening

1. Move decode, expensive effects, and client export into workers.
2. Stream frames to encoders.
3. Normalize AI model registry/version/provenance.
4. Convert long server operations to cancellable jobs.
5. Add structured errors, tracing, logs, and metrics.
6. Add autosave and crash recovery.
7. Add asset checksums, deduplication, retention, and orphan cleanup.
8. Define security/auth/tenancy for projects, assets, and jobs.
9. Add keyboard/accessibility contracts.
10. Consolidate animation systems into tracks plus modifiers.
11. Add per-keyframe interpolation/easing.
12. Add export estimation and unsupported-feature warnings.

## P2 — scale and advanced capability

1. GPU-native render pipeline where it produces measured value.
2. Groups, clipping masks, adjustment layers, and reusable compositions.
3. Additional output formats such as APNG/WebM where appropriate.
4. Background rendering/export queue.
5. Collaboration or cloud projects, only after commands and assets are normalized.
6. More AI models only through the registry/task/provenance architecture.

---

## 15. Concrete release gates

Do not call the architecture production-ready until these are true:

- [ ] No durable project field contains a canvas, bitmap, DOM object, function, or blob URL.
- [ ] One ordered layer model defines z-order.
- [ ] One documented scene evaluator defines animation composition.
- [ ] Random/procedural animation is seeded and deterministic.
- [ ] Preview/export parity tests pass for representative projects.
- [ ] Undo/redo covers all authoring actions.
- [ ] Long tasks support cancellation and stale-result rejection.
- [ ] Project documents are validated and migrated explicitly.
- [ ] Asset storage and lifecycle are documented and tested.
- [ ] Full-frame caches are bounded and memory-accounted.
- [ ] Large imports/exports are rejected or degraded before allocation.
- [ ] Worker/resource cleanup tests show no repeated-open memory leak.
- [ ] AI model versions and provenance are recorded.
- [ ] Experimental/unwired model options are hidden from production UI.
- [ ] Export errors identify render, quantization, encoding, or optimization phase.
- [ ] Security tests cover malformed media and unauthorized asset access.
- [ ] Analytics and logs do not collect user media or sensitive text.
- [ ] Accessibility basics and keyboard cancellation are supported.
- [ ] Error recovery does not rely primarily on reloading the application.

---

## 16. Final senior conclusion

The project has **good product ambition, useful modular names, and a solid prototype feature map**. The problem is not that it has many features. The problem is that the features currently converge through a central provider and several overlapping state/rendering models.

The architecture is acceptable for experimentation and a single-team prototype. It will become increasingly expensive and fragile if more models, effects, timeline capabilities, and export formats are added before the core is normalized.

### The most important decision

Stop expanding the feature catalog temporarily and establish these seven foundations:

1. one serializable project document;
2. one ordered layer model;
3. one runtime asset registry;
4. one deterministic scene evaluator;
5. one command/history path;
6. one cancellable task model;
7. one preview/export rendering contract.

After those exist, the current feature set becomes much easier to test, optimize, persist, and extend. Without them, every new feature increases coupling inside `StudioProvider`, multiplies animation precedence cases, and raises the risk of memory, export, and project-corruption bugs.

**Bottom line:** good prototype practices, weak production architecture. Preserve the useful feature modules, but rebuild the ownership, document, task, and rendering foundations before scaling the studio further.
