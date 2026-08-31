"""Server-side AI pipeline: select / matte / upscale.

Heavy models run through image_studio.ai.* runners when packages and weights are
available. Missing engines raise — no substitute algorithms.
"""

from __future__ import annotations

import os
from typing import Any


def _env_model(name: str) -> str | None:
    return os.environ.get(name) or None


def default_rembg_model() -> str:
    return os.environ.get("IMAGE_STUDIO_AI_MODEL") or os.environ.get("AI_MODEL") or "isnet-general-use"


def sam2_available() -> bool:
    try:
        from .ai.sam2_runner import sam2_ready

        return sam2_ready()
    except Exception:
        return False


def grounding_dino_available() -> bool:
    try:
        from .ai.grounding_dino_runner import grounding_dino_ready

        return grounding_dino_ready()
    except Exception:
        return False


def matte_available(model: str | None = None) -> bool:
    try:
        from .ai.matte_runner import matte_ready

        return matte_ready(model)
    except Exception:
        return rembg_available()


def realesrgan_available() -> bool:
    try:
        from .ai.realesrgan_runner import upscale_available

        return any(
            upscale_available(model, scale)
            for model, scale in (
                ("realesrgan", 2),
                ("realesrgan", 4),
                ("esrgan", 4),
                ("a-esrgan", 4),
            )
        )
    except Exception:
        return bool(_env_model("REALESRGAN_MODEL") or _env_model("IMAGE_STUDIO_REALESRGAN"))


def gfpgan_available() -> bool:
    from .ai.paths import models_dir

    path = models_dir() / "gfpgan" / "GFPGANv1.4.pth"
    return path.exists() and path.stat().st_size > 1024


def rembg_available() -> bool:
    import importlib.util
    return importlib.util.find_spec("rembg") is not None


def lama_available(model: str | None = None) -> bool:
    try:
        from .ai.lama_runner import lama_ready

        return lama_ready(model)
    except Exception:
        return False


def _rgba_cutout_from_mask(
    bgr,
    mask_png_b64: str,
) -> dict[str, Any]:
    """Apply a binary mask and return a cropped transparent RGBA layer."""
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

    return {
        "cutout_png_base64": base64.b64encode(encode_png(crop)).decode("ascii"),
        "mask_png_base64": mask_png_b64,
        "rect": {
            "x": float(x1),
            "y": float(y1),
            "width": float(x2 - x1 + 1),
            "height": float(y2 - y1 + 1),
        },
    }


def _refine_with_sam2(
    payload: bytes,
    top: dict[str, Any],
) -> dict[str, Any]:
    """Run fixed SAM 2.1 Large on the Grounding DINO box and build an RGBA cutout."""
    from .ai.paths import decode_bgr
    from .ai.sam2_runner import segment_with_sam2

    x1 = float(top["x"])
    y1 = float(top["y"])
    x2 = x1 + float(top["w"])
    y2 = y1 + float(top["h"])
    seg = segment_with_sam2(
        payload,
        point=((x1 + x2) / 2.0, (y1 + y2) / 2.0),
        box=(x1, y1, x2, y2),
    )
    layer = _rgba_cutout_from_mask(decode_bgr(payload), seg["mask_png_base64"])

    return {
        **seg,
        "cutout_png_base64": layer["cutout_png_base64"],
        "rect": layer["rect"],
    }


def detect_objects(
    payload: bytes,
    prompt: str = "",
    confidence: float = 0.35,
) -> dict[str, Any]:
    """Prompt selection: Grounding DINO Swin-B → SAM 2.1 Large → RGBA."""
    from .ai.grounding_dino_runner import pick_best_box

    if not grounding_dino_available():
        raise RuntimeError(
            "Grounding DINO Swin-B is unavailable. Run: python scripts/setup_ai_models.py"
        )
    if not sam2_available():
        raise RuntimeError(
            "SAM 2.1 Large is unavailable. Run: python scripts/setup_ai_models.py"
        )
    prompt = (prompt or "").strip()
    if not prompt:
        raise ValueError("A text prompt is required for Grounding DINO detection.")
    from .ai.grounding_dino_runner import detect_with_grounding_dino

    detected = detect_with_grounding_dino(payload, prompt, confidence=confidence)
    result = {
        "engine": "prompt-selection",
        "boxes": detected.get("boxes") or [],
        "prompt": prompt,
    }
    boxes = result.get("boxes") or []
    top = pick_best_box(boxes, prompt)
    if top is None:
        return result

    seg = _refine_with_sam2(payload, top)
    return {
        **result,
        "selected_box": top,
        "selected_label": top.get("label"),
        "mask_png_base64": seg.get("mask_png_base64"),
        "cutout_png_base64": seg.get("cutout_png_base64"),
        "rect": seg.get("rect"),
        "mask_score": seg.get("score"),
        "refined": True,
        "pipeline": "detect→segment→rgba",
    }


def matte_image(payload: bytes, model: str | None = None) -> dict[str, Any]:
    if not matte_available(model):
        raise RuntimeError(
            "Matte engine not available. pip install rembg "
            "(BiRefNet / RMBG / isnet via rembg sessions)."
        )
    from .ai.matte_runner import matte_with_model

    return matte_with_model(payload, model=model)


def inpaint_image(
    image_payload: bytes,
    mask_payload: bytes,
    *,
    model: str | None = None,
) -> dict[str, Any]:
    """Fill white mask pixels with LaMa only."""
    import base64

    import cv2
    import numpy as np

    from .ai.lama_runner import inpaint_background, prepare_inpaint_mask

    decoded_source = cv2.imdecode(
        np.frombuffer(image_payload, np.uint8), cv2.IMREAD_UNCHANGED
    )
    if decoded_source is None:
        raise RuntimeError("Could not decode image for inpaint")
    source_alpha: np.ndarray | None = None
    if decoded_source.ndim == 3 and decoded_source.shape[2] == 4:
        source_alpha = decoded_source[:, :, 3]
        source = decoded_source[:, :, :3]
    elif decoded_source.ndim == 2:
        source = cv2.cvtColor(decoded_source, cv2.COLOR_GRAY2BGR)
    else:
        source = decoded_source

    mask = _decode_inpaint_mask(mask_payload)

    result = inpaint_background(source, mask, model_id=model)

    encoded_image = result["image_bgr"]
    if source_alpha is not None:
        resized_mask = result.get("mask")
        if resized_mask is None:
            resized_mask = prepare_inpaint_mask(mask, source.shape)
        output_alpha = source_alpha.copy()
        output_alpha[resized_mask > 0] = 255
        encoded_image = np.dstack((encoded_image, output_alpha))

    ok, png = cv2.imencode(".png", encoded_image)
    if not ok:
        raise RuntimeError("Could not encode inpainted image")
    return {
        "engine": result["engine"],
        "fill": result["fill"],
        "image_png_base64": base64.b64encode(png.tobytes()).decode("ascii"),
    }


def _decode_inpaint_mask(mask_payload: bytes):
    """Decode white/high pixels as the mask without mistaking opaque alpha for paint.

    Browser canvases encode black/white masks as fully opaque RGBA. Treating their
    alpha channel as authoritative turns every pixel white and erases the full image.
    Luminance is primary; alpha is only a fallback for genuinely alpha-only masks.
    """
    import cv2
    import numpy as np

    mask_img = cv2.imdecode(np.frombuffer(mask_payload, np.uint8), cv2.IMREAD_UNCHANGED)
    if mask_img is None:
        raise RuntimeError("Could not decode mask for inpaint")
    if mask_img.ndim == 2:
        return mask_img
    if mask_img.shape[2] < 4:
        return cv2.cvtColor(mask_img[:, :, :3], cv2.COLOR_BGR2GRAY)

    alpha = mask_img[:, :, 3]
    luminance = cv2.cvtColor(mask_img[:, :, :3], cv2.COLOR_BGR2GRAY)
    visible_luminance = np.rint(
        luminance.astype(np.float32) * (alpha.astype(np.float32) / 255.0)
    ).astype(np.uint8)
    if np.count_nonzero(visible_luminance):
        return visible_luminance
    if int(alpha.min()) != int(alpha.max()):
        return alpha
    return visible_luminance


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
    if not upscale_available(nid, scale):
        raise RuntimeError(
            "AI upscale is not available. Install spandrel (or realesrgan+basicsr) and place "
            "weights under models/realesrgan, or set REALESRGAN_MODEL / IMAGE_STUDIO_REALESRGAN."
        )

    return upscale_with_realesrgan(payload, scale=scale, model=nid)


# Back-compat aliases used by older call sites
def upscale_realesrgan(payload: bytes, scale: int = 2) -> bytes:
    data, _engine = upscale_image(payload, scale=scale)
    return data


def capability_flags() -> dict[str, Any]:
    from .ai.local_models import catalog

    models = catalog()
    prompt_selection = sam2_available() and grounding_dino_available()
    return {
        "prompt_selection": prompt_selection,
        "matte": matte_available(),
        "lama": lama_available(),
        "realesrgan": realesrgan_available(),
        "gfpgan": gfpgan_available(),
        "rembg": rembg_available(),
        "device": models["device"],
        "models": {
            "matte": models["matte"],
            "lama": models.get("lama") or [],
            "upscale": models["upscale"],
            "models_dir": models["models_dir"],
        },
    }


def active_engines() -> list[str]:
    """Honest list of engines that can actually run right now."""
    caps = capability_flags()
    engines = ["OpenCV GrabCut", "Pillow"]
    if caps["rembg"]:
        engines.append("rembg/ONNX")
    if caps["matte"]:
        engines.append("Matte (BiRefNet/RMBG)")
    if caps.get("lama"):
        engines.append("LaMa inpaint")
    if caps["prompt_selection"]:
        engines.append("Prompt selection")
    if caps["realesrgan"]:
        engines.append("RealESRGAN")
    if caps["gfpgan"]:
        engines.append("GFPGAN (weights only)")
    return engines
