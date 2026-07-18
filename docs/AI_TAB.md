# AI Tab — Porting Guide

Documentation of the GIF Studio **AI** inspector tab: every tool, UI control, API contract, model weight, and “professional” (env / server) knob you need to recreate the same stack in another project.

Primary UI: `src/components/studio/ai-tools-panel.jsx`  
Orchestration: `src/context/studio-provider.jsx`  
Browser clients: `src/ai/*`  
Python runners: `src/gif_studio/ai/*` + `src/gif_studio/ai_pipeline.py`  
HTTP API: `src/gif_studio/web_api.py`  
Weights: `models/` (see `models/README.md`)

---

## Architecture (what to copy)

```
┌─────────────────────┐     FormData / JSON      ┌──────────────────────────┐
│  React AI tab       │ ───────────────────────► │  FastAPI /api/ai/*        │
│  ai-tools-panel.jsx │                          │  web_api.py              │
│  + studio-provider  │ ◄─────────────────────── │  → ai_pipeline.py        │
│  + src/ai/*.js      │   mask / PNG / boxes     │  → ai/*_runner.py        │
└─────────────────────┘                          └────────────┬─────────────┘
                                                              │
                     MediaPipe (browser only)                 │ local weights
                     selfie + pose landmarker                 ▼
                                                     models/{sam2,groundingdino,
                                                             realesrgan,rife}/
```

**Rule of thumb for this repo**

| Path | When used |
|------|-----------|
| Browser MediaPipe | Human segment, body + joints (no Python needed) |
| FastAPI + PyTorch | SAM2, Grounding DINO, Real-ESRGAN, RIFE |
| Optional browser ONNX | Only if `VITE_*_ONNX` env vars are set (secondary; server path is primary) |

Default: **local weights only**. Hugging Face Hub at runtime requires `GIF_STUDIO_ALLOW_HF=1`.

Device order: **CUDA → MPS → CPU** (`GIF_STUDIO_TORCH_DEVICE` override).

---

## Tab UI (three sections)

### 1. Detect

| Control | Type | Default | What it does |
|---------|------|---------|--------------|
| **SAM2 model** | select | `sam2.1_hiera_tiny` | Checkpoint for point/box segmentation |
| **SAM2 segment → layer** | button | — | Center-point SAM2 → cutout layer |
| **Grounding DINO model** | select | `swint_ogc` (Tiny) | Text detector size |
| **Text prompt** | text | `""` | Open-vocab labels, e.g. `person, logo, product` |
| **Text-guided detect → layer** | button | — | DINO boxes → SAM2 mask → layer (+ erase mode) |
| **Human segment → layer** | button | — | MediaPipe selfie segmenter → layer |

### 2. Body & joints

| Control | Type | Default | What it does |
|---------|------|---------|--------------|
| **Cut out body as layer** | switch | `true` | Also run selfie mask when detecting pose |
| **Show joints in preview** | switch | from rig | Overlay skeleton (preview only; not in GIF/PNG export) |
| **Detect body + joints** | button | — | MediaPipe Pose (+ optional cutout) |
| **Open joint animation** | button | — | Opens joint keyframe panel |

Related panel (not on the AI tab, but part of the same feature):  
`src/components/studio/joint-anim-panel.jsx` — start/end joint offsets (−20%…+20%), mesh warp into the Body layer.

### 3. Enhance

| Control | Type | Default | What it does |
|---------|------|---------|--------------|
| **Upscale model** | select | `realesrgan` | Bicubic / ESRGAN / Real-ESRGAN / anime |
| **Scale** | select | `2` | `2` / `3` / `4` |
| **Upscale N×** | button | — | Replaces the open image with upscaled PNG |
| **Interpolate (RIFE)** | button | — | Needs ≥2 GIF/video frames; inserts mid-frames (`factor=2`) |

Capabilities (which models are `ready`) come from `GET /api/health` → `models.sam2|grounding_dino|upscale`.

---

## Tool deep-dives

### A. SAM2 — segment anything

**Purpose:** Point (and optionally box) prompt → binary mask → studio layer.

| Layer | File |
|-------|------|
| UI | `ai-tools-panel.jsx` → `runSam2Segment` |
| Browser | `src/ai/sam2.js` → `POST /api/ai/segment` |
| Pipeline | `ai_pipeline.segment_sam2` |
| Runner | `ai/sam2_runner.py` |

#### Models

| ID | Label | File | Config (sam2 package) |
|----|-------|------|------------------------|
| `sam2.1_hiera_tiny` | SAM2.1 Tiny | `models/sam2/sam2.1_hiera_tiny.pt` | `configs/sam2.1/sam2.1_hiera_t.yaml` |
| `sam2.1_hiera_small` | SAM2.1 Small | `sam2.1_hiera_small.pt` | `…_s.yaml` |
| `sam2.1_hiera_base_plus` | SAM2.1 Base+ | `sam2.1_hiera_base_plus.pt` | `…_b+.yaml` |
| `sam2.1_hiera_large` | SAM2.1 Large | `sam2.1_hiera_large.pt` | `…_l.yaml` |

Larger = better edges, more VRAM/latency. Tiny is the default for interactive use.

#### API — `POST /api/ai/segment`

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `image` | file | required | PNG/JPEG upload |
| `point_x`, `point_y` | float | center of image if omitted | Pixel coords |
| `engine` | string | `sam2` | Ignored; always SAM2 |
| `model` | string | `""` → tiny / first on disk | One of the IDs above |

**Response JSON**

```json
{
  "engine": "sam2-local:sam2.1_hiera_tiny",
  "mask_png_base64": "<png>",
  "score": 0.95,
  "point": [x, y],
  "box": null,
  "device": "cuda",
  "model": "sam2.1_hiera_tiny"
}
```

#### Professional / runner settings

| Setting | Where | Default | Meaning |
|---------|-------|---------|---------|
| `SAM2_MODEL` | env | `sam2.1_hiera_tiny` | Default checkpoint id |
| `SAM2_CHECKPOINT` / `GIF_STUDIO_SAM2` | env | — | Override path |
| `SAM2_HF_ID` / `GIF_STUDIO_SAM2_HF` | env | `facebook/sam2-hiera-tiny` | Only if `GIF_STUDIO_ALLOW_HF=1` |
| `multimask_output` | code | `True` | Pick highest-score mask |
| Autocast | code | `bfloat16` on CUDA | Speed/memory |
| Point label | code | `1` (foreground) | SAM2 prompt label |
| `VITE_SAM2_ENCODER` / `VITE_SAM2_DECODER` | Vite | unset | Optional browser ONNX path |

UI default click point when none given: **canvas center**.

---

### B. Grounding DINO — text-guided detect (+ SAM2 refine)

**Purpose:** Natural-language prompt → bounding boxes → (optional) SAM2 object mask → cutout layer. This is the Grounded-SAM style pipeline.

| Layer | File |
|-------|------|
| UI | prompt + model → `runTextDetect` |
| Browser | `src/ai/grounding-dino.js` |
| Pipeline | `ai_pipeline.detect_objects` |
| Runner | `ai/grounding_dino_runner.py` |

#### Models

| ID | Label | Official `.pth` | Transformers snapshot | HF repo (setup only) |
|----|-------|-----------------|----------------------|----------------------|
| `swint_ogc` | Grounding DINO Tiny | `groundingdino_swint_ogc.pth` + `GroundingDINO_SwinT_OGC.py` | `models/groundingdino/hf-tiny/` | `IDEA-Research/grounding-dino-tiny` |
| `swinb_cogcoor` | Grounding DINO Base | `groundingdino_swinb_cogcoor.pth` + `GroundingDINO_SwinB_cfg.py` | `models/groundingdino/hf-base/` | `IDEA-Research/grounding-dino-base` |

Also required for official `.pth` path: local BERT at `models/groundingdino/bert-base-uncased/`.  
Optional vendored package: `third_party/GroundingDINO/`.

**Load order (runner):**

1. Official package + `.pth` + local BERT (if ready)
2. Else Transformers snapshot with `local_files_only=True`
3. Else Hub (only if `GIF_STUDIO_ALLOW_HF=1`)

#### API — `POST /api/ai/detect`

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `image` | file | required | |
| `prompt` | string | required | Open vocabulary; commas OK |
| `confidence` | float | **`0.35`** | Maps to **box_threshold** |
| `refine_sam2` | bool | **`true`** | Top box → SAM2 mask |
| `dino_model` | string | `""` → `swint_ogc` | Tiny / Base id |
| `sam2_model` | string | `""` | Used only when refining |
| `engine` | string | `auto` | Ignored |

UI always sends `refineSam2: true` and the selected DINO + SAM2 models. Confidence is currently **hardcoded `0.35`** in the JS client (expose it in UI if you want a slider when porting).

**Response (boxes only)**

```json
{
  "engine": "grounding-dino-pth:groundingdino_swint_ogc",
  "boxes": [
    { "x": 10, "y": 20, "w": 100, "h": 200, "score": 0.72, "label": "person" }
  ],
  "prompt": "person",
  "device": "cuda"
}
```

**Response (with SAM2 refine)** — adds:

```json
{
  "mask_png_base64": "<png>",
  "mask_score": 0.91,
  "engine": "grounding-dino-…+sam2-local:…",
  "refined": "sam2"
}
```

If refine fails: `refine_error` string, `refined: null`, boxes still returned. Frontend then falls back to a **box crop** + erase brush.

#### Professional DINO settings

| Setting | Where | Default | Meaning |
|---------|-------|---------|---------|
| **`confidence` / box_threshold** | API form / runner arg | `0.35` | Min box score; higher = fewer, cleaner boxes |
| **`GROUNDING_DINO_TEXT_THRESHOLD`** | env | **`0.25`** | Phrase / text match threshold (not exposed in UI) |
| `GROUNDING_DINO_MODEL` | env | `swint_ogc` | Default model id |
| `GROUNDING_DINO_HF_ID` | env | `IDEA-Research/grounding-dino-tiny` | Hub id if allowed |
| Prompt normalization | code | lowercased, trailing `.` added | Required by DINO pipelines |
| Official preprocess | code | resize max side 800 / max 1333, ImageNet norm | Official inference transform |
| Transformers preprocess | HF processor | — | From local `hf-tiny` / `hf-base` |
| `refine_sam2` | API | `true` | Top-scoring box → SAM2 with box + center point |
| `VITE_GROUNDING_DINO_ONNX` | Vite | unset | Experimental; text prompts need the Python API |

**Tuning tips when porting**

- Misses objects → lower `confidence` (e.g. `0.25`) and/or `GROUNDING_DINO_TEXT_THRESHOLD` (e.g. `0.20`).
- Too many false boxes → raise both (e.g. `0.4` / `0.30`).
- Soft / wrong cutouts → keep `refine_sam2=true` and use a larger SAM2 model.
- Prefer Base (`swinb_cogcoor`) for hard prompts; Tiny for speed.

---

### C. MediaPipe — human segment + pose tracking

**Purpose:** Browser-side person cutout and 33-landmark pose. No FastAPI required.

| Layer | File |
|-------|------|
| UI | Human segment / Detect body + joints |
| Client | `src/ai/mediapipe.js` |
| Pose helpers | `src/lib/pose.js` |

#### Human segment

- Model: selfie segmenter TFLite (CDN by default)
- Output: category mask → B/W canvas → layer named `Human`

#### Body + joints (pose “tracking” knobs)

MediaPipe Pose Landmarker options (these are the professional tracking settings):

| Setting | Default | Meaning |
|---------|---------|---------|
| `numPoses` | `1` | Single person |
| `minPoseDetectionConfidence` | **`0.4`** | First-frame detection bar |
| `minPosePresenceConfidence` | **`0.4`** | Landmark present bar |
| `minTrackingConfidence` | **`0.4`** | Temporal tracking bar (IMAGE mode still uses it) |
| `delegate` | `GPU`, fallback `CPU` | WebGL vs CPU |
| Joint visibility filter (UI) | **score ≥ `0.25`** | Shown / countable joints |
| `driveMotion` | `true` | Pose sway drives layer motion |
| Cut out body | UI switch | Run selfie mask + attach `poseJoints` to Body layer |

CDN / override env:

| Env | Default |
|-----|---------|
| `VITE_MEDIAPIPE_WASM` | jsDelivr `@mediapipe/tasks-vision@0.10.35/wasm` |
| `VITE_MEDIAPIPE_MODEL` | selfie_segmenter float16 |
| `VITE_MEDIAPIPE_POSE_MODEL` | `pose_landmarker_lite` float16 |

#### Joint animation (professional motion settings)

After detect, `JointAnimPanel` exposes:

| Setting | Range | Meaning |
|---------|-------|---------|
| Selected joint | `POSE_KEY_JOINTS` subset | Which landmark to key |
| Start / End Offset X,Y | **−20% … +20%** of canvas | Range keys across clip duration |
| Mesh warp | baked into Body pixels | Image warping (not a 3D character) |
| Skeleton overlay | preview only | Hidden from GIF/PNG export |

---

### D. Upscale — Bicubic / ESRGAN / Real-ESRGAN / A-ESRGAN

**Purpose:** Enlarge the current canvas image and reload it as the new source.

| Layer | File |
|-------|------|
| UI | Enhance section |
| Browser | `src/ai/realesrgan.js` → `POST /api/ai/upscale` |
| Runner | `ai/realesrgan_runner.py` |

#### Models

| ID | Label | Weight under `models/realesrgan/` | Notes |
|----|-------|-----------------------------------|-------|
| `bicubic` | Bicubic | none | Always available (OpenCV / canvas) |
| `esrgan` | ESRGAN | `ESRGAN_SRx4_DF2KOST_official-ff704c30.pth` | Classic ESRGAN, net scale 4, 23 blocks |
| `realesrgan` | Real-ESRGAN | `RealESRGAN_x4plus.pth` (or x2 when scale≤2) | General photos |
| `realesrgan-x2` | Real-ESRGAN x2 | `RealESRGAN_x2plus.pth` | Explicit x2 net |
| `a-esrgan` | A-ESRGAN (anime) | `RealESRGAN_x4plus_anime_6B.pth` | Anime/illustration, 6 blocks |

Preferred loader: **Spandrel** (modern Python). Fallback: `realesrgan` + `basicsr` (often broken on Python ≥3.12).

#### API — `POST /api/ai/upscale`

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `image` | file | required | |
| `scale` | int | `2` | Clamped **1–4** |
| `model` | string | `realesrgan` | See table |
| `async_job` | bool | `false` | Celery path; UI expects sync PNG |

**Success:** raw `image/png` body + header `X-Upscale-Engine: <engine>`.

#### Professional upscale settings

| Setting | Where | Default | Meaning |
|---------|-------|---------|---------|
| `scale` / `outscale` | API | `2` | Target multiplier |
| `REALESRGAN_TILE` | env | **`0`** (no tiling) | Tile size for VRAM-safe large images; try `400` if OOM |
| `tile_pad` | code | `10` | Tile overlap (basicsr path) |
| `pre_pad` | code | `0` | Border pad |
| `half` | code | `true` on CUDA | FP16 on GPU |
| Net scale selection | code | x2 weights if `realesrgan` and scale≤2 | Else x4 net + resize to requested outscale |
| Post-resize if outscale ≠ net scale | Spandrel path | `INTER_LANCZOS4` | Match requested scale |
| `REALESRGAN_MODEL` / `GIF_STUDIO_REALESRGAN` | env | — | Custom weight path |
| `GIF_STUDIO_FETCH_WEIGHTS` | env | off | Allow one-shot GitHub weight download |
| `VITE_REALESRGAN_ONNX` | Vite | unset | Optional browser ONNX |

**Which model to pick**

- Photos / mixed → `realesrgan`
- Sharpest classic SR → `esrgan`
- Anime / flat color → `a-esrgan`
- No GPU / no weights → `bicubic`
- Memory pressure → lower scale, set `REALESRGAN_TILE=400`, use Tiny GPU or CPU

---

### E. RIFE — frame interpolation

**Purpose:** Insert in-between frames in a multi-frame GIF/video.

| Setting | Default | Notes |
|---------|---------|-------|
| `factor` | `2` | One mid-frame between each pair (UI fixed) |
| Needs | ≥2 source frames | Single still image → toast error |
| API | `POST /api/ai/interpolate` | `frames[]` + `factor` |
| Weights | `models/rife/train_log/` | via `scripts/setup_ai_models.py` |
| Env | `RIFE_REPO`, `RIFE_MODEL` / `GIF_STUDIO_RIFE` | Practical-RIFE checkout |

Response: `{ engine, frames: ["data:image/png;base64,…", …] }`.

---

## End-to-end flows (for reimplementation)

### Text → cutout (Grounded-SAM)

1. User enters prompt + picks DINO + SAM2 models.
2. `detectWithGroundingDino({ confidence: 0.35, refineSam2: true, … })`.
3. Server: DINO boxes → top score → SAM2 `(box + center point)` → mask PNG.
4. Client: `addElementFromMask` → optional `beginMaskErase` for edge cleanup.

### Point segment

1. SAM2 with center (or click) point.
2. Mask → layer named `SAM2 cutout`.

### Body warp

1. MediaPipe pose (+ optional selfie mask as `Body`).
2. User drags joints / keys start→end offsets.
3. Preview warps mesh; export bakes warp; skeleton is overlay-only.

### Upscale

1. Canvas → PNG blob → `/api/ai/upscale`.
2. Response PNG → `loadFile` as new document source.

---

## Files to transfer (checklist)

### Frontend

```
src/components/studio/ai-tools-panel.jsx
src/components/studio/joint-anim-panel.jsx   # if you want joint keys
src/ai/sam2.js
src/ai/grounding-dino.js
src/ai/realesrgan.js
src/ai/rife.js
src/ai/mediapipe.js
src/ai/onnx.js                              # shared ONNX helper
src/ai/index.js
src/lib/pose.js                             # joint names, sway, keys
# plus the studio-provider handlers:
#   runSam2Segment, runTextDetect, runHumanSegment,
#   runPoseDetect, runRifeInterpolate, addElementFromMask
```

### Backend

```
src/gif_studio/ai_pipeline.py
src/gif_studio/ai/__init__.py
src/gif_studio/ai/paths.py
src/gif_studio/ai/local_models.py
src/gif_studio/ai/sam2_runner.py
src/gif_studio/ai/grounding_dino_runner.py
src/gif_studio/ai/realesrgan_runner.py
src/gif_studio/ai/rife_runner.py
# routes in web_api.py: /api/ai/segment|detect|upscale|interpolate
# health: capability_flags()
```

### Setup / deps

```
requirements-ai.txt
scripts/setup_ai_models.py
models/README.md
third_party/GroundingDINO/   # optional for official .pth path
third_party/Practical-RIFE/  # for RIFE
.env.example                 # AI env block
```

### Weights layout (do not commit large binaries)

```
models/
  sam2/*.pt
  groundingdino/
    groundingdino_swint_ogc.pth
    GroundingDINO_SwinT_OGC.py
    groundingdino_swinb_cogcoor.pth
    GroundingDINO_SwinB_cfg.py
    bert-base-uncased/
    hf-tiny/  hf-base/
  realesrgan/*.pth
  rife/train_log/
```

---

## Environment reference (all AI knobs)

| Variable | Role |
|----------|------|
| `GIF_STUDIO_MODELS_DIR` | Models root (default `models/`) |
| `GIF_STUDIO_THIRD_PARTY` | Vendored repos root |
| `GIF_STUDIO_TORCH_DEVICE` | `cpu` / `cuda` / `mps` |
| `GIF_STUDIO_ALLOW_HF` | `1` to allow Hub downloads at runtime |
| `GIF_STUDIO_FETCH_WEIGHTS` | `1` to allow Real-ESRGAN GitHub fetch |
| `SAM2_MODEL` | Default SAM2 id |
| `SAM2_CHECKPOINT` / `GIF_STUDIO_SAM2` | Checkpoint path |
| `SAM2_HF_ID` / `GIF_STUDIO_SAM2_HF` | HF model id (opt-in) |
| `GROUNDING_DINO_MODEL` | Default DINO id |
| `GROUNDING_DINO_TEXT_THRESHOLD` | Text threshold (**0.25**) |
| `GROUNDING_DINO_HF_ID` | HF id (opt-in) |
| `GROUNDING_DINO_CONFIG` / `GROUNDING_DINO_CHECKPOINT` | Legacy path overrides |
| `REALESRGAN_MODEL` / `GIF_STUDIO_REALESRGAN` | Custom upscale weight |
| `REALESRGAN_TILE` | Tiling for large images (**0**) |
| `RIFE_REPO` / `RIFE_MODEL` / `GIF_STUDIO_RIFE` | RIFE paths |
| `VITE_API_PROXY` | Dev proxy to FastAPI |
| `VITE_MEDIAPIPE_*` | Browser MediaPipe CDN overrides |
| `VITE_SAM2_ENCODER` / `VITE_SAM2_DECODER` | Browser ONNX SAM2 |
| `VITE_GROUNDING_DINO_ONNX` | Browser ONNX DINO (limited) |
| `VITE_REALESRGAN_ONNX` | Browser ONNX upscale |
| `VITE_RIFE_ONNX` | Browser ONNX RIFE |

---

## Defaults cheat sheet (port these first)

| Feature | Key defaults |
|---------|----------------|
| SAM2 model | `sam2.1_hiera_tiny` |
| DINO model | `swint_ogc` (Tiny) |
| DINO box confidence | `0.35` |
| DINO text threshold | `0.25` (env) |
| DINO → SAM2 refine | `true` |
| Upscale model | `realesrgan` |
| Upscale scale | `2` |
| RIFE factor | `2` |
| Pose detection / presence / tracking | `0.4` each |
| Joint visibility | score ≥ `0.25` |
| Cut out body as layer | `true` |
| Real-ESRGAN tile | `0` |
| Device | CUDA → MPS → CPU |
| HF Hub | **off** |

---

## Setup (same as this repo)

```bash
pip install -r requirements-ai.txt
pip install 'git+https://github.com/facebookresearch/sam2.git'
python scripts/setup_ai_models.py
```

Verify: `GET /api/health` → `device`, `sam2`, `grounding_dino`, `realesrgan`, `rife`, and `models.*.ready`.

---

## Minimal API surface to reimplement elsewhere

If you only need the AI capabilities (no full studio UI), implement these four endpoints with the same Form fields and responses:

1. `POST /api/ai/segment` — SAM2 mask  
2. `POST /api/ai/detect` — Grounding DINO (+ optional SAM2 mask)  
3. `POST /api/ai/upscale` — PNG bytes + `X-Upscale-Engine`  
4. `POST /api/ai/interpolate` — RIFE frame list  

Plus browser MediaPipe for human/pose if you want the Body & joints section without a GPU server.

---

## Glossary

| Term | Meaning here |
|------|----------------|
| **Box threshold / confidence** | Min DINO detection score |
| **Text threshold** | Min text–region alignment score |
| **Refine SAM2** | Crop/prompt SAM2 with top DINO box for a soft object mask |
| **Tracking confidence** | MediaPipe pose temporal / presence filter |
| **Tile** | Split image for Real-ESRGAN when VRAM is limited |
| **Outscale** | Requested upscale factor (may differ from network native 2×/4×) |
| **Local-only** | Weights on disk; Hub disabled unless explicitly allowed |
