# Image Studio

Image Studio is a local-first web editor for preparing still images. It combines a layered canvas with selection, cleanup, text, resizing, AI-assisted tools, and PNG output.

## What it does

- Opens PNG, JPEG, and WebP images.
- Keeps the base image, extracted elements, enhancements, overlays, and text as editable layers.
- Supports crop-aware resizing, rotation, flipping, opacity, locking, ordering, and canvas sizing.
- Provides box, lasso, brush, soft-matte, and prompt-assisted selection tools.
- Removes backgrounds and unwanted regions while preserving the original source.
- Upscales selected images with local model runners when available.
- Saves project documents and restores the static composition.
- Downloads the full artboard or an enhanced layer as PNG.
- Optionally optimizes PNG output through the local API.

All source images and model inference stay on the local machine.

## Requirements

- Node.js 20 or newer
- Python 3.11 or newer
- Enough free memory for the selected local AI models

## Quick start

Install the web editor and lightweight local API:

```bash
npm run setup -- --minimal
npm start
```

Open [http://127.0.0.1:5173/studio/ai](http://127.0.0.1:5173/studio/ai).

The first command creates `.venv`, installs the API and frontend dependencies, and creates `.env` from `.env.example` when needed.

To install the optional local AI stack and its essential weights:

```bash
npm run setup
```

Prompt-assisted selection runs only on the local API with Grounding DINO
Swin-B and SAM 2.1 Large. The editor does not expose model selectors.

## Common commands

| Command | Purpose |
|---|---|
| `npm run dev` | Start only the Vite editor |
| `npm run api` | Start only the local FastAPI service |
| `npm start` | Start the editor and API together |
| `npm run build` | Build the production web bundle |
| `npm test` | Run the JavaScript test suite |
| `pytest -q` | Run the Python test suite |
| `npm run check:openapi` | Check the committed API contract |

## Workspaces

- **AI** — select, extract, erase, remove backgrounds, and use prompt-assisted detection.
- **Text** — add and style text layers.
- **Scale** — create and manage enhanced image layers.
- **Output** — configure and download PNG output.

The layer panel, artboard controls, inspector, history, autosave, and project persistence are shared across all workspaces.

## Local API

The FastAPI service provides:

- health and capability discovery;
- smart segmentation and local model inference;
- soft-matte background removal;
- content-aware image cleanup;
- image upscaling;
- lossless PNG optimization;
- optional project persistence;
- generic background-job status and cancellation.

Uploads are limited to PNG, JPEG, and WebP. The server validates file signatures, dimensions, and image content before processing.

## Project structure

```text
src/
├── components/       shared interface components
├── context/          editor orchestration
├── domain/           project and layer rules
├── engine/           static Konva canvas
├── layout/           studio shell and panels
├── pages/            AI, Text, Scale, and Output workspaces
├── render/           static scene evaluation
├── store/            editor state and project bridge
└── image_studio/     local Python API and AI runners
```

The JavaScript project schema is in `schemas/project-v2.schema.json`. The HTTP contract is in `schemas/api/openapi.json`.

## Privacy and model downloads

Local model discovery prefers the repository's `models/` directory. Remote model access is opt-in; see `.env.example` and `models/README.md`. Do not commit model weights, user images, local databases, or generated output.

## Validation

Before submitting a change, run:

```bash
npm test
npm run check:openapi
npm run build
.venv/bin/python -m pytest -q
```
