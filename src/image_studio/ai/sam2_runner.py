"""SAM 2 image segmentation with local checkpoints.

Uses facebookresearch/sam2 ``build_sam2`` + ``SAM2ImagePredictor``.
The fixed SAM 2.1 Large checkpoint is loaded from ``models/sam2``.

Device: CUDA → MPS → CPU (see ``torch_device``).
"""

from __future__ import annotations

import base64
from functools import lru_cache
from typing import Any

import cv2
import numpy as np

from .local_models import resolve_sam2
from .paths import decode_bgr, encode_png, torch_device


def sam2_package_installed() -> bool:
    import importlib.util

    return importlib.util.find_spec("sam2") is not None


def sam2_ready() -> bool:
    """True when sam2 package + a local .pt checkpoint are available."""
    if not sam2_package_installed():
        return False
    return resolve_sam2() is not None


@lru_cache(maxsize=1)
def _predictor():
    if not sam2_package_installed():
        raise RuntimeError(
            "sam2 is not installed. Install with: "
            "pip install 'git+https://github.com/facebookresearch/sam2.git'"
        )

    from sam2.sam2_image_predictor import SAM2ImagePredictor

    device = torch_device()
    resolved = resolve_sam2()
    if resolved:
        from sam2.build_sam import build_sam2

        ckpt, cfg = resolved
        model = build_sam2(cfg, str(ckpt), device=str(device))
        predictor = SAM2ImagePredictor(model)
        return predictor, f"sam2-local:{ckpt.stem}", str(device)

    raise RuntimeError(
        "No local SAM2 checkpoint. Run: python scripts/setup_ai_models.py "
        "(expected models/sam2/sam2.1_hiera_large.pt)."
    )


def segment_with_sam2(
    payload: bytes,
    point: tuple[float, float] | None = None,
    box: tuple[float, float, float, float] | None = None,
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

    predictor, engine, device_name = _predictor()
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
        "model": "sam2.1_hiera_large",
    }
