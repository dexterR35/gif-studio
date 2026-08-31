# Image Studio — Product and Engineering Specification

## Product outcome

Image Studio helps a user turn one or more still images into a polished, layered composition and save the result as PNG. The editor is local-first: image data stays in the browser or the optional local API.

## Product principles

1. Keep the primary path short: open an image, edit it, and save the result.
2. Preserve the original source while derived layers remain removable.
3. Keep expensive AI capabilities explicit and report which engine produced a result.
4. Store project state separately from runtime image handles.
5. Validate uploads and constrain resource-intensive work before decoding or inference.
6. Keep the canvas, saved project, and final PNG visually consistent.

## Main workflow

1. Open a PNG, JPEG, or WebP image.
2. Set the artboard size and fit.
3. Select or extract an element when needed.
4. Clean up the image, remove a background, or enhance a layer.
5. Add and style text.
6. Reorder, lock, hide, or transform layers.
7. Review the complete artboard.
8. Download a PNG.

## Workspaces

### AI

- Box and lasso selection.
- One-click object cut into a new contour-masked layer.
- Brush refinement and erasing.
- Fixed local BiRefNet soft matting.
- Prompt-assisted object detection with SAM and matte edge refinement.
- Background removal and content-aware cleanup.

### Text

- Multiple text layers.
- Font family, size, weight, color, alignment, spacing, outline, and shadow.
- Local font loading.
- Direct placement and transforms on the artboard.

### Scale

- Fixed local Real-ESRGAN ×2 and ×4 checkpoints when installed.
- Source-preserving enhanced layers.
- Explicit ×2 or ×4 scale selection.
- Separate download of an enhanced layer.

### Output

- PNG as the sole output format.
- Artboard dimensions, transparency, and background controls.
- Client-side download with optional server-side PNG optimization.
- Clear busy, success, and error feedback.

## Static composition model

The project document contains:

- project identity and revision metadata;
- canvas dimensions and background settings;
- asset descriptors;
- ordered layer roots;
- image, mask, depth, overlay, and text layers;
- per-layer visibility, locking, opacity, blend mode, and static transform;
- PNG output settings.

Binary image handles live in the runtime asset registry and are not embedded in editor history commands.

## Rendering

The renderer evaluates one static scene from the authoritative project document. Preview and output use the same layer order and transform semantics. Canvas scale affects raster resolution, not the logical project coordinates.

## Local API

The API exposes health checks, click-point selection, prompt selection, smart segmentation, matte creation, inpainting, upscaling, PNG optimization, project persistence, and generic background-job management.

Every upload must pass:

- byte-size limits;
- accepted file-signature checks;
- complete image decoding;
- maximum dimension checks;
- decompression safety checks.

AI work runs through a bounded executor with per-route rate limits, queue limits, free-memory checks, and model cleanup hooks.

## Reliability requirements

- Opening an unsupported or corrupt file produces a useful error without changing the current project.
- Replacing a source revokes stale object URLs.
- Undo and redo never retain non-serializable browser handles.
- Locked layers cannot be transformed or removed accidentally.
- An output failure releases the editor lock and leaves the project editable.
- Older project documents are normalized to the current static schema before use.
- Missing optional models are reported as unavailable capabilities.

## Accessibility requirements

- All tools are keyboard reachable.
- Icon-only controls have accessible names.
- Status messages use polite or assertive live regions as appropriate.
- Focus returns to a sensible control after dialogs and transient panels close.
- Disabled features explain their requirement.

## Acceptance criteria

- A supported image opens and renders at the expected orientation.
- Layer ordering and visibility match between the editor and downloaded PNG.
- Text styling and image transforms survive project save and restore.
- Selection, cleanup, matte, and upscale failures do not corrupt the source.
- The frontend unit suite, Python suite, API contract check, and production build pass.
