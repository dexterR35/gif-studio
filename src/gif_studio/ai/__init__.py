"""Optional heavy AI runners: SAM2, Grounding DINO, Real-ESRGAN.

Imports are deferred so FastAPI still starts without torch installed.
"""

from __future__ import annotations

__all__ = [
    "detect_with_grounding_dino",
    "grounding_dino_ready",
    "realesrgan_ready",
    "sam2_ready",
    "segment_with_sam2",
    "upscale_with_realesrgan",
]


def __getattr__(name: str):
    if name in ("sam2_ready", "segment_with_sam2"):
        from .sam2_runner import sam2_ready, segment_with_sam2

        return {"sam2_ready": sam2_ready, "segment_with_sam2": segment_with_sam2}[name]
    if name in ("grounding_dino_ready", "detect_with_grounding_dino"):
        from .grounding_dino_runner import detect_with_grounding_dino, grounding_dino_ready

        return {
            "grounding_dino_ready": grounding_dino_ready,
            "detect_with_grounding_dino": detect_with_grounding_dino,
        }[name]
    if name in ("realesrgan_ready", "upscale_with_realesrgan", "upscale_available", "normalize_model"):
        from .realesrgan_runner import (
            normalize_model,
            realesrgan_ready,
            upscale_available,
            upscale_with_realesrgan,
        )

        return {
            "realesrgan_ready": realesrgan_ready,
            "upscale_available": upscale_available,
            "normalize_model": normalize_model,
            "upscale_with_realesrgan": upscale_with_realesrgan,
        }[name]
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
