from __future__ import annotations

import base64
import io
import importlib.util
import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Annotated

import cv2
import imageio.v3 as iio
import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from PIL import Image
from starlette.concurrency import run_in_threadpool

from .engine import MAX_UPLOAD_BYTES, validate_uploaded_image
from .ai_pipeline import default_rembg_model
from .security_limits import (
    SecurityRateLimitMiddleware,
    acquire_ai_slot,
    rate_limit_status,
)

app = FastAPI(title="GIF Studio Local API", version="1.0.0")

_CORS_DEFAULT = "http://127.0.0.1:5173,http://localhost:5173"
_cors_origins = [
    origin.strip()
    for origin in os.environ.get("GIF_STUDIO_CORS_ORIGINS", _CORS_DEFAULT).split(",")
    if origin.strip()
]
# Added before CORS → runs after CORS on the way in (POST bodies already allowed).
app.add_middleware(SecurityRateLimitMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT"],
    allow_headers=["*"],
    expose_headers=[
        "X-GIF-Encoder", "X-GIF-Optimized", "X-GIF-Original-Bytes", "X-GIF-Bytes",
        "X-GIF-Compression", "X-Upscale-Engine", "X-Interpolate-Engine",
        "Retry-After", "X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Window",
    ],
)

MAX_IMAGE_BYTES = MAX_UPLOAD_BYTES
MAX_FRAMES = 240
AI_MODEL = default_rembg_model()
_rembg_session = None
_rembg_model: str | None = None


def _clear_rembg_session() -> None:
    global _rembg_session, _rembg_model
    _rembg_session = None
    _rembg_model = None


try:
    from .resource_guard import register_unload_hook

    register_unload_hook(_clear_rembg_session)
except Exception:  # noqa: BLE001
    pass


def _reject_upload(exc: ValueError) -> HTTPException:
    message = str(exc)
    status = 413 if "20 MB" in message or "exceeds" in message.lower() else 400
    if "required" in message.lower():
        status = 422
    return HTTPException(status, message)


def _ai_http_error(exc: BaseException, *, default_message: str) -> HTTPException:
    """Map missing engines → 503, bad input → 422, unexpected → 500."""
    message = str(exc) or default_message
    if isinstance(exc, ValueError):
        return HTTPException(422, message)
    if isinstance(exc, RuntimeError) and "not available" in message.lower():
        return HTTPException(503, message)
    if isinstance(exc, FileNotFoundError):
        return HTTPException(503, message)
    return HTTPException(500, f"{default_message}: {message}")


def _inline_or_queued(result: object, *, inline_builder):
    """When Celery is off, delay() returns a dict — convert to a real response."""
    if isinstance(result, dict) and "job_id" not in result:
        return inline_builder(result)
    job_id = getattr(result, "id", None)
    if job_id is None and isinstance(result, dict):
        job_id = result.get("job_id")
    return {"job_id": job_id or "queued", "status": "queued"}


def _require_upload_image(payload: bytes, filename: str | None = None) -> Image.Image:
    try:
        return validate_uploaded_image(payload, filename=filename)
    except ValueError as exc:
        raise _reject_upload(exc) from exc


def _decode_image(payload: bytes) -> np.ndarray:
    if not payload or len(payload) > MAX_IMAGE_BYTES:
        raise HTTPException(413, "Image is empty or exceeds the 20 MB local API limit.")
    image = cv2.imdecode(np.frombuffer(payload, np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise HTTPException(400, "OpenCV could not decode this image.")
    return image


def _png_data_url(image: np.ndarray) -> str:
    ok, encoded = cv2.imencode(".png", image)
    if not ok:
        raise HTTPException(500, "Could not encode the segmentation result.")
    return "data:image/png;base64," + base64.b64encode(encoded).decode("ascii")


def _ai_mask(payload: bytes, model: str) -> np.ndarray:
    """Return a full-size alpha mask using one reusable local ONNX session."""
    global _rembg_session, _rembg_model
    from rembg import new_session, remove

    if _rembg_session is None or _rembg_model != model:
        _rembg_session = new_session(model)
        _rembg_model = model
    result = remove(payload, session=_rembg_session, post_process_mask=True)
    decoded = cv2.imdecode(np.frombuffer(result, np.uint8), cv2.IMREAD_UNCHANGED)
    if decoded is None or decoded.ndim != 3 or decoded.shape[2] < 4:
        raise RuntimeError("The AI model did not return an alpha mask.")
    return decoded[:, :, 3]


def _grabcut_mask(source: np.ndarray, rect: tuple[int, int, int, int], iterations: int) -> np.ndarray:
    mask = np.zeros(source.shape[:2], np.uint8)
    background_model = np.zeros((1, 65), np.float64)
    foreground_model = np.zeros((1, 65), np.float64)
    cv2.grabCut(
        source,
        mask,
        rect,
        background_model,
        foreground_model,
        iterations,
        cv2.GC_INIT_WITH_RECT,
    )
    return np.where(
        (mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 255, 0
    ).astype("uint8")


@app.get("/api/health")
def health() -> dict[str, object]:
    from . import ai_pipeline
    from .db import db_available
    from .jobs import celery_available
    from .storage import storage_configured

    caps = ai_pipeline.capability_flags()
    rembg = caps["rembg"]
    device = caps.get("device") or {}
    return {
        "status": "ok",
        "opencv": cv2.__version__,
        "imageio": iio.__version__ if hasattr(iio, "__version__") else "available",
        "gifsicle": shutil.which("gifsicle") is not None,
        "oxipng": shutil.which("oxipng") is not None,
        "ai": rembg,
        "ai_model": default_rembg_model() if rembg else None,
        "rembg": rembg,
        "sam2": caps["sam2"],
        "sam3": caps.get("sam3", False),
        "grounding_dino": caps["grounding_dino"],
        "yolo": caps["yolo"],
        "matte": caps.get("matte", False),
        "depth": caps.get("depth", False),
        "lama": caps.get("lama", False),
        "inpaint": caps.get("inpaint", True),
        "film": caps.get("film", False),
        "gfpgan": caps.get("gfpgan", False),
        "realesrgan": caps["realesrgan"],
        "rife": caps["rife"],
        "device": device,
        "nvidia": bool(device.get("nvidia")) if isinstance(device, dict) else False,
        "upload": {
            "formats": ["png", "jpg", "jpeg", "webp"],
            "max_bytes": MAX_UPLOAD_BYTES,
            "max_dimension": 5000,
        },
        "allow_huggingface": caps.get("allow_huggingface", False),
        "models": caps.get("models") or {},
        "database": db_available(),
        "storage": storage_configured(),
        "storage_local": True,
        "celery": celery_available(),
        "engines": ai_pipeline.active_engines(),
        "rate_limit": rate_limit_status(),
    }


@app.post("/api/segment")
async def segment_element(
    image: Annotated[UploadFile, File(description="Current flattened canvas as PNG")],
    x: Annotated[int, Form()],
    y: Annotated[int, Form()],
    width: Annotated[int, Form()],
    height: Annotated[int, Form()],
    iterations: Annotated[int, Form()] = 5,
    method: Annotated[str, Form()] = "auto",
    model: Annotated[str, Form()] = AI_MODEL,
) -> dict[str, object]:
    payload = await image.read()
    _require_upload_image(payload, image.filename)
    source = _decode_image(payload)
    image_height, image_width = source.shape[:2]
    x = max(0, min(x, image_width - 2))
    y = max(0, min(y, image_height - 2))
    width = max(2, min(width, image_width - x))
    height = max(2, min(height, image_height - y))
    if width * height < 64:
        raise HTTPException(400, "Selection is too small for smart segmentation.")

    # Expand a tight user selection so the extracted object has breathing room
    # and never looks clipped while rotating, scaling, or floating.
    padding = max(6, int(round(max(width, height) * 0.1)))
    right = min(image_width, x + width + padding)
    bottom = min(image_height, y + height + padding)
    x = max(0, x - padding)
    y = max(0, y - padding)
    width = right - x
    height = bottom - y

    # Keep the rectangle just inside the image because GrabCut treats everything
    # outside it as definite background.
    rect = (x, y, max(1, width - 1), max(1, height - 1))
    method_key = (method or "auto").strip().lower()
    use_grabcut_only = method_key in {"grabcut", "opencv", "opencv-grabcut"}
    use_ai = method_key in {"auto", "ai"}
    allow_grabcut_fallback = method_key == "auto"
    engine = "opencv-grabcut"
    foreground: np.ndarray | None = None
    async with acquire_ai_slot("smart_segment"):
        if use_ai and not use_grabcut_only and importlib.util.find_spec("rembg") is not None:
            try:
                foreground = await run_in_threadpool(_ai_mask, payload, model)
                # Limit the general subject mask to the requested object region.
                region = np.zeros_like(foreground)
                region[y : y + height, x : x + width] = foreground[y : y + height, x : x + width]
                foreground = region
                engine = f"rembg:{model}"
            except Exception as exc:
                if method_key == "ai" or not allow_grabcut_fallback:
                    raise HTTPException(422, f"AI segmentation failed: {exc}") from exc

        ai_too_empty = (
            foreground is None or np.count_nonzero(foreground) < width * height * 0.005
        )
        if use_grabcut_only or (allow_grabcut_fallback and ai_too_empty):
            try:
                foreground = await run_in_threadpool(
                    _grabcut_mask, source, rect, max(1, min(iterations, 10))
                )
                engine = "opencv-grabcut"
            except cv2.error as exc:
                raise HTTPException(422, f"GrabCut could not separate this selection: {exc}") from exc
        elif method_key == "ai" and ai_too_empty:
            raise HTTPException(
                422,
                "AI matte found no foreground in this selection. "
                "Try another soft-matte model, draw a tighter box, or choose OpenCV GrabCut.",
            )
        elif ai_too_empty:
            raise HTTPException(
                422,
                "No foreground was found. Choose a cutout engine or draw a larger selection.",
            )

        foreground = cv2.morphologyEx(
            foreground, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8)
        )
        foreground = cv2.GaussianBlur(foreground, (3, 3), 0)
        selected_mask = foreground[y : y + height, x : x + width]
        coverage = float(np.count_nonzero(selected_mask > 24)) / float(width * height)
        if coverage < 0.005:
            raise HTTPException(
                422,
                "No foreground was found. Draw a tighter box with some background around the object.",
            )

        crop = source[y : y + height, x : x + width]
        cutout = cv2.cvtColor(crop, cv2.COLOR_BGR2BGRA)
        cutout[:, :, 3] = selected_mask

        # Content-aware fill: remove only the segmented object, preserve every pixel
        # outside its mask, and reconstruct the revealed background from nearby texture.
        kernel_size = max(3, min(11, int(round(max(image_width, image_height) * 0.006)) | 1))
        kernel = np.ones((kernel_size, kernel_size), np.uint8)
        inpaint_mask = cv2.morphologyEx(foreground, cv2.MORPH_CLOSE, kernel)
        inpaint_mask = cv2.dilate(inpaint_mask, kernel, iterations=1)
        radius = max(3, min(15, int(round(max(image_width, image_height) * 0.008))))
        telea = cv2.inpaint(source, inpaint_mask, radius, cv2.INPAINT_TELEA)
        navier_stokes = cv2.inpaint(source, inpaint_mask, radius, cv2.INPAINT_NS)
        reconstructed = cv2.addWeighted(telea, 0.72, navier_stokes, 0.28, 0)
        background = source.copy()
        background[inpaint_mask > 0] = reconstructed[inpaint_mask > 0]
        return {
            "cutout": _png_data_url(cutout),
            "background": _png_data_url(background),
            "coverage": round(coverage, 4),
            "engine": engine,
            "fill": "opencv-content-aware",
            "rect": {"x": x, "y": y, "width": width, "height": height},
        }


@app.post("/api/optimize-png")
async def optimize_png(
    image: Annotated[UploadFile, File(description="PNG image")],
    palette: Annotated[bool, Form()] = False,
) -> Response:
    payload = await image.read()
    if not payload or len(payload) > MAX_IMAGE_BYTES:
        raise HTTPException(413, "PNG is empty or exceeds the 20 MB limit.")
    try:
        source = Image.open(io.BytesIO(payload))
        output = io.BytesIO()
        if palette:
            source.convert("RGBA").quantize(colors=256, method=Image.Quantize.FASTOCTREE).save(
                output, format="PNG", optimize=True, compress_level=9
            )
        else:
            source.save(output, format="PNG", optimize=True, compress_level=9)
        optimized = output.getvalue()
    except Exception as exc:
        raise HTTPException(422, f"Could not optimize PNG: {exc}") from exc

    engine = "pillow-lossless"
    if shutil.which("oxipng"):
        try:
            with tempfile.TemporaryDirectory(prefix="gif-studio-png-") as directory:
                path = Path(directory) / "optimized.png"
                path.write_bytes(optimized)
                subprocess.run(
                    ["oxipng", "-o", "4", "--strip", "safe", str(path)],
                    check=True,
                    capture_output=True,
                    timeout=120,
                )
                optimized = path.read_bytes()
                engine = "oxipng-o4"
        except Exception:
            engine = "pillow-lossless"
    return Response(
        optimized,
        media_type="image/png",
        headers={"X-PNG-Optimizer": engine, "X-PNG-Bytes": str(len(optimized))},
    )


@app.post("/api/export")
async def export_gif(
    frames: Annotated[list[UploadFile], File(description="Ordered PNG animation frames")],
    fps: Annotated[int, Form()] = 15,
    loop: Annotated[int, Form()] = 0,
    palette: Annotated[int, Form()] = 256,
    optimize: Annotated[bool, Form()] = True,
    durations: Annotated[str | None, Form()] = None,
    dither: Annotated[bool, Form()] = True,
    lossy: Annotated[int, Form()] = 0,
    compression_method: Annotated[str, Form()] = "Lossless",
    disposal: Annotated[int, Form()] = 2,
) -> Response:
    if not 2 <= len(frames) <= MAX_FRAMES:
        raise HTTPException(400, f"Export requires 2 to {MAX_FRAMES} frames.")
    fps = max(1, min(fps, 60))
    loop = max(0, min(loop, 65535))
    palette = max(2, min(palette, 256))
    lossy = max(0, min(lossy, 200))
    disposal = disposal if disposal in (1, 2, 3) else 2
    frame_durations: list[int] | int = round(1000 / fps)
    if durations:
        try:
            parsed = json.loads(durations)
            if not isinstance(parsed, list) or len(parsed) != len(frames):
                raise ValueError
            frame_durations = [max(10, min(60_000, int(value))) for value in parsed]
        except (TypeError, ValueError, json.JSONDecodeError) as exc:
            raise HTTPException(400, "Frame durations must be a JSON list matching the frames.") from exc

    decoded: list[np.ndarray] = []
    expected_shape: tuple[int, ...] | None = None
    for upload in frames:
        payload = await upload.read()
        if not payload:
            raise HTTPException(422, "An image file is required.")
        if len(payload) > MAX_IMAGE_BYTES:
            raise HTTPException(413, "One or more frames exceed the 20 MB upload limit.")
        frame = iio.imread(payload, extension=".png")
        if expected_shape is None:
            expected_shape = frame.shape
        elif frame.shape != expected_shape:
            raise HTTPException(400, "All GIF frames must have identical dimensions.")
        decoded.append(frame)

    # Serialize encode with AI jobs; gate on free RAM; cleanup after.
    async with acquire_ai_slot("export"):
        # Build one perceptual palette for the whole animation. A shared palette
        # prevents color pumping/flicker and preserves the full requested 256 colors.
        has_transparency = any(
            frame.ndim == 3 and frame.shape[2] == 4 and np.any(frame[:, :, 3] < 255)
            for frame in decoded
        )
        if not has_transparency:
            sample_images: list[Image.Image] = []
            for frame in decoded[:: max(1, len(decoded) // 12)][:12]:
                sample = Image.fromarray(frame).convert("RGB")
                sample.thumbnail((240, 240), Image.Resampling.LANCZOS)
                sample_images.append(sample)
            sheet_width = sum(sample.width for sample in sample_images)
            sheet_height = max(sample.height for sample in sample_images)
            sheet = Image.new("RGB", (sheet_width, sheet_height))
            cursor = 0
            for sample in sample_images:
                sheet.paste(sample, (cursor, 0))
                cursor += sample.width
            shared_palette = sheet.quantize(
                colors=palette,
                method=Image.Quantize.MEDIANCUT,
                dither=Image.Dither.NONE,
            )
            pillow_dither = Image.Dither.FLOYDSTEINBERG if dither else Image.Dither.NONE
            decoded = [
                np.asarray(
                    Image.fromarray(frame)
                    .convert("RGB")
                    .quantize(palette=shared_palette, dither=pillow_dither)
                    .convert("RGB")
                )
                for frame in decoded
            ]

        unoptimized = io.BytesIO()
        iio.imwrite(
            unoptimized,
            np.stack(decoded),
            extension=".gif",
            plugin="pillow",
            duration=frame_durations,
            loop=loop,
            palettesize=palette,
            optimize=True,
            dither=Image.Dither.FLOYDSTEINBERG if dither else Image.Dither.NONE,
            disposal=disposal,
        )
        gif_bytes = unoptimized.getvalue()
        original_size = len(gif_bytes)
        optimized = False

        if optimize and shutil.which("gifsicle"):
            try:
                from pygifsicle import optimize as optimize_gif

                with tempfile.TemporaryDirectory(prefix="gif-studio-") as directory:
                    source_path = Path(directory) / "source.gif"
                    output_path = Path(directory) / "optimized.gif"
                    source_path.write_bytes(gif_bytes)
                    options = ["--optimize=3"]
                    if compression_method == "Color Reduction":
                        options.append(f"--colors={palette}")
                    if compression_method == "Lossy LZW" and lossy:
                        options.append(f"--lossy={lossy}")
                    optimize_gif(str(source_path), str(output_path), options=options)
                    candidate = output_path.read_bytes()
                    if candidate:
                        gif_bytes = candidate
                        optimized = True
            except Exception:
                # Encoding succeeded, so an unavailable optimizer must never lose the export.
                optimized = False

        return Response(
            gif_bytes,
            media_type="image/gif",
            headers={
                "Content-Disposition": 'attachment; filename="gif-studio-export.gif"',
                "X-GIF-Encoder": "imageio",
                "X-GIF-Optimized": str(optimized).lower(),
                "X-GIF-Original-Bytes": str(original_size),
                "X-GIF-Bytes": str(len(gif_bytes)),
                "X-GIF-Compression": compression_method,
            },
        )


@app.post("/api/compress-gif")
async def compress_gif(
    image: Annotated[UploadFile, File(description="Existing GIF")],
    compression_method: Annotated[str, Form()] = "Lossy LZW",
    lossy: Annotated[int, Form()] = 40,
    colors: Annotated[int, Form()] = 256,
) -> Response:
    payload = await image.read()
    if not payload or len(payload) > 100 * 1024 * 1024:
        raise HTTPException(413, "GIF is empty or exceeds 100 MB.")
    if not payload.startswith((b"GIF87a", b"GIF89a")):
        raise HTTPException(400, "The compressor accepts GIF files only.")
    if not shutil.which("gifsicle"):
        raise HTTPException(503, "gifsicle is not installed on this machine.")
    lossy = max(0, min(lossy, 200))
    colors = max(2, min(colors, 256))
    try:
        from pygifsicle import optimize as optimize_gif

        with tempfile.TemporaryDirectory(prefix="gif-studio-compress-") as directory:
            source_path = Path(directory) / "source.gif"
            output_path = Path(directory) / "compressed.gif"
            source_path.write_bytes(payload)
            options = ["--optimize=3"]
            if compression_method == "Lossy LZW" and lossy:
                options.append(f"--lossy={lossy}")
            elif compression_method == "Color Reduction":
                options.append(f"--colors={colors}")
            optimize_gif(str(source_path), str(output_path), options=options)
            candidate = output_path.read_bytes()
            result = candidate if candidate and len(candidate) < len(payload) else payload
    except Exception as exc:
        raise HTTPException(500, f"gifsicle compression failed: {exc}") from exc
    return Response(
        result,
        media_type="image/gif",
        headers={
            "Content-Disposition": 'attachment; filename="compressed.gif"',
            "X-GIF-Original-Bytes": str(len(payload)),
            "X-GIF-Bytes": str(len(result)),
            "X-GIF-Compression": compression_method,
        },
    )


# --- AI / storage / project API (SAM2, DINO, RealESRGAN, RIFE, Postgres, S3) ---


@app.post("/api/ai/segment")
async def ai_segment(
    image: Annotated[UploadFile, File()],
    point_x: Annotated[float | None, Form()] = None,
    point_y: Annotated[float | None, Form()] = None,
    engine: Annotated[str, Form()] = "sam2",
    model: Annotated[str, Form()] = "",
) -> dict[str, object]:
    payload = await image.read()
    _require_upload_image(payload, image.filename)
    point = (point_x, point_y) if point_x is not None and point_y is not None else None
    # Prefer explicit model id; engine=sam3 selects SAM3 family when model empty.
    mid = model or (engine if engine.startswith("sam") else "") or None
    try:
        from .ai_pipeline import segment_sam2

        async with acquire_ai_slot("segment"):
            return await run_in_threadpool(
                segment_sam2, payload, point, None, mid,
            )
    except HTTPException:
        raise
    except Exception as exc:
        raise _ai_http_error(exc, default_message="AI segment failed") from exc


def _form_bool(value: object, default: bool = True) -> bool:
    """Parse multipart bools reliably (FormData often sends 'true'/'false' strings)."""
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    text = str(value).strip().lower()
    if text in ("1", "true", "yes", "on"):
        return True
    if text in ("0", "false", "no", "off"):
        return False
    return default


@app.post("/api/ai/detect")
async def ai_detect(
    image: Annotated[UploadFile, File()],
    prompt: Annotated[str, Form()] = "",
    confidence: Annotated[float, Form()] = 0.35,
    refine_sam2: Annotated[str, Form()] = "true",
    engine: Annotated[str, Form()] = "auto",
    dino_model: Annotated[str, Form()] = "",
    sam2_model: Annotated[str, Form()] = "",
    yolo_model: Annotated[str, Form()] = "",
    sam3_model: Annotated[str, Form()] = "",
) -> dict[str, object]:
    """Detect: ``sam3`` (text→mask), ``grounding_dino`` + SAM2 refine, or ``yolo`` + SAM2."""
    payload = await image.read()
    _require_upload_image(payload, image.filename)
    try:
        from .ai_pipeline import detect_objects

        async with acquire_ai_slot("detect"):
            return await run_in_threadpool(
                detect_objects,
                payload,
                prompt,
                confidence,
                _form_bool(refine_sam2, True),
                dino_model or None,
                sam2_model or None,
                engine or "auto",
                yolo_model or None,
                sam3_model or None,
            )
    except HTTPException:
        raise
    except Exception as exc:
        raise _ai_http_error(exc, default_message="AI detect failed") from exc


@app.post("/api/ai/matte")
async def ai_matte(
    image: Annotated[UploadFile, File()],
    model: Annotated[str, Form()] = "rembg-isnet",
) -> dict[str, object]:
    """Soft alpha matte (BiRefNet / RMBG / rembg) for transparent GIF layers."""
    payload = await image.read()
    _require_upload_image(payload, image.filename)
    try:
        from .ai_pipeline import matte_image

        async with acquire_ai_slot("matte"):
            return await run_in_threadpool(matte_image, payload, model or None)
    except HTTPException:
        raise
    except Exception as exc:
        raise _ai_http_error(exc, default_message="Matte failed") from exc


@app.post("/api/ai/depth")
async def ai_depth(
    image: Annotated[UploadFile, File()],
    model: Annotated[str, Form()] = "depth-anything-v2-small",
) -> dict[str, object]:
    """Depth Anything V2 map for parallax / Ken Burns."""
    payload = await image.read()
    _require_upload_image(payload, image.filename)
    try:
        from .ai_pipeline import depth_image

        async with acquire_ai_slot("depth"):
            return await run_in_threadpool(depth_image, payload, model or None)
    except HTTPException:
        raise
    except Exception as exc:
        raise _ai_http_error(exc, default_message="Depth failed") from exc


@app.post("/api/ai/inpaint")
async def ai_inpaint(
    image: Annotated[UploadFile, File()],
    mask: Annotated[UploadFile | None, File()] = None,
    mask_png_base64: Annotated[str, Form()] = "",
    model: Annotated[str, Form()] = "auto",
) -> dict[str, object]:
    """Fill erased region — LaMa when ready, else OpenCV Telea/NS."""
    payload = await image.read()
    _require_upload_image(payload, image.filename)
    mask_bytes = await mask.read() if mask is not None else None
    try:
        from .ai_pipeline import inpaint_image

        async with acquire_ai_slot("inpaint"):
            return await run_in_threadpool(
                inpaint_image,
                payload,
                mask_bytes,
                mask_png_base64 or None,
                model or "auto",
            )
    except HTTPException:
        raise
    except Exception as exc:
        raise _ai_http_error(exc, default_message="Inpaint failed") from exc


@app.post("/api/ai/upscale")
async def ai_upscale(
    image: Annotated[UploadFile, File()],
    scale: Annotated[int, Form()] = 2,
    model: Annotated[str, Form()] = "realesrgan",
    async_job: Annotated[bool, Form()] = False,
):
    payload = await image.read()
    _require_upload_image(payload, image.filename)
    if async_job:
        from .jobs import job_upscale
        from .storage import get_bytes, put_bytes

        key = put_bytes(payload, content_type="image/png")
        result = job_upscale.delay(key, scale, model)

        def build_inline(data: dict) -> Response:
            out = get_bytes(data["storage_key"])
            return Response(
                out,
                media_type="image/png",
                headers={"X-Upscale-Engine": str(data.get("engine") or model or "realesrgan")},
            )

        return _inline_or_queued(result, inline_builder=build_inline)
    try:
        from .ai_pipeline import upscale_image

        async with acquire_ai_slot("upscale"):
            out, engine = await run_in_threadpool(upscale_image, payload, scale, model)
        return Response(out, media_type="image/png", headers={"X-Upscale-Engine": engine})
    except HTTPException:
        raise
    except Exception as exc:
        raise _ai_http_error(exc, default_message="Upscale failed") from exc


@app.post("/api/ai/interpolate")
async def ai_interpolate(
    frames: Annotated[list[UploadFile], File()],
    factor: Annotated[int, Form()] = 2,
    model: Annotated[str, Form()] = "rife",
    async_job: Annotated[bool, Form()] = False,
) -> dict[str, object]:
    if len(frames) < 2:
        raise HTTPException(400, "Need at least two frames to interpolate.")
    payloads: list[bytes] = []
    for upload in frames[:MAX_FRAMES]:
        data = await upload.read()
        _require_upload_image(data, upload.filename)
        payloads.append(data)

    if async_job:
        from .jobs import job_interpolate
        from .storage import get_bytes, put_bytes

        keys = [put_bytes(p, content_type="image/png") for p in payloads]
        result = job_interpolate.delay(keys, factor)

        def build_inline(data: dict) -> dict[str, object]:
            outs = [get_bytes(k) for k in data.get("frame_keys") or []]
            return {
                "engine": data.get("engine") or model or "rife",
                "frames": [
                    "data:image/png;base64," + base64.b64encode(b).decode("ascii") for b in outs
                ],
            }

        return _inline_or_queued(result, inline_builder=build_inline)

    try:
        from .ai_pipeline import interpolate_frames

        async with acquire_ai_slot("interpolate"):
            outs, engine = await run_in_threadpool(
                interpolate_frames, payloads, factor, model or "rife",
            )
        return {
            "engine": engine,
            "frames": [
                "data:image/png;base64," + base64.b64encode(b).decode("ascii") for b in outs
            ],
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise _ai_http_error(exc, default_message="Interpolate failed") from exc


@app.post("/api/projects")
async def create_project(document: dict[str, object] | None = None) -> dict[str, object]:
    payload = document or {}
    from .db import Project, get_session

    session = get_session()
    if session is None:
        from uuid import uuid4

        return {
            "id": str(uuid4()),
            "persisted": False,
            "document": payload,
            "note": "DATABASE_URL not set — project kept client-side only.",
        }
    try:
        row = Project(name=payload.get("name", "Untitled"), document=payload)
        session.add(row)
        session.commit()
        session.refresh(row)
        return {"id": row.id, "persisted": True, "name": row.name}
    finally:
        session.close()


@app.get("/api/projects/{project_id}")
async def get_project(project_id: str) -> dict[str, object]:
    from .db import Project, get_session

    session = get_session()
    if session is None:
        raise HTTPException(503, "DATABASE_URL is not configured.")
    try:
        row = session.get(Project, project_id)
        if row is None:
            raise HTTPException(404, "Project not found.")
        return {
            "id": row.id,
            "name": row.name,
            "document": row.document,
            "updated_at": row.updated_at.isoformat() if row.updated_at else None,
        }
    finally:
        session.close()


@app.put("/api/projects/{project_id}")
async def update_project(project_id: str, document: dict[str, object]) -> dict[str, object]:
    from datetime import datetime

    from .db import Project, get_session

    session = get_session()
    if session is None:
        raise HTTPException(503, "DATABASE_URL is not configured.")
    try:
        row = session.get(Project, project_id)
        if row is None:
            raise HTTPException(404, "Project not found.")
        row.document = document
        row.name = document.get("name", row.name)
        row.updated_at = datetime.utcnow()
        session.commit()
        return {"id": row.id, "persisted": True}
    finally:
        session.close()


@app.post("/api/assets")
async def upload_asset(
    file: Annotated[UploadFile, File()],
    project_id: Annotated[str | None, Form()] = None,
) -> dict[str, object]:
    payload = await file.read()
    _require_upload_image(payload, file.filename)
    from .storage import put_bytes, storage_configured

    key = put_bytes(payload, content_type=file.content_type or "application/octet-stream")
    asset_id = None
    from .db import Asset, get_session

    session = get_session()
    if session is not None and project_id:
        try:
            row = Asset(
                project_id=project_id,
                storage_key=key,
                filename=file.filename or "",
                bytes=len(payload),
            )
            session.add(row)
            session.commit()
            session.refresh(row)
            asset_id = row.id
        finally:
            session.close()
    return {
        "id": asset_id,
        "storage_key": key,
        "s3": storage_configured(),
        "bytes": len(payload),
    }
