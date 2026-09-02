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
from .paths import onnx_providers


def matte_ready() -> bool:
    if importlib.util.find_spec("rembg") is None:
        return False
    return resolve_matte() is not None


@lru_cache(maxsize=2)
def _birefnet_session(force_cpu: bool = False):
    """Load the one supported matte model from the workspace, never the network."""
    if importlib.util.find_spec("rembg") is None:
        raise RuntimeError("rembg is not installed. pip install rembg")

    spec = resolve_matte()
    if spec is None:
        raise RuntimeError(
            "BiRefNet is unavailable. Run: python scripts/setup_ai_models.py"
        )
    os.environ["U2NET_HOME"] = str(os.path.dirname(spec["path"]))
    providers = ["CPUExecutionProvider"] if force_cpu else onnx_providers()
    from rembg import new_session

    return new_session(spec["rembg"], providers=providers)


def matte_with_model(payload: bytes) -> dict[str, Any]:
    """Return a soft BiRefNet alpha mask and RGBA cutout."""
    from rembg import remove

    session = _birefnet_session()
    try:
        result = remove(payload, session=session, post_process_mask=False)
    except Exception as exc:  # noqa: BLE001 - retry only known GPU runtime failures
        message = str(exc).lower()
        cuda_failure = any(
            marker in message
            for marker in ("cuda", "cudnn", "cublas", "cudaexecutionprovider", ".dll")
        )
        inner_session = getattr(session, "inner_session", session)
        active_providers = set(getattr(inner_session, "get_providers", lambda: [])())
        if not cuda_failure or "CUDAExecutionProvider" not in active_providers:
            raise
        # CPUExecutionProvider does not automatically retry a CUDA kernel that
        # fails at runtime. Recreate the session on CPU so a broken/mismatched
        # local CUDA stack degrades gracefully instead of failing the request.
        result = remove(
            payload,
            session=_birefnet_session(force_cpu=True),
            post_process_mask=False,
        )
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
