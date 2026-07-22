"""Server-side AI pipeline: select / matte / upscale.

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


def realesrgan_available() -> bool:
    try:
        from .ai.realesrgan_runner import realesrgan_ready

        return realesrgan_ready()
    except Exception:
        return bool(_env_model("REALESRGAN_MODEL") or _env_model("GIF_STUDIO_REALESRGAN"))


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


def _segment_family(model: str | None) -> str | None:
    """Return ``sam2`` / ``sam3`` when ``model`` names that family; else None."""
    if not model:
        return None
    mid = str(model).strip().lower().replace("-", "_")
    if mid.startswith("sam3") or mid in {"sam_3"}:
        return "sam3"
    if mid.startswith("sam2") or "hiera" in mid or mid.startswith("sam_2"):
        return "sam2"
    return None


def _prefer_sam2_large(sam2_model: str | None) -> str | None:
    """Use caller model, else prefer SAM 2.1 Large when weights exist on disk."""
    if sam2_model and _segment_family(sam2_model) == "sam2":
        return sam2_model
    try:
        from .ai.local_models import list_sam2_models

        ready = {m["id"]: m for m in list_sam2_models() if m.get("ready")}
        for preferred in (
            "sam2.1_hiera_large",
            "sam2.1_hiera_base_plus",
            "sam2.1_hiera_small",
            "sam2.1_hiera_tiny",
        ):
            if preferred in ready:
                return preferred
    except Exception:
        pass
    return sam2_model if _segment_family(sam2_model) == "sam2" else None


def _detect_upscale_scale() -> int:
    """Upscale factor for DINO→SAM refine. ``0``/``1`` disables. Default 4."""
    raw = os.environ.get("GIF_STUDIO_DETECT_UPSCALE", "4")
    try:
        scale = int(raw)
    except ValueError:
        scale = 4
    return max(0, min(4, scale))


def _upscale_for_detect(payload: bytes, scale: int) -> tuple[bytes, str, float, float]:
    """Real-ESRGAN upscale for detect refine.

    Returns ``(png_bytes, engine, scale_x, scale_y)``. On failure / scale≤1,
    returns the original payload with scale 1.
    """
    import cv2

    from .ai.paths import decode_bgr

    src = decode_bgr(payload)
    sh, sw = src.shape[:2]
    if scale <= 1 or not realesrgan_available():
        return payload, "identity", 1.0, 1.0

    # Try requested scale, then smaller factors if size/RAM guards refuse.
    last_err: Exception | None = None
    for try_scale in (scale, 2) if scale > 2 else (scale,):
        try:
            out, engine = upscale_image(payload, scale=try_scale, model="realesrgan")
            up = decode_bgr(out)
            uh, uw = up.shape[:2]
            sx = float(uw) / float(max(1, sw))
            sy = float(uh) / float(max(1, sh))
            # Optional GFPGAN face polish when weights exist (best-effort).
            polished, gfp = _maybe_gfpgan(out)
            if gfp:
                return polished, f"{engine}+{gfp}", sx, sy
            return out, engine, sx, sy
        except Exception as exc:  # noqa: BLE001
            last_err = exc
            continue

    # Fallback: Lanczos so bbox still scales consistently when AI upscale fails.
    if scale > 1:
        bgr = src if src.ndim == 3 else cv2.cvtColor(src, cv2.COLOR_GRAY2BGR)
        if bgr.shape[2] == 4:
            bgr = cv2.cvtColor(bgr, cv2.COLOR_BGRA2BGR)
        resized = cv2.resize(
            bgr,
            (int(sw * scale), int(sh * scale)),
            interpolation=cv2.INTER_LANCZOS4,
        )
        ok, buf = cv2.imencode(".png", resized)
        if ok:
            return buf.tobytes(), f"lanczos-x{scale}", float(scale), float(scale)
    if last_err:
        return payload, f"identity({last_err})", 1.0, 1.0
    return payload, "identity", 1.0, 1.0


def _maybe_gfpgan(payload: bytes) -> tuple[bytes, str | None]:
    """Best-effort GFPGAN face polish after Real-ESRGAN. No-op if unavailable."""
    if not gfpgan_available():
        return payload, None
    try:
        import cv2
        import numpy as np
        import torch
        from gfpgan import GFPGANer

        from .ai.paths import decode_bgr, encode_png, models_dir, torch_device

        weight = models_dir() / "gfpgan" / "GFPGANv1.4.pth"
        device = torch_device()
        restorer = GFPGANer(
            model_path=str(weight),
            upscale=1,
            arch="clean",
            channel_multiplier=2,
            bg_upsampler=None,
            device=device,
        )
        bgr = decode_bgr(payload)
        if bgr.ndim == 2:
            bgr = cv2.cvtColor(bgr, cv2.COLOR_GRAY2BGR)
        elif bgr.shape[2] == 4:
            bgr = cv2.cvtColor(bgr, cv2.COLOR_BGRA2BGR)
        _cropped, _restored, output = restorer.enhance(
            bgr, has_aligned=False, only_center_face=False, paste_back=True,
        )
        if output is None:
            return payload, None
        return encode_png(np.asarray(output)), "gfpgan"
    except Exception:
        return payload, None


def _scale_box(top: dict[str, Any], sx: float, sy: float) -> dict[str, float]:
    return {
        "x": float(top["x"]) * sx,
        "y": float(top["y"]) * sy,
        "w": float(top["w"]) * sx,
        "h": float(top["h"]) * sy,
    }


def _rgba_cutout_from_mask(
    bgr,
    mask_png_b64: str,
    scale_x: float,
    scale_y: float,
) -> dict[str, Any]:
    """Bitwise-AND RGB with binary mask → cropped transparent RGBA + original-space rect."""
    import base64

    import cv2
    import numpy as np

    from .ai.paths import encode_png

    raw = base64.b64decode(mask_png_b64)
    arr = np.frombuffer(raw, dtype=np.uint8)
    mask = cv2.imdecode(arr, cv2.IMREAD_GRAYSCALE)
    if mask is None:
        raise RuntimeError("Could not decode SAM mask")

    if bgr.ndim == 2:
        bgr = cv2.cvtColor(bgr, cv2.COLOR_GRAY2BGR)
    elif bgr.shape[2] == 4:
        bgr = cv2.cvtColor(bgr, cv2.COLOR_BGRA2BGR)

    h, w = bgr.shape[:2]
    if mask.shape[0] != h or mask.shape[1] != w:
        mask = cv2.resize(mask, (w, h), interpolation=cv2.INTER_NEAREST)

    binary = (mask > 127).astype(np.uint8)
    rgba = cv2.cvtColor(bgr, cv2.COLOR_BGR2BGRA)
    rgba[:, :, 3] = binary * 255

    ys, xs = np.where(binary > 0)
    if xs.size == 0:
        raise RuntimeError("SAM mask was empty")

    pad = 2
    x1 = max(0, int(xs.min()) - pad)
    y1 = max(0, int(ys.min()) - pad)
    x2 = min(w - 1, int(xs.max()) + pad)
    y2 = min(h - 1, int(ys.max()) + pad)
    crop = rgba[y1 : y2 + 1, x1 : x2 + 1]

    sx = max(1e-6, float(scale_x))
    sy = max(1e-6, float(scale_y))
    return {
        "cutout_png_base64": base64.b64encode(encode_png(crop)).decode("ascii"),
        "mask_png_base64": mask_png_b64,
        "rect": {
            "x": float(x1) / sx,
            "y": float(y1) / sy,
            "width": float(x2 - x1 + 1) / sx,
            "height": float(y2 - y1 + 1) / sy,
        },
    }


def _refine_with_sam2(
    payload: bytes,
    top: dict[str, Any],
    sam2_model: str | None,
) -> dict[str, Any]:
    """DINO box → Real-ESRGAN (+ optional GFPGAN) → scale box → SAM2 → RGBA cutout.

    Image resolution before/after upscale is irrelevant to callers: boxes/`rect`
    stay in the *original* image coordinate space; cutout pixels may be denser.
    """
    if not sam2_available():
        raise RuntimeError("SAM2 not available for mask refine")

    import base64

    from .ai.paths import decode_bgr
    from .ai.sam2_runner import segment_with_sam2

    want_scale = _detect_upscale_scale()
    up_payload, up_engine, sx, sy = _upscale_for_detect(payload, want_scale)
    scaled = _scale_box(top, sx, sy)
    x1, y1 = scaled["x"], scaled["y"]
    x2, y2 = x1 + scaled["w"], y1 + scaled["h"]

    model = _prefer_sam2_large(sam2_model)
    seg = segment_with_sam2(
        up_payload,
        point=((x1 + x2) / 2.0, (y1 + y2) / 2.0),
        box=(x1, y1, x2, y2),
        model=model,
    )

    bgr = decode_bgr(up_payload)
    layer = _rgba_cutout_from_mask(
        bgr, seg["mask_png_base64"], scale_x=sx, scale_y=sy,
    )

    # Full-frame mask in *original* resolution for UI compositing onto canvas.
    orig = decode_bgr(payload)
    oh, ow = orig.shape[:2]
    import cv2
    import numpy as np

    raw = base64.b64decode(seg["mask_png_base64"])
    mask_hr = cv2.imdecode(np.frombuffer(raw, dtype=np.uint8), cv2.IMREAD_GRAYSCALE)
    if mask_hr is not None and (mask_hr.shape[0] != oh or mask_hr.shape[1] != ow):
        mask_orig = cv2.resize(mask_hr, (ow, oh), interpolation=cv2.INTER_NEAREST)
        from .ai.paths import encode_png

        mask_b64_orig = base64.b64encode(encode_png(mask_orig)).decode("ascii")
    else:
        mask_b64_orig = seg["mask_png_base64"]

    return {
        **seg,
        "mask_png_base64": mask_b64_orig,
        "mask_png_base64_hr": seg.get("mask_png_base64"),
        "cutout_png_base64": layer["cutout_png_base64"],
        "rect": layer["rect"],
        "upscale_engine": up_engine,
        "upscale_scale_x": sx,
        "upscale_scale_y": sy,
        "scaled_box": scaled,
        "engine": f"{up_engine}+{seg.get('engine')}",
    }


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
    """Detect via SAM3 (text→mask) or Grounding DINO + upscale + SAM2 refine.

    DINO path: box on input → Real-ESRGAN (×N) → scale box → SAM2 → RGBA cutout.
    SAM3 replaces that stack entirely (never stacked on DINO).
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

    # DINO → upscale → SAM2 → RGBA. SAM3 is never used as a refine step.
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
            "mask_png_base64_hr": seg.get("mask_png_base64_hr"),
            "cutout_png_base64": seg.get("cutout_png_base64"),
            "rect": seg.get("rect"),
            "mask_score": seg.get("score"),
            "upscale_engine": seg.get("upscale_engine"),
            "upscale_scale_x": seg.get("upscale_scale_x"),
            "upscale_scale_y": seg.get("upscale_scale_y"),
            "scaled_box": seg.get("scaled_box"),
            "engine": f"{result.get('engine')}+{seg.get('engine')}",
            "refined": "sam2",
            "pipeline": "dino→realesrgan→sam2→rgba",
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


# Back-compat aliases used by older call sites
def upscale_realesrgan(payload: bytes, scale: int = 2) -> bytes:
    data, _engine = upscale_image(payload, scale=scale)
    return data


def capability_flags() -> dict[str, Any]:
    from .ai.local_models import catalog

    models = catalog()
    return {
        "sam2": sam2_available(),
        "sam3": sam3_available(),
        "grounding_dino": grounding_dino_available(),
        "matte": matte_available(),
        "realesrgan": realesrgan_available(),
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
    if caps["realesrgan"]:
        engines.append("RealESRGAN")
    if caps["gfpgan"]:
        engines.append("GFPGAN (weights only)")
    engines.append("MediaPipe (browser)")
    return engines


def shutil_which_gifsicle() -> bool:
    import shutil
    return shutil.which("gifsicle") is not None
