# GIF Studio

A local Python desktop application and automation toolkit for turning one static image into a customizable animated GIF.

GIF Studio is designed as a maintainable application rather than a single script. The rendering engine is independent from the user interface, so the same animation pipeline can be used from the desktop app, the command line, tests, or a future batch/API service.

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

## Web studio with smart element animation

The Vite interface can use a local FastAPI service for rembg/ONNX AI segmentation,
OpenCV GrabCut selection and background inpainting, ImageIO GIF encoding, and
optional gifsicle optimization.
All image data stays on the local machine.

Install both application stacks:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements-web.txt
npm install
```

Start the API in one terminal:

```powershell
npm run api
```

Start Vite in a second terminal:

```powershell
npm run dev
```

Open `http://127.0.0.1:5173`, choose **Elements**, and draw a close rectangle
around an object. The API first tries the local `isnet-general-use` AI model and
falls back to OpenCV GrabCut when appropriate. The AI model is downloaded to the
local rembg model cache on first use; subsequent processing is local. OpenCV
inpaints the original position. GIF export sends the rendered frames to ImageIO
and uses gifsicle optimization when the platform executable is available. If the
API is offline, the browser automatically falls back to edge-based selection and
the bundled GIF encoder.

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
│   ├── sample_source.png
│   └── sample_output.gif
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
