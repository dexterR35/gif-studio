"""Depth Anything V2 Small — local HF snapshot under ``models/depth/``.

Drives richer parallax / Ken Burns. Returns an 8-bit depth PNG (near=bright).
"""

from __future__ import annotations

import base64
from functools import lru_cache
from typing import Any

import cv2
import numpy as np
from PIL import Image

from .local_models import allow_huggingface, resolve_depth
from .paths import decode_bgr, torch_device


def depth_ready(model_id: str | None = None) -> bool:
    if resolve_depth(model_id) is not None:
        return True
    return allow_huggingface()


@lru_cache(maxsize=2)
def _load_pipeline(hf_path: str, device: str):
    from transformers import pipeline

    return pipeline(
        task="depth-estimation",
        model=hf_path,
        device=0 if device.startswith("cuda") else -1,
    )


def estimate_depth(payload: bytes, model: str | None = None) -> dict[str, Any]:
    """Return normalized depth map PNG (uint8) + mean depth for parallax."""
    resolved = resolve_depth(model)
    device = str(torch_device())
    bgr = decode_bgr(payload)
    if bgr.ndim == 2:
        bgr = cv2.cvtColor(bgr, cv2.COLOR_GRAY2BGR)
    elif bgr.shape[2] == 4:
        bgr = bgr[:, :, :3]
    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
    pil = Image.fromarray(rgb)

    if resolved and (resolved["hf_path"] / "config.json").exists():
        pipe = _load_pipeline(str(resolved["hf_path"]), device)
        engine = f"depth-anything-v2-local:{resolved['id']}"
    elif allow_huggingface():
        repo = (resolved or {}).get("hf_repo") or "depth-anything/Depth-Anything-V2-Small-hf"
        pipe = _load_pipeline(repo, device)
        engine = f"depth-anything-v2-hf:{repo}"
    else:
        raise RuntimeError(
            "Depth Anything V2 weights not found. Place a Transformers snapshot under "
            "models/depth/v2-small-hf/ (python scripts/setup_ai_models.py) "
            "or set GIF_STUDIO_ALLOW_HF=1."
        )

    out = pipe(pil)
    depth = out["depth"]
    if hasattr(depth, "convert"):
        depth_arr = np.asarray(depth.convert("L"), dtype=np.float32)
    else:
        depth_arr = np.asarray(depth, dtype=np.float32)
    dmin, dmax = float(depth_arr.min()), float(depth_arr.max())
    if dmax <= dmin:
        norm = np.zeros_like(depth_arr, dtype=np.uint8)
    else:
        norm = ((depth_arr - dmin) / (dmax - dmin) * 255.0).astype(np.uint8)
    # Resize to source if needed
    h, w = bgr.shape[:2]
    if norm.shape[0] != h or norm.shape[1] != w:
        norm = cv2.resize(norm, (w, h), interpolation=cv2.INTER_LINEAR)
    ok, png = cv2.imencode(".png", norm)
    if not ok:
        raise RuntimeError("Could not encode depth PNG")
    mean_n = float(norm.mean()) / 255.0
    # Suggest layer depth % (farther = lower parallax depth in our UI)
    suggested_depth = int(round((1.0 - mean_n) * 100))
    return {
        "engine": engine,
        "depth_png_base64": base64.b64encode(png.tobytes()).decode("ascii"),
        "mean_normalized": mean_n,
        "suggested_layer_depth": max(0, min(100, suggested_depth)),
        "device": device,
    }
