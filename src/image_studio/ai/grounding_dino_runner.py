"""Grounding DINO image detection with the official package and local weights.

Matches https://github.com/IDEA-Research/GroundingDINO:

    from groundingdino.util.inference import load_model, predict
    model = load_model(config, checkpoint, device=...)
    boxes, logits, phrases = predict(model, image, caption, box_threshold, text_threshold)

Weights: ``models/groundingdino/groundingdino_swinb_cogcoor.pth`` (Swin-B)
from the official GitHub release.

Prompt tip (from upstream): separate categories with ``.``
e.g. ``chair . person . dog .``

Device: CUDA → MPS → CPU. Runtime loading is local-only.
"""

from __future__ import annotations

import os
import tempfile
from functools import lru_cache
from pathlib import Path
from typing import Any

from .local_models import resolve_grounding_dino
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
    required = (
        "config.json",
        "model.safetensors",
        "tokenizer.json",
        "tokenizer_config.json",
        "vocab.txt",
    )
    if all((path / name).exists() for name in required):
        return path
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


def grounding_dino_ready() -> bool:
    return groundingdino_package_ready()


# Common open-vocab confusions (casino art: chip ≈ dice). Used only for box ranking.
_LABEL_NEGATIVES: dict[str, tuple[str, ...]] = {
    "dice": ("chip", "poker", "token", "coin", "roulette"),
    "die": ("chip", "poker", "token", "coin", "roulette"),
}

# Synonyms appended to short single-word prompts so DINO sees both forms.
_CAPTION_SYNONYMS: dict[str, str] = {
    "dice": "dice . die",
    "die": "die . dice",
}


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
    # Single-token prompts: add synonyms (dice ↔ die) before trailing "."
    bare = text[:-1].strip() if text.endswith(".") else text
    if bare and "." not in bare and " " not in bare and bare in _CAPTION_SYNONYMS:
        text = _CAPTION_SYNONYMS[bare]
    if not text.endswith("."):
        text += "."
    return text


def prompt_tokens(prompt: str) -> list[str]:
    """Tokens from the user prompt (before synonym expansion) for ranking."""
    text = (prompt or "").lower().strip()
    for sep in (".", ",", ";", "|"):
        text = text.replace(sep, " ")
    return [t for t in text.split() if len(t) > 1]


def rank_detection_boxes(
    boxes: list[dict[str, Any]],
    prompt: str,
) -> list[dict[str, Any]]:
    """Prefer boxes whose phrase matches the prompt; demote known confusions.

    Grounding DINO often returns a high-score *chip* for prompt ``dice``. Ranking
    by score alone then picks the wrong object and the UI shows a square crop.
    """
    tokens = prompt_tokens(prompt)
    if not boxes:
        return []

    def key(box: dict[str, Any]) -> tuple:
        label = str(box.get("label") or "").lower()
        score = float(box.get("score") or 0)
        match = 0
        for tok in tokens:
            if tok in label or label in tok:
                match = 2
                break
            # soft: shared stem (dic*)
            if len(tok) >= 3 and (label.startswith(tok[:3]) or tok.startswith(label[:3])):
                match = max(match, 1)
        penalty = 0
        for tok in tokens:
            for bad in _LABEL_NEGATIVES.get(tok, ()):
                if bad in label and tok not in label:
                    penalty = 1
                    break
        area = float(box.get("w") or 0) * float(box.get("h") or 0)
        # Small objects (dice) are often out-scored by larger chips with the same phrase.
        prefer_small = any(t in ("dice", "die", "coin", "ring", "button") for t in tokens)
        if prefer_small:
            return (match, -penalty, -area, score)
        return (match, -penalty, score, -area)

    return sorted(boxes, key=key, reverse=True)


def pick_best_box(boxes: list[dict[str, Any]], prompt: str) -> dict[str, Any] | None:
    ranked = rank_detection_boxes(boxes, prompt)
    return ranked[0] if ranked else None


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
    if orig is not None and not getattr(orig, "_image_studio_patched", False):
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

        get_extended_attention_mask._image_studio_patched = True  # type: ignore[attr-defined]
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


@lru_cache(maxsize=1)
def _official_model():
    """Official README: load_model(config, checkpoint, device=...)."""
    _ensure_groundingdino_on_path()
    resolved = resolve_grounding_dino()
    if not resolved:
        raise RuntimeError(
            "No Grounding DINO checkpoint. Expected models/groundingdino/"
            "groundingdino_swinb_cogcoor.pth (+ GroundingDINO_SwinB_cfg.py). "
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
    return model, "GroundingDINO-B", device


def detect_with_grounding_dino(
    payload: bytes,
    prompt: str,
    confidence: float = 0.35,
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

    if not groundingdino_package_ready():
        raise RuntimeError(
            "Grounding DINO Swin-B is unavailable. Run: "
            "python scripts/setup_ai_models.py"
        )
    return _detect_official(payload, caption, box_threshold, text_threshold)


def _detect_official(
    payload: bytes,
    caption: str,
    box_threshold: float,
    text_threshold: float,
) -> dict[str, Any]:
    """Same path as the README demo/inference_on_a_image.py Python API."""
    import torch
    from groundingdino.util.inference import load_image, predict
    from torchvision.ops import box_convert

    model, engine, device = _official_model()

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
    for box, score, phrase in zip(xyxy, logits, phrases, strict=False):
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
