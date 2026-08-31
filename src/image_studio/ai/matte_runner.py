"""Fixed local BiRefNet matting for transparent cutouts."""

from __future__ import annotations

import base64
import importlib.util
import os
from functools import lru_cache
from typing import Any

import cv2
import numpy as np

from .local_models import resolve_matte


def matte_ready() -> bool:
    if importlib.util.find_spec("rembg") is None:
        return False
    return resolve_matte() is not None


@lru_cache(maxsize=1)
def _birefnet_session():
    """Load the one supported matte model from the workspace, never the network."""
    if importlib.util.find_spec("rembg") is None:
        raise RuntimeError("rembg is not installed. pip install rembg")

    spec = resolve_matte()
    if spec is None:
        raise RuntimeError(
            "BiRefNet is unavailable. Run: python scripts/setup_ai_models.py"
        )
    os.environ["U2NET_HOME"] = str(os.path.dirname(spec["path"]))
    from rembg import new_session

    return new_session(spec["rembg"])


def matte_with_model(payload: bytes) -> dict[str, Any]:
    """Return a soft BiRefNet alpha mask and RGBA cutout."""
    from rembg import remove

    result = remove(payload, session=_birefnet_session(), post_process_mask=False)
    decoded = cv2.imdecode(np.frombuffer(result, np.uint8), cv2.IMREAD_UNCHANGED)
    if decoded is None or decoded.ndim < 3 or decoded.shape[2] < 4:
        raise RuntimeError("Matte failed — no alpha channel returned")
    alpha = decoded[:, :, 3]
    ok, mask_png = cv2.imencode(".png", alpha)
    if not ok:
        raise RuntimeError("Could not encode matte mask")
    return {
        "engine": "matte",
        "mask_png_base64": base64.b64encode(mask_png.tobytes()).decode("ascii"),
        "rgba_png_base64": base64.b64encode(result).decode("ascii"),
        "soft": True,
    }
