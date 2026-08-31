"""Local image-processing API for Image Studio."""

from __future__ import annotations

import base64
import importlib.util
import io
import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Annotated

import cv2
import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from PIL import Image

from .ai_pipeline import default_rembg_model
from .api import jobs_router
from .api.errors import RequestIdMiddleware
from .image_validation import MAX_UPLOAD_BYTES, validate_uploaded_image
from .security_limits import (
    SecurityRateLimitMiddleware,
    acquire_ai_slot,
    rate_limit_status,
    run_blocking,
)

app = FastAPI(title="Image Studio Local API", version="1.0.0")

_CORS_DEFAULT = "http://127.0.0.1:5173,http://localhost:5173"
_cors_origins = [
    origin.strip()
    for origin in os.environ.get("IMAGE_STUDIO_CORS_ORIGINS", _CORS_DEFAULT).split(",")
    if origin.strip()
]
# Added before CORS → runs after CORS on the way in (POST bodies already allowed).
app.add_middleware(RequestIdMiddleware)
app.add_middleware(SecurityRateLimitMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT"],
    allow_headers=["*"],
    expose_headers=[
        "X-Upscale-Engine", "X-PNG-Optimizer", "X-PNG-Bytes",
        "Retry-After", "X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Window",
        "X-Request-Id",
    ],
)

app.include_router(jobs_router)

MAX_IMAGE_BYTES = MAX_UPLOAD_BYTES
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
async def health() -> dict[str, object]:
    from . import ai_pipeline
    from .db import db_available

    caps = ai_pipeline.capability_flags()
    rembg = caps["rembg"]
    device = caps.get("device") or {}
    return {
        "status": "ok",
        "opencv": cv2.__version__,
        "oxipng": shutil.which("oxipng") is not None,
        "ai": rembg,
        "ai_model": default_rembg_model() if rembg else None,
        "rembg": rembg,
        "prompt_selection": caps["prompt_selection"],
        "matte": caps.get("matte", False),
        "lama": caps.get("lama", False),
        "gfpgan": caps.get("gfpgan", False),
        "realesrgan": caps["realesrgan"],
        "device": device,
        "nvidia": bool(device.get("nvidia")) if isinstance(device, dict) else False,
        "upload": {
            "formats": ["png", "jpg", "jpeg", "webp"],
            "max_bytes": MAX_UPLOAD_BYTES,
            "max_dimension": 5000,
        },
        "models": caps.get("models") or {},
        "database": db_available(),
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
    update_background: Annotated[bool, Form()] = True,
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
    # and never looks clipped while rotating or scaling.
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
    engine = "opencv-grabcut"
    foreground: np.ndarray | None = None
    async with acquire_ai_slot("smart_segment"):
        if use_ai and not use_grabcut_only and importlib.util.find_spec("rembg") is not None:
            try:
                foreground = await run_blocking(_ai_mask, payload, model)
                # Limit the general subject mask to the requested object region.
                region = np.zeros_like(foreground)
                region[y : y + height, x : x + width] = foreground[y : y + height, x : x + width]
                foreground = region
                engine = f"rembg:{model}"
            except Exception as exc:
                raise HTTPException(422, f"AI segmentation failed: {exc}") from exc

        ai_too_empty = (
            foreground is None or np.count_nonzero(foreground) < width * height * 0.005
        )
        if use_grabcut_only:
            try:
                foreground = await run_blocking(
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

        result: dict[str, object] = {
            "cutout": _png_data_url(cutout),
            "coverage": round(coverage, 4),
            "engine": engine,
            "rect": {"x": x, "y": y, "width": width, "height": height},
        }
        if update_background:
            # Avoid loading a 200 MB model when a caller only needs the cutout layer.
            from .ai.lama_runner import inpaint_background

            fill_result = await run_blocking(inpaint_background, source, foreground)
            result.update({
                "background": _png_data_url(fill_result["image_bgr"]),
                "fill": fill_result.get("fill") or "opencv-content-aware",
                "fill_engine": fill_result.get("engine"),
            })
        return result


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
            with tempfile.TemporaryDirectory(prefix="image-studio-png-") as directory:
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


# --- AI / project API (SAM2 refine via detect, DINO, RealESRGAN, Postgres) ---


@app.post("/api/ai/detect")
async def ai_detect(
    image: Annotated[UploadFile, File()],
    prompt: Annotated[str, Form()] = "",
    confidence: Annotated[float, Form()] = 0.35,
) -> dict[str, object]:
    """Run the fixed backend prompt-selection pipeline and return an RGBA cutout."""
    payload = await image.read()
    _require_upload_image(payload, image.filename)
    try:
        from .ai_pipeline import detect_objects

        async with acquire_ai_slot("detect"):
            return await run_blocking(
                detect_objects,
                payload,
                prompt,
                confidence,
            )
    except HTTPException:
        raise
    except Exception as exc:
        message = str(exc)
        if "torch" in message.lower() or "c10.dll" in message.lower() or "dll" in message.lower():
            return {
                "engine": "unavailable",
                "detect_engine": "unavailable",
                "boxes": [],
                "selected_box": None,
                "selected_label": None,
                "mask_png_base64": None,
                "mask_score": None,
                "refined": None,
                "prompt": prompt,
                "device": None,
                "note": "AI detection is unavailable because the local PyTorch runtime is not loading correctly on this machine.",
            }
        raise _ai_http_error(exc, default_message="AI detect failed") from exc


@app.post("/api/ai/matte")
async def ai_matte(
    image: Annotated[UploadFile, File()],
    model: Annotated[str, Form()] = "rembg-isnet",
) -> dict[str, object]:
    """Soft alpha matte (BiRefNet / RMBG / rembg) for transparent image layers."""
    payload = await image.read()
    _require_upload_image(payload, image.filename)
    try:
        from .ai_pipeline import matte_image

        async with acquire_ai_slot("matte"):
            return await run_blocking(matte_image, payload, model or None)
    except HTTPException:
        raise
    except Exception as exc:
        raise _ai_http_error(exc, default_message="Matte failed") from exc


@app.post("/api/ai/inpaint")
async def ai_inpaint(
    image: Annotated[UploadFile, File(description="RGB/RGBA plate to fill")],
    mask: Annotated[UploadFile, File(description="White = hole to erase/fill")],
    model: Annotated[str, Form()] = "big-lama",
) -> dict[str, object]:
    """LaMa erase inpaint. White / high mask pixels are filled."""
    image_payload = await image.read()
    mask_payload = await mask.read()
    _require_upload_image(image_payload, image.filename)
    _require_upload_image(mask_payload, mask.filename)
    try:
        from .ai_pipeline import inpaint_image

        async with acquire_ai_slot("inpaint"):
            return await run_blocking(
                inpaint_image,
                image_payload,
                mask_payload,
                model=model or None,
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
):
    payload = await image.read()
    _require_upload_image(payload, image.filename)
    try:
        from .ai_pipeline import upscale_image

        async with acquire_ai_slot("upscale"):
            out, engine = await run_blocking(upscale_image, payload, scale, model)
        return Response(out, media_type="image/png", headers={"X-Upscale-Engine": engine})
    except HTTPException:
        raise
    except Exception as exc:
        raise _ai_http_error(exc, default_message="Upscale failed") from exc


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
