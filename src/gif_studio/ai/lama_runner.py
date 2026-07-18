"""Inpaint — LaMa when weights exist, else OpenCV Telea/NS (honest engine label)."""

from __future__ import annotations

import base64
from typing import Any

import cv2
import numpy as np

from .local_models import resolve_lama
from .paths import decode_bgr, encode_png


def lama_ready() -> bool:
    return resolve_lama() is not None


def inpaint_ready(model_id: str | None = None) -> bool:
    mid = (model_id or "auto").strip().lower()
    if mid in {"opencv", "opencv-telea", "telea"}:
        return True
    if mid == "lama":
        return lama_ready()
    return True  # auto always has OpenCV fallback


def _opencv_inpaint(bgr: np.ndarray, mask: np.ndarray) -> tuple[np.ndarray, str]:
    binary = (mask > 24).astype(np.uint8) * 255
    # Dilate slightly so edges blend
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    binary = cv2.dilate(binary, kernel, iterations=1)
    telea = cv2.inpaint(bgr, binary, 3, cv2.INPAINT_TELEA)
    ns = cv2.inpaint(bgr, binary, 3, cv2.INPAINT_NS)
    blended = cv2.addWeighted(telea, 0.72, ns, 0.28, 0)
    return blended, "opencv-telea+ns"


def _try_lama(bgr: np.ndarray, mask: np.ndarray) -> tuple[np.ndarray, str] | None:
    ckpt = resolve_lama()
    if ckpt is None:
        return None
    try:
        # Optional dependency: simple-lama-inpainting
        from simple_lama_inpainting import SimpleLama
        from PIL import Image

        lama = SimpleLama()
        rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
        pil_img = Image.fromarray(rgb)
        pil_mask = Image.fromarray((mask > 24).astype(np.uint8) * 255)
        out = lama(pil_img, pil_mask)
        arr = np.asarray(out.convert("RGB"))
        return cv2.cvtColor(arr, cv2.COLOR_RGB2BGR), f"lama-local:{ckpt.stem}"
    except Exception:
        return None


def inpaint_image(
    payload: bytes,
    mask_payload: bytes | None = None,
    mask_png_base64: str | None = None,
    model: str | None = "auto",
) -> dict[str, Any]:
    """Fill masked region. ``mask`` white = hole to fill."""
    bgr = decode_bgr(payload)
    if bgr.ndim == 2:
        bgr = cv2.cvtColor(bgr, cv2.COLOR_GRAY2BGR)
    elif bgr.shape[2] == 4:
        bgr = bgr[:, :, :3]

    mask: np.ndarray | None = None
    if mask_payload:
        mask = cv2.imdecode(np.frombuffer(mask_payload, np.uint8), cv2.IMREAD_GRAYSCALE)
    elif mask_png_base64:
        raw = base64.b64decode(mask_png_base64)
        mask = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_GRAYSCALE)
    if mask is None:
        raise ValueError("Inpaint requires a mask (white = erase)")
    if mask.shape[:2] != bgr.shape[:2]:
        mask = cv2.resize(mask, (bgr.shape[1], bgr.shape[0]), interpolation=cv2.INTER_NEAREST)

    mid = (model or "auto").strip().lower()
    engine = "opencv-telea+ns"
    out = None
    if mid in {"lama", "auto"} and lama_ready():
        tried = _try_lama(bgr, mask)
        if tried is not None:
            out, engine = tried
        elif mid == "lama":
            raise RuntimeError(
                "LaMa weights found but simple-lama-inpainting failed. "
                "pip install simple-lama-inpainting or use model=opencv-telea."
            )
    if out is None:
        out, engine = _opencv_inpaint(bgr, mask)

    return {
        "engine": engine,
        "image_png_base64": base64.b64encode(encode_png(out)).decode("ascii"),
    }
