"""Server-side AI pipeline: select / matte / upscale.

Heavy models run through image_studio.ai.* runners when packages and weights are
available. Missing engines raise — no substitute algorithms.
"""

from __future__ import annotations

from math import isfinite
from typing import Any


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


def matte_available() -> bool:
    try:
        from .ai.matte_runner import matte_ready

        return matte_ready()
    except Exception:
        return False


def realesrgan_available() -> bool:
    try:
        from .ai.realesrgan_runner import upscale_available

        return any(upscale_available(scale) for scale in (2, 4))
    except Exception:
        return False


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
    """Apply a hard or soft mask and return a contour-cropped RGBA layer."""
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

    alpha = mask.astype(np.uint8)
    rgba = cv2.cvtColor(bgr, cv2.COLOR_BGR2BGRA)
    rgba[:, :, 3] = alpha

    ys, xs = np.where(alpha > 2)
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


def _encode_mask(mask) -> str:
    import base64

    from .ai.paths import encode_png

    return base64.b64encode(encode_png(mask)).decode("ascii")


def _decode_mask(mask_png_b64: str):
    import base64

    import cv2
    import numpy as np

    decoded = cv2.imdecode(
        np.frombuffer(base64.b64decode(mask_png_b64), dtype=np.uint8),
        cv2.IMREAD_GRAYSCALE,
    )
    if decoded is None:
        raise RuntimeError("Could not decode selection mask")
    return decoded


def _isolate_component_at_point(mask_png_b64: str, point: tuple[float, float]) -> str:
    """Discard disconnected SAM islands and keep the component under the click."""
    import cv2
    import numpy as np

    mask = _decode_mask(mask_png_b64)
    binary = (mask > 127).astype(np.uint8)
    count, labels = cv2.connectedComponents(binary, connectivity=8)
    if count <= 2:
        return _encode_mask(binary * 255)

    h, w = binary.shape
    px = int(np.clip(round(point[0]), 0, w - 1))
    py = int(np.clip(round(point[1]), 0, h - 1))
    label = int(labels[py, px])
    if label == 0:
        radius = max(2, min(12, round(min(w, h) * 0.01)))
        y1, y2 = max(0, py - radius), min(h, py + radius + 1)
        x1, x2 = max(0, px - radius), min(w, px + radius + 1)
        nearby = labels[y1:y2, x1:x2]
        foreground = nearby[nearby > 0]
        if foreground.size:
            values, frequencies = np.unique(foreground, return_counts=True)
            label = int(values[int(np.argmax(frequencies))])
    if label == 0:
        areas = np.bincount(labels.ravel())
        label = int(np.argmax(areas[1:]) + 1)
    return _encode_mask((labels == label).astype(np.uint8) * 255)


def _refine_sam_edges_with_birefnet(
    payload: bytes,
    sam_mask_png_b64: str,
) -> tuple[str, bool]:
    """Use fixed BiRefNet only in a narrow band around the SAM object contour."""
    import cv2
    import numpy as np

    from .ai.matte_runner import matte_with_model

    sam_mask = _decode_mask(sam_mask_png_b64)
    matte = _decode_mask(matte_with_model(payload)["mask_png_base64"])
    h, w = sam_mask.shape
    if matte.shape != sam_mask.shape:
        matte = cv2.resize(matte, (w, h), interpolation=cv2.INTER_LINEAR)

    sam_binary = (sam_mask > 127).astype(np.uint8)
    sam_area = int(np.count_nonzero(sam_binary))
    if sam_area == 0:
        return sam_mask_png_b64, False

    # A global matte can target a different foreground object. In that case SAM is
    # safer; only blend when BiRefNet substantially overlaps the grounded object.
    overlap = int(np.count_nonzero((matte > 24) & (sam_binary > 0))) / sam_area
    if overlap < 0.2:
        return sam_mask_png_b64, False

    radius = max(2, min(10, round(min(w, h) * 0.004)))
    kernel = cv2.getStructuringElement(
        cv2.MORPH_ELLIPSE,
        (radius * 2 + 1, radius * 2 + 1),
    )
    inner = cv2.erode(sam_binary, kernel)
    outer = cv2.dilate(sam_binary, kernel)
    boundary = (outer > 0) & (inner == 0)
    refined = np.zeros_like(matte, dtype=np.uint8)
    refined[inner > 0] = 255
    refined[boundary] = matte[boundary]
    if np.count_nonzero(refined > 2) == 0:
        return sam_mask_png_b64, False
    return _encode_mask(refined), True


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
    mask_png_b64, matte_refined = _refine_sam_edges_with_birefnet(
        payload,
        seg["mask_png_base64"],
    )
    layer = _rgba_cutout_from_mask(decode_bgr(payload), mask_png_b64)

    return {
        **seg,
        "mask_png_base64": mask_png_b64,
        "cutout_png_base64": layer["cutout_png_base64"],
        "rect": layer["rect"],
        "matte_refined": matte_refined,
    }


def point_cutout(payload: bytes, x: float, y: float) -> dict[str, Any]:
    """Cut the clicked object with fixed SAM 2.1 Large and return an RGBA layer."""
    from .ai.paths import decode_bgr
    from .ai.sam2_runner import segment_with_sam2

    if not sam2_available():
        raise RuntimeError(
            "Point selection is unavailable. Run: python scripts/setup_ai_models.py"
        )
    bgr = decode_bgr(payload)
    height, width = bgr.shape[:2]
    px = float(x)
    py = float(y)
    if not isfinite(px) or not isfinite(py):
        raise ValueError("Click coordinates must be finite numbers.")
    if px < 0 or py < 0 or px >= width or py >= height:
        raise ValueError("Click is outside the image canvas.")

    seg = segment_with_sam2(payload, point=(px, py))
    mask_png_b64 = _isolate_component_at_point(seg["mask_png_base64"], (px, py))
    layer = _rgba_cutout_from_mask(bgr, mask_png_b64)
    return {
        "engine": "point-selection",
        "pipeline": "point→segment→rgba",
        "point": {"x": px, "y": py},
        "mask_png_base64": mask_png_b64,
        "cutout_png_base64": layer["cutout_png_base64"],
        "rect": layer["rect"],
        "mask_score": seg.get("score"),
    }


def detect_objects(
    payload: bytes,
    prompt: str = "",
    confidence: float = 0.35,
) -> dict[str, Any]:
    """Prompt selection: text grounding → SAM contour → BiRefNet edge matte."""
    from .ai.grounding_dino_runner import pick_best_box

    if not grounding_dino_available():
        raise RuntimeError(
            "Grounding DINO Swin-B is unavailable. Run: python scripts/setup_ai_models.py"
        )
    if not sam2_available():
        raise RuntimeError(
            "SAM 2.1 Large is unavailable. Run: python scripts/setup_ai_models.py"
        )
    if not matte_available():
        raise RuntimeError(
            "BiRefNet is unavailable. Run: python scripts/setup_ai_models.py"
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
        "matte_refined": seg.get("matte_refined", False),
        "refined": True,
        "pipeline": "detect→segment→matte→rgba",
    }


def matte_image(payload: bytes) -> dict[str, Any]:
    if not matte_available():
        raise RuntimeError(
            "BiRefNet is unavailable. Run: python scripts/setup_ai_models.py"
        )
    from .ai.matte_runner import matte_with_model

    return matte_with_model(payload)


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


def upscale_image(payload: bytes, scale: int = 2) -> tuple[bytes, str]:
    """Return PNG bytes and engine name using fixed Real-ESRGAN ×2 or ×4."""
    from .ai.realesrgan_runner import (
        normalize_scale,
        upscale_available,
        upscale_with_realesrgan,
    )

    normalized_scale = normalize_scale(scale)
    if not upscale_available(normalized_scale):
        raise RuntimeError(
            f"Real-ESRGAN ×{normalized_scale} is not available. Install spandrel "
            "and place the matching checkpoint under models/realesrgan/."
        )

    return upscale_with_realesrgan(payload, scale=normalized_scale)


# Back-compat aliases used by older call sites
def upscale_realesrgan(payload: bytes, scale: int = 2) -> bytes:
    data, _engine = upscale_image(payload, scale=scale)
    return data


def capability_flags() -> dict[str, Any]:
    from .ai.local_models import catalog

    models = catalog()
    point_selection = sam2_available()
    prompt_selection = point_selection and grounding_dino_available() and matte_available()
    return {
        "point_selection": point_selection,
        "prompt_selection": prompt_selection,
        "matte": matte_available(),
        "lama": lama_available(),
        "realesrgan": realesrgan_available(),
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
    if caps["matte"]:
        engines.append("Matte")
    if caps.get("lama"):
        engines.append("LaMa inpaint")
    if caps["prompt_selection"]:
        engines.append("Prompt selection")
    if caps["point_selection"]:
        engines.append("Point selection")
    if caps["realesrgan"]:
        engines.append("RealESRGAN")
    return engines
