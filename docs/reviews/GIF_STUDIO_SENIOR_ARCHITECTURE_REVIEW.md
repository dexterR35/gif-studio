> **Canonical review path.** Sibling docs under `docs/` — use `../` for MEGA/manual links.

# GIF Studio - Senior Architecture and Engineering Review

> **Canonical master (includes this file as Part E):** [GIF_STUDIO_COMPLETE_PRODUCTION_MANUAL.md](../GIF_STUDIO_COMPLETE_PRODUCTION_MANUAL.md)

## Review scope

This review evaluates the architecture and engineering practices described in `Pasted markdown.md`. It is a document-level audit, not a source-code audit. Findings marked as risks are based on the documented design and must be confirmed against the implementation, tests, profiling data, and deployment configuration.

### Confidence levels

- **High confidence:** The concern follows directly from a documented structural choice or contradiction.
- **Medium confidence:** The design strongly suggests a problem, but implementation details could reduce the risk.
- **Unknown:** The document does not provide enough evidence to grade the implementation.

---

## Executive verdict

**Overall engineering readiness: 4.8/10 - promising prototype architecture, not yet production-grade.**

The product concept is strong and the document is unusually comprehensive for a creative-tool prototype. The implementation map, user workflows, explicit limitations, and separation between browser and server AI are useful. However, the documented architecture has several high-risk characteristics:

1. `StudioProvider` appears to be a god object responsible for rendering, extraction, AI operations, and transforms.
2. Project state is split across Zustand, a serializable project document, React context, and runtime canvas/bitmap objects without a clearly defined source of truth.
3. Layers are stored in separate type-specific collections while the UI claims reorderable layers. That creates ordering, serialization, and rendering contradictions.
4. Preview, playback, AI, and export use multiple engines, but no single deterministic render specification is defined.
5. Animation systems can write to the same properties without a documented composition and precedence model.
6. Full-frame GIF caching can consume hundreds of MiB or multiple GiB very quickly.
7. Animated-GIF segmentation, masking, tracking, and inpainting semantics are not defined.
8. Undo/redo, project migrations, asset persistence, cancellation, testing, observability, security behavior, and failure contracts are missing or under-specified.
9. Pixelation is presented as censoring, but pixelation is not a reliable secure-redaction mechanism.
10. Product analytics and technical telemetry are effectively absent from the design.

**Senior recommendation:** stop expanding the model catalog and effect list temporarily. Stabilize the project model, render contract, time model, resource lifecycle, and test strategy first.

---

## Scorecard: good, mixed, or bad

| Area | Verdict | Score | Senior assessment |
|---|---:|---:|---|
| Product concept and feature coverage | Good | 8/10 | Clear creative workflow and useful feature set. |
| Documentation discoverability | Good | 7/10 | Strong source map, workflows, and defaults; weak on invariants and contracts. |
| Architecture boundaries | Bad | 4/10 | Responsibilities are concentrated and boundaries are not enforceable. |
| State ownership | Bad | 3/10 | Multiple likely sources of truth and mixed serializable/runtime state. |
| Layer model | Bad | 3/10 | Separate arrays conflict with cross-layer ordering and generic tooling. |
| Rendering design | Mixed/Bad | 4/10 | Canvas 2D is reasonable for an MVP, but the hot path and cache plan will not scale. |
| Preview/export consistency | Bad | 3/10 | No documented canonical renderer or visual-equivalence contract. |
| Animation model | Mixed/Bad | 4/10 | Feature-rich, but precedence, additive behavior, timebase, and determinism are unclear. |
| Selection and masks | Mixed | 6/10 | Good tool coverage; mask coordinate space, undo, temporal behavior, and alpha correctness are missing. |
| AI task coverage | Good | 7/10 | Broad and task-oriented capabilities. |
| AI orchestration | Mixed/Bad | 4/10 | Too many exposed engines, ambiguous fallbacks, weak capability representation. |
| Import/export correctness | Mixed/Bad | 4/10 | Broad formats, but GIF timing, alpha, color, and engine consistency need a formal contract. |
| Performance and memory | Critical | 2/10 | Full-frame caches and CPU pixel effects create a high probability of jank or OOM. |
| Reliability and cancellation | Bad/Unknown | 3/10 | No documented stale-result protection, cancellation, atomic commands, or cleanup. |
| Security and privacy | Bad/Unknown | 3/10 | Limits are mentioned, but threat model and media-processing controls are absent. |
| Undo/redo and project recovery | Bad | 1/10 | Essential editor behavior is not documented. |
| Automated testing | Bad | 1/10 | No test strategy or release gates are described. |
| Product analytics | Bad | 1/10 | No event taxonomy, funnels, or privacy policy is described. |
| Technical observability | Bad | 1/10 | No frame-time, memory, AI latency, export, or failure telemetry is described. |
| Accessibility | Bad/Unknown | 2/10 | Keyboard, screen-reader, touch, reduced-motion, and focus behavior are absent. |

---

## What is already good practice

### 1. The document is honest about incomplete areas

The explicit gaps section is good engineering communication. It identifies limited inpainting UI, incomplete model slots, playback tradeoffs, RAM-heavy long GIFs, and the need to select one detection stack. This is better than presenting placeholders as complete functionality.

### 2. The source map is useful

Mapping behavior to files makes onboarding and debugging easier. The workflows also connect product actions to implementation areas instead of listing features without context.

### 3. The product keeps AI as an assistive subsystem

The statement that AI assists selection, depth, interpolation, and upscale instead of replacing the editor is a sound product boundary. It helps avoid coupling the core editor to any specific model family.

### 4. Non-destructive editing is the right default

Keeping the source intact when creating a cutout is generally correct. A project editor should preserve original assets and represent edits as reversible operations.

### 5. Browser/server capability separation is directionally correct

Local lightweight inference and server-side heavier inference can be a good architecture. The problem is not the split itself; the missing part is a formal routing, versioning, status, and fallback contract.

### 6. Some limits exist

Upload, dimension, memory, motion-clip, and text-layer limits show awareness that the system needs guardrails. The specific limits and enforcement model need improvement, but having limits is better than unbounded processing.

### 7. The system distinguishes preview-only content

Calling out the pose skeleton as preview-only is useful. Debug overlays should not accidentally become project content or appear in exports.

---

## Critical findings

## C-01: `StudioProvider` is a likely god object

**Source signal:** The architecture table assigns the draw loop, extraction, AI runners, and transforms to one React provider.

**Verdict:** Bad practice. High confidence.

A React provider should not be the central rendering engine, AI orchestrator, selection engine, transform service, and command handler. This creates:

- High coupling between UI lifecycle and editor runtime.
- Difficult unit testing because behavior requires mounting React context.
- Accidental rerenders in performance-sensitive paths.
- Hard-to-reason concurrency when AI requests complete after state changes.
- Large merge-conflict surface.
- Fragile cleanup of canvases, workers, textures, timers, and object URLs.
- A tendency to add more responsibilities because the provider already has access to everything.

### Required improvement

Split the responsibilities into pure or independently testable modules:

```text
UI components
    |
    v
EditorSession / UI adapters
    |
    +--> Command service ------> Project store
    +--> Selection controller
    +--> AI task controller ---> AI client
    +--> Playback controller
    |
    v
Render core ---> Asset cache ---> Worker pool / GPU backend
    |
    v
Preview surface and Exporter
```

Suggested boundaries:

- `project-schema`: serializable domain types, validation, migrations.
- `project-store`: atomic document updates and subscriptions.
- `editor-session`: transient selection, hover, tool mode, viewport state.
- `command-service`: undoable commands and transactions.
- `asset-manager`: image, mask, font, frame, bitmap, and URL lifecycle.
- `animation-evaluator`: deterministic value evaluation at time `t`.
- `render-core`: pure render plan and compositing order.
- `preview-runtime`: requestAnimationFrame, frame skipping, viewport resolution.
- `export-runtime`: exact frame generation using the same render core.
- `ai-client`: request, cancellation, progress, model metadata, error mapping.

### Acceptance criteria

- The renderer can produce a frame from a project snapshot without mounting React.
- AI completion handlers cannot directly mutate arbitrary UI state.
- A unit test can evaluate transforms, animation, and layer order without DOM components.
- React context exposes small stable interfaces, not canvases and all editor methods.

---

## C-02: State ownership and source-of-truth rules are unclear

**Source signal:** Zustand owns UI/tools state, a project document owns serializable state, the provider owns runtime operations, and elements contain canvas/bitmap-like fields.

**Verdict:** Bad practice. High confidence.

The design does not state which system is authoritative when values overlap. Examples:

- Selection and transforms can be represented in Zustand, the project document, or provider-local state.
- Background transforms live in project settings, while element transforms live on element objects.
- Capability information appears near project/editor state even though it is environment state.
- Runtime objects such as `bitmap`, `maskCanvas`, and `cleanup` are listed as element properties even though they are not portable project data.

This invites desynchronization, impossible-to-reproduce bugs, and projects that cannot be reliably saved or reopened.

### Required improvement

Define three explicit state classes:

1. **Project document - persistent and serializable**
   - Canvas settings.
   - Asset references.
   - Unified layers.
   - Timeline/tracks.
   - Export settings.
   - Model provenance for committed AI outputs.

2. **Editor session - transient UI state**
   - Active tool.
   - Current selection IDs.
   - Hover/drag state.
   - Viewport zoom and pan.
   - Open panels.
   - In-progress lasso path.

3. **Runtime cache - non-serializable resources**
   - `ImageBitmap` objects.
   - decoded frames.
   - WebGL/Pixi textures.
   - canvases and OffscreenCanvas instances.
   - loaded model sessions.
   - font handles.

Capabilities belong to an environment/service store, not the project document.

### Mandatory invariants

- A project document must serialize to JSON without DOM, Canvas, Blob URL, or model-session objects.
- Reopening the same project with the same assets must reproduce the same timeline output.
- Runtime caches can be discarded and rebuilt without changing the project.
- Every persistent mutation is performed through an atomic command.

---

## C-03: The layer model contradicts the claimed reorder behavior

**Source signal:** Background, enhanced, elements, overlays, and text use different fields/arrays, while the layers UI claims drag reorder and front/back insertion.

**Verdict:** Bad practice. High confidence.

Separate arrays such as `elements[]`, `overlays[]`, and `textLayers[]` make true cross-type ordering difficult. A fixed draw stack says elements are always below overlays and text, while a generic layers panel suggests reorderable content. Both cannot be fully true at the same time unless the UI only reorders within each category, which is not documented.

Additional problems:

- Background transform behavior is special-cased in settings.
- Enhanced content is special-cased as `enhancedLayer`.
- Censor is special-cased instead of represented as one or more layers/effects.
- Effects are split between base `imageEdits`, layer effects, and entire-GIF effects.
- Generic operations such as duplicate, group, lock, hide, reorder, copy/paste, and undo require per-type branching.

### Required improvement

Use one ordered layer tree with a discriminated type:

```ts
type LayerId = string;
type AssetId = string;

type BaseLayer = {
  id: LayerId;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  blendMode: BlendMode;
  transform: Transform2D;
  effects: EffectNode[];
};

type Layer =
  | (BaseLayer & { type: "raster"; assetId: AssetId; maskAssetId?: AssetId })
  | (BaseLayer & { type: "text"; text: string; style: TextStyle })
  | (BaseLayer & { type: "group"; children: LayerId[] })
  | (BaseLayer & { type: "adjustment"; scope: "below" | "group" })
  | (BaseLayer & { type: "redaction"; shape: Shape; mode: "solid" | "pixelate" | "blur" })
  | (BaseLayer & { type: "debug-overlay"; exportable: false });
```

The artboard is document metadata, not a visual layer. The source/background can be a locked raster layer. An enhanced version should either replace the asset reference, be a selectable alternative, or be an explicitly composited layer with clear semantics.

### Acceptance criteria

- Any exportable visual layer can be reordered relative to another exportable layer unless a documented constraint prevents it.
- The render order is exactly the order in the project document.
- The layers panel does not show an ordering operation the data model cannot preserve.
- Background, overlay, and cutout share the same transform/effect primitives.

---

## C-04: Runtime canvases and bitmaps appear to be stored inside domain entities

**Source signal:** Element properties include `bitmap`, `sourceBitmap`, `maskCanvas`, and `cleanup`.

**Verdict:** Bad practice. High confidence if these are actually stored in the project/store objects.

DOM canvas objects and `ImageBitmap` instances are not serializable, are expensive to retain, complicate equality and subscriptions, and require explicit cleanup. Storing them in Zustand or project entities can also break devtools, persistence, and immutable-update assumptions.

### Required improvement

Persistent objects should contain references only:

```ts
type RasterLayerData = {
  sourceAssetId: AssetId;
  maskAssetId?: AssetId;
  cleanupAssetId?: AssetId;
  sourceFramePolicy: "all" | "first" | "tracked";
};
```

The asset manager maps those IDs to runtime resources and owns:

- decode state;
- reference counting;
- cache eviction;
- `ImageBitmap.close()`;
- `URL.revokeObjectURL()`;
- texture destruction;
- canvas recycling;
- IndexedDB or project-package persistence.

---

## C-05: The frame cache design can exhaust memory

**Source signal:** The document acknowledges a full per-frame canvas cache for GIF imports.

**Verdict:** Critical. High confidence.

The default project is 10 seconds at 24 FPS, which is 240 output frames.

Memory for one uncompressed RGBA cache is approximately:

```text
width * height * 4 bytes * frame count
```

Examples:

| Resolution and duration | One RGBA frame cache | Realistic multi-surface cost |
|---|---:|---:|
| 480 x 300, 240 frames | about 132 MiB | often 264-527 MiB |
| 1920 x 1080, 240 frames | about 1.85 GiB | easily 3.7-7.4 GiB |
| 5000 x 5000, one buffer | about 95 MiB | several buffers can exceed 1 GiB |

The realistic cost is higher because the editor can retain source frames, composited frames, masks, cleanup images, effect intermediates, GPU textures, and export buffers simultaneously.

### Required improvement

- Preserve GIF patches and disposal metadata instead of caching every composited full frame indefinitely.
- Use a bounded LRU cache around the playhead.
- Decode on a worker and transfer `ImageBitmap` where supported.
- Render preview at viewport resolution, not export resolution.
- Use a memory-budget service, not only fixed dimension limits.
- Compute limits from `width * height * frames * activeSurfaces * bytesPerPixel`.
- Reject or downscale before allocation, not after memory pressure occurs.
- Release stale frame caches when source, scale, or project changes.
- Provide a low-memory mode.

### Acceptance criteria

- Memory has a configured budget and an observable current estimate.
- Long imports do not allocate all output frames up front.
- Cache eviction is deterministic and tested.
- Canceling import/export releases buffers and workers.
- The UI can explain why an asset was downscaled or rejected.

---

## C-06: Pixi as a final canvas blit does not solve the expensive part

**Source signal:** Canvas 2D performs transforms and effects; Pixi optionally blits the final composite for preview.

**Verdict:** Misleading optimization. High confidence.

Uploading an already-composited Canvas 2D result to a GPU surface only accelerates display scaling/compositing of that final image. It does not accelerate:

- per-pixel Canvas `getImageData` work;
- convolutions;
- distortion calculations;
- repeated mask rasterization;
- source-frame composition;
- CPU-to-GPU upload costs.

It can even add an extra copy/upload per frame.

### Required improvement

Choose one of these strategies:

1. **Canvas-first optimized MVP**
   - OffscreenCanvas worker.
   - dirty-layer caching.
   - preview-resolution rendering.
   - no per-frame effects recomputation when parameters are unchanged.
   - pooled intermediate surfaces.

2. **Actual GPU render graph**
   - Upload source assets once.
   - Perform transforms, masks, blend modes, and supported effects in WebGL/WebGPU.
   - Avoid readback until export or when required.
   - Keep CPU-only effects as explicit fallback passes.

Do not call the second canvas a GPU renderer if it only displays a CPU-rendered texture.

---

## C-07: Preview and export do not have a documented single source of visual truth

**Source signal:** Preview may use Canvas and Pixi; playback uses GSAP and decoded frames; export uses Python, client GIF paths, PNG snapshot, and ffmpeg.wasm.

**Verdict:** Bad practice. High confidence.

Creative tools fail user trust when the exported result differs from preview. Multiple render and timing paths commonly produce differences in:

- font metrics;
- color and alpha;
- effect kernels;
- rounding;
- GIF disposal;
- frame timing;
- random animation;
- interpolation;
- transform origin;
- browser/server implementations.

### Required improvement

Define a canonical render contract:

```text
Project snapshot + asset snapshot + exact time + render profile
    -> deterministic RGBA frame
```

Preview and export must call the same animation evaluator and render-plan generator. Backends may differ, but they must pass golden-frame equivalence tests.

Recommended split:

- Render core creates backend-neutral draw/effect commands.
- Canvas, WebGL, and headless/export backends implement the same commands.
- Export never reinterprets project settings independently.
- AI is not rerun during export; committed AI results are assets.

### Acceptance criteria

- Golden fixtures compare preview and export frames at selected timestamps.
- A saved project exports identically after reload within a documented pixel tolerance.
- Random motion is seeded.
- Font availability is validated before export.

---

## C-08: Animation composition and precedence are undefined

**Source signal:** Base presets, loop motion, keyframes, timed liquify clips, parallax, pose sway, text entrance/loop/exit, and ping-pong can affect overlapping properties.

**Verdict:** Bad practice. High confidence.

The statement that linear keyframes override base-motion channels is not enough. Questions that must have one formal answer include:

- Does parallax add to keyframed `x/y`, or replace it?
- Does text entrance opacity multiply or override layer opacity?
- Does a Zoom motion clip multiply keyframed scale before or after anchor transforms?
- Does pose deformation happen in source space or transformed layer space?
- Does ping-pong remap the entire timeline or only the base preset?
- What does `Random` mean during scrubbing and export?
- Which easing owns the value when a preset and keyframe track both exist?
- Are effect parameters animatable and how are they composed?

Without explicit rules, the same project can behave differently across UI paths.

### Required improvement

Create one timeline evaluator with typed tracks and explicit blend modes:

```ts
type TrackBlend = "replace" | "add" | "multiply";

type PropertyTrack = {
  targetId: string;
  property: PropertyPath;
  blend: TrackBlend;
  priority: number;
  keyframes: Keyframe[];
};
```

Recommended evaluation order:

1. Resolve canonical project time in integer microseconds.
2. Apply global loop/ping-pong time mapping once.
3. Resolve source frame for that time.
4. Evaluate static layer properties.
5. Evaluate preset-generated tracks.
6. Evaluate user tracks using explicit replace/add/multiply semantics.
7. Add parallax offsets.
8. Apply pose/mesh deformation in documented coordinate space.
9. Apply per-layer effects.
10. Composite layers.
11. Apply global effects.
12. Apply secure redaction last.
13. Convert to export color/palette format.

`Random` must use a stable seed based on project ID, clip ID, and frame index.

---

## C-09: The time model mixes variable GIF delays and fixed project FPS

**Source signal:** Imported GIF frames are scrubbed by source delays, while projects use duration, FPS, a GSAP 0-1 clock, RIFE factors, and fixed-frame export.

**Verdict:** Bad/under-specified. High confidence.

Variable-delay GIF input and fixed-FPS output require an explicit resampling policy. Floating-point progress from 0 to 1 is not a sufficient canonical time model. It can create drift, dropped final frames, inconsistent loop boundaries, and differences between preview and export.

### Required improvement

- Store canonical time as integer microseconds or rational frame time.
- Keep source frame durations exactly.
- Define whether output samples at frame start, center, or another policy.
- Define final-frame and loop-boundary behavior.
- Define RIFE interpolation timestamps, not only a factor.
- Make playback, scrubbing, and export use the same time resolver.
- Use a monotonic clock; treat GSAP as optional UI integration, not the source of time truth.

---

## C-10: Animated-GIF cutout semantics are missing

**Source signal:** The system imports animated GIFs and supports AI/local cutouts, masks, cleanup, pose, depth, and moving layers, but the document does not explain whether those operations are per-frame or static.

**Verdict:** Critical product ambiguity. High confidence.

For an animated source, a cutout cannot generally be represented by one static bitmap and one mask. The object may move, deform, disappear, or change appearance. A single cleanup image also cannot correctly fill a changing background across all frames.

Unanswered questions:

- Is extraction based on the current frame, first frame, or all frames?
- Is the extracted element static, a frame sequence, or a tracked object?
- Are masks propagated temporally?
- Is cleanup/inpainting performed per frame?
- How are segmentation flicker and temporal inconsistency handled?
- How do depth and pose outputs change over time?
- What happens when source GIF disposal changes the visible frame?

### Required improvement

Explicitly support one or more modes:

1. **Static snapshot cutout**
   - Extract one selected frame as a static layer.
   - Clearly label that animation from the source is not preserved.

2. **Tracked animated cutout**
   - Maintain per-frame asset/mask references.
   - Propagate masks with optical flow/tracking and allow keyframe corrections.
   - Smooth masks temporally.

3. **Per-frame batch segmentation**
   - Process each frame with temporal consistency constraints.
   - Cache results as an animated asset.

For background removal from an animated source, inpainting must be temporally stable or the product should explicitly restrict the workflow.

---

## C-11: Pixelation is not secure censoring

**Source signal:** A pixelated region is called `Censor` and can be followed by other whole-output effects.

**Verdict:** Security/privacy risk. High confidence.

Pixelation can preserve recognizable structure and is not a reliable redaction technique. Applying blur, sharpen, scaling, or other processing after pixelation can also change its obscuring strength. Users may assume the feature provides privacy protection when it only provides a visual effect.

### Required improvement

- Rename it to `Pixelate` unless it is explicitly presented as visual-only.
- Add a separate `Redact` mode with opaque solid fill.
- Render secure redaction after all other visual effects and before final encoding.
- Flatten the final output; never retain hidden source pixels in an exported layered format.
- Warn that blur and pixelation are not guaranteed redaction.
- Support multiple redaction regions as regular redaction layers.

---

## C-12: Undo/redo and atomic editing are missing

**Verdict:** Critical editor gap. High confidence from the document omission.

An editor with selection, masks, transforms, AI operations, timeline edits, reordering, and effects requires robust undo/redo. Without commands/transactions, users cannot safely explore, and implementation code tends to mutate state in many places.

### Required improvement

Use an undoable command model:

```ts
interface EditorCommand {
  id: string;
  label: string;
  apply(document: ProjectDocument): ProjectDocument;
  invert(before: ProjectDocument, after: ProjectDocument): EditorCommand;
}
```

Requirements:

- Drag operations coalesce into one history entry.
- Brush strokes are one entry per stroke, not one per pointer move.
- AI output commits atomically only after the result is complete and still relevant.
- Cancelled or stale AI operations do not enter history.
- Asset creation/deletion is reference-counted across undo history.
- History has memory limits and checkpointing.
- Autosave persists stable document snapshots, not transient drag state.

---

## High-priority findings

## H-01: The enhanced-underlay behavior is suspicious and under-defined

The enhanced image is described as an underlay that never replaces the source. If the source is fully opaque and aligned, the enhanced image is invisible. If alignment, dimensions, or transparency differ, the pair can create halos and doubled memory use.

Clarify one of these intended models:

- replace source asset while retaining original for non-destructive rollback;
- preview A/B toggle between source and enhanced;
- use enhanced only when the source has transparency;
- use enhanced as a separately positioned creative layer.

Do not keep both full-resolution assets active in the draw stack without a visible compositing reason.

---

## H-02: `imageEdits` and layer/global effects duplicate concepts

Brightness, contrast, saturation, hue, blur, and other adjustments appear in multiple systems. This creates inconsistent ordering and duplicated implementation.

Use one effect stack abstraction per layer plus optional global adjustment layers. A background should not need a special `imageEdits` path if it is a raster layer.

Each effect node should define:

- type and version;
- parameters and defaults;
- coordinate space;
- alpha behavior;
- preview quality mode;
- whether it is deterministic;
- backend support;
- cache key.

---

## H-03: The local extraction tolerance combines unrelated concepts

A single `extractTolerance` appears to control background color distance and edge softness. Those are different operations:

- color-distance threshold;
- contiguous-region behavior;
- edge feather radius;
- edge decontamination/spill removal;
- mask expansion/erosion.

Expose them separately internally, even if the UI initially presents one simple slider. Keep mask operations in source coordinates and use premultiplied-alpha-correct processing to avoid dark or light fringes.

---

## H-04: Mask-editing behavior needs a defined coordinate and history model

The document does not define:

- mask resolution;
- source-space vs artboard-space coordinates;
- behavior after layer scale/rotation;
- resampling filter;
- pressure support;
- undo granularity;
- whether feather is destructive;
- whether trim changes transform origin.

Recommended model:

- Store masks in source-image coordinates.
- Keep feather as a non-destructive mask effect where possible.
- Store brush strokes temporarily, rasterizing/checkpointing under a memory budget.
- Make trim an explicit command that updates source rect and transform to preserve visual position.

---

## H-05: Defaulting new cutouts to `Float` is surprising

A newly extracted object should normally preserve the current image and remain still. Automatically adding motion violates the principle of least surprise and makes extraction produce an unrelated side effect.

Use `None` as the default layer motion. Offer `Float` as a one-click suggestion after extraction.

---

## H-06: Hard limits of three motion clips and five text layers are arbitrary

Static low limits can be acceptable for an early MVP, but they should be explained as product limits or derived from a performance budget. Otherwise they become architectural debt and user confusion.

Prefer:

- soft warnings based on complexity score;
- preview-quality degradation under load;
- explicit project complexity meter;
- configurable server/export limits;
- no hard-coded UI assumptions that prevent future expansion.

---

## H-07: Capability flags are too weak and can be misleading

A boolean such as `inpaint: true` hides whether the preferred model is ready or only a lower-quality fallback exists. The same problem applies to catalog slots that may be wired incompletely.

Use structured capability status:

```json
{
  "task": "inpaint",
  "status": "degraded",
  "engines": [
    {
      "id": "opencv-telea",
      "version": "4.x",
      "status": "ready",
      "qualityTier": "fallback",
      "device": "cpu"
    },
    {
      "id": "lama",
      "version": null,
      "status": "missing-weights",
      "qualityTier": "preferred",
      "device": "cuda"
    }
  ]
}
```

The UI should hide unavailable choices or label them accurately. Never silently claim the preferred feature is available when only a materially different fallback exists.

---

## H-08: The AI model catalog is too implementation-focused for normal users

Most users should choose intent and tradeoff, not raw model names. Exposing SAM, DINO, YOLO, BiRefNet, and multiple RealESRGAN variants can turn internal architecture into product complexity.

Recommended UI:

- `Fast`, `Balanced`, `Best edges` for cutout.
- `Person`, `Object`, `Text prompt`, `Class detection` for task.
- `Local/private` vs `Server/best quality` when relevant.

Keep the model registry internal and store exact engine/version/parameters as provenance.

---

## H-09: AI routing and fallback behavior need a formal policy

There are local and server variants, two segmentation endpoints, and multiple detection stacks. The document does not define:

- routing priority;
- timeouts;
- cancellation;
- fallback order;
- whether fallback is silent;
- preprocessing parity;
- model-version pinning;
- stale-result protection;
- cache keys;
- job progress.

Implement an AI task controller with:

- task ID and project revision ID;
- `AbortController` support;
- latest-request-wins or explicit multi-job behavior;
- structured progress;
- typed errors;
- visible fallback notification;
- content-hash + model-version cache key;
- atomic result commit.

Long tasks should use a server job abstraction with polling or streaming progress, cancellation, and bounded GPU concurrency.

---

## H-10: Model provenance and reproducibility are incomplete

`engine` and `smart` are not enough. A committed AI asset should record:

- task type;
- engine and exact model version;
- model checksum or deployment revision;
- preprocessing version;
- parameters/prompts/points/boxes when safe to store;
- source asset hash and source frame/time;
- output mask/image asset hash;
- creation timestamp;
- fallback path used.

The saved project should use the committed output asset. It should not require rerunning the model to reproduce an export.

---

## H-11: API boundaries are ambiguous

`/api/segment` and `/api/ai/segment` may be valid for different contracts, but the distinction is not clear. Endpoint versioning and typed request/response models are not documented.

Recommended API style:

```text
POST /api/v1/tasks/segment
POST /api/v1/tasks/matte
POST /api/v1/tasks/depth
POST /api/v1/tasks/inpaint
POST /api/v1/tasks/upscale
POST /api/v1/tasks/interpolate
GET  /api/v1/jobs/{id}
DELETE /api/v1/jobs/{id}
GET  /api/v1/capabilities
```

Use FastAPI/OpenAPI as the source of truth and generate the TypeScript client. Include request IDs, typed error codes, limits, engine metadata, and retry guidance.

---

## H-12: Server resource limits are not safe enough as documented

A fixed output edge limit and an estimated 20 GiB peak-RAM threshold are not sufficient. Many deployments have far less available memory, and AI tensor memory can depend on model, precision, tile size, batch size, and GPU state.

Required controls:

- Per-task pixel and frame limits.
- Per-model memory estimator.
- Device-specific budgets.
- GPU concurrency semaphore.
- Request timeout and cancellation.
- Decompression-bomb protection.
- MIME sniffing and decoder validation, not extension checks only.
- Temp-file quotas and cleanup.
- Frame-count and total-pixel limits for animated inputs.
- Backpressure with `429` or `503` and `Retry-After` where appropriate.
- Process isolation for risky decoders where practical.

The upload list mentions PNG/JPG/WEBP while the product imports GIF. Clarify which formats are client-only and which server endpoints accept animated media.

---

## H-13: Media privacy, retention, and metadata handling are missing

For user images, document and implement:

- whether media leaves the browser;
- which task uses which server;
- retention duration;
- temp-file deletion;
- log redaction;
- access controls;
- encryption in transit and at rest where applicable;
- EXIF/GPS metadata stripping;
- whether filenames or text-layer content enter telemetry;
- model-provider data policy if third-party services are introduced.

Local processing should be clearly labeled, but do not imply privacy if model files or assets are still sent elsewhere.

---

## H-14: Import behavior is incomplete

The import contract should cover:

- EXIF orientation;
- ICC/color profiles;
- CMYK JPEG conversion;
- alpha premultiplication;
- corrupted files;
- frame-count limits;
- GIF disposal and partial frames;
- variable delays and zero-delay normalization;
- animated WebP/APNG support or explicit rejection;
- maximum total decoded pixels;
- original asset preservation;
- duplicate asset detection by hash.

A filename extension is not a reliable media type check.

---

## H-15: GIF export terminology is misleading

A 256-color GIF cannot be lossless relative to a full-color source in the general case. `Lossless` can describe the compression stage after palette quantization, but `High quality = Lossless` suggests no visual loss.

Also, `Lossy LZW` is imprecise terminology. LZW itself is lossless; tools such as gifsicle may perform lossy frame/palette optimization before or around compression.

Recommended labels:

- `High quality GIF` - 256 colors, dithering, no lossy optimization.
- `Balanced GIF` - reduced palette and moderate lossy optimization.
- `Small GIF` - aggressive palette and frame optimization.
- `Custom`.

Document that GIF transparency is effectively binary and soft alpha edges require matting/dithering, which can create halos.

---

## H-16: Export formats need an explicit capability matrix

Document format behavior:

| Feature | GIF | PNG | MP4/H.264 |
|---|---|---|---|
| Animation | Yes | Snapshot only unless APNG added | Yes |
| Soft alpha | No, limited/binary transparency | Yes | Usually no |
| Audio | No | No | Potentially, but not described |
| Variable frame duration | Yes | N/A | Usually resampled to fixed timebase |
| Color count | Max 256 per frame/palette strategy | Full color | Full color, codec-dependent |
| Loop metadata | Yes | N/A | Player/application behavior |

For MP4, require a background when alpha is present, or offer a codec/container that supports alpha and clearly state compatibility. Load ffmpeg.wasm lazily in a worker and document memory and cross-origin-isolation requirements if multithreading is used.

---

## H-17: Font handling and text export determinism are missing

Text layers require more than typography fields. Projects need:

- font family identity and source;
- loading status;
- license/embedding policy;
- fallback behavior;
- export wait on `document.fonts.ready`;
- consistent line breaking and metrics;
- project portability when a font is unavailable;
- text shaping for non-Latin scripts;
- versioned text-rendering behavior.

A project should warn before export if the intended font is unavailable.

---

## H-18: Resource cancellation and stale-result protection are not described

Typical failure case:

1. User starts SAM segmentation on asset A.
2. User imports asset B or changes the selection.
3. Request A completes later.
4. Result A is inserted into the current project.

Every async task must carry project revision, source asset ID/hash, target layer ID, and task ID. Completion must validate that the result is still applicable. Cancellation must release workers, network requests, tensors, and temporary assets.

---

## H-19: Accessibility is not part of the design

At minimum, define:

- complete keyboard operation for tools and timeline;
- focus order and focus trapping in panels/dialogs;
- visible focus indicators;
- accessible names for icon-only controls;
- screen-reader status for long AI/export tasks;
- reduced-motion behavior;
- touch and pen interactions;
- color contrast;
- non-color-only status indicators;
- keyboard alternatives for drag reorder and transform handles.

A creative tool can still be progressively accessible even if the visual canvas itself has limits.

---

## H-20: The documentation mixes facts, defaults, aspirations, and placeholders

The document combines:

- implemented product behavior;
- implementation details;
- current defaults;
- catalog options;
- incomplete slots;
- recommendations;
- limitations.

That causes readers to mistake a picker entry for a working capability.

Add status labels to every feature/model:

- `stable`;
- `experimental`;
- `partial`;
- `server-only`;
- `local-only`;
- `configured but unavailable`;
- `planned`.

Add generated metadata:

```yaml
source_commit: <git SHA>
generated_at: <UTC timestamp>
schema_version: <doc schema>
verified_by_tests: <test suite or none>
```

The sentence saying the document was generated from the codebase is not enough without a commit or generation method.

---

## Product analytics and technical observability

## Current verdict: Bad / missing

The document lists features and capability flags but does not define analytics, telemetry, logging, tracing, or performance measurement. A media editor with browser AI, server AI, rendering, and export needs both product analytics and technical observability.

These must be separate systems:

- **Product analytics:** tells whether workflows are useful and where users fail.
- **Technical telemetry:** tells whether the application is slow, unstable, or incorrect.

### Recommended product events

| Event | Important fields |
|---|---|
| `project_created` | project type, initial canvas size |
| `asset_import_started` | format bucket, size bucket, animated/static |
| `asset_import_completed` | decode duration, frame count bucket, downscaled flag |
| `selection_started` | tool category, local/server intent |
| `selection_completed` | tool category, duration, success, correction-followed flag |
| `ai_task_started` | task, engine class, local/server, quality tier |
| `ai_task_completed` | latency, fallback used, output dimensions |
| `ai_task_failed` | typed error code, cancelled/stale flags |
| `timeline_edit` | track type, operation category |
| `preview_playback` | duration bucket, dropped-frame bucket |
| `export_started` | format, resolution bucket, frame count bucket |
| `export_completed` | duration, output size bucket, backend |
| `export_failed` | typed error, phase, memory-pressure flag |
| `project_reopened` | schema version, migration count, missing assets/fonts |

### Recommended technical metrics

- Application startup and editor-ready time.
- Asset decode time.
- Preview frame time p50/p95/p99.
- Dropped frames and long tasks.
- CPU vs GPU render path.
- Canvas readback count and duration.
- Cache hit rate and cache bytes.
- Estimated and observed memory pressure.
- Worker crashes and restarts.
- AI queue, preprocessing, inference, and postprocessing duration.
- AI fallback rate by task.
- Export frame-render time, encode time, and failure phase.
- Preview/export visual-diff failures in CI.
- API status code, request ID, model revision, and device class.

### Privacy requirements for analytics

Do **not** collect by default:

- image pixels or thumbnails;
- original filenames;
- local filesystem paths;
- text-layer contents;
- prompts or class queries that may contain personal data;
- exact mask coordinates;
- EXIF metadata;
- project titles;
- raw exception payloads containing user content.

Use coarse buckets and pseudonymous session/project IDs. Provide consent and opt-out where required. Analytics failure must never block editing or export.

### Quality analytics

A useful privacy-preserving AI quality proxy is whether the user immediately refines or discards an AI result:

- mask edited within a short period after AI completion;
- result deleted/undone;
- alternate engine retried;
- export completed with the result.

Treat this as a proxy, not ground truth. Do not silently upload the media for quality review.

---

## Recommended target architecture

```text
+----------------------------- UI --------------------------------+
| React routes, panels, canvas controls, timeline, inspectors      |
+------------------------------+----------------------------------+
                               |
                               v
+------------------------ Editor session --------------------------+
| Active tool, selection, hover, viewport, panel state, gestures   |
+------------------------------+----------------------------------+
                               |
                    commands / transactions
                               |
                               v
+------------------------ Project store ---------------------------+
| Versioned immutable project document, migrations, undo/redo      |
+-----------+------------------+------------------+----------------+
            |                  |                  |
            v                  v                  v
+----------------+   +------------------+   +----------------------+
| Asset manager  |   | Timeline engine  |   | AI task controller   |
| IDs, decode,   |   | canonical time,  |   | routing, cancel,     |
| cache, cleanup |   | track evaluation |   | progress, provenance |
+-------+--------+   +---------+--------+   +----------+-----------+
        |                      |                       |
        +----------------------+-----------------------+
                               |
                               v
+-------------------------- Render core ---------------------------+
| Backend-neutral render plan, layer order, effects, redaction     |
+-------------------+----------------------+-----------------------+
                    |                      |
                    v                      v
        +----------------------+   +-------------------------------+
        | Preview runtime      |   | Export runtime                |
        | worker/GPU, adaptive |   | same evaluator and render     |
        | resolution/cache     |   | contract, deterministic       |
        +----------------------+   +-------------------------------+
```

---

## Recommended project-document shape

This is illustrative, not a required exact API:

```ts
type ProjectDocument = {
  schemaVersion: number;
  id: string;
  canvas: {
    width: number;
    height: number;
    background: BackgroundSpec;
    colorSpace: "srgb";
  };
  assets: Record<AssetId, AssetManifestEntry>;
  rootLayerIds: LayerId[];
  layers: Record<LayerId, Layer>;
  timeline: {
    durationUs: number;
    loopMode: "once" | "loop" | "ping-pong";
    tracks: Track[];
  };
  exportSettings: ExportSettings;
  metadata: {
    createdAt: string;
    updatedAt: string;
    appVersion: string;
  };
};
```

### Asset manifest principles

- Assets are immutable and content-addressed when practical.
- Project data refers to asset IDs, never Blob URLs or Canvas objects.
- Derived assets record source asset and operation provenance.
- Large binary data is stored in a project package or IndexedDB, not inline JSON.
- Runtime decoders and textures are disposable caches.

---

## Recommended render pipeline

### Preview pipeline

1. Resolve canonical time.
2. Resolve input frame/asset for every visible layer.
3. Evaluate transforms and animated properties.
4. Render dirty layers at preview resolution.
5. Apply per-layer mask/effects.
6. Composite in unified layer order.
7. Apply global effects.
8. Apply redaction last.
9. Present to canvas.
10. Record frame timing and skip frames adaptively if overloaded.

### Export pipeline

1. Freeze a project and asset snapshot.
2. Validate fonts, assets, model outputs, dimensions, duration, and memory budget.
3. Generate exact frame timestamps.
4. Render with the same evaluator/render-plan logic as preview.
5. Convert alpha/color according to target format.
6. Quantize/encode with deterministic settings.
7. Verify output metadata, duration, dimensions, and frame count.
8. Release all intermediate resources.

---

## Required engineering practices

### Schema versioning and migrations

Every project must contain a schema version. Migrations must be pure, ordered, tested, and capable of reporting unsupported/corrupt projects. Never infer versions from missing fields indefinitely.

### Atomic commands

All persistent edits should be commands. This enables undo/redo, analytics, autosave, collaboration later, and consistent validation.

### Runtime resource ownership

Every resource must have an owner and disposal path:

- object URLs;
- ImageBitmap;
- Audio/Video frames if added;
- canvases;
- GPU textures;
- ONNX sessions;
- Web Workers;
- ffmpeg workers;
- temporary files;
- network requests.

### Determinism

- Seed random animations.
- Pin model/output assets.
- Use one timebase.
- Define rounding.
- Define transform order.
- Define effect order.
- Define font behavior.
- Do not rerun AI at export.

### Error design

Use typed user-actionable errors, for example:

- `UNSUPPORTED_FORMAT`;
- `DECODE_LIMIT_EXCEEDED`;
- `MODEL_UNAVAILABLE`;
- `MODEL_OUT_OF_MEMORY`;
- `TASK_CANCELLED`;
- `STALE_RESULT_DISCARDED`;
- `FONT_MISSING`;
- `EXPORT_MEMORY_BUDGET_EXCEEDED`;
- `ENCODER_UNAVAILABLE`;
- `PROJECT_MIGRATION_FAILED`.

Do not expose raw stack traces to users. Include request IDs for server failures.

---

## Test strategy that is currently missing

## Unit tests

- Transform matrix composition and anchor behavior.
- Percent/logical-pixel conversion if percent coordinates remain.
- Easing functions and boundary values.
- Ping-pong time mapping.
- Keyframe interpolation and blend modes.
- GIF frame-delay resolution.
- Layer ordering.
- Mask coordinate transforms.
- Quality-profile mapping.
- Capability routing and fallback policy.
- Project migrations.

## Property-based tests

- No NaN/Infinity transforms for valid inputs.
- Time evaluation stays within valid ranges.
- Undo followed by redo returns the same document.
- Serialize/deserialize round trip preserves the document.
- Reordering layers never loses or duplicates IDs.
- Cache eviction never removes referenced assets.

## Golden image tests

Create small licensed fixtures for:

- alpha edges;
- masks;
- blend modes;
- distortions;
- text rendering;
- pose warp;
- parallax;
- censor/redaction ordering;
- GIF disposal modes;
- palette/dither profiles.

Compare selected preview and export frames with a documented tolerance.

## API contract tests

- OpenAPI client compatibility.
- Request-size and pixel limits.
- Invalid/corrupt media.
- Cancellation.
- Timeout.
- unavailable model;
- fallback status;
- concurrent GPU requests;
- temp-file cleanup.

## End-to-end tests

- Import static image -> select -> move -> mask -> animate -> export.
- Import GIF -> scrub -> edit -> export with timing preserved.
- Remove background -> transparent GIF warning/handling.
- Upscale -> A/B -> commit -> export.
- AI request becomes stale after source replacement.
- Undo/redo across AI result and mask stroke.
- Save/reopen/migrate project.
- Missing font and missing asset recovery.

## Performance tests

Set explicit budgets for:

- editor-ready time;
- 480p/720p/1080p preview frame time;
- peak memory by fixture;
- long GIF decode;
- AI task latency per device tier;
- export throughput;
- cancellation cleanup time;
- bundle and lazy-loaded model/ffmpeg sizes.

---

## Documentation improvements

### Add a table of contents

The document is long enough to require navigation.

### Add architecture invariants

Examples:

- The project document contains no runtime objects.
- Layer order is represented once.
- Preview and export share time and rendering semantics.
- AI results are committed assets, not live model dependencies.
- Redaction is always the last visual pass.

### Add sequence diagrams

At minimum:

- static import;
- animated GIF import;
- local extraction;
- server AI extraction;
- stale/cancelled AI result;
- preview frame;
- export job;
- project save/reopen.

### Add API contracts

Link to generated OpenAPI and document engine selection, errors, limits, progress, and cancellation.

### Add status and ownership

Every feature should have status, owning module/team, and source of truth.

### Remove magic-number ambiguity

Values such as tolerance 42, max 3 clips, max 5 text layers, 5k pixels, and 20 GiB need rationale, configuration source, and enforcement location.

### Normalize terminology

Use one term consistently for each concept:

- source asset vs background layer;
- raster layer vs element vs overlay;
- preset motion vs loop motion vs motion clip;
- image adjustment vs effect;
- pixelate vs redact;
- static cutout vs animated cutout.

### Separate current state from future work

Use sections such as:

- Stable behavior.
- Experimental behavior.
- Known limitations.
- Planned behavior.
- Non-goals.

---

## Prioritized improvement plan

## P0 - must be resolved before calling the architecture production-ready

1. Define the versioned serializable project schema and separate runtime caches.
2. Replace fragmented layer arrays with one ordered layer model.
3. Split `StudioProvider` into domain, runtime, and UI boundaries.
4. Implement atomic commands, undo/redo, autosave snapshots, and migrations.
5. Define one canonical timebase and animation composition order.
6. Make preview and export share the same render-plan/evaluation logic.
7. Add bounded frame/asset caches, memory budgets, cancellation, and disposal.
8. Define animated-GIF selection/mask/inpaint behavior or explicitly restrict it.
9. Add secure solid redaction and label pixelation as visual-only.
10. Add typed API errors, capability statuses, model provenance, and stale-result checks.
11. Add golden-frame, migration, timing, and import/export tests.
12. Add technical telemetry for frame time, memory, AI tasks, and exports.

## P1 - high-value stabilization

1. Move preview rendering and CPU-heavy effects to OffscreenCanvas workers.
2. Build a real GPU render path or remove the misleading Pixi-only blit abstraction.
3. Consolidate `imageEdits`, per-layer effects, and global effects into one effect graph.
4. Add robust asset packaging, hashing, deduplication, and IndexedDB persistence.
5. Improve mask representation, edge decontamination, and non-destructive feather.
6. Add AI task routing by intent/quality instead of exposing raw models by default.
7. Add export validation, file-size estimation, and format capability warnings.
8. Add font packaging/validation and color-management rules.
9. Add accessibility and keyboard behavior.
10. Add security/privacy documentation and media-retention controls.

## P2 - expand only after the foundation is stable

1. Temporal object tracking and per-frame masks.
2. Temporally stable animated inpainting.
3. More generic property tracks and animated effect parameters.
4. Layer groups, clipping masks, and adjustment layers.
5. Optional generative fill.
6. Additional model families only when registry, capability, and test contracts are mature.

---

## Concrete release gates

Do not label the editor production-ready until these are true:

- A project can save, close, reopen, migrate, and export without visual drift.
- Preview and export pass golden-frame comparisons.
- Undo/redo covers every persistent editing action.
- Long GIFs cannot allocate unbounded full-frame caches.
- All async tasks are cancellable or safely discard stale results.
- Runtime assets are disposed and memory usage is observable.
- Model options reflect actual readiness and exact fallback behavior.
- Export accurately explains GIF alpha and quality limitations.
- Secure redaction uses opaque fill and runs after visual effects.
- Corrupt and oversized inputs fail safely with typed messages.
- Core workflows have end-to-end tests.
- Technical telemetry can identify dropped frames, OOM risk, AI failures, and export failures without collecting user media.

---

## Final senior assessment

This is a strong feature inventory and a useful internal reference, but it is not yet a sufficiently rigorous architecture specification. The main problem is not a lack of features; it is that the core editor semantics are spread across special cases:

- special background transforms;
- special enhanced layer;
- separate layer arrays;
- multiple effect systems;
- multiple animation systems;
- multiple render/export engines;
- local and server AI paths;
- runtime canvases mixed with logical entities.

That structure can work for a demo, but every new feature increases branching and hidden interactions. The best next move is to reduce concepts, not add more:

1. one project document;
2. one ordered layer model;
3. one time evaluator;
4. one render contract;
5. one command/history path;
6. one asset-lifecycle owner;
7. one AI task abstraction;
8. one observability model.

After those foundations are in place, the existing feature breadth becomes an advantage rather than a maintenance liability.
