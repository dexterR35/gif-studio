"""Server-side AI pipeline: SAM2 / Grounding DINO / RealESRGAN / RIFE.

Heavy models run through gif_studio.ai.* runners when packages + weights are
available. Missing engines raise — no substitute algorithms.
"""

from __future__ import annotations

import os
from typing import Any


def _env_model(name: str) -> str | None:
    return os.environ.get(name) or None


def default_rembg_model() -> str:
    return os.environ.get("GIF_STUDIO_AI_MODEL") or os.environ.get("AI_MODEL") or "isnet-general-use"


def sam2_available() -> bool:
    try:
        from .ai.sam2_runner import sam2_ready

        return sam2_ready()
    except Exception:
        return bool(_env_model("SAM2_CHECKPOINT") or _env_model("GIF_STUDIO_SAM2"))


def grounding_dino_available() -> bool:
    try:
        from .ai.grounding_dino_runner import grounding_dino_ready

        return grounding_dino_ready()
    except Exception:
        return bool(
            _env_model("GROUNDING_DINO_CONFIG") and _env_model("GROUNDING_DINO_CHECKPOINT")
        )


def yolo_available() -> bool:
    try:
        from .ai.yolo_runner import yolo_ready

        return yolo_ready()
    except Exception:
        return False


def realesrgan_available() -> bool:
    try:
        from .ai.realesrgan_runner import realesrgan_ready

        return realesrgan_ready()
    except Exception:
        return bool(_env_model("REALESRGAN_MODEL") or _env_model("GIF_STUDIO_REALESRGAN"))


def rife_available() -> bool:
    try:
        from .ai.rife_runner import rife_ready

        return rife_ready()
    except Exception:
        # Env alone is not enough — inference requires a RIFE repo checkout.
        return False


def rembg_available() -> bool:
    import importlib.util
    return importlib.util.find_spec("rembg") is not None


def segment_sam2(
    payload: bytes,
    point: tuple[float, float] | None = None,
    box: tuple[float, float, float, float] | None = None,
    model: str | None = None,
) -> dict[str, Any]:
    """Run SAM2 segmentation. Raises if SAM2 is not installed/configured."""
    if not sam2_available():
        raise RuntimeError(
            "SAM2 is not available. Install SAM2 and place weights under models/sam2 "
            "(python scripts/setup_ai_models.py)."
        )

    from .ai.sam2_runner import segment_with_sam2

    return segment_with_sam2(payload, point=point, box=box, model=model)


def _resolve_detect_engine(engine: str | None) -> str:
    """Return ``grounding_dino`` or ``yolo``. ``auto`` prefers DINO, then YOLO."""
    wanted = (engine or "auto").strip().lower().replace("-", "_")
    aliases = {
        "dino": "grounding_dino",
        "groundingdino": "grounding_dino",
        "ultralytics": "yolo",
        "yolov8": "yolo",
        "yolo11": "yolo",
    }
    wanted = aliases.get(wanted, wanted)
    if wanted in {"grounding_dino", "yolo"}:
        return wanted
    if grounding_dino_available():
        return "grounding_dino"
    if yolo_available():
        return "yolo"
    raise RuntimeError(
        "No detect engine ready. Install Grounding DINO and/or Ultralytics YOLO "
        "with local weights (python scripts/setup_ai_models.py)."
    )


def detect_objects(
    payload: bytes,
    prompt: str = "",
    confidence: float = 0.35,
    refine_sam2: bool = True,
    dino_model: str | None = None,
    sam2_model: str | None = None,
    engine: str | None = "auto",
    yolo_model: str | None = None,
) -> dict[str, Any]:
    """Detect with Grounding DINO (open-vocab) or Ultralytics YOLO (COCO), optional SAM2 refine.

    When ``refine_sam2`` is True and SAM2 is available, the selected box is passed to
    SAM2 (Grounded-SAM style) so the cutout follows the object, not the cube.
    """
    from .ai.grounding_dino_runner import pick_best_box

    chosen = _resolve_detect_engine(engine)

    if chosen == "yolo":
        if not yolo_available():
            raise RuntimeError(
                "YOLO is not available. pip install ultralytics and place weights "
                "under models/yolo/ (python scripts/setup_ai_models.py). "
                "See https://github.com/ultralytics/ultralytics"
            )
        from .ai.yolo_runner import detect_with_yolo

        result = detect_with_yolo(
            payload, prompt=prompt, confidence=confidence, model=yolo_model,
        )
    else:
        if not grounding_dino_available():
            raise RuntimeError(
                "Grounding DINO is not available. Install the official package + local "
                "weights (python scripts/setup_ai_models.py)."
            )
        if not prompt:
            raise ValueError("A text prompt is required for Grounding DINO detection.")
        from .ai.grounding_dino_runner import detect_with_grounding_dino

        result = detect_with_grounding_dino(
            payload, prompt, confidence=confidence, model=dino_model,
        )

    result = {**result, "detect_engine": chosen}
    boxes = result.get("boxes") or []
    top = pick_best_box(boxes, prompt) if prompt else (
        max(boxes, key=lambda b: float(b.get("score") or 0)) if boxes else None
    )
    if top is not None:
        result = {**result, "selected_box": top, "selected_label": top.get("label")}

    if not refine_sam2 or not boxes or top is None:
        return result
    if not sam2_available():
        return {
            **result,
            "refined": None,
            "refine_error": (
                "SAM2 not available — returned box only (square crop). "
                "Install SAM2 weights under models/sam2 for object contour."
            ),
        }

    x1 = float(top["x"])
    y1 = float(top["y"])
    x2 = x1 + float(top["w"])
    y2 = y1 + float(top["h"])
    try:
        from .ai.sam2_runner import segment_with_sam2

        seg = segment_with_sam2(
            payload,
            point=((x1 + x2) / 2.0, (y1 + y2) / 2.0),
            box=(x1, y1, x2, y2),
            model=sam2_model,
        )
        result = {
            **result,
            "mask_png_base64": seg.get("mask_png_base64"),
            "mask_score": seg.get("score"),
            "engine": f"{result.get('engine')}+{seg.get('engine')}",
            "refined": "sam2",
        }
    except Exception as exc:
        result = {**result, "refine_error": str(exc), "refined": None}
    return result


def upscale_image(payload: bytes, scale: int = 2, model: str = "realesrgan") -> tuple[bytes, str]:
    """Return (png_bytes, engine_name). Bicubic always works; GAN models need RealESRGAN stack."""
    from .ai.realesrgan_runner import normalize_model, upscale_available, upscale_with_realesrgan

    mid = normalize_model(model)
    if not upscale_available(mid):
        raise RuntimeError(
            "AI upscale is not available. Install spandrel/basicsr and place weights "
            "under models/realesrgan, or set REALESRGAN_MODEL / GIF_STUDIO_REALESRGAN. "
            "Bicubic works without AI packages."
        )

    return upscale_with_realesrgan(payload, scale=scale, model=mid)


def interpolate_frames(frames: list[bytes], factor: int = 2) -> tuple[list[bytes], str]:
    """Return (frame_pngs, engine_name). Requires RIFE."""
    if not rife_available():
        raise RuntimeError(
            "RIFE is not available. Install the RIFE package and place weights "
            "under models/rife, or set RIFE_MODEL / GIF_STUDIO_RIFE."
        )

    from .ai.rife_runner import interpolate_with_rife

    return interpolate_with_rife(frames, factor=factor)


# Back-compat aliases used by older call sites
def upscale_realesrgan(payload: bytes, scale: int = 2) -> bytes:
    data, _engine = upscale_image(payload, scale=scale)
    return data


def interpolate_rife(frames: list[bytes], factor: int = 2) -> list[bytes]:
    data, _engine = interpolate_frames(frames, factor=factor)
    return data


def capability_flags() -> dict[str, Any]:
    from .ai.local_models import catalog

    models = catalog()
    return {
        "sam2": sam2_available(),
        "grounding_dino": grounding_dino_available(),
        "yolo": yolo_available(),
        "realesrgan": realesrgan_available(),
        "rife": rife_available(),
        "rembg": rembg_available(),
        "mediapipe_server": False,
        "device": models["device"],
        "allow_huggingface": models["allow_huggingface"],
        "models": {
            "sam2": models["sam2"],
            "grounding_dino": models["grounding_dino"],
            "yolo": models["yolo"],
            "upscale": models["upscale"],
            "models_dir": models["models_dir"],
        },
    }


def active_engines() -> list[str]:
    """Honest list of engines that can actually run right now."""
    caps = capability_flags()
    engines = ["OpenCV GrabCut", "ImageIO", "Pillow"]
    if shutil_which_gifsicle():
        engines.append("gifsicle")
    if caps["rembg"]:
        engines.append("rembg/ONNX")
    if caps["sam2"]:
        engines.append("SAM2")
    if caps["grounding_dino"]:
        engines.append("Grounding DINO")
    if caps["yolo"]:
        engines.append("YOLO")
    if caps["realesrgan"]:
        engines.append("RealESRGAN")
    if caps["rife"]:
        engines.append("RIFE")
    engines.append("MediaPipe (browser)")
    return engines


def shutil_which_gifsicle() -> bool:
    import shutil
    return shutil.which("gifsicle") is not None
