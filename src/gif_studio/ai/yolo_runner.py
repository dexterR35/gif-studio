"""Ultralytics YOLO — local weights under ``models/yolo/``.

https://github.com/ultralytics/ultralytics

Closed-set COCO detection (not open-vocab). Optional class filter via prompt
(e.g. ``person``, ``dog``, ``cup``). Pair with SAM2 refine for contour masks.
"""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import Any

from .local_models import resolve_yolo
from .paths import decode_bgr, models_dir, torch_device


def _ensure_local_yolo_config_dir() -> None:
    """Keep Ultralytics settings under models/ (no ~/.config write required)."""
    if os.environ.get("YOLO_CONFIG_DIR"):
        return
    cfg = models_dir() / "yolo" / ".ultralytics"
    cfg.mkdir(parents=True, exist_ok=True)
    os.environ["YOLO_CONFIG_DIR"] = str(cfg)


def yolo_package_installed() -> bool:
    import importlib.util

    return importlib.util.find_spec("ultralytics") is not None


def yolo_ready() -> bool:
    return yolo_package_installed() and resolve_yolo() is not None


@lru_cache(maxsize=4)
def _load_yolo(model_id: str = ""):
    if not yolo_package_installed():
        raise RuntimeError(
            "ultralytics is not installed. Install with: pip install ultralytics "
            "(https://github.com/ultralytics/ultralytics)"
        )
    _ensure_local_yolo_config_dir()
    from ultralytics import YOLO

    resolved = resolve_yolo(model_id or None)
    if resolved is None:
        raise RuntimeError(
            "No local YOLO weights. Place .pt under models/yolo/ "
            "(python scripts/setup_ai_models.py) or set YOLO_MODEL."
        )
    path, engine = resolved
    # Ultralytics loads from a local path — avoid Hub when the file exists.
    model = YOLO(str(path))
    device = str(torch_device())
    return model, engine, device


def _prompt_class_filters(prompt: str) -> list[str]:
    text = (prompt or "").lower().strip()
    if not text:
        return []
    for sep in (".", ",", ";", "|"):
        text = text.replace(sep, " ")
    return [t for t in text.split() if len(t) > 1]


def detect_with_yolo(
    payload: bytes,
    prompt: str = "",
    confidence: float = 0.35,
    model: str | None = None,
) -> dict[str, Any]:
    """Return xywh boxes. Prompt filters COCO class names (substring match)."""
    model_obj, engine, device = _load_yolo(model or "")
    image = decode_bgr(payload)
    if image is None:
        raise ValueError("Could not decode image for YOLO")

    conf = max(0.01, min(0.99, float(confidence)))
    results = model_obj.predict(
        source=image,
        conf=conf,
        verbose=False,
        device=device if device.startswith("cuda") else device,
    )

    filters = _prompt_class_filters(prompt)
    boxes: list[dict[str, Any]] = []
    for r in results:
        names = r.names or {}
        if r.boxes is None:
            continue
        for box in r.boxes:
            xyxy = box.xyxy[0].tolist()
            cls_id = int(box.cls[0])
            label = str(names.get(cls_id, cls_id))
            score = float(box.conf[0])
            if filters:
                label_l = label.lower()
                if not any(f in label_l or label_l in f for f in filters):
                    continue
            x1, y1, x2, y2 = [float(v) for v in xyxy]
            boxes.append({
                "x": x1,
                "y": y1,
                "w": max(1.0, x2 - x1),
                "h": max(1.0, y2 - y1),
                "score": score,
                "label": label,
            })

    return {
        "engine": engine,
        "boxes": boxes,
        "prompt": prompt,
        "device": device,
        "source": "ultralytics/ultralytics",
        "note": (
            "Closed-set COCO classes. Use Grounding DINO for open-vocab text."
            if not filters
            else f"Filtered by: {', '.join(filters)}"
        ),
    }
