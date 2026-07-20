# GIF Studio — Complete Senior Production Architecture Manual

**Status:** Full archive (reviews + inventories concatenated)  
**Date:** 2026-07-20  
**Build from instead:** [GIF_STUDIO_MEGA_SENIOR_BUILD.md](./GIF_STUDIO_MEGA_SENIOR_BUILD.md) — coherent mega senior build bible.

This file preserves every detail from the split notes as numbered parts (reference archive).

| Former / sibling doc | Role in this manual |
|---|---|
| `GIF_STUDIO_SENIOR_PRODUCTION_ARCHITECTURE.md` | Folded into Parts A–B (locked decisions + target architecture) |
| `STUDIO_IMAGE_PROCESSING.md` | Part C — full product/feature reference |
| `AI_GIF_STACK.md` | Part D — AI reality-check stack |
| `GIF_STUDIO_SENIOR_ARCHITECTURE_REVIEW.md` | Part E — architecture review findings |
| `GIF_STUDIO_CRITICAL_SENIOR_REVIEW.md` | Part F — critical senior review |
| `GIF_STUDIO_CURSOR_PRODUCTION_BUILD_PLAN.md` | Part G — executable phased build plan |

**How to use:** implement against **Part A (locked decisions)** and **Part G (phases)**. Use Parts C–D for product/AI inventory. Use Parts E–F for why the migration exists.

---

# Part A — Locked production decisions

These close previous “or / TBD” forks. Change only via ADR.

## A.1 Product posture

| Decision | Lock |
|---|---|
| Product | Local-first GIF editor: import → select/cut → animate → export |
| AI role | Assists selection/matte/depth/inpaint/upscale/interpolate only; never replaces animator or GIF encoder |
| Primary surface | Web (Vite React) + local FastAPI |
| Desktop/CLI | Alternate surfaces over shared Python engine where applicable; not the web architecture source of truth |

## A.2 Frontend vs backend (backend-heavy, frontend-correct)

| Concern | Owner |
|---|---|
| Heavy AI (SAM*, DINO, YOLO, matte, depth, LaMa, RealESRGAN, RIFE) | **Backend** FastAPI + runners |
| Server GIF encode / gifsicle / compress / optimize-png | **Backend** |
| Upload validation, rate limits, AI concurrency, RAM gates, job queue | **Backend** |
| Editor UX, tools, layers, timeline, Konva transforms, commands, undo | **Frontend** |
| Animation evaluation + preview render plan | **Frontend** (pure modules; testable without React) |
| Local lasso/pen color-key extract | **Frontend** (light offline path) |
| MediaPipe pose/human | **Frontend** optional light path (not server matte substitute) |
| Client GIF encode | **Degraded offline fallback only**; warn parity may differ |
| Optional client ONNX | Opt-in acceleration; production default **API-first**; UI shows `api \| local \| unavailable` |

Rule: if heavy, GPU-bound, or security-sensitive → Python API.

## A.3 Architecture “ones”

1. One versioned project document (V2)  
2. One ordered scene graph (layers)  
3. One runtime asset registry  
4. One time evaluator (µs)  
5. One render contract (preview ≡ export semantics)  
6. One command/history path  
7. One TaskManager for async work  
8. One observability model (no media in telemetry)

## A.4 Locked forks (previously open)

| Topic | Locked default |
|---|---|
| Enhanced / upscale | **Alternate source asset** on the same raster layer (A/B). Explicit second layer only if user creates it. Never auto-draw full-res underlay under opaque source. |
| GPU path (P0–P7) | **Canvas-first optimized** (OffscreenCanvas worker, dirty caches, viewport preview). Real GPU graph only after profiling + parity tests (P1+). Remove misleading Pixi-as-GPU claim. |
| Encode authority | **Server `/api/export` is production encode.** Client encoder = offline degraded. Golden tests compare **pre-quantize RGBA** from shared evaluator; palette step may be server-only. |
| GIF sample policy | Output samples at **frame start** of each project frame interval. |
| Imported GIF delays | Preserve exactly in asset metadata; map into project time via cumulative timestamp table. |
| Animated cutout default | **Static snapshot** from selected frame; warn that source animation is not preserved. Tracked/batch = later phases. |
| New cutout motion default | **`None`** (not Float). |
| Pixelate vs redact | **Pixelate** = visual mosaic layer. **Redact** = opaque secure fill, last visual pass, flattened in export. |
| Detect engines | Pick **one** path: SAM3 **or** DINO+SAM2 **or** YOLO(+SAM2). Never stack. |
| GrabCut vs rembg | Explicit user/method choice; **no silent fallback**. |
| Caps | Soft complexity warnings preferred; hard safety: upload 20 MB / edge 5000 px; upscale refuse >5k edge or >20 GiB peak; AI concurrent default 1; free RAM floor 3 GiB. Text/motion soft warn beyond 5 text / 3 liquify clips. |
| Schema | Target **`schemaVersion: 2`**; migrate V1 → V2 with backup; V2 is only writable model after Phase 1. |
| Migration style | **Strangler**, no big-bang rewrite; no dual-write of old+new layer arrays. |
| Feature freeze | No new model families / effect types / export formats until Phases 0–7 gates pass. |

## A.5 Preview ≡ export must-match vs may-differ

**Must match:** time mapping, layer order, transform order, track evaluation, masks/effects order, text layout inputs, GIF frame selection, redaction order, deterministic seeds.

**May differ:** preview resolution (viewport), draft-quality effect approximations during drag (UI must label draft), final encode palette/dither path when using server encoder.

**Final Preview mode** uses the export contract at full project resolution (may still stream encode on server).

## A.6 State ownership (release-blocking)

| State | Owner | Persisted |
|---|---|---:|
| Project document | `ProjectStore` | Yes |
| Editor session | `EditorSessionStore` | No |
| Environment/capabilities | `EnvironmentStore` | No |
| Runtime assets | `RuntimeAssetRegistry` | No |
| Long operations | `TaskManager` | Metadata only |
| Playback clock | `PlaybackController` | No |

Runtime cache may be deleted anytime without changing project meaning.

## A.7 Dependency direction

```text
React UI → application services → domain (pure)
Infrastructure adapters implement ports ← domain interfaces
Renderer reads RenderPlan + assets; never mutates project
UI never calls raw AI/export endpoints (goes through TaskManager / ExportService)
```

## A.8 Current readiness

| Verdict | Score |
|---|---|
| Prototype feature coverage | Strong (~8/10) |
| Production foundations | Weak (~4.6–4.8/10) |

Ship production label only after Part G release gates.

## A.9 Non-negotiable engineering rules

- No Canvas / ImageBitmap / blob URLs / model sessions in durable project JSON  
- No ambient `Math.random()` or wall-clock inside frame evaluation  
- No silent AI model fallback  
- No pixelation marketed as secure redaction  
- No logging of media, masks, prompts, filenames, text-layer contents, or raw exceptions  
- All persistent edits via commands  
- All long ops: cancellation + `finally` disposal + stale-revision checks  
- ADR for every irreversible decision  

---

# Part B — Target system architecture

## B.1 System diagram

```text
┌──────────────────────────────────────────────────────────────────┐
│  Browser — Vite + React 18                                       │
│  Workspaces → Editor UI → Preview surface                        │
│       │              │                                           │
│       ▼              ▼                                           │
│  CommandService / ProjectStore / EditorSession                   │
│  SceneEvaluator + RenderCore → PreviewRuntime / ExportRuntime    │
│  AssetRegistry (bounded) · TaskManager · AiClient · ExportClient │
└───────────────────────────────┬──────────────────────────────────┘
                                │ HTTP /api/*
                                ▼
┌──────────────────────────────────────────────────────────────────┐
│  Python FastAPI (`gif_studio`)                                   │
│  security_limits · resource_guard · jobs                         │
│  /api/health · /api/segment · /api/ai/* · /api/export · projects │
│  AI runners (CUDA if present else CPU) · unload + empty_cache    │
└──────────────────────────────────────────────────────────────────┘
```

## B.2 Target module layout

```text
src/domain/          project, layers, timeline, effects, errors
src/application/     commands, editor-session, projects, tasks, ai, export, telemetry
src/runtime/         assets, playback, workers, capabilities
src/render/          scene-evaluator, canvas2d, preview, export
src/media/gif|image  decode, disposal, time-map, caches
src/infrastructure/  api client, persistence, telemetry adapters
src/context/         studio-root-provider (thin), legacy adapter
schemas/             project-v2.schema.json, api/
docs/adr/            architecture decision records
docs/production-refactor/  BASELINE.md, STATUS.md
```

`studio-provider.jsx` (~3.3k LOC today) becomes a **thin composition root**, not the product brain.

## B.3 Workspaces

| Route | Workspace | Chrome |
|---|---|---|
| `/gif/ai` | AI | Layer |
| `/gif/motion` | Motion | Layer |
| `/gif/edit` | Effects | Layer |
| `/gif/text` | Text | Layer |
| `/gif/timeline` | Timeline | Focus |
| `/gif/scale` | Scale | Focus |
| `/gif/output` | Export | Focus |

## B.4 Canonical data contracts (V2)

### Project

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

### Assets

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

### Layers

```ts
type VisualLayerCommon = {
  id: LayerId; name: string; visible: boolean; locked: boolean;
  opacity: number; blendMode: BlendMode; transform: Transform2D;
  effects: EffectNode[]; animationTrackIds: TrackId[];
};

type Layer =
  | (VisualLayerCommon & { type: "raster"; assetId: AssetId; maskAssetId?: AssetId;
      mediaMapping?: MediaTimeMapping; pose?: PoseBinding;
      variants?: { originalAssetId: AssetId; enhancedAssetId?: AssetId; active: "original" | "enhanced" } })
  | (VisualLayerCommon & { type: "text"; text: string; style: TextStyle; fontAssetId?: AssetId })
  | (VisualLayerCommon & { type: "group"; childIds: LayerId[] })
  | (VisualLayerCommon & { type: "adjustment"; scope: "below" | "group" })
  | (VisualLayerCommon & { type: "pixelate"; region: Shape; pixelSize: number })
  | { id: LayerId; type: "redaction"; name: string; visible: boolean; locked: boolean;
      region: Shape; fill: string; secure: true };
```

### Timeline

- Canonical time: **integer microseconds**
- `loopMode`: `once | loop | ping-pong`
- Tracks: `absolute | additive | multiply` + keyframes + modifiers
- Evaluation order: loop map → source frame → static props → preset tracks → user tracks → parallax → pose warp → per-layer effects → composite → global effects → **redaction last** → export color/palette
- `Random`: `hash(projectSeed, clipId, frameIndex)`

### Tool state machine

Discriminated union (`move`, `select-rect`, `select-lasso`, `select-polygon`, `mask-brush`, `pixelate`, `redact`) — illegal boolean combos unrepresentable.

### Commands / tasks / errors

- Commands: execute → `{ document, inverse, assetRefDelta }`
- Tasks: queued/running/succeeded/failed/cancelled/stale + `sourceRevision` + AbortSignal
- Typed errors: `UNSUPPORTED_FORMAT`, `INVALID_MEDIA`, `DECODE_LIMIT_EXCEEDED`, `PROJECT_VALIDATION_FAILED`, `PROJECT_MIGRATION_FAILED`, `ASSET_MISSING`, `FONT_MISSING`, `MODEL_UNAVAILABLE`, `MODEL_OUT_OF_MEMORY`, `TASK_CANCELLED`, `STALE_RESULT_DISCARDED`, `EXPORT_MEMORY_BUDGET_EXCEEDED`, `ENCODER_UNAVAILABLE`, `EXPORT_RENDER_FAILED`, `EXPORT_ENCODE_FAILED`, `UNAUTHORIZED`, `RATE_LIMITED`, `INTERNAL_ERROR`

## B.5 Draw / composition (production)

Authoritative order = **document layer order** (not fixed type buckets).

Legacy prototype stack (V1, migrate away): Enhanced underlay → Background → Elements → Overlays → Text → Censor → GIF effects → Pose skeleton (preview).

## B.6 Performance budgets (initial)

| Metric | Target |
|---|---|
| Interactive preview frame time | p95 ≤ 33 ms (reference tier) |
| Dropped preview frames | < 5% over 30 s reference |
| Main-thread long tasks (steady play) | no repeated > 100 ms |
| Decode cache | bounded by budget; never by frame count alone |
| Browser task cancel ack | ≤ 250 ms cooperative |
| Open/close leak | no monotonic retained growth |

## B.7 Security & limits (backend)

| Rule | Value |
|---|---|
| AI upload formats | PNG, JPG, WEBP (magic+PIL + client validate) |
| Max size / edge | 20 MB · 5000 px |
| Upscale refuse | output > 5k or peak > 20 GiB |
| Device | CUDA → else CPU; `GIF_STUDIO_TORCH_DEVICE` |
| Concurrent AI | default 1 |
| Rate limits | AI 8/min, heavy 3/min, export 12/min, POST 60/min |
| Proxy | `GIF_STUDIO_TRUST_PROXY=1` for X-Forwarded-For |
| Free RAM floor | 3 GiB default before heavy job |
| After job | unload model caches + torch empty_cache |

## B.8 Prototype debt (do not copy)

- `StudioProvider` god object  
- Runtime bitmaps on layer entities  
- Split `elements[]` / `overlays[]` / `textLayers[]`  
- Multiple preview/export pipelines  
- Pixi final blit called “GPU renderer”  
- Unbounded GIF frame canvases  
- Missing undo/commands/migrations/telemetry/a11y  

---


---

# Part C — Product reference — image processing, selection, layers, motion, settings, workflows

> Source file preserved in full: `STUDIO_IMAGE_PROCESSING.md`

Full reference for how the studio handles **image processing**, **cutting / selecting / moving**, **layers**, **properties**, **settings**, **motion / animation**, **AI models**, and **content fill**.

Related docs: [AI_GIF_STACK.md](./AI_GIF_STACK.md) · [BUILD_SPEC.md](../BUILD_SPEC.md)

---

## 1. Architecture overview

```
Import (image / GIF)
        │
        ▼
┌───────────────────┐     optional      ┌──────────────────┐
│  Source / frames  │ ───────────────► │ Enhanced underlay │ (upscale)
└─────────┬─────────┘                   └────────┬─────────┘
          │                                      │
          ▼                                      ▼
   Selection / AI cutout ──► Element layers (+ mask, cleanup)
          │
          ▼
   Draw loop (Canvas 2D): transforms · effects · text · overlays · censor
          │
          ├─► Optional Pixi WebGL blit (preview)
          └─► Export (GIF / PNG / MP4)
```

| Layer | Role |
|-------|------|
| **Zustand** `src/store/studio-store.js` | UI/tools state, capabilities, selection |
| **Project document** `src/lib/project-document.js` | Serializable project (edits, parallax, censor) |
| **StudioProvider** `src/context/studio-provider.jsx` | Draw loop, extract, AI runners, transforms |
| **Python API** `src/gif_studio/web_api.py` + `ai_pipeline.py` | Segment, matte, depth, inpaint, upscale, interpolate |

### Workspaces (tab order)

| Route | Workspace | Focus |
|-------|-----------|--------|
| `/gif/ai` | AI | Detect, matte, depth, pose, interpolate |
| `/gif/motion` | Motion | Base motion presets, overlays |
| `/gif/edit` | Effects | Filters, distortion, frames, image edits |
| `/gif/text` | Text | Text layers + entrance/loop/exit |
| `/gif/timeline` | Timeline | Motion-effect clips, keyframes, text in/out |
| `/gif/scale` | Scale | Upscale → Enhanced layer |
| `/gif/output` | Output | Encode GIF / compress / MP4 |

---

## 2. Draw stack (bottom → top)

1. **Enhanced underlay** — upscaled copy; never replaces source  
2. **Background (source)** — main image or GIF frame  
3. **Elements** — cutouts / smart selections (reorderable)  
4. **Overlays** — extra images  
5. **Text** — up to 5 layers  
6. **Censor** — pixelate region  
7. **GIF effects / decorative frames** — whole-output or targeted  
8. **Pose skeleton** — preview only (not exported as overlay art)

---

## 3. Selecting, cutting, moving

### 3.1 Selection tools

| Tool | Store / UI | Behavior |
|------|------------|----------|
| **Move** | `selectMode = false` | Select and transform layers on stage |
| **Rectangle** | `selectionTool: 'Rectangle'` | Drag box → local extract (same as lasso; not API) |
| **Freehand Lasso** | `'Freehand Lasso'` | Continuous path → mask |
| **Polygonal Lasso** | `'Polygonal Lasso'` | Click anchors → Complete / Enter |
| **Pen Path** | `'Pen Path'` | Quadratic-smooth closed path |
| **Mask / Erase** | `maskEditing` + `maskBrush` | Paint alpha on a cutout |
| **Censor** | `censorSelecting` | Drag pixelate box |
| **SAM2 click** | Select aside / tools | Point-prompt cutout |
| **Human segment** | MediaPipe | Person mask → Human layer |
| **Text / class detect** | Select-detect aside | SAM3 / DINO+SAM2 / YOLO |
| **Select subject / Remove BG** | Contextual task bar | Soft matte or GrabCut |

**Key files:** `layout/tools-rail.jsx`, `layout/select-detect-aside.jsx`, `components/studio/contextual-task-bar.jsx`, extract helpers in `studio-provider.jsx`.

### 3.2 Extract (cut) pipeline

1. User draws a selection (or runs AI segment/matte).  
2. **Tools (Rectangle / Lasso / Pen)** always use **local extract** (`extractElementLocal`): color-key vs border background + path mask; edge tolerance softens alpha.  
3. **API extract** (`/api/segment`): rembg or OpenCV GrabCut — used by Select Subject / Remove BG / Matte (`runMatteCutout` / `extractElement`), not by the marquee tools.  
4. New **Element** layer is created with:
   - `bitmap` / `sourceBitmap` / `maskCanvas`
   - optional `cleanup` canvas (hole fill under cutout for preview)
   - default `effects`, motion (`Float`), depth, opacity, anchors  
5. Base source stays intact by default (`updateBackground` optional on server).

**Edge tolerance** (`tools.extractTolerance`, default `42`, typical range 5–120): distance from background sample used to punch transparency and feather edges.

### 3.3 Moving & transforming

| Action | Applies to | Notes |
|--------|------------|--------|
| Drag on stage | Element / overlay / text / base | Position as % of canvas |
| Scale / rotate | Inspector Transform + stage handles | Pivot = `anchorX` / `anchorY` (0–100%) |
| Flip X / Y | Tools rail / inspector | `imageEdits` for base, or element flags |
| Rotate ±90° | Tools | Updates rotation on selection |
| Lock / visibility | Layers aside | Locked items ignore transform |

Base image also uses timeline transforms: `scaleStart/End`, `rotateStart/End`, `xStart/End`, `yStart/End`, `opacityStart/End`.

### 3.4 Mask paint (refine cutouts)

| Brush param | Default | Role |
|-------------|---------|------|
| `mode` | Hide | Hide (erase) or Reveal |
| `size` | 48 | Brush diameter (UI space) |
| `hardness` | 70 | Soft vs hard falloff |
| `opacity` | 100 | Stroke strength |
| `feather` | 8 | Blur after stroke |

Also: invert mask, reset mask, feather mask, trim transparent bounds.

---

## 4. Layers

### 4.1 Layer types

| Type | Store field | Created by | Typical props |
|------|-------------|------------|---------------|
| **Artboard** | `settings.width/height` | Project | Fit, lock aspect |
| **Background** | source image / GIF pack | Import | Fit, imageEdits, motion presets |
| **Enhanced** | `enhancedLayer` | Scale / upscale | Fit, download PNG; drawn under source |
| **Element** | `elements[]` | Extract / AI | bitmap, mask, cleanup, effects, motion, depth, poseJoints |
| **Overlay** | `overlays[]` | Add image | transform, opacity, effects |
| **Text** | `textLayers[]` (max **5**) | Text workspace | Typography + entrance/loop/exit + in/out |

**UI:** `layout/layers-aside.jsx` — drag reorder, insert front/back (`layerInsertAt`).

### 4.2 Element properties (cutout)

| Property | Meaning |
|----------|---------|
| `x, y, w, h` | Bounding box on canvas (%) |
| `rotation`, `scaleX/Y`, `flipX/Y`, `opacity` | Transform |
| `anchorX/Y` | Pivot for scale/rotate |
| `motion`, `amplitude`, `speed` | Loop motion (incl. Pose sway) |
| `depth` | Parallax contribution (0–100) |
| `effects` | Per-layer pixel effects |
| `maskCanvas` | Soft alpha refine |
| `cleanup` | Hole-fill underlay when cutout moves |
| `poseJoints` | MediaPipe joints for Body cutouts |
| `engine`, `smart` | How the cutout was produced |
| `visible`, `locked` | Layer chrome |

### 4.3 Parallax

`PARALLAX_DEFAULT` + Depth AI:

| Setting | Options / role |
|---------|----------------|
| enabled | On/off |
| mode | Horizontal / Vertical / Diagonal / Orbit |
| strength | Travel amount |
| speed | Animation rate |
| per-layer `depth` | How much that layer moves |

Depth map from **Depth Anything V2** (`POST /api/ai/depth`) feeds richer parallax.

---

## 5. Image processing & effects

### 5.1 Quick base adjustments (`imageEdits`)

Applied on the background source:

- Brightness / contrast / saturation (0–300%)  
- Hue (±180)  
- Blur, grayscale, sepia  
- Flip X / Y  

### 5.2 GIF / layer effects (`EFFECT_DEFAULTS`)

Target: **Entire GIF** · **Selected element** · **Selected overlay** (`tools.effectTarget`).

| Group | Controls |
|-------|----------|
| Tone | hue, saturation, lightness, brightness, contrast |
| Look presets | None, Grayscale, Sepia, Monochrome, Gotham, Lomo, Nashville, Toaster, Vignette, Polaroid |
| Color | invert, tint + tintColor |
| Transparency key | transparentEnabled, transparentColor, fuzz, edgeCleanup |
| Detail | blur, sharpen, oilPaint, emboss, posterize, solarize, noise |
| Dither | None / Ordered / Error diffusion |
| Distortion | type + amount + center X/Y + radius + push angle |
| Frame | None, Camera, Fuzzy, Rounded, Solid (+ color, width, rounded) |

**Pipeline:** `src/lib/effects.js` — Canvas 2D (`applyPixelEffects`, `applyDistortion`, convolutions). OpenCV filters (`engine/opencv-filters.js`) exist for probe/offline use but are **skipped on the hot playback path**.

### 5.3 Static distortion types

`None` · `Bloat` · `Pucker` · `Twirl` · `Push` · `Swirl` · `Implode` · `Wave`

### 5.4 Censor / pixelate

Region `x/y/w/h` (%), `pixelSize` 2–100 — downscale then upscale mosaic over the box.

### 5.5 Crop / cut vs content-aware fill

| Operation | What happens |
|-----------|--------------|
| Extract cutout | New floating layer; base usually unchanged |
| Local hole fill | Edge-sample cleanup bitmap under the cutout (preview) |
| Server hole fill | Telea + Navier-Stokes blend when background update requested |
| LaMa / OpenCV inpaint | `POST /api/ai/inpaint` — API ready; primary erase→fill UI is limited |
| Generative diffusion fill | **Not implemented** (no SD/Flux-style fill) |

---

## 6. Animation & motion

### 6.1 Base motion presets

Defined in `src/lib/presets.js` → `PRESETS` / `transformsFromAmount(preset, amount)`.

| Preset | Behavior |
|--------|----------|
| Still | No motion |
| Zoom in / Zoom out | Scale start→end from Amount |
| Ken Burns | Zoom + pan + ping-pong |
| Spin & zoom | Scale + rotate + opacity + ping-pong |
| Fade in | Opacity 0→100 |
| Float / Drift / Bounce / Pulse / Spin / Wobble / Orbit | Looping sin/cos motions driven by amplitude + speed |

**Global motion knobs:** Amount (amplitude), Speed, Duration, FPS, Easing, Anchor X/Y, Ping-pong (where preset sets it).

**Easing options:** Linear · Ease in · Ease out · Ease in-out · Smoothstep · Spring.

### 6.2 Timed motion-effect clips (liquify timeline)

`src/lib/motion-effects.js` — max **3** clips (`MAX_MOTION_EFFECTS`).

| Clip type | Role |
|-----------|------|
| Bloat, Pucker, Twirl, Push, Swirl, Wave | Soft liquify over time |
| Zoom | Multiplies base scale envelope |

**Per clip:** in/out (seconds), amount, radius, x/y, angle, fadeIn/fadeOut %, cycles, **animate mode**.

**Animate modes:** Hold · Left→Right · Right→Left · Top→Bottom · Bottom→Top · Orbit · Pulse · Random · Spin.

Locked **base-motion lane** (`BASE_MOTION_ID`) mirrors the Motion dropdown (display-only; not stored in `motionEffects[]`).

### 6.3 Layer & text motion

| Scope | Options |
|-------|---------|
| Element loop | None, Float, Drift, Bounce, Pulse, Spin, Wobble, Orbit, **Pose sway** |
| Text entrance | None, Fade, Slide up/down, Scale in, Typewriter (+ more on Text page) |
| Text loop | None, Float, Pulse, Wobble (+ amplitude/speed) |
| Text exit | None, Fade, Slide up/down, Scale out |
| Text window | `in` / `out` seconds (clamped to duration) |

### 6.4 Property keyframes

`src/lib/keyframes.js` + Timeline UI — tracks **opacity**, **scale**, **x**, **y**. Linear interpolation overrides base motion channels during draw.

### 6.5 Playback engines

| Engine | File | Role |
|--------|------|------|
| GSAP timeline | `engine/gsap-playback.js` | Progress 0–1 clock |
| GIF frame pack | `engine/gif-decode.js` | gifuct-js → per-frame canvases; scrub by delay |
| Pixi preview | `engine/pixi-renderer.js` | Optional GPU blit of composite canvas |
| RIFE | `ai/rife.js` → `/api/ai/interpolate` | Densify GIF frames (factor 2+) |

---

## 7. AI models

Product rule: AI **assists** selection, matte, depth, interpolate, upscale — it does **not** replace the animator or GIF encoder. See [AI_GIF_STACK.md](./AI_GIF_STACK.md).

### 7.1 Browser (client)

| Model / lib | Entry | Use |
|-------------|-------|-----|
| MediaPipe selfie segmenter | `ai/mediapipe.js` | Human layer mask |
| MediaPipe pose landmarker | same | 33 joints; optional body mask; Pose sway / joint keys |
| ONNX Runtime | `ai/onnx.js` | Shared WASM sessions |
| SAM2 ONNX (optional) | `ai/sam2.js` | Local segment if `VITE_SAM2_*` set; else API |
| RealESRGAN ONNX (optional) | `ai/realesrgan.js` | Local upscale if env set; else API |

### 7.2 Server (FastAPI)

| Endpoint | Engine | Purpose |
|----------|--------|---------|
| `POST /api/segment` | rembg / GrabCut + Telea/NS | Classic smart cutout |
| `POST /api/ai/segment` | SAM2 / SAM3 | Point / box segment |
| `POST /api/ai/detect` | SAM3 · Grounding DINO+SAM2 · YOLO(+SAM2) | Text / COCO detect → mask |
| `POST /api/ai/matte` | BiRefNet, RMBG-2.0, rembg-isnet | Soft alpha matte |
| `POST /api/ai/depth` | Depth Anything V2 | Depth → parallax |
| `POST /api/ai/inpaint` | LaMa or OpenCV Telea+NS | Content-aware hole fill |
| `POST /api/ai/upscale` | RealESRGAN family (+ GFPGAN slot) | Enhanced layer |
| `POST /api/ai/interpolate` | RIFE (+ FILM slot) | Frame interpolation |

### 7.3 Model catalog (pickers)

| Family | Variants |
|--------|----------|
| SAM2 | tiny / small / base+ / large |
| SAM3 | sam3, sam3.1 (HF access) |
| Grounding DINO | swint_ogc, swinb_cogcoor |
| YOLO | yolov8n/s/m, yolo11n |
| Matte | birefnet, rmbg-2.0, rembg-isnet (+ GrabCut UI) |
| Depth | depth-anything-v2-small |
| Inpaint | lama, opencv-telea |
| Interpolate | rife, film (slot) |
| Upscale | bicubic, esrgan, realesrgan, realesrgan-x2, a-esrgan, gfpgan |

**Cutout model default (UI):** `birefnet`.

### 7.4 Capability flags

Client `capabilities` (and `/api/health`): `opencv`, `pixi`, `ffmpeg`, `onnx`, `mediapipe`, `sam2`, `sam3`, `groundingDino`, `yolo`, `matte`, `depth`, `lama`, `inpaint`, `film`, `gfpgan`, `realesrgan`, `rife`, `rembg`, plus `api` / `device` / `models`.

`inpaint` defaults true (OpenCV fallback even without LaMa weights).

### 7.5 Limits (server)

- Uploads: PNG / JPG / WEBP · max ~20 MB · max edge 5000 px  
- Upscale refuse if output > 5k or estimated peak RAM > 20 GiB  
- Device: CUDA if present, else CPU (`GIF_STUDIO_TORCH_DEVICE`)  
- Rate limits / concurrency: `security_limits.py`

---

## 8. Content fill (inpaint)

| Path | Status | Notes |
|------|--------|-------|
| Cutout cleanup underlay | Active | Local edge sample or server Telea/NS; hides hole while cutout moves |
| `/api/ai/inpaint` + `ai/inpaint.js` | Backend ready | LaMa preferred; OpenCV fallback |
| Dedicated erase → generative fill UI | Limited / not primary | No diffusion generative fill |
| Optional rewrite of base after cutout | Server flag | Default leaves background unchanged |

**Recommended mental model:** cutout = new layer; fill = optional cleanup under that layer or explicit inpaint — not “delete forever without a layer.”

---

## 9. Properties & settings reference

### 9.1 Project `settings` (`INITIAL` in `presets.js`)

| Key | Default | Description |
|-----|---------|-------------|
| `preset` | Still | Active motion preset name |
| `duration` | 10 | Timeline length (seconds) |
| `fps` | 24 | Frames per second |
| `easing` | Ease in-out | Timeline easing |
| `width` / `height` | 480 × 300 | Artboard |
| `fit` | Contain | Contain / Cover / Stretch / Original size |
| `background` | `#111114` | Solid BG color |
| `transparent` | false | Transparent GIF BG |
| `quality` | High quality | Profile name |
| `palette` | 256 | Color count |
| `dither` | true | Encoding dither |
| `lossy` | 0 | Lossy LZW strength |
| `compressionMethod` | Lossless | Lossless / Lossy LZW |
| `loop` | 0 | GIF loop (0 = forever) |
| `disposal` | 2 | Frame disposal method |
| `motion` | None | Loop motion name |
| `speed` | 1 | Motion speed |
| `amplitude` / `cycles` | from preset | Loop strength / cycles |
| `anchorX` / `anchorY` | 50 / 50 | Transform pivot (%) |
| `motionEffects` | [] | Timed liquify/zoom clips |
| `scaleStart/End` … `opacityStart/End` | from preset | One-shot channels |
| `pingPong` | from preset | Fold timeline |

### 9.2 Quality profiles (`QUALITY_PROFILE_MAP`)

| Profile | palette | dither | lossy | compression |
|---------|---------|--------|-------|-------------|
| Low / small | 64 | false | 80 | Lossy LZW |
| Balanced | 128 | true | 30 | Lossy LZW |
| High quality | 256 | true | 0 | Lossless |
| Custom | user | user | user | user |

### 9.3 Tools state (`studio-store` tools)

| Key | Default | Role |
|-----|---------|------|
| `selectMode` | — | Selection vs move |
| `selectionTool` | Rectangle etc. | Active marquee/lasso |
| `selection` / `selectionPoints` | — | Live geometry |
| `extractTolerance` | 42 | Cut edge softness |
| `maskEditing` | false | Mask brush mode |
| `maskBrush` | Hide / 48 / 70 / 100 / 8 | Brush params |
| `censorSelecting` | false | Censor drag |
| `effectTarget` | Entire GIF | Where effects apply |
| `cutoutModel` | birefnet | Matte / cutout engine |

### 9.4 Text layer defaults (`TEXT_DEFAULT`)

Typography: font, size, weight, italic, align, color, stroke, letterSpacing, lineHeight, decoration, casing, blendMode, shadow.  
Transform: x/y (%), rotation, scaleX/Y, flip, opacity.  
Animation: entrance, entranceDuration, motion, exit, exitDuration, amplitude, speed, in/out.

### 9.5 Pose / joints

- 33 MediaPipe landmarks  
- Joint keyframes (`jointKeys` start/end dx/dy) + IDW mesh warp (`lib/pose-warp.js`)  
- Drive motion from skeleton for Body cutouts  

---

## 10. Import & export

| Feature | Module | Notes |
|---------|--------|-------|
| Animated GIF import | `engine/gif-decode.js` | gifuct-js → composited frame canvases |
| PNG snapshot | Effects panel | Current canvas; optional 8-bit via API |
| GIF encode | Python engine + gifsicle / client paths | Palette, dither, disposal |
| Compress GIF | Output page | Existing GIF recompress |
| GIF → MP4 | `engine/ffmpeg-export.js` | ffmpeg.wasm |
| Enhanced PNG download | Scale page | Upscaled underlay only |

---

## 11. Typical workflows

### Select object → move → animate

1. Tools → Rectangle / Lasso / SAM2 click / Select subject.  
2. Extract creates an **Element** layer.  
3. Move/scale on stage; set layer motion (Float, Orbit, Pose sway…).  
4. Optional: Mask/Erase to refine alpha; Effects on selected element.  
5. Timeline: add liquify clips or property keyframes.  
6. Output: encode GIF.

### Remove background / soft edges

1. Contextual bar → Remove BG / Matte (BiRefNet etc.).  
2. Or API segment with rembg / GrabCut.  
3. Enable transparent background on Output if needed.

### Depth parallax Ken Burns

1. AI → Depth for parallax.  
2. Set parallax mode/strength; assign layer depths.  
3. Combine with Ken Burns or Orbit base preset.

### Upscale then animate

1. Scale → RealESRGAN (2×/3×/4×) → Enhanced layer.  
2. Keep Enhanced under source or match artboard.  
3. Apply motion on Motion / Timeline tabs.

### Fill hole after cutout

1. Extract cutout (cleanup underlay appears for preview).  
2. If base rewrite needed, use server segment with background update / inpaint API.  
3. Generative fill is out of scope today — use LaMa/OpenCV for classical fill.

---

## 12. Key source map

| Area | Paths |
|------|-------|
| Draw / extract / AI actions | `src/context/studio-provider.jsx` |
| Store / tools | `src/store/studio-store.js` |
| Effects | `src/lib/effects.js`, `components/studio/effects-panel.jsx` |
| Presets & defaults | `src/lib/presets.js` |
| Catalogs | `src/lib/catalogs.js` |
| Motion clips | `src/lib/motion-effects.js` |
| Keyframes | `src/lib/keyframes.js`, `src/timeline/keyframe-timeline.jsx` |
| Pose | `src/lib/pose.js`, `src/lib/pose-warp.js` |
| Client AI | `src/ai/*` |
| Server AI | `src/gif_studio/ai/*`, `ai_pipeline.py` |
| Layers UI | `src/layout/layers-aside.jsx` |
| Tools / select | `src/layout/tools-rail.jsx`, `select-detect-aside.jsx` |
| Inspector | `src/layout/inspector-aside.jsx` |
| Preview | `src/layout/preview-stage.jsx` |

---

## 13. Gaps & notes

1. **Inpaint UI** — API exists; not a full first-class erase→fill workspace yet.  
2. **No generative (diffusion) fill** — classical LaMa/OpenCV only.  
3. **FILM / GFPGAN** — catalog slots; weights/wiring may be incomplete.  
4. **OpenCV in playback** — intentionally bypassed for performance (Canvas path wins).  
5. **Long GIFs** — full per-frame canvas cache in RAM; large imports can be heavy.  
6. **Detect path** — prefer one stack (SAM3 **or** DINO+SAM2 **or** YOLO); do not stack all.

---

*Generated from the gif-studio codebase (web UI + Python AI API). Update this doc when workspaces or model catalogs change.*

---

# Part D — AI reality-check stack

> Source file preserved in full: `AI_GIF_STACK.md`

**Purpose:** Map which jobs use ML vs stay classical, and how the AI tab jobs wire to APIs/models.

**Date:** 2026-07-18

---

## Product rule

| Keep non-ML (core product) | AI assists only |
|----------------------------|-----------------|
| Konva select / drag / transform / layers / BG | Smart select → layer |
| Motion presets, keyframes, easing, timeline | Depth parallax, RIFE fps |
| Canvas size, fps, duration, fit | Upscale, smart crop |
| Palette / dither / gifsicle GIF encode | Better masks before export |

AI never replaces the animator or GIF encoder.

### Server upload + device (Python only)

| Rule | Value |
|------|--------|
| Formats | PNG, JPG, WEBP only (backend magic+PIL + frontend accept/validate) |
| Max size | 20 MB · max edge 5000 px |
| Upscale | Refuse output > 5k or estimated peak > 20 GiB |
| Device | NVIDIA CUDA if present → else CPU / system RAM |
| Override | `GIF_STUDIO_TORCH_DEVICE=cpu\|cuda\|mps` |
| Rate limit | Backend only (`security_limits.py`) — per-IP windows + AI concurrency/cooldowns |
| Concurrency | `GIF_STUDIO_AI_MAX_CONCURRENT` (default `1`) |
| Cooldown | `GIF_STUDIO_AI_COOLDOWN_<ROUTE>` seconds (e.g. `UPSCALE`, `DETECT`) |
| Per-IP | `GIF_STUDIO_RATE_LIMIT_AI=8/minute`, `_HEAVY=3/minute`, `_EXPORT=12/minute`, `_POST=60/minute` |
| Proxy | Set `GIF_STUDIO_TRUST_PROXY=1` behind nginx so `X-Forwarded-For` is used |
| Cutout | `/api/segment` `method=ai` (rembg) or `method=grabcut` (OpenCV) — GrabCut is a UI choice, not a silent fallback |
| Job queue | One heavy job at a time; queue wait; refuse if free RAM below 3 GiB (default); unload model caches after each job + torch empty_cache |

Engines prefer CUDA but are **CPU-ok** unless marked `requires_nvidia` in `/api/health` → `device.engines`. None currently require NVIDIA-only.

---

## When to use which

| Tool | Role | Core strength |
|------|------|---------------|
| **SAM 2** | Interactive click/box select (SAM 3 Tracker later) | Pixel-accurate outlines |
| **SAM 3** | Text/concept detect → mask (**replaces** DINO + SAM2 refine) | One-model open-vocab select |
| **Grounding DINO + SAM2** | Fallback open-vocab until SAM3 is ready | Box detect + SAM2 contour |
| **YOLO (Ultralytics)** | Cheap COCO-class detect (+ optional SAM2 refine) | Closed-set, local `.pt` |
| **BiRefNet / RMBG** | Soft hair/edges for transparent GIFs | Soft alpha matte |
| **Depth Anything V2** | Richer parallax Ken Burns | Monocular depth |
| **LaMa / OpenCV** | Clean hole after cutout | Inpaint |
| **RIFE** (FILM slot) | Smoother fps from few frames | Interpolation |
| **Real-ESRGAN** (GFPGAN slot) | Sharper sources before export | Upscale / face polish |

Do **not** stack SAM3 on top of Grounding DINO + SAM2. Pick one detect path.

---

## Feature matrix (UI → API → model → export)

| UI job | API | Models (picker) | Export impact |
|--------|-----|-----------------|---------------|
| Click/box segment | `POST /api/ai/segment` | SAM2.1 (Tracker later) | Clean subject layer |
| Text / class detect | `POST /api/ai/detect` | `sam3` \| `grounding_dino`+SAM2 \| `yolo`+SAM2 | Text select without drawing |
| Soft matte | `POST /api/ai/matte` | BiRefNet, RMBG-2.0, rembg isnet | Better GIF transparency |
| Erase / fill hole | `POST /api/ai/inpaint` | LaMa, OpenCV Telea | Clean BG after cutout |
| Depth for motion | `POST /api/ai/depth` | Depth Anything V2 Small | Richer parallax |
| Interpolate | `POST /api/ai/interpolate` | RIFE (live), FILM (slot) | Smoother fps |
| Upscale | `POST /api/ai/upscale` | RealESRGAN family, GFPGAN (slot) | Sharper before export |

---

## AI tab sections

1. **Select** — SAM2 interactive segment; detect engine (SAM3 / DINO+SAM2 / YOLO); soft matte; human  

2. **Layers & BG** — cutout + clean BG, inpaint under selected layer  
3. **Motion AI** — depth → parallax, interpolate, body/joints  
4. **Enhance** — upscale  

Layer contract: mask → cutout layer → transform cube selected. Optional inpaint updates the base image only.

---

## Source map

| Area | Path |
|------|------|
| Catalog | `src/gif_studio/ai/local_models.py` |
| Pipeline | `src/gif_studio/ai_pipeline.py` |
| Runners | `src/gif_studio/ai/*_runner.py` |
| HTTP | `src/gif_studio/web_api.py` |
| UI | `src/components/studio/ai-tools-panel.jsx` |
| Clients | `src/ai/*.js` |
| Setup | `scripts/setup_ai_models.py` |

---

## Shortlist status

| Model | Status |
|-------|--------|
| SAM2 + DINO + YOLO + RIFE + RealESRGAN | Live |
| BiRefNet / RMBG / rembg matte | Live via rembg |
| Depth Anything V2 Small | Live when `models/depth/v2-small-hf` present |
| LaMa | Weights optional; OpenCV fallback always |
| SAM3 | Detect engine (text→mask); gated Hub — `python scripts/setup_ai_models.py --with-sam3` |
| FILM / GFPGAN | Catalog slots only |

---

# Part E — Senior architecture review (findings & required improvements)

> Source file preserved in full: `GIF_STUDIO_SENIOR_ARCHITECTURE_REVIEW.md`

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

---

# Part F — Critical senior engineering review

> Source file preserved in full: `GIF_STUDIO_CRITICAL_SENIOR_REVIEW.md`

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

---

# Part G — Executable production build plan (phases 0–14, tests, CI, release gates)

> Source file preserved in full: `GIF_STUDIO_CURSOR_PRODUCTION_BUILD_PLAN.md`

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


---

# Part H — Master glossary & maintenance

| Term | Meaning |
|---|---|
| Source asset | Immutable imported media |
| Raster layer | Visual layer referencing assets + optional mask |
| Cutout | Raster layer from selection/AI mask |
| Enhanced variant | Upscaled alternate asset on a layer (A/B) |
| Preset motion | Starting transform envelope |
| Motion clip | Timed liquify/zoom on timeline |
| Keyframe track | Explicit property animation |
| Pixelate | Visual mosaic (not privacy) |
| Redact | Opaque privacy cover (last pass) |
| Render plan | Backend-neutral draw/effect commands |
| Capability | Environment readiness, not project data |
| Committed AI result | Asset in project; export does not re-run model |
| Strangler migration | Incremental replace; no dual-write |

## Maintenance rules

1. Change **Part A locks** only with an ADR under `docs/adr/`.  
2. Keep Parts C–G content in sync when editing sibling files, or edit this master and regenerate siblings.  
3. Prefer updating invariants and gates over feature laundry lists.  
4. Production label requires Part G release gates green.

---

*End of GIF Studio Complete Senior Production Architecture Manual.*
