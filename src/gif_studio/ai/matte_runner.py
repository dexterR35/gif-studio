"""Soft matting — BiRefNet / RMBG-2.0 / rembg isnet for transparent GIF cutouts.

Uses rembg sessions when available. Local weights preferred under ``models/matte/``.
"""

from __future__ import annotations

import base64
import importlib.util
from typing import Any

import cv2
import numpy as np

from .local_models import resolve_matte


def matte_ready(model_id: str | None = None) -> bool:
    if importlib.util.find_spec("rembg") is None:
        return False
    return resolve_matte(model_id) is not None


def matte_with_model(payload: bytes, model: str | None = None) -> dict[str, Any]:
    """Return soft alpha mask (PNG) + optional RGBA cutout."""
    if importlib.util.find_spec("rembg") is None:
        raise RuntimeError("rembg is not installed. pip install rembg")

    from rembg import new_session, remove

    spec = resolve_matte(model) or resolve_matte("rembg-isnet")
    rembg_name = (spec or {}).get("rembg") or "isnet-general-use"
    session = new_session(rembg_name)
    result = remove(payload, session=session, post_process_mask=True)
    decoded = cv2.imdecode(np.frombuffer(result, np.uint8), cv2.IMREAD_UNCHANGED)
    if decoded is None or decoded.ndim < 3 or decoded.shape[2] < 4:
        raise RuntimeError("Matte failed — no alpha channel returned")
    alpha = decoded[:, :, 3]
    ok, mask_png = cv2.imencode(".png", alpha)
    if not ok:
        raise RuntimeError("Could not encode matte mask")
    return {
        "engine": f"matte:{spec.get('id', rembg_name) if spec else rembg_name}",
        "mask_png_base64": base64.b64encode(mask_png.tobytes()).decode("ascii"),
        "rgba_png_base64": base64.b64encode(result).decode("ascii"),
        "soft": True,
    }
