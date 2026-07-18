"""SAM 2 — local checkpoints under ``models/sam2/`` only.

Uses facebookresearch/sam2 ``build_sam2`` + ``SAM2ImagePredictor``.
Hugging Face ``from_pretrained`` is opt-in via ``GIF_STUDIO_ALLOW_HF=1``.

Device: CUDA → MPS → CPU (see ``torch_device``).
"""

from __future__ import annotations

import base64
import os
from functools import lru_cache
from typing import Any

import cv2
import numpy as np

from .local_models import allow_huggingface, resolve_sam2
from .paths import decode_bgr, encode_png, torch_device


def sam2_package_installed() -> bool:
    import importlib.util

    return importlib.util.find_spec("sam2") is not None


def sam2_ready() -> bool:
    """True when sam2 package + a local .pt checkpoint are available."""
    if not sam2_package_installed():
        return False
    if resolve_sam2() is not None:
        return True
    return allow_huggingface()


@lru_cache(maxsize=4)
def _predictor(model_id: str = ""):
    if not sam2_package_installed():
        raise RuntimeError(
            "sam2 is not installed. Install with: "
            "pip install 'git+https://github.com/facebookresearch/sam2.git'"
        )

    import torch
    from sam2.sam2_image_predictor import SAM2ImagePredictor

    device = torch_device()
    resolved = resolve_sam2(model_id or None)
    if resolved:
        from sam2.build_sam import build_sam2

        ckpt, cfg = resolved
        model = build_sam2(cfg, str(ckpt), device=str(device))
        predictor = SAM2ImagePredictor(model)
        return predictor, f"sam2-local:{ckpt.stem}", str(device)

    if allow_huggingface():
        hf_id = (
            os.environ.get("SAM2_HF_ID")
            or os.environ.get("GIF_STUDIO_SAM2_HF")
            or "facebook/sam2-hiera-tiny"
        )
        predictor = SAM2ImagePredictor.from_pretrained(hf_id, device=device)
        return predictor, f"sam2-hf:{hf_id}", str(device)

    raise RuntimeError(
        "No local SAM2 checkpoint. Run: python scripts/setup_ai_models.py "
        "(weights → models/sam2/*.pt). HF is disabled unless GIF_STUDIO_ALLOW_HF=1."
    )


def segment_with_sam2(
    payload: bytes,
    point: tuple[float, float] | None = None,
    box: tuple[float, float, float, float] | None = None,
    model: str | None = None,
) -> dict[str, Any]:
    """Point- and/or box-prompt segmentation (Grounded-SAM style).

    ``box`` is xyxy in pixel space. Returns mask PNG (base64) + engine label.
    """
    import torch

    bgr = decode_bgr(payload)
    if bgr.ndim == 2:
        rgb = cv2.cvtColor(bgr, cv2.COLOR_GRAY2RGB)
    elif bgr.shape[2] == 4:
        rgb = cv2.cvtColor(bgr, cv2.COLOR_BGRA2RGB)
    else:
        rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)

    h, w = rgb.shape[:2]
    box_arr = None
    if box is not None:
        x1_raw, y1_raw, x2_raw, y2_raw = [float(v) for v in box]
        x1 = float(np.clip(min(x1_raw, x2_raw), 0, w - 1))
        y1 = float(np.clip(min(y1_raw, y2_raw), 0, h - 1))
        x2 = float(np.clip(max(x1_raw, x2_raw), 0, w - 1))
        y2 = float(np.clip(max(y1_raw, y2_raw), 0, h - 1))
        if x2 <= x1:
            x2 = min(w - 1.0, x1 + 1.0)
        if y2 <= y1:
            y2 = min(h - 1.0, y1 + 1.0)
        box_arr = np.array([x1, y1, x2, y2], dtype=np.float32)
        if point is None:
            point = ((x1 + x2) / 2.0, (y1 + y2) / 2.0)

    if point is None:
        point = (w / 2.0, h / 2.0)
    px = float(np.clip(point[0], 0, w - 1))
    py = float(np.clip(point[1], 0, h - 1))

    predictor, engine, device_name = _predictor(model or "")
    device = torch.device(device_name)

    autocast_device = "cuda" if device.type == "cuda" else "cpu"
    dtype = torch.bfloat16 if device.type == "cuda" else torch.float32
    predict_kwargs: dict[str, Any] = {
        "point_coords": np.array([[px, py]], dtype=np.float32),
        "point_labels": np.array([1], dtype=np.int32),
        "multimask_output": True,
    }
    if box_arr is not None:
        predict_kwargs["box"] = box_arr

    with torch.inference_mode():
        if device.type == "cuda":
            with torch.autocast(autocast_device, dtype=dtype):
                predictor.set_image(rgb)
                masks, scores, _ = predictor.predict(**predict_kwargs)
        else:
            predictor.set_image(rgb)
            masks, scores, _ = predictor.predict(**predict_kwargs)

    best = int(np.argmax(scores))
    mask = (masks[best] > 0).astype(np.uint8) * 255
    png = encode_png(mask)

    return {
        "engine": f"{engine}+box" if box_arr is not None else engine,
        "mask_png_base64": base64.b64encode(png).decode("ascii"),
        "score": float(scores[best]),
        "point": (px, py),
        "box": box_arr.tolist() if box_arr is not None else None,
        "device": device_name,
        "model": model or engine,
    }
