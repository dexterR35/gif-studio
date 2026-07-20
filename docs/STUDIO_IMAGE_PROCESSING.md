# GIF Studio — Image Processing, Animation, Selection & Layers

Full reference for how the studio handles **image processing**, **cutting / selecting / moving**, **layers**, **properties**, **settings**, **motion / animation**, **AI models**, and **content fill**.

**Build from:** [GIF_STUDIO_MEGA_SENIOR_BUILD.md](./GIF_STUDIO_MEGA_SENIOR_BUILD.md) · Archive Part C: [COMPLETE_PRODUCTION_MANUAL.md](./GIF_STUDIO_COMPLETE_PRODUCTION_MANUAL.md)

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
