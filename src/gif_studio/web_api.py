from __future__ import annotations

import base64
import io
import importlib.util
import json
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

app = FastAPI(title="GIF Studio Local API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
    expose_headers=["X-GIF-Encoder", "X-GIF-Optimized", "X-GIF-Original-Bytes", "X-GIF-Bytes", "X-GIF-Compression"],
)

MAX_IMAGE_BYTES = MAX_UPLOAD_BYTES
MAX_FRAMES = 240
AI_MODEL = "isnet-general-use"
_rembg_session = None
_rembg_model: str | None = None


def _reject_upload(exc: ValueError) -> HTTPException:
    message = str(exc)
    status = 413 if "20 MB" in message or "exceeds" in message.lower() else 400
    if "required" in message.lower():
        status = 422
    return HTTPException(status, message)


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
    ai_available = importlib.util.find_spec("rembg") is not None
    return {
        "status": "ok",
        "opencv": cv2.__version__,
        "imageio": iio.__version__ if hasattr(iio, "__version__") else "available",
        "gifsicle": shutil.which("gifsicle") is not None,
        "oxipng": shutil.which("oxipng") is not None,
        "ai": ai_available,
        "ai_model": AI_MODEL if ai_available else None,
        "engines": ["rembg/ONNX", "OpenCV GrabCut", "ImageIO", "gifsicle"],
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
    engine = "opencv-grabcut"
    foreground: np.ndarray | None = None
    if method in {"auto", "ai"} and importlib.util.find_spec("rembg") is not None:
        try:
            foreground = await run_in_threadpool(_ai_mask, payload, model)
            # Limit the general subject mask to the requested object region.
            region = np.zeros_like(foreground)
            region[y : y + height, x : x + width] = foreground[y : y + height, x : x + width]
            foreground = region
            engine = f"rembg:{model}"
        except Exception as exc:
            if method == "ai":
                raise HTTPException(422, f"AI segmentation failed: {exc}") from exc

    if foreground is None or np.count_nonzero(foreground) < width * height * 0.005:
        try:
            foreground = await run_in_threadpool(
                _grabcut_mask, source, rect, max(1, min(iterations, 10))
            )
            engine = "opencv-grabcut"
        except cv2.error as exc:
            raise HTTPException(422, f"GrabCut could not separate this selection: {exc}") from exc

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
