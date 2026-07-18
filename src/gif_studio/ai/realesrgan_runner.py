"""Upscale engines: Bicubic, ESRGAN, Real-ESRGAN, A-ESRGAN (anime).

Real-ESRGAN / ESRGAN / A-ESRGAN use xinntao weights via Spandrel or
realesrgan+basicsr. Bicubic is always available (OpenCV).

See: https://github.com/xinntao/Real-ESRGAN
"""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import Any
from urllib.request import urlretrieve

import cv2
import numpy as np

from .paths import decode_bgr, encode_png, env_path, models_dir, torch_device

# model id → (filename, url, net_scale, num_block)
MODEL_SPECS: dict[str, dict[str, Any]] = {
    "esrgan": {
        "file": "ESRGAN_SRx4_DF2KOST_official-ff704c30.pth",
        "url": (
            "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.1/"
            "ESRGAN_SRx4_DF2KOST_official-ff704c30.pth"
        ),
        "net_scale": 4,
        "num_block": 23,
        "label": "esrgan",
    },
    "realesrgan": {
        "file": "RealESRGAN_x4plus.pth",
        "url": (
            "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/"
            "RealESRGAN_x4plus.pth"
        ),
        "file_x2": "RealESRGAN_x2plus.pth",
        "url_x2": (
            "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.1/"
            "RealESRGAN_x2plus.pth"
        ),
        "net_scale": 4,
        "num_block": 23,
        "label": "realesrgan",
    },
    "a-esrgan": {
        "file": "RealESRGAN_x4plus_anime_6B.pth",
        "url": (
            "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.2.4/"
            "RealESRGAN_x4plus_anime_6B.pth"
        ),
        "net_scale": 4,
        "num_block": 6,
        "label": "a-esrgan",
    },
}

ALIASES = {
    "bicubic": "bicubic",
    "esrgan": "esrgan",
    "real-esrgan": "realesrgan",
    "realesrgan": "realesrgan",
    "realesrgan-x2": "realesrgan-x2",
    "a-esrgan": "a-esrgan",
    "aesrgan": "a-esrgan",
    "anime": "a-esrgan",
}


def normalize_model(model: str | None) -> str:
    key = (model or "realesrgan").strip().lower().replace("_", "-")
    return ALIASES.get(key, "realesrgan")


def _weight_path(model: str, scale: int) -> Path:
    custom = env_path("REALESRGAN_MODEL", "GIF_STUDIO_REALESRGAN")
    if custom and model in {"realesrgan", "realesrgan-x2"}:
        return custom
    if model == "realesrgan-x2":
        return models_dir() / "realesrgan" / "RealESRGAN_x2plus.pth"
    spec = MODEL_SPECS.get(model) or MODEL_SPECS["realesrgan"]
    if model == "realesrgan" and int(scale) == 2 and spec.get("file_x2"):
        return models_dir() / "realesrgan" / spec["file_x2"]
    return models_dir() / "realesrgan" / spec["file"]


def _ensure_weights(model: str, scale: int) -> Path:
    """Require local weights under models/realesrgan (no runtime Hub downloads)."""
    mid = "realesrgan" if model == "realesrgan-x2" else model
    path = _weight_path(model, scale)
    if path.exists() and path.stat().st_size > 1024:
        return path
    # Optional one-shot fetch from GitHub releases (not Hugging Face)
    allow = os.environ.get("GIF_STUDIO_FETCH_WEIGHTS", "").strip().lower() in {
        "1", "true", "yes",
    }
    if not allow:
        raise FileNotFoundError(
            f"Missing local upscale weights: {path}. "
            "Run: python scripts/setup_ai_models.py"
        )
    path.parent.mkdir(parents=True, exist_ok=True)
    spec = MODEL_SPECS[mid]
    if (model == "realesrgan-x2" or (model == "realesrgan" and int(scale) == 2)) and spec.get("url_x2"):
        url = spec["url_x2"]
    else:
        url = spec["url"]
    tmp = path.with_suffix(path.suffix + ".part")
    urlretrieve(url, tmp)
    tmp.replace(path)
    return path


def realesrgan_package_ready() -> bool:
    import importlib.util

    return (
        importlib.util.find_spec("realesrgan") is not None
        and importlib.util.find_spec("basicsr") is not None
    )


def spandrel_ready() -> bool:
    import importlib.util

    return importlib.util.find_spec("spandrel") is not None


def realesrgan_ready() -> bool:
    """AI upscalers ready when Spandrel or realesrgan+basicsr can load weights."""
    return spandrel_ready() or realesrgan_package_ready()


def upscale_available(model: str | None = None) -> bool:
    mid = normalize_model(model)
    if mid == "bicubic":
        return True
    if not realesrgan_ready():
        return False
    try:
        path = _weight_path(mid, 2 if mid in {"realesrgan", "realesrgan-x2"} else 4)
        return path.exists() and path.stat().st_size > 1024
    except Exception:
        return False


def _upscale_bicubic(image: np.ndarray, scale: int) -> tuple[bytes, str]:
    h, w = image.shape[:2]
    out = cv2.resize(
        image,
        (max(1, int(w * scale)), max(1, int(h * scale))),
        interpolation=cv2.INTER_CUBIC,
    )
    return encode_png(out), "bicubic"


def _spec_key(model: str) -> str:
    if model == "realesrgan-x2":
        return "realesrgan"
    return model


@lru_cache(maxsize=6)
def _realesrganer(model: str, net_scale: int):
    from basicsr.archs.rrdbnet_arch import RRDBNet
    from realesrgan import RealESRGANer

    key = _spec_key(model)
    spec = MODEL_SPECS[key]
    if model == "realesrgan-x2" or (model == "realesrgan" and int(net_scale) == 2):
        net_scale = 2
    else:
        net_scale = int(spec["net_scale"])
    weights = _ensure_weights(model, net_scale)
    num_block = int(spec["num_block"])
    model_net = RRDBNet(
        num_in_ch=3,
        num_out_ch=3,
        num_feat=64,
        num_block=num_block,
        num_grow_ch=32,
        scale=net_scale,
    )

    device = torch_device()
    half = device.type == "cuda"
    tile = int(os.environ.get("REALESRGAN_TILE", "0") or 0)
    upsampler = RealESRGANer(
        scale=net_scale,
        model_path=str(weights),
        model=model_net,
        tile=tile,
        tile_pad=10,
        pre_pad=0,
        half=half,
        device=device,
    )
    return upsampler, f"{spec['label']}-x{net_scale}", net_scale


@lru_cache(maxsize=6)
def _spandrel_model(model: str, net_scale: int):
    from spandrel import ImageModelDescriptor, ModelLoader

    weights = _ensure_weights(model, net_scale)
    loaded = ModelLoader().load_from_file(str(weights))
    if not isinstance(loaded, ImageModelDescriptor):
        raise RuntimeError(f"Unexpected Spandrel model type: {type(loaded)}")
    device = torch_device()
    loaded.to(device).eval()
    label = MODEL_SPECS[_spec_key(model)]["label"]
    return loaded, f"{label}-spandrel-x{loaded.scale}", int(loaded.scale), device


def upscale_with_realesrgan(
    payload: bytes,
    scale: int = 2,
    model: str = "realesrgan",
) -> tuple[bytes, str]:
    """Return (png_bytes, engine_name)."""
    scale = max(1, min(4, int(scale)))
    mid = normalize_model(model)
    image = decode_bgr(payload)

    if mid == "bicubic":
        return _upscale_bicubic(image, scale)

    if mid not in MODEL_SPECS and mid != "realesrgan-x2":
        mid = "realesrgan"

    # Prefer Spandrel — works on modern Python without broken basicsr builds.
    if spandrel_ready():
        return _upscale_spandrel(image, scale, mid)

    if realesrgan_package_ready():
        if mid == "realesrgan-x2":
            net_scale = 2
        elif mid == "realesrgan" and scale <= 2:
            net_scale = 2
        else:
            net_scale = MODEL_SPECS[_spec_key(mid)]["net_scale"]
        upsampler, engine, _built = _realesrganer(mid, int(net_scale))
        if image.ndim == 2:
            bgr = cv2.cvtColor(image, cv2.COLOR_GRAY2BGR)
        else:
            bgr = image
        out, _ = upsampler.enhance(bgr, outscale=float(scale))
        return encode_png(out), engine

    raise RuntimeError(
        "AI upscale not available. Install with: pip install spandrel torch "
        "(or realesrgan + basicsr on older Python). Bicubic works without AI."
    )


def _upscale_spandrel(image: np.ndarray, outscale: int, model: str) -> tuple[bytes, str]:
    import torch

    if model == "realesrgan-x2":
        net_scale_hint = 2
    elif model == "realesrgan" and outscale <= 2:
        net_scale_hint = 2
    else:
        net_scale_hint = MODEL_SPECS[_spec_key(model)]["net_scale"]
    loaded, engine, net_scale, device = _spandrel_model(model, int(net_scale_hint))
    if image.ndim == 2:
        rgb = cv2.cvtColor(image, cv2.COLOR_GRAY2RGB)
    elif image.shape[2] == 4:
        rgb = cv2.cvtColor(image, cv2.COLOR_BGRA2RGB)
    else:
        rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)

    tensor = torch.from_numpy(rgb).float().permute(2, 0, 1).unsqueeze(0) / 255.0
    tensor = tensor.to(device)
    with torch.inference_mode():
        out = loaded(tensor)
    out = out.squeeze(0).clamp(0, 1).permute(1, 2, 0).cpu().numpy()
    out = (out * 255.0).round().astype(np.uint8)
    bgr = cv2.cvtColor(out, cv2.COLOR_RGB2BGR)
    if outscale != net_scale:
        h, w = image.shape[:2]
        bgr = cv2.resize(
            bgr,
            (int(w * outscale), int(h * outscale)),
            interpolation=cv2.INTER_LANCZOS4,
        )
    return encode_png(bgr), engine
