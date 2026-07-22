"""Server-side AI pipeline: select / matte / depth / upscale / interpolate.

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


def sam3_available() -> bool:
    try:
        from .ai.sam3_runner import sam3_ready

        return sam3_ready()
    except Exception:
        return False


def grounding_dino_available() -> bool:
    try:
        from .ai.grounding_dino_runner import grounding_dino_ready

        return grounding_dino_ready()
    except Exception:
        return bool(
            _env_model("GROUNDING_DINO_CONFIG") and _env_model("GROUNDING_DINO_CHECKPOINT")
        )


def matte_available(model: str | None = None) -> bool:
    try:
        from .ai.matte_runner import matte_ready

        return matte_ready(model)
    except Exception:
        return rembg_available()


def depth_available() -> bool:
    try:
        from .ai.depth_runner import depth_ready

        return depth_ready()
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
        return False


def gfpgan_available() -> bool:
    from pathlib import Path
    from .ai.paths import models_dir

    path = models_dir() / "gfpgan" / "GFPGANv1.4.pth"
    return path.exists() and path.stat().st_size > 1024


def rembg_available() -> bool:
    import importlib.util
    return importlib.util.find_spec("rembg") is not None


def _resolve_detect_engine(engine: str | None) -> str:
    """Return ``sam3`` or ``grounding_dino``.

    ``auto`` prefers SAM3 (text→mask) when ready, else Grounding DINO.
    """
    wanted = (engine or "auto").strip().lower().replace("-", "_")
    aliases = {
        "dino": "grounding_dino",
        "groundingdino": "grounding_dino",
        "sam_3": "sam3",
        "sam3.1": "sam3",
    }
    wanted = aliases.get(wanted, wanted)
    if wanted in {"sam3", "grounding_dino"}:
        return wanted
    if sam3_available():
        return "sam3"
    if grounding_dino_available():
        return "grounding_dino"
    raise RuntimeError(
        "No detect engine ready. Install SAM3 and/or Grounding DINO "
        "with local weights (python scripts/setup_ai_models.py)."
    )


def _mask_to_box(mask_png_b64: str, label: str, score: float) -> dict[str, Any] | None:
    """Build a detect-style box from a binary mask PNG (for SAM3 text path)."""
    import base64

    import cv2
    import numpy as np

    raw = base64.b64decode(mask_png_b64)
    arr = np.frombuffer(raw, dtype=np.uint8)
    mask = cv2.imdecode(arr, cv2.IMREAD_GRAYSCALE)
    if mask is None:
        return None
    ys, xs = np.where(mask > 127)
    if xs.size == 0:
        return None
    x1, x2 = int(xs.min()), int(xs.max())
    y1, y2 = int(ys.min()), int(ys.max())
    return {
        "x": float(x1),
        "y": float(y1),
        "w": float(max(1, x2 - x1 + 1)),
        "h": float(max(1, y2 - y1 + 1)),
        "score": float(score),
        "label": label or "object",
    }


def _detect_with_sam3(
    payload: bytes,
    prompt: str,
    sam3_model: str | None = None,
) -> dict[str, Any]:
    """SAM3 text/concept → mask. Replaces Grounding DINO + SAM2 refine (not stacked)."""
    if not sam3_available():
        raise RuntimeError(
            "SAM3 is not available. Install facebookresearch/sam3 and place "
            "weights under models/sam3/ (python scripts/setup_ai_models.py --with-sam3)."
        )
    if not (prompt or "").strip():
        raise ValueError("A text prompt is required for SAM3 concept detect.")
    from .ai.sam3_runner import segment_with_sam3

    seg = segment_with_sam3(
        payload,
        prompt=prompt.strip(),
        model=sam3_model or "sam3",
    )
    mask_b64 = seg.get("mask_png_base64")
    if not mask_b64:
        raise RuntimeError("SAM3 returned no mask")
    box = _mask_to_box(mask_b64, prompt.strip(), float(seg.get("score") or 0))
    boxes = [box] if box else []
    return {
        "engine": seg.get("engine") or "sam3",
        "detect_engine": "sam3",
        "boxes": boxes,
        "selected_box": box,
        "selected_label": (box or {}).get("label") or prompt.strip(),
        "mask_png_base64": mask_b64,
        "mask_score": seg.get("score"),
        "refined": None,
        "prompt": prompt.strip(),
        "device": seg.get("device"),
        "note": "SAM3 text→mask (no Grounding DINO / SAM2 refine)",
    }


def _refine_with_sam2(
    payload: bytes,
    top: dict[str, Any],
    sam2_model: str | None,
) -> dict[str, Any]:
    """Box → mask via SAM2 only (DINO refine). SAM3 is a separate detect engine."""
    if not sam2_available():
        raise RuntimeError("SAM2 not available for mask refine")
    from .ai.sam2_runner import segment_with_sam2

    x1 = float(top["x"])
    y1 = float(top["y"])
    x2 = x1 + float(top["w"])
    y2 = y1 + float(top["h"])
    model = sam2_model if _segment_family(sam2_model) == "sam2" else None
    return segment_with_sam2(
        payload,
        point=((x1 + x2) / 2.0, (y1 + y2) / 2.0),
        box=(x1, y1, x2, y2),
        model=model,
    )


def detect_objects(
    payload: bytes,
    prompt: str = "",
    confidence: float = 0.35,
    refine_sam2: bool = True,
    dino_model: str | None = None,
    sam2_model: str | None = None,
    engine: str | None = "auto",
    sam3_model: str | None = None,
) -> dict[str, Any]:
    """Detect via SAM3 (text→mask) or Grounding DINO + SAM2 refine.

    SAM3 is the upgrade path that *replaces* DINO+SAM2 — never stacked on both.
    """
    from .ai.grounding_dino_runner import pick_best_box

    chosen = _resolve_detect_engine(engine)

    # SAM3 concept detect — single model, no DINO box + SAM refine stack.
    if chosen == "sam3":
        return _detect_with_sam3(
            payload, prompt, sam3_model=sam3_model or sam2_model,
        )

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

    # DINO boxes → SAM2 mask. SAM3 is never used as a refine step.
    if not refine_sam2 or not boxes or top is None:
        return result
    if not sam2_available():
        return {
            **result,
            "refined": None,
            "refine_error": (
                "SAM2 not available — returned box only (square crop). "
                "Install weights under models/sam2, or use detect engine SAM3 "
                "for text→mask without DINO."
            ),
        }

    try:
        seg = _refine_with_sam2(payload, top, sam2_model)
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


def matte_image(payload: bytes, model: str | None = None) -> dict[str, Any]:
    if not matte_available(model):
        raise RuntimeError(
            "Matte engine not available. pip install rembg "
            "(BiRefNet / RMBG / isnet via rembg sessions)."
        )
    from .ai.matte_runner import matte_with_model

    return matte_with_model(payload, model=model)


def depth_image(payload: bytes, model: str | None = None) -> dict[str, Any]:
    if not depth_available():
        raise RuntimeError(
            "Depth Anything V2 not available. Place snapshot under "
            "models/depth/v2-small-hf/ (python scripts/setup_ai_models.py)."
        )
    from .ai.depth_runner import estimate_depth

    return estimate_depth(payload, model=model)


def upscale_image(payload: bytes, scale: int = 2, model: str = "realesrgan") -> tuple[bytes, str]:
    """Return (png_bytes, engine_name). Real-ESRGAN family only."""
    mid = (model or "realesrgan").strip().lower()
    if mid == "gfpgan":
        if not gfpgan_available():
            raise RuntimeError(
                "GFPGAN slot is not ready. Place GFPGANv1.4.pth under models/gfpgan/."
            )
        raise RuntimeError(
            "GFPGAN runner is a catalog slot — use Real-ESRGAN for upscale, then face polish later."
        )

    from .ai.realesrgan_runner import normalize_model, upscale_available, upscale_with_realesrgan

    nid = normalize_model(model)
    if not upscale_available(nid):
        raise RuntimeError(
            "AI upscale is not available. Install spandrel (or realesrgan+basicsr) and place "
            "weights under models/realesrgan, or set REALESRGAN_MODEL / GIF_STUDIO_REALESRGAN."
        )

    return upscale_with_realesrgan(payload, scale=scale, model=nid)


def interpolate_frames(
    frames: list[bytes],
    factor: int = 2,
    model: str | None = "rife",
) -> tuple[list[bytes], str]:
    """Return (frame_pngs, engine_name). RIFE only."""
    mid = (model or "rife").strip().lower()
    if mid != "rife":
        raise RuntimeError(f"Unknown interpolate model {model!r}. Supported: rife.")
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
        "sam3": sam3_available(),
        "grounding_dino": grounding_dino_available(),
        "matte": matte_available(),
        "depth": depth_available(),
        "realesrgan": realesrgan_available(),
        "rife": rife_available(),
        "gfpgan": gfpgan_available(),
        "rembg": rembg_available(),
        "mediapipe_server": False,
        "device": models["device"],
        "allow_huggingface": models["allow_huggingface"],
        "models": {
            "sam2": models["sam2"],
            "sam3": models["sam3"],
            "select_detect": models.get("select_detect") or [],
            "grounding_dino": models["grounding_dino"],
            "matte": models["matte"],
            "depth": models["depth"],
            "interpolate": models["interpolate"],
            "upscale": models["upscale"],
            "models_dir": models["models_dir"],
            "jobs": models["jobs"],
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
    if caps["matte"]:
        engines.append("Matte (BiRefNet/RMBG)")
    if caps["sam2"]:
        engines.append("SAM2")
    if caps["sam3"]:
        engines.append("SAM3")
    if caps["grounding_dino"]:
        engines.append("Grounding DINO")
    if caps["depth"]:
        engines.append("Depth Anything V2")
    if caps["realesrgan"]:
        engines.append("RealESRGAN")
    if caps["rife"]:
        engines.append("RIFE")
    if caps["gfpgan"]:
        engines.append("GFPGAN (weights only)")
    engines.append("MediaPipe (browser)")
    return engines


def shutil_which_gifsicle() -> bool:
    import shutil
    return shutil.which("gifsicle") is not None
