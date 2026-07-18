"""SAM 3 — facebookresearch/sam3 when installed + local/HF-gated weights.

Image concept / point segmentation with the same mask contract as SAM2.
Video tracking UI is out of scope for this pass.
"""

from __future__ import annotations

import base64
import importlib.util
from functools import lru_cache
from typing import Any

import cv2
import numpy as np

from .local_models import allow_huggingface, resolve_sam3
from .paths import decode_bgr, torch_device


def sam3_package_installed() -> bool:
    return importlib.util.find_spec("sam3") is not None


def sam3_ready() -> bool:
    if not sam3_package_installed():
        return False
    if resolve_sam3() is not None:
        return True
    return allow_huggingface()


@lru_cache(maxsize=2)
def _build_processor(model_id: str = ""):
    """Best-effort SAM3 loader — API differs by package version."""
    if not sam3_package_installed():
        raise RuntimeError(
            "sam3 is not installed. "
            "pip install git+https://github.com/facebookresearch/sam3.git "
            "and place weights under models/sam3/ (HF access may be required)."
        )
    resolved = resolve_sam3(model_id or None)
    device = str(torch_device())

    # Prefer local checkpoint path / snapshot
    try:
        from sam3.model_builder import build_sam3_image_model
        from sam3.model.sam3_image_processor import Sam3Processor

        kwargs: dict[str, Any] = {"device": device}
        if resolved is not None and resolved.is_file():
            kwargs["checkpoint_path"] = str(resolved)
        elif resolved is not None and resolved.is_dir():
            kwargs["checkpoint_path"] = str(resolved)
        model = build_sam3_image_model(**kwargs)
        processor = Sam3Processor(model, device=device)
        label = f"sam3-local:{resolved.name if resolved else 'default'}"
        return processor, label, device
    except Exception as exc:
        raise RuntimeError(
            f"Could not load SAM3 ({exc}). Ensure facebookresearch/sam3 is installed "
            "and models/sam3 weights are present (gated Hub: GIF_STUDIO_ALLOW_HF=1 + hf auth)."
        ) from exc


def segment_with_sam3(
    payload: bytes,
    point: tuple[float, float] | None = None,
    box: tuple[float, float, float, float] | None = None,
    prompt: str | None = None,
    model: str | None = None,
) -> dict[str, Any]:
    """Return mask_png_base64 like SAM2. Supports point, box, and text concept prompt."""
    if not sam3_ready():
        raise RuntimeError(
            "SAM3 is not available. Install sam3 + weights under models/sam3/."
        )

    processor, engine, device = _build_processor(model or "")
    bgr = decode_bgr(payload)
    if bgr is None:
        raise ValueError("Could not decode image for SAM3")
    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
    h, w = rgb.shape[:2]

    # API surface varies — try common patterns
    mask = None
    try:
        state = processor.set_image(rgb)
        if prompt and str(prompt).strip():
            out = processor.set_text_prompt(state=state, prompt=str(prompt).strip())
            masks = out.get("masks") if isinstance(out, dict) else None
            if masks is not None:
                m = masks[0]
                mask = m.cpu().numpy() if hasattr(m, "cpu") else np.asarray(m)
        if mask is None and box is not None:
            x1, y1, x2, y2 = box
            out = processor.set_box_prompt(
                state=state, box=[x1, y1, x2, y2],
            )
            masks = out.get("masks") if isinstance(out, dict) else getattr(out, "masks", None)
            if masks is not None:
                m = masks[0]
                mask = m.cpu().numpy() if hasattr(m, "cpu") else np.asarray(m)
        if mask is None and point is not None:
            out = processor.set_point_prompt(
                state=state, points=[[point[0], point[1]]], labels=[1],
            )
            masks = out.get("masks") if isinstance(out, dict) else getattr(out, "masks", None)
            if masks is not None:
                m = masks[0]
                mask = m.cpu().numpy() if hasattr(m, "cpu") else np.asarray(m)
    except Exception as exc:
        raise RuntimeError(f"SAM3 inference failed: {exc}") from exc

    if mask is None:
        raise RuntimeError("SAM3 returned no mask for the given prompt")

    mask = np.asarray(mask).squeeze()
    if mask.ndim > 2:
        mask = mask[0]
    if mask.shape[0] != h or mask.shape[1] != w:
        mask = cv2.resize(mask.astype(np.float32), (w, h), interpolation=cv2.INTER_LINEAR)
    binary = (mask > 0.5).astype(np.uint8) * 255
    ok, png = cv2.imencode(".png", binary)
    if not ok:
        raise RuntimeError("Could not encode SAM3 mask")
    return {
        "engine": engine,
        "mask_png_base64": base64.b64encode(png.tobytes()).decode("ascii"),
        "score": float(mask.max()) if mask.size else 0.0,
        "device": device,
        "point": point,
        "prompt": prompt,
    }
