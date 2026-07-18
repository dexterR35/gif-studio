# GIF Studio AI reality-check stack

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
