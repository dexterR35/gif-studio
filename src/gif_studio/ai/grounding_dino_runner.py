"""Grounding DINO — IDEA-Research/GroundingDINO.

Primary path: Hugging Face Transformers
  AutoModelForZeroShotObjectDetection + AutoProcessor
  (IDEA-Research/grounding-dino-tiny | grounding-dino-base)

Secondary path: official groundingdino package
  load_model(config, checkpoint) + predict(...)

See: https://github.com/IDEA-Research/GroundingDINO
"""

from __future__ import annotations

import os
from functools import lru_cache
from typing import Any

from PIL import Image

from .paths import env_path, models_dir, torch_device


def _hf_id() -> str:
    return (
        os.environ.get("GROUNDING_DINO_HF_ID")
        or os.environ.get("GIF_STUDIO_GROUNDING_DINO_HF")
        or "IDEA-Research/grounding-dino-tiny"
    )


def _local_weights() -> tuple[str | None, str | None]:
    cfg = env_path("GROUNDING_DINO_CONFIG", "GIF_STUDIO_GROUNDING_DINO_CONFIG")
    ckpt = env_path("GROUNDING_DINO_CHECKPOINT", "GIF_STUDIO_GROUNDING_DINO_CHECKPOINT")
    default_ckpt = models_dir() / "groundingdino" / "groundingdino_swint_ogc.pth"
    default_cfg = models_dir() / "groundingdino" / "GroundingDINO_SwinT_OGC.py"
    if ckpt is None and default_ckpt.exists():
        ckpt = default_ckpt
    if cfg is None and default_cfg.exists():
        cfg = default_cfg
    return (str(cfg) if cfg else None, str(ckpt) if ckpt else None)


def transformers_ready() -> bool:
    import importlib.util

    return importlib.util.find_spec("transformers") is not None


def groundingdino_package_ready() -> bool:
    import importlib.util

    cfg, ckpt = _local_weights()
    return (
        importlib.util.find_spec("groundingdino") is not None
        and bool(cfg)
        and bool(ckpt)
    )


def grounding_dino_ready() -> bool:
    return transformers_ready() or groundingdino_package_ready()


@lru_cache(maxsize=1)
def _hf_model():
    import torch
    from transformers import AutoModelForZeroShotObjectDetection, AutoProcessor

    model_id = _hf_id()
    device = torch_device()
    processor = AutoProcessor.from_pretrained(model_id)
    model = AutoModelForZeroShotObjectDetection.from_pretrained(model_id)
    model.to(device)
    model.eval()
    return processor, model, device, f"grounding-dino-hf:{model_id}"


@lru_cache(maxsize=1)
def _local_model():
    cfg, ckpt = _local_weights()
    if not cfg or not ckpt:
        raise RuntimeError("GROUNDING_DINO_CONFIG and GROUNDING_DINO_CHECKPOINT required")
    from groundingdino.util.inference import load_model

    model = load_model(cfg, ckpt)
    return model, "grounding-dino-local"


def detect_with_grounding_dino(
    payload: bytes,
    prompt: str,
    confidence: float = 0.35,
) -> dict[str, Any]:
    """Text-guided open-set detection. Boxes are xywh in pixel space."""
    prompt = (prompt or "").strip()
    if not prompt:
        raise ValueError("prompt is required for Grounding DINO")

    image = Image.open(__import__("io").BytesIO(payload)).convert("RGB")
    text_threshold = float(os.environ.get("GROUNDING_DINO_TEXT_THRESHOLD", "0.25"))
    box_threshold = float(confidence)

    if transformers_ready():
        return _detect_transformers(image, prompt, box_threshold, text_threshold)
    if groundingdino_package_ready():
        return _detect_official(image, prompt, box_threshold, text_threshold)
    raise RuntimeError(
        "Grounding DINO not available. Install transformers "
        "(pip install transformers) or the official groundingdino package + weights."
    )


def _detect_transformers(image: Image.Image, prompt: str, box_threshold: float, text_threshold: float):
    import torch

    processor, model, device, engine = _hf_model()
    # Transformers Grounding DINO expects lowercase + trailing period phrases.
    text = prompt.lower().strip()
    if not text.endswith("."):
        text = text + "."

    inputs = processor(images=image, text=text, return_tensors="pt")
    inputs = {k: v.to(device) if hasattr(v, "to") else v for k, v in inputs.items()}

    with torch.no_grad():
        outputs = model(**inputs)

    target_sizes = torch.tensor([image.size[::-1]], device=device)
    # API differs slightly across transformers versions
    try:
        results = processor.post_process_grounded_object_detection(
            outputs,
            inputs["input_ids"],
            box_threshold=box_threshold,
            text_threshold=text_threshold,
            target_sizes=target_sizes,
        )[0]
    except TypeError:
        results = processor.post_process_grounded_object_detection(
            outputs,
            threshold=box_threshold,
            target_sizes=target_sizes,
            text_labels=[[prompt]],
        )[0]

    boxes = []
    scores = results.get("scores")
    labels = results.get("labels") or results.get("text_labels") or []
    xyxy = results.get("boxes")
    if xyxy is None:
        return {"engine": engine, "boxes": [], "prompt": prompt}

    for i, box in enumerate(xyxy):
        x1, y1, x2, y2 = [float(v) for v in box.tolist()]
        score = float(scores[i]) if scores is not None else 0.0
        label = labels[i] if i < len(labels) else prompt
        if isinstance(label, (list, tuple)):
            label = " ".join(str(x) for x in label)
        boxes.append({
            "x": x1,
            "y": y1,
            "w": max(1.0, x2 - x1),
            "h": max(1.0, y2 - y1),
            "score": score,
            "label": str(label),
        })

    return {"engine": engine, "boxes": boxes, "prompt": prompt}


def _detect_official(image: Image.Image, prompt: str, box_threshold: float, text_threshold: float):
    import torch
    from groundingdino.util.inference import predict
    from groundingdino.util.utils import get_phrases_from_posmap

    del get_phrases_from_posmap  # imported for package side-effects in some versions

    model, engine = _local_model()
    # Official API expects CHW float tensor in [0,1] via their load_image — build manually.
    import groundingdino.datasets.transforms as T

    transform = T.Compose([
        T.RandomResize([800], max_size=1333),
        T.ToTensor(),
        T.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
    ])
    image_tensor, _ = transform(image, None)
    caption = prompt.lower().strip()
    if not caption.endswith("."):
        caption += "."

    boxes, logits, phrases = predict(
        model=model,
        image=image_tensor,
        caption=caption,
        box_threshold=box_threshold,
        text_threshold=text_threshold,
        device=str(torch_device()),
    )

    w, h = image.size
    out = []
    for box, score, phrase in zip(boxes, logits, phrases, strict=False):
        # boxes are cxcywh normalized
        cx, cy, bw, bh = [float(v) for v in box.tolist()]
        x = (cx - bw / 2) * w
        y = (cy - bh / 2) * h
        out.append({
            "x": x,
            "y": y,
            "w": bw * w,
            "h": bh * h,
            "score": float(score),
            "label": str(phrase),
        })
    return {"engine": engine, "boxes": out, "prompt": prompt}
