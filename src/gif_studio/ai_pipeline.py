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
            (_env_model("GROUNDING_DINO_CONFIG") and _env_model("GROUNDING_DINO_CHECKPOINT"))
            or _env_model("GROUNDING_DINO_HF_ID")
        )


def yolo_available() -> bool:
    try:
        import ultralytics  # noqa: F401
        return True
    except ImportError:
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


def segment_sam2(payload: bytes, point: tuple[float, float] | None = None) -> dict[str, Any]:
    """Run SAM2 segmentation. Raises if SAM2 is not installed/configured."""
    if not sam2_available():
        raise RuntimeError(
            "SAM2 is not available. Install SAM2 and place weights under models/sam2, "
            "or set SAM2_CHECKPOINT / GIF_STUDIO_SAM2."
        )

    from .ai.sam2_runner import segment_with_sam2

    return segment_with_sam2(payload, point)


def detect_objects(payload: bytes, prompt: str = "", confidence: float = 0.35) -> dict[str, Any]:
    """Run Grounding DINO detection. Raises if the model is not available."""
    if not grounding_dino_available():
        raise RuntimeError(
            "Grounding DINO is not available. Install the package and place weights "
            "under models/groundingdino, or set GROUNDING_DINO_* env vars."
        )
    if not prompt:
        raise ValueError("A text prompt is required for Grounding DINO detection.")

    from .ai.grounding_dino_runner import detect_with_grounding_dino

    return detect_with_grounding_dino(payload, prompt, confidence=confidence)


def upscale_image(payload: bytes, scale: int = 2) -> tuple[bytes, str]:
    """Return (png_bytes, engine_name). Requires RealESRGAN."""
    if not realesrgan_available():
        raise RuntimeError(
            "RealESRGAN is not available. Install spandrel/basicsr and place weights "
            "under models/realesrgan, or set REALESRGAN_MODEL / GIF_STUDIO_REALESRGAN."
        )

    from .ai.realesrgan_runner import upscale_with_realesrgan

    return upscale_with_realesrgan(payload, scale=scale)


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
    return {
        "sam2": sam2_available(),
        "grounding_dino": grounding_dino_available(),
        "yolo": yolo_available(),
        "realesrgan": realesrgan_available(),
        "rife": rife_available(),
        "rembg": rembg_available(),
        "mediapipe_server": False,
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
