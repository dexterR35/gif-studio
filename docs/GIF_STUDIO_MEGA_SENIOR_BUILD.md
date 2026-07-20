# GIF Studio — Mega Senior Build Spec

**Status:** Unified control surface + product/architecture bible  
**Date:** 2026-07-20  
**Mode:** Strangler migration (keep app bootable every phase)  
**Primary surfaces:** Web editor (Vite + React) + local FastAPI AI/encode API  
**Secondary surfaces:** Desktop Qt / CLI over shared Python engine (`BUILD_SPEC.md`)

---

## Authority (conflict resolution)

| Layer | Document | Wins for |
|-------|----------|----------|
| **1. Procedure** | [production-refactor/CURSOR_PRODUCTION_BUILD_PLAN.md](./production-refactor/CURSOR_PRODUCTION_BUILD_PLAN.md) | Phase work, exit gates, tests, PR slices, DoD checklists |
| **2. Locked overlays** | **This file §2** (esp. server-first + enhanced) | Compute placement, enhanced semantics, product locks that override plan defaults |
| **3. Archive / inventory** | [COMPLETE_PRODUCTION_MANUAL.md](./GIF_STUDIO_COMPLETE_PRODUCTION_MANUAL.md), reviews, image/AI docs | Detail & rationale |

**Rule:** When procedure detail conflicts → **CURSOR build plan wins**. When compute placement or the overlays below conflict with older plan text (e.g. enhanced A/B) → **§2 locked overlays win**.

Source reviews (also under `docs/reviews/`):

- `GIF_STUDIO_SENIOR_ARCHITECTURE_REVIEW.md`
- `GIF_STUDIO_CRITICAL_SENIOR_REVIEW.md` (of former `SENIOR_SRC_ARCHITECTURE.md`)

| Doc | Use |
|-----|-----|
| **This file** | Control surface: locks, FE/BE map, overlays, sprint→phase map |
| [CURSOR_PRODUCTION_BUILD_PLAN.md](./production-refactor/CURSOR_PRODUCTION_BUILD_PLAN.md) | Primary **execution** document (phases 0–14) |
| [COMPLETE_PRODUCTION_MANUAL.md](./GIF_STUDIO_COMPLETE_PRODUCTION_MANUAL.md) | Full archive |
| [STUDIO_IMAGE_PROCESSING.md](./STUDIO_IMAGE_PROCESSING.md) | Product inventory |
| [AI_GIF_STACK.md](./AI_GIF_STACK.md) | AI matrix short form |
| [BUILD_SPEC.md](../BUILD_SPEC.md) | Desktop/CLI history |

---

## Table of contents

0. [Executive build charter](#0-executive-build-charter)  
1. [Product vision & principles](#1-product-vision--principles)  
2. [Locked decisions & overlays](#2-locked-decisions--overlays)  
3. [System architecture (FE + BE)](#3-system-architecture-fe--be)  
4. [Domain model & contracts](#4-domain-model--contracts)  
5. [Frontend design & modules](#5-frontend-design--modules)  
6. [Backend design & API](#6-backend-design--api)  
7. [Image processing & composition](#7-image-processing--composition)  
8. [Selection, masks & cutouts](#8-selection-masks--cutouts)  
9. [Motion, timeline & pose](#9-motion-timeline--pose)  
10. [AI subsystem](#10-ai-subsystem)  
11. [Import, export & GIF honesty](#11-import-export--gif-honesty)  
12. [Performance & memory](#12-performance--memory)  
13. [Security & privacy](#13-security--privacy)  
14. [Reliability: commands, undo, tasks](#14-reliability-commands-undo-tasks)  
15. [Observability & analytics](#15-observability--analytics)  
16. [Accessibility](#16-accessibility)  
17. [Phased build plan (0–14)](#17-phased-build-plan-014)  
18. [Test strategy](#18-test-strategy)  
19. [CI & release gates](#19-ci--release-gates)  
20. [Migration map & PR sequence](#20-migration-map--pr-sequence)  
21. [ADRs required](#21-adrs-required)  
22. [Definition of done](#22-definition-of-done)  
23. [Cursor agent prompt](#23-cursor-agent-prompt)  
24. [Source map (current → target)](#24-source-map-current--target)  
25. [Glossary](#25-glossary)

---

## 0. Executive build charter

### What we are building

A **local-first professional GIF studio**:

```text
Import image/GIF → Select / cut / matte → Animate → Export GIF (+ PNG / MP4)
```

AI assists cutout, matte, depth, inpaint, upscale, interpolate. AI never replaces the animator or the GIF encoder contract.

### Current reality

| Area | Score | Action |
|------|------:|--------|
| Feature coverage | ~8/10 | Preserve workflows |
| Production foundations | ~4.6–4.8/10 | Rebuild foundations |
| Analytics / a11y / undo / parity | Bad / missing | Build in phases |

### Primary objective (P0)

Preserve user workflows while installing:

1. One serializable project document (V2)  
2. One ordered scene graph  
3. One runtime asset registry  
4. One deterministic time + scene evaluator  
5. One command/history path  
6. One cancellable TaskManager  
7. One preview/export render contract  
8. Bounded memory + explicit resource ownership  
9. Strict validation, migrations, typed errors  
10. Privacy-safe telemetry  

### Feature freeze

**Do not** add new AI model families, effect types, export formats, or timeline features until Phases **0–7** pass. Migrate and fix existing features only.

### Non-negotiables

- No dual-write of old + new state  
- No Canvas / ImageBitmap / blob URLs in project JSON  
- No ambient `Math.random()` in frame evaluation  
- No silent AI fallback  
- No “secure censor” via pixelate  
- No media/prompts in logs or analytics  
- All persistent edits via commands  
- All long ops: cancel + dispose + stale-revision guard  
- ADR for irreversible decisions  

---

## 1. Product vision & principles

1. **Local first** — media stays on machine (localhost API).  
2. **Preview before export** — see motion before full encode.  
3. **Editable presets** — starting points, not black boxes.  
4. **Reproducible output** — same project + assets ⇒ same frames (tolerance).  
5. **Separation of concerns** — UI ≠ session ≠ document ≠ render ≠ AI workers.  
6. **Honest GIF** — palette, binary alpha, memory, timing explained.  
7. **Safe defaults** — reject/downscale before OOM.  
8. **AI assists, does not own** — committed assets only at export.  

### Workspaces (keep)

| Route | Workspace | Chrome |
|-------|-----------|--------|
| `/gif/ai` | AI | Layer |
| `/gif/motion` | Motion | Layer |
| `/gif/edit` | Effects | Layer |
| `/gif/text` | Text | Layer |
| `/gif/timeline` | Timeline | Focus |
| `/gif/scale` | Scale | Focus |
| `/gif/output` | Export | Focus |

Layer chrome: Project / Select-detect / Tools / Preview / Layers / Inspector.  
Focus chrome: Preview + right Outlet.

### Core user journeys (must stay green every phase)

1. Import still → lasso/SAM cutout → move → motion → export GIF  
2. Remove BG / soft matte → transparent GIF  
3. Import GIF → scrub → animate → export with timing policy  
4. Depth → parallax → Ken Burns  
5. Upscale → **replace source asset** (keep original for rollback) → export  
6. Timeline liquify + keyframes → export  
7. Body/joints → pose sway → export  

---

## 2. Locked decisions & overlays

Change only via ADR. **Overlays must not be diluted.**

### 2.1 Server-first compute overlay (user-approved)

| Workload | Placement |
|----------|-----------|
| Interactive edit + preview | **Frontend** |
| Best / server quality AI | **Backend jobs** (default when API available) |
| Fast / private AI | Optional **local** only, labeled **degraded** |
| Final export encode (GIF/MP4) | **Backend job** (default); client encode = **offline fallback only** |
| Preview-res drag effects | Frontend OK |

#### Move FE → BE

| Work | Phase |
|------|-------|
| Upscale, RIFE | **9–10** |
| Best segment / matte / inpaint | **9–10** |
| Final GIF/MP4 encode | **11** (server default); client = fallback |
| Temporal / all-frames AI | **P2 after Phase 14 gates** |

**Stay on FE:** scrub/composite, transforms, lasso/mask brush, light local extract.

**ADR at Phase 9 (mandatory):** “AI local/server routing and fallback policy” must encode **server-first for Best + export**, not “client or server equally.”

### 2.2 Other locked product decisions

| Topic | Lock |
|-------|------|
| Primary surface | Web React + FastAPI |
| Desktop/CLI | Secondary; shared Python engine; not web SoT |
| Enhanced / upscale | **Replace source asset + keep original for rollback** — not invisible underlay, not dual-draw. Optional UX compare before commit is OK; committed state = enhanced is active asset, original retained for undo/rollback. *(Overrides older “A/B alternate forever” plan wording.)* |
| GIF cutouts (P0) | **Static snapshot only**, clearly labeled |
| Pixelate vs Redact | Visual mosaic vs opaque last-pass secure fill |
| New cutout motion | **`None`** |
| Dual-write | **Forbidden.** Legacy arrays = **read-only projections** from V2 |
| Feature freeze | No new models/effects/formats until Phases **0–7** gates pass; Phases **8–14** still required before “production-grade” |
| Client ONNX / browser Best AI | Not production default after Phases 10–11 |
| ffmpeg.wasm | Convenience / offline only — not production encode default after Phase 11 |
| GPU (P0–P7) | **Canvas-first** + workers; real GPU only after parity + profile |
| Pixi blit-only | Not a GPU renderer; remove or demote |
| Encode authority | Server job `/api/v1/...` (or `/api/export` until v1 cutover); golden on pre-quantize RGBA |
| GIF sample | Frame **start** of each project frame |
| GIF delays | Preserve; cumulative timestamp table |
| Detect | One engine only (SAM3 **or** DINO+SAM2 **or** YOLO) |
| GrabCut vs rembg | Explicit method; no silent fallback |
| Schema | **`schemaVersion: 2`**; V1→V2 migrate with backup |
| Caps | Soft complexity warns; hard: 20 MB / 5k edge; upscale 5k/20 GiB; AI concurrent 1; RAM floor 3 GiB |

### 2.3 Execution mode (build plan §0–§2)

- Strangler — import→edit→preview→export works after **every** phase  
- No big-bang rewrite; no giant PR  
- Evidence: `docs/production-refactor/STATUS.md` after each phase  
- Discover toolchain first; no ambient `Math.random()` in eval; no UI→raw API; no silent AI fallback; no media in logs  
- Feature flags (with expiry): `projectV2`, `unifiedLayers`, `commandHistory`, `sceneEvaluatorV2`, `rendererV2`, `workerDecode`, `taskManagerV2`, **`serverJobsV2`**

### 2.4 Preview ≡ export

**Must match:** time, layer order, transforms, tracks, masks/effects, text inputs, GIF frame pick, redaction, seeds.  
**May differ:** viewport preview res; draft effects while dragging (labeled); server palette step.  
**Final Preview** = export contract @ project resolution.

---

## 3. System architecture (FE + BE)

```text
┌─────────────────────────── BROWSER ───────────────────────────┐
│ Pages / Layout / UI kit                                        │
│        │                                                       │
│        ▼                                                       │
│ Application services                                           │
│  CommandBus · History · ProjectService · Autosave              │
│  EditorSession · ToolStateMachine · PlaybackController         │
│  TaskManager · AiService · ExportService · Telemetry           │
│        │                                                       │
│        ▼                                                       │
│ Domain (pure TS/JS)                                            │
│  project-schema · layers · timeline evaluator · effects        │
│        │                                                       │
│        ▼                                                       │
│ Runtime                                                        │
│  AssetRegistry · MemoryBudget · Workers (decode/render)        │
│  SceneEvaluator → RenderPlan → Canvas2D preview/export         │
└────────────────────────────┬──────────────────────────────────┘
                             │ typed HTTP /api/*
┌────────────────────────────▼──────────────────────────────────┐
│ Python FastAPI (`src/gif_studio`)                              │
│  web_api · ai_pipeline · security_limits · resource_guard      │
│  jobs · storage · engine (GIF encode) · ai/*_runner            │
│  CUDA if present else CPU · unload + empty_cache after jobs    │
└───────────────────────────────────────────────────────────────┘
```

### Responsibility matrix

| Concern | FE | BE |
|---------|:--:|:--:|
| Tools, Konva, layers UI, timeline UI | ✓ | |
| Project commands / undo | ✓ | |
| Scene evaluation / preview | ✓ | |
| Local color-key extract | ✓ | |
| MediaPipe pose (optional) | ✓ | |
| Bounded GIF decode cache | ✓ | |
| SAM / matte / depth / inpaint / upscale / RIFE | | ✓ |
| rembg / GrabCut `/api/segment` | | ✓ |
| Production GIF encode / gifsicle | | ✓ |
| Rate limit / RAM gate / concurrency | | ✓ |
| Upload magic+PIL validation | | ✓ |
| Project/asset persistence API | | ✓ |

### Target folder layout

```text
src/
  domain/          project, layers, timeline, effects, errors
  application/     commands, editor-session, projects, tasks, ai, export, telemetry
  runtime/         assets, playback, workers, capabilities
  render/          scene-evaluator, canvas2d, preview, export
  media/           gif/, image/
  infrastructure/  api/, persistence/, telemetry/
  context/         studio-root-provider.tsx  (thin)
  pages|layout|components|hooks   UI only
schemas/           project-v2.schema.json, api/
docs/adr/
docs/production-refactor/   BASELINE.md, STATUS.md, PERFORMANCE_BUDGETS.md
```

`studio-provider.jsx` (~3383 LOC) → thin composition root only.

### Dependency rules

```text
UI → application → domain
infrastructure implements ports ← domain/application
renderer never mutates project
UI never calls raw fetch to AI/export (TaskManager / ExportService only)
domain imports neither React nor FastAPI nor Konva
```

---

## 4. Domain model & contracts

### 4.1 State classes

| Class | Owner | Persisted |
|-------|-------|----------:|
| Project document | ProjectStore | Yes |
| Editor session | EditorSessionStore | No |
| Environment | EnvironmentStore | No |
| Runtime assets | RuntimeAssetRegistry | No |
| Tasks | TaskManager | Metadata only |
| Playback | PlaybackController | No |

### 4.2 Project V2

```ts
type ProjectDocumentV2 = {
  schemaVersion: 2;
  id: string;
  projectSeed: string;
  metadata: { name: string; createdAt: string; updatedAt: string; appVersion: string };
  canvas: {
    width: number; height: number;
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

Invariants: JSON-only; no selection/playback/capabilities; every layer/asset ref exists; each layer once in graph; no cycles.

### 4.3 Assets

```ts
type AssetManifestEntry = {
  id: AssetId;
  kind: "image" | "animated-image" | "mask" | "depth" | "font" | "video";
  mimeType: string;
  checksumSha256: string;
  byteLength: number;
  width?: number; height?: number;
  frameCount?: number; durationUs?: number;
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

Binaries in AssetStore / IndexedDB / server storage — never inline JSON.

### 4.4 Layers (unified scene graph)

```ts
type VisualLayerCommon = {
  id: LayerId; name: string; visible: boolean; locked: boolean;
  opacity: number; blendMode: BlendMode; transform: Transform2D;
  effects: EffectNode[]; animationTrackIds: TrackId[];
};

type Layer =
  | (VisualLayerCommon & {
      type: "raster";
      assetId: AssetId;
      maskAssetId?: AssetId;
      mediaMapping?: MediaTimeMapping;
      pose?: PoseBinding;
      /** Upscale commit: assetId becomes enhanced; rollbackAssetId keeps pre-upscale original */
      rollbackAssetId?: AssetId;
    })
  | (VisualLayerCommon & { type: "text"; text: string; style: TextStyle; fontAssetId?: AssetId })
  | (VisualLayerCommon & { type: "group"; childIds: LayerId[] })
  | (VisualLayerCommon & { type: "adjustment"; scope: "below" | "group" })
  | (VisualLayerCommon & { type: "pixelate"; region: Shape; pixelSize: number })
  | {
      id: LayerId; type: "redaction"; name: string; visible: boolean; locked: boolean;
      region: Shape; fill: string; secure: true;
    };
```

- Artboard = canvas metadata, not a layer.  
- Source background = locked raster (unlockable).  
- Render order = `rootLayerIds` order.  
- Pose skeleton = session debug, not exportable content.  

### 4.5 Timeline

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

Time = integer microseconds. Presets compile to tracks/modifiers (no parallel hidden system).

### 4.6 Evaluation order

1. Map loop / ping-pong once  
2. Resolve source frame / media mapping  
3. Static layer properties  
4. Absolute tracks  
5. Multiply tracks  
6. Additive tracks / procedural modifiers  
7. Parallax  
8. Pose / mesh warp (documented space)  
9. Per-layer effects  
10. Composite by layer order  
11. Global / adjustment effects  
12. **Secure redaction last**  
13. Export color / palette  

`Random` = `hash(projectSeed, clipId, frameIndex)`.

### 4.7 Tool state machine

```ts
type ToolState =
  | { kind: "move"; phase: "idle" | "dragging"; pointerId?: number }
  | { kind: "select-rect"; phase: "ready" | "drawing"; draft?: Rect }
  | { kind: "select-lasso"; phase: "ready" | "drawing"; points: Point[] }
  | { kind: "select-polygon"; phase: "placing"; points: Point[] }
  | { kind: "select-pen"; phase: "placing"; points: Point[] }
  | { kind: "mask-brush"; phase: "ready" | "painting"; stroke?: MaskStroke }
  | { kind: "pixelate"; phase: "ready" | "drawing"; draft?: Rect }
  | { kind: "redact"; phase: "ready" | "drawing"; draft?: Rect };
```

### 4.8 Typed errors

`UNSUPPORTED_FORMAT` · `INVALID_MEDIA` · `DECODE_LIMIT_EXCEEDED` · `PROJECT_VALIDATION_FAILED` · `PROJECT_MIGRATION_FAILED` · `ASSET_MISSING` · `FONT_MISSING` · `MODEL_UNAVAILABLE` · `MODEL_OUT_OF_MEMORY` · `TASK_CANCELLED` · `STALE_RESULT_DISCARDED` · `EXPORT_MEMORY_BUDGET_EXCEEDED` · `ENCODER_UNAVAILABLE` · `EXPORT_RENDER_FAILED` · `EXPORT_ENCODE_FAILED` · `UNAUTHORIZED` · `RATE_LIMITED` · `INTERNAL_ERROR`

---

## 5. Frontend design & modules

### 5.1 Stack (keep)

React 18 · Vite · Zustand (or split stores) · Konva/react-konva · Canvas 2D · GSAP as UI clock only · gifuct-js · gifenc (fallback) · ffmpeg.wasm (optional MP4) · MediaPipe optional · Tailwind UI kit

### 5.2 UI kit (keep & harden)

`Button`, `Field`, `SelectField`, `Switch`, `Section`, `Collapsible`, `Slider`, `LayerRow`, `ExportModal`, `BusyOverlay`, `Toast`, `ZoomControls`, `CanvasViewport`, …  

Add: a11y names, focus rings, keyboard, reduced-motion, validation messages.

### 5.3 Layout zones

```text
Header (Reset · Export) · WorkspaceNav
LAYER: [ProjectAside][SelectDetect?][ToolsRail?] | Preview | [Layers][Inspector]
FOCUS: Preview | Focus Outlet
Overlays: ExportModal · Busy · Toast · ErrorBoundary (scoped recovery)
```

### 5.4 Page responsibilities (thin)

| Page | Owns UI for |
|------|-------------|
| AI | Depth, interpolate, pose entry → AiService |
| Motion | Presets, overlays |
| Effects | Inspector EffectsPanel (edit page may be shell) |
| Text | Add/delete text, entrance/loop/exit |
| Timeline | Keyframes + motion clips |
| Scale | Upscale → replace asset + rollback original |
| Output | Encode settings, compress, MP4 |

### 5.5 Application services (replace god provider)

| Service | Responsibility |
|---------|----------------|
| CommandBus / HistoryService | Undoable mutations |
| ProjectService / Autosave | Open/save/migrate |
| EditorSession + Tool FSM | Tools, selection, viewport |
| PlaybackController | play/pause/scrub `timeUs` |
| SceneEvaluator | project+time → RenderPlan |
| PreviewRuntime | rAF, adaptive quality |
| ExportService | preflight + frame stream + encode handoff |
| AiService | intents → TaskManager |
| TaskManager | queue, cancel, stale, progress |
| AssetRegistry | decode, LRU, dispose |
| MemoryBudgetService | admit/reject |
| EnvironmentStore | health + structured capabilities |
| Telemetry / Analytics | privacy-safe |

### 5.6 React composition root

Expose **narrow hooks**: `useProject()`, `useSelection()`, `usePlayback()`, `useTasks()`, `useCapabilities()`.  
Do **not** expose canvas refs + 80 methods in one context value.

### 5.7 Transform UX

- Positions % of artboard (or migrate to logical px with one conversion helper + tests)  
- Anchor 0–100%  
- Konva drag/resize/rotate → coalesced transform command  
- Flip / rotate 90 via commands  

### 5.8 Settings defaults (product)

| Key | Default |
|-----|---------|
| duration | 10 s |
| fps | 24 |
| easing | Ease in-out |
| canvas | 480×300 |
| fit | Contain |
| quality | High (256 palette, dither on) |
| loop | 0 (forever) |
| disposal | 2 |
| extractTolerance UI | 42 (split internally: chroma / feather / decontam) |
| cutout default motion | **None** |
| cutout model UI default | birefnet (intent: Best edges) |

---

## 6. Backend design & API

### 6.1 Package layout

```text
src/gif_studio/
  web_api.py          routes + OpenAPI
  ai_pipeline.py      dispatch + capability
  engine.py           GIF encode / core image
  security_limits.py  rate / size / format
  resource_guard.py   RAM / concurrency
  jobs.py / worker.py async heavy jobs
  storage.py / db.py  assets / projects
  models.py / presets.py / metadata.py
  ai/*_runner.py      SAM2/3, DINO, YOLO, matte, depth, LaMa, RealESRGAN, RIFE
  cli.py / app.py / ui/   desktop/CLI surfaces
```

### 6.2 Canonical routes

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/health` | device, engines, structured capability statuses |
| POST | `/api/segment` | rembg \| grabcut (explicit `method`) |
| POST | `/api/ai/segment` | SAM2 / SAM3 point-box |
| POST | `/api/ai/detect` | sam3 \| grounding_dino+SAM2 \| yolo |
| POST | `/api/ai/matte` | BiRefNet / RMBG / rembg-isnet |
| POST | `/api/ai/depth` | Depth Anything V2 |
| POST | `/api/ai/inpaint` | LaMa / OpenCV Telea |
| POST | `/api/ai/upscale` | RealESRGAN family |
| POST | `/api/ai/interpolate` | RIFE |
| POST | `/api/export` | production GIF encode |
| POST | `/api/compress-gif` | recompress |
| POST | `/api/optimize-png` | 8-bit PNG |
| CRUD | `/api/projects*` | project docs |
| POST | `/api/assets` | binary assets |

### 6.3 API contract requirements

- OpenAPI generated; FE uses generated client  
- Request id / correlation id on every response  
- Typed error envelope (`code`, `message`, `requestId`, `details?`)  
- Progress: poll job or stream; cancel endpoint  
- Phase 10: migrate long work to **`/api/v1` jobs** (OpenAPI); keep compatibility shims briefly under flag `serverJobsV2`  
- No silent engine substitution  

### 6.4 Capability shape (not booleans alone)

```json
{
  "task": "inpaint",
  "status": "degraded",
  "engines": [
    { "id": "opencv-telea", "status": "ready", "qualityTier": "fallback", "device": "cpu" },
    { "id": "lama", "status": "missing-weights", "qualityTier": "preferred", "device": "cuda" }
  ]
}
```

### 6.5 Limits & env

| Env / rule | Default |
|------------|---------|
| Upload | PNG/JPG/WEBP · 20 MB · edge ≤ 5000 |
| Upscale refuse | edge > 5k or peak > 20 GiB |
| `GIF_STUDIO_TORCH_DEVICE` | auto cuda→cpu (mps where supported) |
| `GIF_STUDIO_AI_MAX_CONCURRENT` | 1 |
| Cooldown | `GIF_STUDIO_AI_COOLDOWN_<ROUTE>` |
| Rate | AI 8/min · heavy 3/min · export 12/min · POST 60/min |
| `GIF_STUDIO_TRUST_PROXY` | 0 (set 1 behind nginx) |
| Free RAM floor | 3 GiB |
| Post-job | unload caches + `empty_cache` |

### 6.6 Job execution

- One heavy GPU/CPU job at a time (default)  
- Queue wait; refuse if under RAM floor  
- Timeout + temp file cleanup always  
- Subprocess args as arrays (never shell-interpolate user strings)  
- Model allowlist + checksum when downloading  

---

## 7. Image processing & composition

### 7.1 Pipeline

```text
Assets → resolve frame @ timeUs → evaluate transforms/tracks
  → per-layer mask + effects → composite (layer order)
  → global adjustments → redaction → present / encode
```

### 7.2 Effect graph (unify)

One ordered `effects[]` per layer + adjustment layers. Migrate away from triple system (`imageEdits` + layer effects + entire-GIF).

| Group | Controls |
|-------|----------|
| Tone | hue, sat, lightness, brightness, contrast |
| Looks | Grayscale, Sepia, Monochrome, Gotham, Lomo, Nashville, Toaster, Vignette, Polaroid |
| Color | invert, tint |
| Transparency key | color, fuzz, edge cleanup |
| Detail | blur, sharpen, oil, emboss, posterize, solarize, noise |
| Dither | None / Ordered / Error diffusion |
| Distortion | Bloat, Pucker, Twirl, Push, Swirl, Implode, Wave |
| Frame | Camera, Fuzzy, Rounded, Solid |

Each effect node: type, version, params, coordinate space, alpha behavior, preview approx flag, backend support, cache key.

Hot path: Canvas2D / worker; skip OpenCV on every playback frame.

### 7.3 Distortion / liquify clips

Types: Bloat, Pucker, Twirl, Push, Swirl, Wave, Zoom.  
Clip fields: in/out, amount, radius, x/y, angle, fadeIn/Out, cycles, animate mode.  
Animate: Hold, L→R, R→L, T→B, B→T, Orbit, Pulse, Random, Spin.  
Soft-warn beyond 3 clips; budget-driven hard stop if needed.

### 7.4 Pixelate vs redact

| Feature | Layer type | Pass |
|---------|------------|------|
| Pixelate | `pixelate` | Normal visual |
| Redact | `redaction` secure | Final protected; flatten export |

### 7.5 Content fill

| Path | Role |
|------|------|
| Cleanup underlay | Preview hole while cutout moves (local edge / Telea) |
| `/api/ai/inpaint` | Committed fill asset (LaMa preferred) |
| Generative diffusion | Out of scope (P2+) |

Mental model: cutout = new layer; fill = optional cleanup or explicit inpaint command.

### 7.6 Transform matrix order

1. Source/crop origin  
2. Anchor to local  
3. Deform bounds  
4. Scale / flip  
5. Rotate  
6. Anchor back  
7. Layer position  
8. Parent/group  
9. Canvas  

Shared helpers + unit tests — do not trust implicit Konva order alone.

---

## 8. Selection, masks & cutouts

### 8.1 Tools

Move · Rectangle · Freehand lasso · Polygonal · Pen · Mask brush · Pixelate · Redact · SAM click (AI) · Human (MediaPipe) · Detect (AI) · Select subject / Remove BG (API)

### 8.2 Extract paths

| Path | Where | When |
|------|-------|------|
| Local color-key + path | FE | Marquee / lasso / pen |
| `/api/segment` | BE | Subject / BG / GrabCut choice |
| `/api/ai/segment` | BE | SAM click/box |
| `/api/ai/detect` | BE | Text/class (one engine) |
| `/api/ai/matte` | BE | Soft alpha |

### 8.3 Extract internals (split tolerance)

Expose separately in code (UI may show one slider initially):

- chroma distance threshold  
- contiguous region policy  
- edge feather radius  
- spill / decontamination  
- mask expand/erode  

Masks stored in **source image coordinates**. Feather non-destructive when possible. Trim = explicit command updating rect + transform.

### 8.4 Mask brush defaults

| Param | Default |
|-------|---------|
| mode | Hide / Reveal |
| size | 48 |
| hardness | 70 |
| opacity | 100 |
| feather | 8 |

One history entry per stroke. Invert / reset / feather / trim = commands.

### 8.5 Animated source cutouts

| Mode | Default | Notes |
|------|---------|-------|
| Static snapshot | **Yes** | Warn: no temporal tracking |
| Tracked sequence | Later | Per-frame mask/asset |
| Batch segment | Later | Server job + temporal smooth |

---

## 9. Motion, timeline & pose

### 9.1 Base presets (compile to tracks)

Still · Zoom in/out · Ken Burns · Spin & zoom · Fade in · Float · Drift · Bounce · Pulse · Spin · Wobble · Orbit  

Knobs: Amount, Speed, Duration, FPS, Easing, Anchor, Ping-pong.  
Easing: Linear · Ease in/out/in-out · Smoothstep · Spring.

### 9.2 Property keyframes

Tracks: opacity, scale, x, y (+ expand later). Modes: absolute / additive / multiply.

### 9.3 Text motion

Entrance / loop / exit catalogs; `in`/`out` seconds clamped to duration. Soft-warn > 5 text layers.

### 9.4 Parallax

Enabled + mode (H/V/Diagonal/Orbit) + strength + speed + per-layer depth. Fed by Depth AI asset.

### 9.5 Pose

- 33 MediaPipe landmarks  
- Joint keys start/end dx/dy  
- IDW mesh warp for body cutouts  
- Pose sway as modifier  
- Persist pose bindings in project; skeleton overlay session-only  

### 9.6 Playback

- Canonical clock = `timeUs` (PlaybackController)  
- GSAP optional UI tween only  
- Scrub / play / ping-pong share time resolver with export  

---

## 10. AI subsystem

### 10.1 Product rule

| Core (non-ML) | AI assists |
|---------------|------------|
| Select, transform, layers, timeline | Smart select → layer |
| Motion presets, keyframes | Depth parallax, RIFE |
| Canvas, fps, duration, encode | Upscale, better masks |

### 10.2 Feature matrix

| UI intent | API | Models | Result |
|-----------|-----|--------|--------|
| Click/box select | `/api/ai/segment` | SAM2.x | Mask/cutout asset |
| Text/class detect | `/api/ai/detect` | sam3 \| dino+sam2 \| yolo | Mask/cutout |
| Soft matte | `/api/ai/matte` | BiRefNet, RMBG, rembg-isnet | Alpha cutout |
| Fill hole | `/api/ai/inpaint` | LaMa, OpenCV | Raster asset |
| Depth | `/api/ai/depth` | Depth Anything V2 Small | Depth asset |
| Interpolate | `/api/ai/interpolate` | RIFE | Frame sequence |
| Upscale | `/api/ai/upscale` (server Best default) | RealESRGAN* | New asset; command replaces layer `assetId`, sets `rollbackAssetId` |

**Slots only (hide in prod until ready):** FILM, GFPGAN.

### 10.3 UX intents (preferred over raw names)

- Cutout: Fast / Balanced / Best edges  
- Task: Person / Object / Text prompt / Class  
- Runtime: Local-private vs Server-best (when both exist)  

Store exact engine/version/params as provenance.

### 10.4 Task contract

```ts
type StudioTask = {
  id: string;
  kind: "decode" | "segment" | "matte" | "depth" | "upscale" | "interpolate" | "inpaint" | "export";
  state: "queued" | "running" | "succeeded" | "failed" | "cancelled" | "stale";
  progress?: { completed: number; total?: number; message?: string };
  sourceRevision: string;
  provenance?: ModelProvenance;
  error?: StudioErrorData;
};
```

- AbortSignal on every task  
- Commit only if `sourceRevision` still matches  
- Atomic apply command  
- Never re-run AI at export  

### 10.5 Client AI files (thin wrappers)

`src/ai/{sam2,matte,depth,inpaint,realesrgan,rife,grounding-dino,mediapipe,onnx,index}.js` → call TaskManager / API only.

### 10.6 Setup

`python scripts/setup_ai_models.py` (+ `--with-sam3`). Health reflects readiness.

---

## 11. Import, export & GIF honesty

### 11.1 Import

- FE accept + BE magic/PIL for AI path (PNG/JPG/WEBP)  
- GIF import: patches + disposal + delay table; **bounded** decode cache  
- EXIF orientation once into asset  
- Admission via MemoryBudget before full decode  

### 11.2 Export pipeline

1. Freeze project + asset snapshot  
2. Preflight: fonts, assets, dims, duration, memory, redaction  
3. Exact timestamps from durationUs + fps  
4. Shared evaluator → RGBA frames  
5. Server quantize/encode (production)  
6. Verify metadata / frame count  
7. Release buffers  

### 11.3 Quality profiles

| Profile | Palette | Dither | Notes |
|---------|---------|--------|-------|
| Low | 64 | Off | lossy ok |
| Balanced | 128 | On | |
| High | 256 | On | lossless LZW |
| Custom | user | user | |

Also: loop, disposal, alpha threshold, transparent vs matte, gifsicle when available.

### 11.4 Honesty UX

- GIF ≤ 256 colors/frame; binary transparency  
- Soft alpha must threshold or matte  
- Show memory estimate before export  
- Project file ≠ secure deliverable if originals retained  

### 11.5 MP4 / PNG

- PNG snapshot / enhanced download  
- GIF→MP4 via ffmpeg.wasm or server — optional convenience  

### 11.6 Desktop/CLI encode (secondary)

Pillow path + sidecar JSON + comment metadata per `BUILD_SPEC.md`. Shared limits philosophy (~1200 frames / ~1.8 GB raw estimate or budget service).

---

## 12. Performance & memory

### 12.1 Peak estimate

```text
peak =
  source decode working set
  + decode cache budget
  + masks/depth
  + effect intermediates
  + preview/export backbuffers
  + encoder working set
  + model working set
  + transfer copies
  + safety margin
```

### 12.2 Policies

- Every cache: byte budget, eviction, owner  
- Preview @ viewport; export @ project res  
- Draft effect approx only while dragging  
- Stream export frames; don’t keep full sequence unless budgeted  
- Low-memory mode: smaller preview, shorter cache, refuse heavy AI  
- Evict on source replace / close / cancel / scale invalidate  

### 12.3 Initial budgets

| Metric | Target |
|--------|--------|
| Preview p95 | ≤ 33 ms |
| Dropped frames | < 5% / 30 s |
| Long tasks | no repeated > 100 ms |
| Cancel ack | ≤ 250 ms |
| Leak | no monotonic growth on open/close |

### 12.4 Benchmark fixtures

1. Small static 480×300  
2. Standard animated 960×540 / 120 frames  
3. Heavy 1080p + pose + effects  
4. Memory adversarial (preflight only)  
5. AI workflow still→segment→upscale→export  

---

## 13. Security & privacy

### Threats

Malformed media · decompression bombs · MIME spoof · malicious project JSON · path traversal · job enumeration · subprocess injection · SSRF · arbitrary model download · GPU starvation · log leakage · fake “secure” pixelate · hidden pixels in export  

### Controls

- Magic sniff + probe before full decode  
- Pixel/frame/duration/memory limits  
- Isolated storage keys  
- Authn for non-local production deploys  
- CORS/CSRF policy  
- Rate + concurrency  
- Array subprocess args  
- Model allowlist + checksum  
- Retention + temp cleanup  
- Secrets via env only  
- CSP compatible with workers/WASM  
- Secure redact contract (§7.4)  

### Analytics denylist

No pixels, masks, filenames, project titles, text-layer content, prompts, EXIF, raw exceptions, tokens, full project JSON.

---

## 14. Reliability: commands, undo, tasks

```ts
type EditorCommand = {
  id: string;
  label: string;
  coalesceKey?: string;
  execute(doc: ProjectDocumentV2): {
    document: ProjectDocumentV2;
    inverse: EditorCommand;
    assetRefDelta?: AssetRefDelta;
  };
};
```

- Drag / slider / stroke / trim → one history entry  
- AI apply atomic  
- Stale/cancelled never enter history  
- History byte budget + checkpoints  
- Autosave after committed transactions only  
- Crash recovery from last good snapshot  

---

## 15. Observability & analytics

### Product events (examples)

`project_opened` · `import_succeeded/failed` · `ai_task_*` · `layer_*` · `export_*` · `crash_recovery_*`

Dimensions: buckets only (size, latency, device tier, error code) — never media.

### Tech metrics

Editor-ready · decode · preview p50/p95/p99 · drops · cache bytes · AI latency · export phases · queue depth · migration/autosave success · retained resources  

### Tracing

Correlation ID: browser → API → job → error. Structured logs. Redact media/text.

---

## 16. Accessibility

- Keyboard: nav, tools, escape, delete, undo/redo, play, nudge, reorder, zoom, panels  
- Focus order + visible focus + modal trap  
- Names/state for icon buttons, sliders, layers, timeline  
- Reduced motion: no surprise autoplay; pause controls  
- Live regions for task status  
- Actionable errors (retry, lower res, request id)  
- Capability honesty (available / degraded / missing)  

---

## 17. Phased build plan (0–14)

**Rule:** app bootable + main journey green after every phase. Evidence in `docs/production-refactor/STATUS.md`.  
**Procedure detail:** follow [CURSOR_PRODUCTION_BUILD_PLAN.md](./production-refactor/CURSOR_PRODUCTION_BUILD_PLAN.md) §7. Apply §2 overlays.

```text
P0 Baseline → P1 Domain V2 → P2 Assets → P3 Scene graph → P4 Commands
  → P5 Tools/masks → P6 Time/anim → P7 Render parity → P8 Decode/perf
  → P9 TaskManager/AI (server-first Best) → P10 FastAPI /api/v1 jobs
  → P11 Export (server default) → P12 Observability → P13 A11y → P14 Release
```

### Phase 0 — Baseline (first actions when execution starts)

1. Confirm copies: build plan in `docs/production-refactor/`, reviews in `docs/reviews/`  
2. Detect package manager; record scripts in `BASELINE.md`  
3. Create `STATUS.md` from build plan §19 template  
4. Inventory: project mutations, canvas/bitmap/URL creation, long tasks, preview/export entry points  
5. Add minimum smoke + fixture scaffolding; run existing Python tests; note no JS test runner yet  
6. **Do not** start renderer/AI/UI feature work until Phase 0 exit gate passes  

**Exit:** evidence recorded; app unchanged.

| Phase | Goal | Exit gate (summary) |
|------:|------|---------------------|
| 0 | Baseline, smoke, BASELINE/STATUS, inventory | Evidence recorded; app unchanged |
| 1 | TS domain, Project V2, validation, migrations | Round-trip + migrate fixtures pass |
| 2 | Asset manifest + RuntimeAssetRegistry | No runtime objects in document |
| 3 | Unified ordered layers; **enhanced = replace + rollback** | Cross-type z-order = document order |
| 4 | Commands, undo/redo, autosave, recovery | All authoring via history |
| 5 | ActiveTool FSM; masks; static GIF cutout; redaction | Invalid tool combos impossible; Pixelate ≠ Redact |
| 6 | µs time; tracks/modifiers; pose persist; seeds | Deterministic eval at `timeUs` |
| 7 | Pure SceneEvaluator → RenderPlan; goldens/parity | Preview ≡ export within tolerance |
| 8 | Worker decode, LRU, admission, adaptive preview | Bounded memory; budgets measured |
| 9 | TaskManager; registry; **server-first Best**; provenance | Stale results never apply; ADR routing signed |
| 10 | FastAPI `/api/v1` jobs, OpenAPI, security; absorb Best AI | Long work = cancellable jobs |
| 11 | Export preflight, stream encode, **server-default export** | No silent feature drop; client encode fallback only |
| 12 | Analytics + telemetry + tracing (privacy-safe) | No media/PII in events |
| 13 | A11y, keyboard, capability honesty UX | Core workflows keyboard-reachable |
| 14 | Legacy removal, CI gates, docs, readiness report | All build-plan §17 gates checked with evidence |

### Deferred P2 (build plan §20) — only after Phase 14

Temporal cutouts · groups/adjustment layers · APNG/WebM · GPU-native if measured · collab/cloud · new model families · all-frames AI

---

## 18. Test strategy

| Layer | Coverage |
|-------|----------|
| Unit | transforms, easing, ping-pong, tracks, GIF delays, layer order, masks, migrations, quality maps, routing |
| Property | no NaN; undo/redo identity; serialize RT; reorder integrity; cache refs |
| Golden | alpha, masks, distortion, text, pose, parallax, redact order, disposal, palette |
| API | OpenAPI, limits, corrupt media, cancel, timeout, unavailable model, concurrency, temp cleanup |
| E2E | journeys §1; stale AI; undo across AI+mask; save/reopen/migrate |
| Perf | budgets §12; leak tests |
| Security | threat cases §13 |
| A11y | keyboard smoke; focus; labels |

---

## 19. CI & release gates

Do **not** label production-ready until:

- [ ] Save / reopen / migrate / export without visual drift  
- [ ] Golden preview↔export (pre-quantize RGBA)  
- [ ] Undo/redo covers persistent edits  
- [ ] Long GIFs cannot unbounded-allocate  
- [ ] Tasks cancel or discard stale  
- [ ] Runtime dispose + observable memory  
- [ ] Capabilities match readiness (no fake `inpaint: true`)  
- [ ] GIF honesty UX  
- [ ] Solid redaction last; pixelate labeled visual  
- [ ] Typed errors on bad/oversized input  
- [ ] Core E2E green  
- [ ] Telemetry without media exfil  
- [ ] A11y keyboard smoke  
- [ ] Security suite + threat review  
- [ ] Legacy writable paths removed  

CI: lint · typecheck · unit · migration · contract · golden smoke · e2e smoke. Full perf matrix on scheduled hardware.

---

## 20. Migration map & PR sequence

### Mapping: old A–H sprints → build-plan phases

| Former sprint | Build-plan phase(s) |
|---------------|---------------------|
| A schema/state | **1 + 2** |
| B layers | **3** |
| C commands | **4** |
| D time/anim | **6** |
| E render | **7** |
| F memory/GIF | **8** |
| G AI + BE move | **9 + 10** |
| H shell/docs/gates | **5** (tools/redact) + **12–14** |
| Backend track | **10** (+ export job in **11**) |

### Strangler

1. Tests + baseline (Phase 0)  
2. V2 types (read path)  
3. V1→V2 migrate; legacy selectors **read-only** from V2  
4. V2 only writable  
5. Assets out of entities  
6. Commands  
7. Evaluator + preview/export adapters  
8. Panels off legacy provider API  
9. Delete compatibility  

### Forbidden

- Dual-write V1 and V2  
- Store runtime objects in the project document  
- New model/effect/format catalog entries before Phases 0–7 pass  
- Treat ffmpeg.wasm / browser Best AI as production defaults after Phases 10–11  
- Skip `STATUS.md` / tests and mark a phase complete  

### PR sequence

Follow build plan **§14** (~30 small PRs). Combine adjacent items only if independently testable and reversible.

### Feature flags (short-lived, with expiry)

`projectV2` · `unifiedLayers` · `commandHistory` · `sceneEvaluatorV2` · `rendererV2` · `workerDecode` · `taskManagerV2` · **`serverJobsV2`**

---

## 21. ADRs required

Full list: build plan **§15** (15 ADRs). Write under `docs/adr/`.

**Priority early:**

1. Project V2 schema  
2. Unified scene graph  
3. Asset manifest + runtime registry  
4. Command/history model  
5. µs timebase  
6. Animation precedence  
7. Render contract / preview≡export  
8. Canvas2D-first renderer  
9. GIF bounded cache  
10. **AI local/server routing — server-first Best + export** (Phase 9; not equal client/server)  
11. Server jobs `/api/v1`  
12. Analytics privacy denylist  
13. **Enhanced = replace source + rollback original**  
14. Fonts / export preflight  
15. Secure redaction vs pixelate  

Do not mark Phase 9 complete without ADR #10 signed.

---

## 22. Definition of done

Production claim is **forbidden** until:

1. Build plan **§17 release gates** + **§21 complete DoD** checked with evidence in `STATUS.md`  
2. All Phase 0–14 exit gates pass + `PRODUCTION_READINESS_REPORT.md`  
3. `StudioProvider` is thin  
4. V2 is only writable project document  
5. Preview/export share evaluator  
6. **Server-first Best AI + server-default export** live; client paths labeled fallback/degraded  
7. Enhanced commit = replace + rollback (no invisible underlay)  
8. Memory budgets enforced; undo/autosave/recovery work  
9. Docs/ADRs match code  

---

## 23. Cursor agent prompt

Paste build plan **§18** master prompt after files are in-repo, **plus**:

```text
Apply locked server-first compute overlay from docs/GIF_STUDIO_MEGA_SENIOR_BUILD.md §2.
Authority: CURSOR_PRODUCTION_BUILD_PLAN.md wins for procedure;
MEGA §2 overlays win for compute placement and enhanced=replace+rollback.
Strangler only. No dual-write. No runtime objects in project JSON.
Feature freeze until Phases 0–7. Update STATUS.md every phase with evidence.
Do not treat ffmpeg.wasm or browser Best AI as production defaults after Phases 10–11.
Start at lowest incomplete phase. Prefer small reversible PRs.
```

---

## 24. Source map (current → target)

| Current | Target |
|---------|--------|
| `context/studio-provider.jsx` | Thin root + services |
| `store/studio-store.js` | ProjectStore + EditorSession + Environment |
| `lib/project-document.js` | `domain/project/*` V2 + migrations |
| `lib/effects.js` | `domain/effects` + `render/canvas2d` |
| `lib/motion-effects.js` / `keyframes.js` / `presets.js` | `domain/timeline/*` |
| `lib/pose.js` / `pose-warp.js` | domain pose + render warp |
| `engine/gif-decode.js` | `media/gif/*` bounded cache |
| `engine/gsap-playback.js` | PlaybackController (GSAP optional) |
| `engine/pixi-renderer.js` | Remove or non-claim blit |
| `engine/konva-editor.jsx` | UI adapter over commands |
| `ai/*.js` | AiService + TaskManager clients |
| `gif_studio/web_api.py` | Versioned OpenAPI + jobs |
| `gif_studio/ai/*` | runners + registry + provenance |
| `gif_studio/security_limits.py` / `resource_guard.py` | keep & harden |
| `gif_studio/engine.py` | production encode authority |

---

## 25. Glossary

| Term | Meaning |
|------|---------|
| Project V2 | Versioned serializable document |
| Scene graph | Ordered layers map |
| Render plan | Backend-neutral draw commands |
| Committed AI result | Asset used at export; no re-infer |
| Enhanced commit | Replace layer `assetId` with upscaled asset; `rollbackAssetId` keeps original |
| Server-first | Best AI + final encode on backend jobs when API up; local = degraded |
| Pixelate | Visual mosaic |
| Redact | Opaque secure fill |
| Strangler | Incremental replace without dual-write |
| SourceRevision | Token proving AI result still applies |
| Capability | Environment readiness, not project data |

---

## Related archive

For exhaustive review prose and uncut inventories, see  
[GIF_STUDIO_COMPLETE_PRODUCTION_MANUAL.md](./GIF_STUDIO_COMPLETE_PRODUCTION_MANUAL.md) (Parts C–G).

---

*Build from this file. Update locks via ADR. Prefer green gates over new features.*
