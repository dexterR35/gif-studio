# GIF Studio

A local-first toolkit for turning stills and GIFs into editable, exportable animations.

## Dual stack

| Surface | Technology | How to run |
|---------|------------|------------|
| **Desktop** | Python 3.11+ / **PySide6** | `python run.py` |
| **Web editor** | **JavaScript** (Vite + React) — no TypeScript requirement | `npm run dev` |
| **Local API** | **FastAPI** (AI, GrabCut, export) | `npm run api` |

Frontend source under `src/**/*.js` / `*.jsx` is intentionally **JavaScript-only** (no TS build gate).

## Authority (engineering)

| Doc | Role |
|-----|------|
| [docs/production-refactor/CURSOR_PRODUCTION_BUILD_PLAN.md](docs/production-refactor/CURSOR_PRODUCTION_BUILD_PLAN.md) | Executable production refactor plan |
| [docs/GIF_STUDIO_MEGA_SENIOR_BUILD.md](docs/GIF_STUDIO_MEGA_SENIOR_BUILD.md) **§2** | Locked product overlays (win on conflict) |
| [docs/production-refactor/STATUS.md](docs/production-refactor/STATUS.md) | Phase status + evidence |
| [docs/production-refactor/ARCHITECTURE.md](docs/production-refactor/ARCHITECTURE.md) | Current architecture summary |
| [docs/adr/](docs/adr/) | Architecture decision records |

## Local models & privacy

- Weights and caches prefer the repo **`models/`** directory ([models/README.md](models/README.md)).
- Hugging Face hub downloads are **opt-in** only: set `GIF_STUDIO_ALLOW_HF=1` (or `true`/`yes`). Default is local-only.
- **GrabCut** vs rembg soft-matte is an **explicit UI method choice** — never a silent fallback when AI fails.
- Best quality AI and export are **local-backend-first** when FastAPI is healthy ([ADR 0010](docs/adr/0010-ai-local-backend-routing.md)).

## Implemented features

- Local desktop UI built with **PySide6 / Qt 6**.
- Open or drag-and-drop PNG, JPEG, WebP, BMP, TIFF, and GIF images.
- Source-image preview and asynchronously rendered animation preview.
- Presets: Still, Zoom In, Zoom Out, Rotate, Pan, Pulse, Bounce, Shake, Fade In, Ken Burns, Spin & Zoom, Orbit, Wobble, and Custom.
- Editable start/end transforms:
  - scale;
  - rotation;
  - horizontal and vertical movement;
  - opacity;
  - easing and ping-pong looping.
- Procedural motion controls for amplitude and cycle count.
- Canvas resize modes: Contain, Cover, Stretch, and Original size.
- Solid or transparent backgrounds.
- Low, balanced, high-quality, and custom GIF encoding profiles.
- Palette size, dithering, resampling filter, optimization, loop count, disposal mode, and alpha threshold controls.
- Embedded GIF comment metadata plus an optional `.gif.json` sidecar containing all settings and the source SHA-256.
- Background rendering with progress, cancellation, and export safety limits.
- Headless CLI and reusable Python API for automation.
- PyInstaller build helper for a distributable desktop executable.
- Automated tests for animation, transparency, metadata, sidecars, and CLI export.

A complete product and engineering specification is in [BUILD_SPEC.md](BUILD_SPEC.md).  
Full archive: [docs/GIF_STUDIO_COMPLETE_PRODUCTION_MANUAL.md](docs/GIF_STUDIO_COMPLETE_PRODUCTION_MANUAL.md).

## Web studio with smart element animation

The Vite interface uses a local FastAPI service for rembg/ONNX AI segmentation,
**explicit** OpenCV GrabCut (selected in the cutout method UI), background inpainting,
ImageIO GIF encoding, and optional gifsicle optimization.
All image data stays on the local machine.

Install both application stacks:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements-web.txt
npm install
```

Or on macOS/Linux:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements-web.txt
npm install
```

Start both (or separately with `npm run api` + `npm run dev`):

```bash
npm start
```

Open `http://127.0.0.1:5173`. Choose a soft-matte model **or** OpenCV GrabCut in the
cutout controls — GrabCut is never applied as a silent fallback when rembg fails.
Models load from local rembg / `models/` caches (HF only if `GIF_STUDIO_ALLOW_HF` is set).
OpenCV can inpaint the original position after cutout. GIF export prefers `/api/export`
(ImageIO + optional gifsicle). If the API is offline, the browser uses degraded
edge-based selection and the bundled gifenc path (labeled offline / degraded).

FE unit tests: `npm test` (Vitest). OpenAPI drift: `npm run check:openapi`.

### Optional heavy AI engines (SAM2 · Grounding DINO · Real-ESRGAN · RIFE)

Real PyTorch runners live under `src/gif_studio/ai/` and call the official stacks:

| Engine | Upstream | Ready when |
|--------|----------|------------|
| **SAM 2** | [facebookresearch/sam2](https://github.com/facebookresearch/sam2) | `pip install git+https://github.com/facebookresearch/sam2.git` (HF weights on first use) |
| **Grounding DINO** | [IDEA-Research/GroundingDINO](https://github.com/IDEA-Research/GroundingDINO) | `pip install transformers` → `IDEA-Research/grounding-dino-tiny` |
| **Real-ESRGAN** | [xinntao/Real-ESRGAN](https://github.com/xinntao/Real-ESRGAN) | `pip install realesrgan basicsr` (or `spandrel`); weights auto-download |
| **RIFE** | [hzwer/ECCV2022-RIFE](https://github.com/hzwer/ECCV2022-RIFE) / [Practical-RIFE](https://github.com/hzwer/Practical-RIFE) | clone + `train_log` weights via setup script |

```bash
pip install -r requirements-ai.txt
pip install "git+https://github.com/facebookresearch/sam2.git"
python scripts/setup_ai_models.py
```

Check `/api/health` for `sam2`, `grounding_dino`, `realesrgan`, and `rife` flags.
Without weights/packages, those AI endpoints return an error — there are no substitute algorithms.

## Requirements

- Python 3.11 or newer.
- Windows 10/11, macOS, or a Linux desktop supported by Qt 6.
- Enough memory for the requested canvas and frame count. GIF Studio displays a raw-memory estimate before export.

## Install and run

### Windows PowerShell

```powershell
cd gif_studio
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
python run.py
```

### macOS or Linux

```bash
cd gif_studio
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
python run.py
```

An editable install exposes both commands:

```bash
python -m pip install -e .
gif-studio
gif-studio-cli --help
```

## Desktop workflow

1. Open or drop an image into the application.
2. Select a preset in the **Animation** tab.
3. Adjust duration, FPS, easing, start/end transforms, amplitude, and cycles.
4. Configure canvas and quality in the **Output** tab.
5. Add title, author, description, and copyright in **Metadata**.
6. Render a bounded preview.
7. Export the full-resolution GIF.

The preview renderer automatically limits preview dimensions and frame count. Export always uses the full selected settings.

## Command-line automation

Create a GIF with a preset:

```bash
gif-studio-cli input.png output.gif \
  --preset "Ken Burns" \
  --duration 3 \
  --fps 18 \
  --size 1200x800 \
  --fit cover \
  --quality high \
  --title "Campaign hero" \
  --author "Design team"
```

Create a transparent looping pulse:

```bash
gif-studio-cli logo.png logo-pulse.gif \
  --preset Pulse \
  --duration 1.8 \
  --fps 20 \
  --size 600x600 \
  --transparent \
  --quality high \
  --loop 0
```

Write a complete JSON configuration template:

```bash
gif-studio-cli --dump-default-config animation-config.json
```

Use that file for a reproducible export:

```bash
gif-studio-cli input.png output.gif --config animation-config.json
```

The CLI writes `output.gif.json` unless `--no-sidecar` is supplied.

## Python automation API

```python
from dataclasses import replace
from pathlib import Path

from gif_studio.engine import create_gif
from gif_studio.metadata import write_sidecar_json
from gif_studio.models import AnimationSettings, GifMetadata
from gif_studio.presets import PRESET_VALUES

source = Path("input.png")
output = Path("output.gif")

settings = AnimationSettings(
    canvas_width=900,
    canvas_height=600,
    duration_seconds=2.5,
    fps=15,
    preset="Ken Burns",
)
settings = replace(settings, **PRESET_VALUES["Ken Burns"])

metadata = GifMetadata(
    title="Animated hero",
    author="Studio team",
    description="Generated locally with GIF Studio.",
    source_filename=source.name,
)

create_gif(source, output, settings, metadata)
write_sidecar_json(source, output, settings, metadata)
```

A batch example is included in `examples/batch_example.py`.

## Quality profiles

| Profile | Palette | Dithering | Resize filter | Typical use |
|---|---:|---|---|---|
| Low / small file | 64 colors | None | Bilinear | Drafts, simple icons, smaller files |
| Balanced | 128 colors | Floyd–Steinberg | Bicubic | General web and social use |
| High quality | 256 colors | Floyd–Steinberg | Lanczos | Detailed artwork and final exports |
| Custom | User controlled | User controlled | User controlled | Format-specific optimization |

Final size is content-dependent. A high-motion photographic image generally compresses less efficiently than a flat-color logo.

## GIF format limitations

GIF has a maximum of 256 palette entries per frame and only binary transparency. Semi-transparent source pixels must become either transparent or opaque during export. GIF also tends to be larger than modern animated WebP, APNG, or video for photographic animation.

The application preserves transparency with a reserved palette index and exposes an alpha threshold. For soft shadows or translucent edges, use a solid matte background or add APNG/WebP export in a future release.

## Build a desktop executable

Install development dependencies and run the build helper:

```bash
python -m pip install -r requirements-dev.txt
python scripts/build_executable.py
```

PyInstaller creates the application in `dist/GIF-Studio/` on the current platform. Build separately on Windows, macOS, and Linux; PyInstaller does not cross-compile native Qt bundles.

## Run tests

```bash
python -m pip install -r requirements-dev.txt
pytest
```

The current tests cover:

- easing and transform endpoints;
- procedural frame differences;
- dimensions and frame counts;
- GIF comments and transparency;
- sidecar metadata and source hashing;
- configuration generation and CLI export.

## Project structure

```text
gif_studio/
├── BUILD_SPEC.md
├── README.md
├── pyproject.toml
├── requirements.txt
├── run.py
├── examples/
│   ├── batch_example.py
│   ├── sample_source.png      # CLI/examples only (not web demo)
│   └── sample_output.gif
├── public/                    # Web static assets (no bundled demo image)
├── scripts/
│   └── build_executable.py
├── src/gif_studio/
│   ├── app.py                 # Desktop entry point
│   ├── cli.py                 # Headless automation entry point
│   ├── engine.py              # Animation, compositing, quantization, GIF writer
│   ├── metadata.py            # Sidecar metadata and source hashing
│   ├── models.py              # Validated settings and metadata models
│   ├── presets.py             # Built-in animation definitions
│   ├── worker.py              # Qt background worker
│   └── ui/
│       ├── main_window.py      # Desktop workflow and controls
│       └── widgets.py          # Reusable preview/color widgets
└── tests/
    ├── test_cli.py
    └── test_engine.py
```

## Troubleshooting

### Qt platform plugin error

Recreate the virtual environment and reinstall PySide6. On Linux, ensure the machine has the desktop libraries required by Qt and that the app is launched from a graphical session.

### Export uses too much memory

Reduce one or more of output width, output height, duration, or FPS. Full RGBA frames are rendered before GIF encoding, so approximate raw memory is:

```text
width × height × 4 bytes × frame_count
```

The app blocks exports over 1,200 frames or approximately 1.8 GB of estimated raw frame memory.

### Transparent edges look rough

GIF transparency is one-bit. Increase or decrease the alpha threshold, use a matching solid background, or choose a future APNG/WebP exporter for full alpha.

### A mostly static animation contains fewer frames

GIF encoders may combine identical frames. This is valid and can significantly reduce file size.
