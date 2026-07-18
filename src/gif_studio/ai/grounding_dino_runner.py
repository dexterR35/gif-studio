"""Grounding DINO — IDEA-Research official package + local GitHub weights.

Matches https://github.com/IDEA-Research/GroundingDINO:

    from groundingdino.util.inference import load_model, predict
    model = load_model(config, checkpoint, device=...)
    boxes, logits, phrases = predict(model, image, caption, box_threshold, text_threshold)

Weights: ``models/groundingdino/groundingdino_swint_ogc.pth`` (T) /
``groundingdino_swinb_cogcoor.pth`` (B) from GitHub releases.

Prompt tip (from upstream): separate categories with ``.``
e.g. ``chair . person . dog .``

Device: CUDA → MPS → CPU. Hub only if ``GIF_STUDIO_ALLOW_HF=1``.
"""

from __future__ import annotations

import io
import os
import tempfile
from functools import lru_cache
from pathlib import Path
from typing import Any

from PIL import Image

from .local_models import allow_huggingface, resolve_grounding_dino
from .paths import ensure_sys_path, models_dir, third_party_dir, torch_device


def _ensure_groundingdino_on_path() -> None:
    import importlib.util

    if importlib.util.find_spec("groundingdino") is not None:
        return
    local = third_party_dir() / "GroundingDINO"
    if local.is_dir():
        ensure_sys_path(local)


def _local_bert_dir() -> Path | None:
    path = models_dir() / "groundingdino" / "bert-base-uncased"
    if (path / "config.json").exists():
        return path
    return None


def _hf_local_dir(model_id: str | None = None) -> Path | None:
    wanted = (model_id or os.environ.get("GROUNDING_DINO_MODEL") or "swint_ogc").strip()
    root = models_dir() / "groundingdino"
    mapping = {
        "swint_ogc": root / "hf-tiny",
        "tiny": root / "hf-tiny",
        "groundingdino-t": root / "hf-tiny",
        "swinb_cogcoor": root / "hf-base",
        "base": root / "hf-base",
        "groundingdino-b": root / "hf-base",
    }
    path = mapping.get(wanted.lower())
    if path and (path / "config.json").exists():
        return path
    for candidate in (root / "hf-tiny", root / "hf-base"):
        if (candidate / "config.json").exists():
            return candidate
    return None


def groundingdino_package_ready() -> bool:
    """Official IDEA-Research package + GitHub .pth + local BERT text encoder."""
    import importlib.util

    _ensure_groundingdino_on_path()
    return (
        importlib.util.find_spec("groundingdino") is not None
        and resolve_grounding_dino() is not None
        and _local_bert_dir() is not None
    )


def transformers_local_ready() -> bool:
    import importlib.util

    return importlib.util.find_spec("transformers") is not None and _hf_local_dir() is not None


def transformers_hub_ready() -> bool:
    import importlib.util

    return allow_huggingface() and importlib.util.find_spec("transformers") is not None


def grounding_dino_ready() -> bool:
    return groundingdino_package_ready() or transformers_local_ready() or transformers_hub_ready()


def normalize_dino_caption(prompt: str) -> str:
    """Upstream preprocess: lowercase, strip, ensure trailing ``.``.

    Also normalizes comma/semicolon lists to `` . `` separators as recommended
    in the IDEA-Research README (\"chair . person . dog .\").
    """
    text = (prompt or "").lower().strip()
    if not text:
        return text
    # "dog, cat" or "dog; cat" → "dog . cat ."
    for sep in (",", ";", "|"):
        if sep in text and "." not in text:
            parts = [p.strip() for p in text.split(sep) if p.strip()]
            text = " . ".join(parts)
            break
    if not text.endswith("."):
        text += "."
    return text


def _patch_transformers_for_groundingdino() -> None:
    """Compat shims so official GroundingDINO works with transformers ≥5."""
    import torch
    from transformers import BertModel

    if not hasattr(BertModel, "get_head_mask"):
        def get_head_mask(self, head_mask, num_hidden_layers, is_attention_chunked=False):
            if head_mask is None:
                return [None] * num_hidden_layers
            if not isinstance(head_mask, torch.Tensor):
                return [None] * num_hidden_layers
            if head_mask.dim() == 1:
                head_mask = head_mask.unsqueeze(0).unsqueeze(0).unsqueeze(-1).unsqueeze(-1)
                head_mask = head_mask.expand(num_hidden_layers, -1, -1, -1, -1)
            elif head_mask.dim() == 2:
                head_mask = head_mask.unsqueeze(1).unsqueeze(-1).unsqueeze(-1)
                head_mask = head_mask.expand(num_hidden_layers, -1, -1, -1, -1)
            if is_attention_chunked:
                head_mask = head_mask.unsqueeze(-1)
            return head_mask

        BertModel.get_head_mask = get_head_mask  # type: ignore[method-assign]

    orig = getattr(BertModel, "get_extended_attention_mask", None)
    if orig is not None and not getattr(orig, "_gif_studio_patched", False):
        def get_extended_attention_mask(self, attention_mask, input_shape, device=None, dtype=None, *args, **kwargs):
            if isinstance(device, torch.dtype) and dtype is None:
                dtype = device
                device = None
            try:
                return orig(self, attention_mask, input_shape, device=device, dtype=dtype, **kwargs)
            except TypeError:
                try:
                    return orig(self, attention_mask, input_shape, dtype=dtype or self.dtype)
                except TypeError:
                    return orig(self, attention_mask, input_shape)

        get_extended_attention_mask._gif_studio_patched = True  # type: ignore[attr-defined]
        BertModel.get_extended_attention_mask = get_extended_attention_mask  # type: ignore[method-assign]


def _config_with_local_bert(cfg_path: Path) -> Path:
    """Point ``text_encoder_type`` at on-disk BERT (no Hub at load)."""
    bert = _local_bert_dir()
    if bert is None:
        raise RuntimeError(
            "Missing local BERT for Grounding DINO. Run: python scripts/setup_ai_models.py"
        )
    text = cfg_path.read_text(encoding="utf-8")
    local = str(bert.resolve()).replace("\\", "/")
    patched = text
    for needle in (
        'text_encoder_type = "bert-base-uncased"',
        "text_encoder_type = 'bert-base-uncased'",
    ):
        if needle in patched:
            patched = patched.replace(needle, f'text_encoder_type = "{local}"')
            break
    else:
        patched = patched.rstrip() + f'\ntext_encoder_type = "{local}"\n'
    out = cfg_path.with_name(cfg_path.stem + "_local.py")
    out.write_text(patched, encoding="utf-8")
    return out


@lru_cache(maxsize=4)
def _official_model(model_id: str = ""):
    """Official README: load_model(config, checkpoint, device=...)."""
    _ensure_groundingdino_on_path()
    resolved = resolve_grounding_dino(model_id or None)
    if not resolved:
        raise RuntimeError(
            "No Grounding DINO checkpoint. Expected models/groundingdino/"
            "groundingdino_swint_ogc.pth (+ config). "
            "Run: python scripts/setup_ai_models.py"
        )
    cfg, ckpt = resolved
    cfg_local = _config_with_local_bert(cfg)
    _patch_transformers_for_groundingdino()
    from groundingdino.util.inference import load_model

    device = str(torch_device())
    try:
        model = load_model(str(cfg_local), str(ckpt), device=device)
    except TypeError:
        model = load_model(str(cfg_local), str(ckpt))
    model = model.to(device)
    model.eval()
    # Match checkpoint table names: GroundingDINO-T / GroundingDINO-B
    tag = "T" if "swint" in ckpt.stem.lower() or "ogc" in ckpt.stem.lower() else "B"
    if "swinb" in ckpt.stem.lower() or "cogcoor" in ckpt.stem.lower():
        tag = "B"
    return model, f"GroundingDINO-{tag}", device


@lru_cache(maxsize=4)
def _transformers_model(model_id: str = ""):
    import torch
    from transformers import AutoModelForZeroShotObjectDetection, AutoProcessor

    local = _hf_local_dir(model_id or None)
    if local is not None:
        load_from = str(local)
        local_only = True
    elif allow_huggingface():
        load_from = (
            os.environ.get("GROUNDING_DINO_HF_ID")
            or "IDEA-Research/grounding-dino-tiny"
        )
        local_only = False
    else:
        raise RuntimeError("No local Grounding DINO Transformers weights")

    device = torch_device()
    processor = AutoProcessor.from_pretrained(load_from, local_files_only=local_only)
    model = AutoModelForZeroShotObjectDetection.from_pretrained(
        load_from, local_files_only=local_only,
    )
    model.to(device)
    model.eval()
    tag = Path(load_from).name if local_only else load_from
    return processor, model, device, f"grounding-dino-transformers:{tag}"


def detect_with_grounding_dino(
    payload: bytes,
    prompt: str,
    confidence: float = 0.35,
    model: str | None = None,
) -> dict[str, Any]:
    """Text-guided open-set detection (IDEA-Research Grounding DINO).

    Boxes are xywh in pixel space. Defaults match the official demo:
    box_threshold=0.35, text_threshold=0.25.
    """
    prompt = (prompt or "").strip()
    if not prompt:
        raise ValueError("prompt is required for Grounding DINO")

    caption = normalize_dino_caption(prompt)
    text_threshold = float(os.environ.get("GROUNDING_DINO_TEXT_THRESHOLD", "0.25"))
    box_threshold = float(confidence)

    if groundingdino_package_ready():
        try:
            return _detect_official(payload, caption, box_threshold, text_threshold, model)
        except Exception:
            if not (transformers_local_ready() or transformers_hub_ready()):
                raise

    if transformers_local_ready() or transformers_hub_ready():
        image = Image.open(io.BytesIO(payload)).convert("RGB")
        return _detect_transformers(image, caption, box_threshold, text_threshold, model)

    raise RuntimeError(
        "Grounding DINO not available. Official install:\n"
        "  python scripts/setup_ai_models.py\n"
        "  cd third_party/GroundingDINO && pip install -e .\n"
        "Weights: models/groundingdino/groundingdino_swint_ogc.pth\n"
        "See https://github.com/IDEA-Research/GroundingDINO"
    )


def _detect_official(
    payload: bytes,
    caption: str,
    box_threshold: float,
    text_threshold: float,
    model_id: str | None,
) -> dict[str, Any]:
    """Same path as the README demo/inference_on_a_image.py Python API."""
    import torch
    from groundingdino.util.inference import load_image, predict
    from torchvision.ops import box_convert

    model, engine, device = _official_model(model_id or "")

    # Official load_image(path) — write bytes to a temp PNG
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
        tmp.write(payload)
        tmp_path = tmp.name
    try:
        image_source, image_tensor = load_image(tmp_path)
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass

    boxes, logits, phrases = predict(
        model=model,
        image=image_tensor,
        caption=caption,
        box_threshold=box_threshold,
        text_threshold=text_threshold,
        device=device,
    )

    # annotate() converts cxcywh-normalized → xyxy pixels
    h, w = image_source.shape[:2]
    if boxes.numel() == 0:
        return {
            "engine": engine,
            "boxes": [],
            "prompt": caption,
            "device": device,
            "source": "IDEA-Research/GroundingDINO",
        }

    scale = torch.tensor([w, h, w, h], dtype=boxes.dtype)
    xyxy = box_convert(boxes=boxes * scale, in_fmt="cxcywh", out_fmt="xyxy").numpy()

    out = []
    for i, (box, score, phrase) in enumerate(zip(xyxy, logits, phrases, strict=False)):
        x1, y1, x2, y2 = [float(v) for v in box]
        out.append({
            "x": x1,
            "y": y1,
            "w": max(1.0, x2 - x1),
            "h": max(1.0, y2 - y1),
            "score": float(score),
            "label": str(phrase),
        })
    return {
        "engine": engine,
        "boxes": out,
        "prompt": caption,
        "device": device,
        "source": "IDEA-Research/GroundingDINO",
    }


def _detect_transformers(
    image: Image.Image,
    caption: str,
    box_threshold: float,
    text_threshold: float,
    model_id: str | None,
) -> dict[str, Any]:
    import torch

    processor, model, device, engine = _transformers_model(model_id or "")
    inputs = processor(images=image, text=caption, return_tensors="pt")
    inputs = {k: v.to(device) if hasattr(v, "to") else v for k, v in inputs.items()}

    with torch.no_grad():
        outputs = model(**inputs)

    target_sizes = torch.tensor([image.size[::-1]], device=device)
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
            text_labels=[[caption]],
        )[0]

    boxes = []
    scores = results.get("scores")
    labels = results.get("labels") or results.get("text_labels") or []
    xyxy = results.get("boxes")
    if xyxy is None:
        return {"engine": engine, "boxes": [], "prompt": caption, "device": str(device)}

    for i, box in enumerate(xyxy):
        x1, y1, x2, y2 = [float(v) for v in box.tolist()]
        score = float(scores[i]) if scores is not None else 0.0
        label = labels[i] if i < len(labels) else caption
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

    return {"engine": engine, "boxes": boxes, "prompt": caption, "device": str(device)}
