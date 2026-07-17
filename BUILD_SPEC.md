# GIF Studio — Product and Engineering Build Specification

**Status:** Implemented MVP with desktop UI, rendering engine, CLI automation, packaging helper, examples, and tests  
**Target:** Local-first cross-platform Python desktop application  
**Primary job:** Convert one static image into a configurable animated GIF without uploading the asset to a remote service

---

## 1. Product vision

GIF Studio is a professional local tool for designers, marketers, developers, and content creators who need to animate a still image quickly while retaining control over motion, dimensions, quality, transparency, looping, and metadata.

The application should feel simple for a first export but have an architecture that supports advanced animation, additional formats, batch processing, and automation later.

### Product principles

1. **Local first.** Source files stay on the user's computer.
2. **Preview before export.** Users should see motion before committing to a full-resolution render.
3. **Editable presets.** A preset is a starting point, not a locked effect.
4. **Reproducible output.** Every meaningful render setting can be represented in code or JSON.
5. **Separation of concerns.** Rendering is independent from the UI.
6. **Honest format behavior.** The app explains GIF palette, transparency, and memory limitations.
7. **Safe defaults.** The UI prevents accidental multi-gigabyte renders.

### MVP non-goals

The current implementation does not include a multi-track timeline, hand-authored per-frame drawing, video editing, cloud storage, collaborative projects, or full-alpha APNG/WebP export. These are roadmap items rather than requirements for the first working release.

---

## 2. User journeys

### 2.1 Interactive desktop export

1. User opens or drops a source image.
2. App displays source dimensions and a fitted preview.
3. User selects an animation preset.
4. Preset populates editable transform controls.
5. User adjusts timing, canvas, quality, transparency, and metadata.
6. User renders a bounded preview in a background thread.
7. User plays or pauses the preview.
8. User exports a full-resolution GIF.
9. App embeds portable comment metadata and optionally creates a complete JSON sidecar.

### 2.2 Reproducible command-line export

1. User invokes `gif-studio-cli` with a source, output path, preset, and overrides.
2. CLI validates dimensions, frame count, and memory estimate.
3. Renderer generates frames and reports progress.
4. CLI writes the GIF and sidecar.
5. The same settings can be reused in CI, batch processing, or scheduled automation.

### 2.3 Python batch automation

1. Developer imports the engine and data models.
2. A shared `AnimationSettings` object is applied to many images.
3. Each export receives asset-specific metadata.
4. The engine runs without constructing a Qt application.

---

## 3. Feature matrix

### 3.1 Implemented source and preview features

| Feature | MVP status | Notes |
|---|---|---|
| File picker | Implemented | PNG, JPEG, WebP, BMP, TIFF, GIF |
| Drag and drop | Implemented | First local file is loaded |
| EXIF orientation correction | Implemented | Via Pillow `ImageOps.exif_transpose` |
| Source preview | Implemented | Aspect-fitted Qt preview |
| Animated preview | Implemented | Background render, bounded size/frame count |
| Preview playback | Implemented | Play/pause timer |
| Preview invalidation | Implemented | UI marks preview out of date after setting changes |
| Cancellation | Implemented | Cooperative checks during rendering and quantization |

When an animated GIF is used as input, the MVP treats the first decoded frame as the source image. Importing and editing an existing animation is a separate future workflow.

### 3.2 Implemented animation features

| Category | Controls |
|---|---|
| Timing | Duration, FPS, easing, ping-pong |
| Scale | Start and end percentage |
| Rotation | Start and end degrees |
| Position | Start/end horizontal and vertical percentage offsets |
| Opacity | Start and end percentage |
| Procedural motion | Amplitude and cycle count |
| Loop behavior | Infinite or finite GIF loop count |

Built-in presets:

- Still
- Zoom In
- Zoom Out
- Rotate
- Pan Left to Right
- Pan Bottom to Top
- Pulse
- Bounce
- Shake
- Fade In
- Ken Burns
- Spin & Zoom
- Orbit
- Wobble
- Custom

Presets update the editable settings. The engine does not hide preset values in opaque effect objects, which keeps exports reproducible and makes later project serialization straightforward.

### 3.3 Implemented output features

| Feature | Options |
|---|---|
| Canvas dimensions | 1–8192 pixels per side |
| Aspect lock | Source aspect ratio |
| Source fitting | Contain, Cover, Stretch, Original size |
| Background | Solid RGB or transparent |
| Palette | 2–256 entries |
| Dithering | None, Floyd–Steinberg |
| Resampling | Nearest, Bilinear, Bicubic, Lanczos |
| Optimization | Pillow GIF optimization toggle |
| Disposal | Keep, restore background, restore previous |
| Transparency | Reserved palette index plus alpha threshold |
| Frame duration | Derived from FPS |
| Safety limits | 1,200 frames and about 1.8 GB raw estimate |

Quality profiles:

| Profile | Palette | Dither | Resampling | Intended use |
|---|---:|---|---|---|
| Low / small file | 64 | None | Bilinear | Drafts and flat graphics |
| Balanced | 128 | Floyd–Steinberg | Bicubic | General distribution |
| High quality | 256 | Floyd–Steinberg | Lanczos | Final detailed output |
| Custom | User values | User values | User values | Manual optimization |

### 3.4 Implemented metadata features

GIF metadata support is inconsistent between applications. The MVP therefore writes two forms:

1. **GIF Comment Extension**
   - title;
   - author;
   - description;
   - software;
   - copyright;
   - source filename.
2. **JSON sidecar**
   - schema version;
   - UTC generation time;
   - source filename and SHA-256;
   - output filename and format;
   - all metadata fields;
   - every animation and encoding setting.

The sidecar filename is `output.gif.json`.

### 3.5 Implemented automation features

- `gif-studio-cli` command.
- JSON configuration loading.
- Complete default configuration generation.
- Preset, duration, FPS, size, fit, transparency, background, quality, looping, and metadata overrides.
- Reusable `create_gif()` Python API.
- Batch example.
- Deterministic settings model suitable for later job queues.

---

## 4. Technology stack

| Layer | Technology | Reason |
|---|---|---|
| Language | Python 3.11+ | Modern typing, dataclass support, broad desktop availability |
| Desktop UI | PySide6 / Qt 6 | Native desktop widgets, cross-platform packaging, mature event/thread model |
| Image processing | Pillow | Reliable image decoding, transforms, palette conversion, GIF writing |
| Pixel operations | NumPy | Fast alpha-mask and palette-index manipulation |
| Concurrency | QThread + QObject worker | Keeps desktop UI responsive during CPU-heavy rendering |
| Data model | Python dataclasses | Lightweight, serializable, CLI/UI independent |
| Packaging | setuptools + PyInstaller | Editable installs, console scripts, native desktop bundles |
| Testing | pytest | Focused engine and automation regression tests |
| Linting | Ruff | Fast import, correctness, and style checks |
| Metadata integrity | hashlib / JSON | Source fingerprint and reproducible sidecar |

### Optional future libraries

These should remain optional so the core app stays installable:

- **gifsicle** or `pygifsicle`: post-export GIF size optimization;
- **FFmpeg**: MP4/WebM export and advanced palette generation;
- **pyvips**: lower-memory processing of very large images;
- **OpenCV**: tracking, optical effects, and additional filters;
- **colour-science** or LittleCMS integration: advanced color management;
- **Pydantic**: versioned project/job schema when external API boundaries are added.

---

## 5. Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│                    Desktop UI (PySide6)                     │
│ file input · controls · preview playback · progress · dialogs│
└──────────────────────────────┬──────────────────────────────┘
                               │ immutable settings snapshot
┌──────────────────────────────▼──────────────────────────────┐
│                  Background Render Worker                   │
│ preview/export mode · cancellation flag · progress signals  │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│                    Animation Engine                         │
│ easing · transforms · resize · rotate · composite · opacity │
└──────────────────────────────┬──────────────────────────────┘
                               │ RGBA frames
┌──────────────────────────────▼──────────────────────────────┐
│                    GIF Encoding Layer                       │
│ palette quantization · transparency · duration · loop        │
│ disposal · optimization · comment metadata                  │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│                 GIF + optional JSON sidecar                 │
└─────────────────────────────────────────────────────────────┘

The CLI and Python API enter directly at the settings and engine layers.
```

### Module responsibilities

| Module | Responsibility |
|---|---|
| `models.py` | Settings, metadata, validation, memory/frame calculations |
| `presets.py` | Human-readable preset defaults |
| `engine.py` | Load, ease, transform, render, quantize, save |
| `metadata.py` | Source hashing and sidecar serialization |
| `worker.py` | Background execution and cancellation bridge to Qt |
| `ui/widgets.py` | Reusable fitted image preview and color selector |
| `ui/main_window.py` | User workflow, state collection, dialogs, playback |
| `cli.py` | Automation arguments, JSON config, progress, exit codes |
| `app.py` | Qt application startup |

---

## 6. Rendering pipeline

### 6.1 Input normalization

1. Open with Pillow.
2. Apply EXIF orientation.
3. Convert to RGBA.
4. Preserve original pixel dimensions for source information and aspect locking.

### 6.2 Timeline sampling

```text
frame_count = round(duration_seconds × fps)
frame_duration_ms = round(1000 ÷ fps)
```

The final frame count is never lower than two. Desktop validation prevents more than 1,200 frames.

For a normal transform, frame position is sampled from `0` to `1`. Ping-pong maps the full timeline to `0 → 1 → 0`. Procedural effects use a periodic phase that avoids duplicating the exact first phase at the final frame.

### 6.3 Easing

Implemented easing functions:

- Linear
- Ease in
- Ease out
- Ease in-out
- Smoothstep
- Smootherstep
- Damped spring

Easing is applied to interpolated start/end transforms. Procedural effects add their periodic component after base interpolation.

### 6.4 Spatial transform

For each frame:

1. Determine the base dimensions from Contain, Cover, Stretch, or Original size.
2. Apply animated scale using the selected resampling filter.
3. Apply rotation with bicubic sampling and an expanded transparent bounding box.
4. Multiply source alpha by animated opacity.
5. Position the transformed image around canvas center plus percentage offsets.
6. Alpha-composite onto a transparent or solid canvas.

### 6.5 GIF quantization

GIF supports palette indices rather than full RGBA pixels.

For a solid background:

1. Flatten RGBA over the selected matte color.
2. Quantize to the selected palette size.
3. Apply optional Floyd–Steinberg dithering.

For transparent output:

1. Quantize RGB using at most 255 nontransparent entries.
2. Reserve palette index 255 for transparency.
3. Map pixels at or under the alpha threshold to that index.
4. Save with the selected disposal method.

This preserves hard transparency but cannot preserve partial alpha because the GIF format does not support it.

### 6.6 Encoding

Pillow writes:

- all quantized frames;
- per-frame duration;
- loop count;
- disposal method;
- optimization flag;
- transparency index when applicable;
- UTF-8 comment metadata.

Identical frames can be merged by an encoder. That is valid GIF behavior and reduces output size.

---

## 7. Desktop UI design

### Main layout

- Left: scrollable source summary and tabbed controls.
- Right: source preview and larger animation preview.
- Top toolbar: Open, Render Preview, Export, Cancel, Reset.
- Bottom status bar: progress and current operation.

### Animation tab

- Preset selector.
- Duration and frame rate.
- Easing and ping-pong.
- Start/end table for scale, rotation, X, Y, and opacity.
- Amplitude and cycles for procedural effects.

### Output tab

- Width/height and source aspect lock.
- Fit mode.
- Transparent background or color selector.
- Quality profile.
- Palette, dither, resampling, optimization.
- Loop count, disposal mode, alpha threshold.
- Frame count and memory estimate.
- GIF limitations note.

### Metadata tab

- Title.
- Author.
- Copyright.
- Description.
- Sidecar toggle.
- Explanation of portable versus reliable metadata.

### Responsiveness

Full rendering is never executed on the Qt UI thread. A worker receives a snapshot of settings and emits progress. Cancellation uses a thread-safe event checked between frames and during quantization.

---

## 8. Validation and resource management

### Validation rules

- Canvas: 1–8192 pixels per side.
- Duration: 0.1–120 seconds at model level.
- FPS: 1–60.
- Frame count: maximum 1,200 in the desktop/export model.
- Palette: 2–256 colors.
- Opacity: 0–100%.
- Scale: greater than zero.
- Disposal: GIF methods 1, 2, or 3.
- Alpha threshold: 0–255.
- Loop count: 0–65,535.

### Memory estimate

The engine currently holds full RGBA frames before GIF encoding:

```text
estimated_raw_bytes = width × height × 4 × frame_count
```

Exports over approximately 1.8 GB of estimated raw frames are rejected. A future streaming or disk-backed encoder can reduce this requirement.

### Failure handling

- Invalid source: descriptive error dialog or CLI exit code 2.
- Invalid settings: validation before worker launch.
- Export exception: worker reports error without freezing the UI.
- Cancellation: worker exits cooperatively.
- Close during render: app requests cancellation and closes only after worker completion.

---

## 9. Privacy and security

- No network access is required by the application.
- Images are processed locally.
- User text is embedded only in the selected output and optional sidecar.
- Sidecars store a source filename and SHA-256, not the complete source path.
- Output paths are selected by the user.
- The app does not execute image metadata, scripts, or macros.
- Production packaging should keep Pillow and Qt updated for image-decoder security fixes.

For untrusted high-volume server use, render jobs should run in isolated processes with CPU, memory, file-size, and execution-time limits. The desktop MVP assumes files selected by the local user.

---

## 10. Packaging and distribution

### Developer installation

```bash
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
python -m pip install -e .[dev]
gif-studio
```

### Native bundle

```bash
python scripts/build_executable.py
```

The helper invokes PyInstaller in windowed mode. Build on each target operating system:

- Windows build for `.exe` distribution;
- macOS build for `.app` distribution and later signing/notarization;
- Linux build for a directory bundle, with AppImage packaging as a future distribution step.

### Production release additions

- application icon and platform metadata;
- code signing;
- macOS notarization;
- Windows installer such as Inno Setup or WiX;
- Linux AppImage/Flatpak manifest;
- automated build matrix in CI;
- software bill of materials and dependency scanning;
- crash logs stored locally with user-controlled export.

---

## 11. Test strategy

### Implemented automated tests

- easing boundary behavior;
- transform interpolation endpoints;
- procedural animation frame differences;
- output dimensions and frame count;
- transparent pixel preservation;
- GIF comment metadata;
- JSON sidecar contents and SHA-256;
- default config generation;
- CLI GIF export.

### Recommended additional tests

1. Golden-image comparisons for every preset.
2. Cover/Contain/Stretch crop and alignment tests.
3. Disposal and transparency behavior across major viewers.
4. Very small palettes and threshold edge cases.
5. Unicode metadata round trips.
6. Cancellation during frame rendering and quantization.
7. UI tests with `pytest-qt`.
8. Platform packaging smoke tests.
9. Performance benchmarks by canvas size and frame count.
10. Fuzzing against malformed image inputs.

### Acceptance criteria for MVP

- A supported static image can be loaded without changing its orientation incorrectly.
- Every listed preset can produce a preview and export.
- Start/end transforms visibly affect output.
- UI remains responsive during rendering.
- User can cancel a long render.
- Exported GIF opens in Pillow and a browser.
- Transparent exports contain transparent pixels.
- Metadata comment and sidecar are written when enabled.
- CLI can reproduce an export from JSON settings.
- Test suite passes.

---

## 12. Prioritized improvement roadmap

### Version 0.2 — Editing depth

1. **Focus-point crop control** for Cover and Ken Burns effects.
2. **Timeline scrubber** with instant single-frame preview.
3. **Keyframes** with add/remove/reorder and per-segment easing.
4. **Text and watermark layers** with fonts, position, shadow, and timing.
5. **Basic filters**: brightness, contrast, saturation, blur, sharpen, hue.
6. **Project files** such as `.gifstudio.json` with schema migration.
7. **Undo/redo** using Qt's undo framework.
8. **Preset save/import/export**.
9. **Recent files and autosaved application preferences**.
10. **Estimated encoded size sampling** instead of raw-memory estimate only.

### Version 0.3 — Formats and throughput

1. Animated WebP export.
2. APNG export for full alpha.
3. MP4/WebM export through FFmpeg.
4. Batch queue with per-job settings and cancellation.
5. Folder watch automation.
6. Optional gifsicle optimization.
7. Shared/global palette analysis across sampled frames.
8. Delta-frame optimization before GIF encoding.
9. Disk-backed or streaming frame pipeline.
10. Command-line transform overrides for every model field.

### Version 0.4 — Advanced animation

1. Layer stack with images, shapes, and text.
2. Masks and clipping paths.
3. Motion paths and Bezier curves.
4. Spring parameter controls: mass, stiffness, damping.
5. Perspective and four-corner transforms.
6. Blur trails, glow, shadow, and displacement effects.
7. Random seed and deterministic noise animation.
8. Audio-reactive parameter generation for video outputs.
9. Plugin interface for third-party effects/exporters.
10. Color-managed workflow and profile conversion.

### Version 1.0 — Production application

1. Stable versioned project format.
2. Comprehensive undo/redo.
3. Hardware-accelerated preview where available.
4. Sandboxed render process with crash recovery.
5. Cross-platform signed installers.
6. Accessibility review and keyboard-complete operation.
7. Localization framework.
8. Telemetry-free by default, with explicit opt-in diagnostics only.
9. Automated release, SBOM, and security scanning.
10. Extensive visual regression and viewer-compatibility matrix.

---

## 13. Recommended next engineering tasks

The highest-value improvements after the MVP are:

1. Add a timeline scrubber that renders only the selected frame immediately.
2. Add focus-point controls so pan/zoom effects target the subject rather than only the canvas center.
3. Add project/preset JSON import and export in the desktop UI.
4. Implement animated WebP and APNG using the same rendered RGBA frames.
5. Replace all-frame memory retention with a streaming or temporary-frame strategy.
6. Add shared-palette analysis and optional gifsicle post-processing for smaller files.
7. Introduce `pytest-qt` UI smoke tests and a cross-platform packaging CI matrix.

These additions preserve the current architecture: the UI continues to collect settings, while independent renderers and encoders consume those settings.

---

## 14. Definition of done for a production release

A production release is ready when:

- installers are signed and tested on supported platforms;
- the UI has keyboard navigation and accessible names;
- cancellation and close behavior have platform UI tests;
- memory use is bounded for advertised maximum sizes;
- project/preset schemas are versioned;
- crash and error reporting is clear and local;
- outputs are tested in Chrome, Firefox, Safari, Edge, Windows Photos, macOS Preview, and common messaging platforms;
- dependency scanning reports no known critical vulnerabilities;
- documentation includes format-selection guidance and troubleshooting;
- visual regression tests cover all built-in presets.
