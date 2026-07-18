"""SAM 2 (Segment Anything Model 2) — facebookresearch/sam2.

Uses the official `sam2` package:
  - Hugging Face: SAM2ImagePredictor.from_pretrained(...)
  - Local: build_sam2(config, checkpoint) + SAM2ImagePredictor

See: https://github.com/facebookresearch/sam2
"""

from __future__ import annotations

import base64
import os
from functools import lru_cache
from typing import Any

import cv2
import numpy as np

from .paths import decode_bgr, encode_png, env_path, models_dir, torch_device


def _hf_id() -> str:
    return (
        os.environ.get("SAM2_HF_ID")
        or os.environ.get("GIF_STUDIO_SAM2_HF")
        or "facebook/sam2-hiera-tiny"
    )


def _local_checkpoint() -> tuple[str | None, str | None]:
    ckpt = env_path("SAM2_CHECKPOINT", "GIF_STUDIO_SAM2")
    cfg = os.environ.get("SAM2_CONFIG") or os.environ.get("GIF_STUDIO_SAM2_CONFIG")
    if ckpt and not cfg:
        name = ckpt.name.lower()
        if "tiny" in name or "_t." in name:
            cfg = "configs/sam2.1/sam2.1_hiera_t.yaml"
        elif "small" in name or "_s." in name:
            cfg = "configs/sam2.1/sam2.1_hiera_s.yaml"
        elif "base" in name or "b+" in name:
            cfg = "configs/sam2.1/sam2.1_hiera_b+.yaml"
        else:
            cfg = "configs/sam2.1/sam2.1_hiera_l.yaml"
    default_ckpt = models_dir() / "sam2" / "sam2.1_hiera_tiny.pt"
    if ckpt is None and default_ckpt.exists():
        ckpt = default_ckpt
        cfg = cfg or "configs/sam2.1/sam2.1_hiera_t.yaml"
    return (str(ckpt) if ckpt else None, cfg)


def sam2_package_installed() -> bool:
    import importlib.util

    return importlib.util.find_spec("sam2") is not None


def sam2_ready() -> bool:
    """True when the sam2 package is importable (weights download on first use)."""
    return sam2_package_installed()


@lru_cache(maxsize=1)
def _predictor():
    if not sam2_package_installed():
        raise RuntimeError(
            "sam2 is not installed. Install with: "
            "pip install 'git+https://github.com/facebookresearch/sam2.git'"
        )

    import torch
    from sam2.sam2_image_predictor import SAM2ImagePredictor

    ckpt, cfg = _local_checkpoint()
    device = torch_device()

    if ckpt and cfg:
        from sam2.build_sam import build_sam2

        model = build_sam2(cfg, ckpt, device=str(device))
        predictor = SAM2ImagePredictor(model)
        return predictor, "sam2-local", str(device)

    # Hugging Face weights (official facebookresearch/sam2 API)
    predictor = SAM2ImagePredictor.from_pretrained(_hf_id(), device=device)
    return predictor, f"sam2-hf:{_hf_id()}", str(device)


def segment_with_sam2(
    payload: bytes,
    point: tuple[float, float] | None = None,
) -> dict[str, Any]:
    """Point-prompt image segmentation. Returns mask PNG (base64) + engine label."""
    import torch

    bgr = decode_bgr(payload)
    if bgr.ndim == 2:
        rgb = cv2.cvtColor(bgr, cv2.COLOR_GRAY2RGB)
    elif bgr.shape[2] == 4:
        rgb = cv2.cvtColor(bgr, cv2.COLOR_BGRA2RGB)
    else:
        rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)

    h, w = rgb.shape[:2]
    if point is None:
        point = (w / 2.0, h / 2.0)
    px = float(np.clip(point[0], 0, w - 1))
    py = float(np.clip(point[1], 0, h - 1))

    predictor, engine, device_name = _predictor()
    device = torch.device(device_name)

    autocast_device = "cuda" if device.type == "cuda" else "cpu"
    dtype = torch.bfloat16 if device.type == "cuda" else torch.float32

    with torch.inference_mode():
        if device.type == "cuda":
            with torch.autocast(autocast_device, dtype=dtype):
                predictor.set_image(rgb)
                masks, scores, _ = predictor.predict(
                    point_coords=np.array([[px, py]], dtype=np.float32),
                    point_labels=np.array([1], dtype=np.int32),
                    multimask_output=True,
                )
        else:
            predictor.set_image(rgb)
            masks, scores, _ = predictor.predict(
                point_coords=np.array([[px, py]], dtype=np.float32),
                point_labels=np.array([1], dtype=np.int32),
                multimask_output=True,
            )

    best = int(np.argmax(scores))
    mask = (masks[best] > 0).astype(np.uint8) * 255
    png = encode_png(mask)

    return {
        "engine": engine,
        "mask_png_base64": base64.b64encode(png).decode("ascii"),
        "score": float(scores[best]),
        "point": (px, py),
        "device": device_name,
    }
