"""Real-ESRGAN upscaling — xinntao/Real-ESRGAN.

Uses the official `realesrgan` + `basicsr` stack (RealESRGANer + RRDBNet),
with automatic weight download from the Real-ESRGAN GitHub releases.

Falls back to Spandrel if realesrgan/basicsr are unavailable.

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

REALESRGAN_X4PLUS_URL = (
    "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth"
)
REALESRGAN_X2PLUS_URL = (
    "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.1/RealESRGAN_x2plus.pth"
)


def _weight_path(scale: int) -> Path:
    custom = env_path("REALESRGAN_MODEL", "GIF_STUDIO_REALESRGAN")
    if custom:
        return custom
    name = "RealESRGAN_x2plus.pth" if int(scale) == 2 else "RealESRGAN_x4plus.pth"
    return models_dir() / "realesrgan" / name


def _ensure_weights(scale: int) -> Path:
    path = _weight_path(scale)
    if path.exists():
        return path
    path.parent.mkdir(parents=True, exist_ok=True)
    url = REALESRGAN_X2PLUS_URL if int(scale) == 2 else REALESRGAN_X4PLUS_URL
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
    """Ready when Spandrel or realesrgan+basicsr can load xinntao weights."""
    return spandrel_ready() or realesrgan_package_ready()


@lru_cache(maxsize=2)
def _realesrganer(scale: int):
    from basicsr.archs.rrdbnet_arch import RRDBNet
    from realesrgan import RealESRGANer

    scale = 2 if int(scale) == 2 else 4
    weights = _ensure_weights(scale)
    if scale == 2:
        model = RRDBNet(num_in_ch=3, num_out_ch=3, num_feat=64, num_block=23, num_grow_ch=32, scale=2)
    else:
        model = RRDBNet(num_in_ch=3, num_out_ch=3, num_feat=64, num_block=23, num_grow_ch=32, scale=4)

    device = torch_device()
    half = device.type == "cuda"
    tile = int(os.environ.get("REALESRGAN_TILE", "0") or 0)
    upsampler = RealESRGANer(
        scale=scale,
        model_path=str(weights),
        model=model,
        tile=tile,
        tile_pad=10,
        pre_pad=0,
        half=half,
        device=device,
    )
    return upsampler, f"realesrgan-x{scale}plus", scale


@lru_cache(maxsize=2)
def _spandrel_model(scale: int):
    from spandrel import ImageModelDescriptor, ModelLoader

    weights = _ensure_weights(2 if int(scale) == 2 else 4)
    model = ModelLoader().load_from_file(str(weights))
    if not isinstance(model, ImageModelDescriptor):
        raise RuntimeError(f"Unexpected Spandrel model type: {type(model)}")
    device = torch_device()
    model.to(device).eval()
    return model, f"realesrgan-spandrel-x{model.scale}", int(model.scale), device


def upscale_with_realesrgan(payload: bytes, scale: int = 2) -> tuple[bytes, str]:
    """Return (png_bytes, engine_name) using Real-ESRGAN (xinntao weights)."""
    scale = max(1, min(4, int(scale)))
    image = decode_bgr(payload)

    # Prefer Spandrel — works on modern Python without broken basicsr builds.
    if spandrel_ready():
        return _upscale_spandrel(image, scale)

    if realesrgan_package_ready():
        net_scale = 2 if scale <= 2 else 4
        upsampler, engine, built_scale = _realesrganer(net_scale)
        del built_scale
        if image.ndim == 2:
            bgr = cv2.cvtColor(image, cv2.COLOR_GRAY2BGR)
        else:
            bgr = image
        out, _ = upsampler.enhance(bgr, outscale=float(scale))
        return encode_png(out), engine

    raise RuntimeError(
        "Real-ESRGAN not available. Install with: pip install spandrel torch "
        "(or realesrgan + basicsr on older Python)"
    )


def _upscale_spandrel(image: np.ndarray, outscale: int) -> tuple[bytes, str]:
    import torch

    model, engine, net_scale, device = _spandrel_model(2 if outscale <= 2 else 4)
    if image.ndim == 2:
        rgb = cv2.cvtColor(image, cv2.COLOR_GRAY2RGB)
    elif image.shape[2] == 4:
        rgb = cv2.cvtColor(image, cv2.COLOR_BGRA2RGB)
    else:
        rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)

    tensor = torch.from_numpy(rgb).float().permute(2, 0, 1).unsqueeze(0) / 255.0
    tensor = tensor.to(device)
    with torch.inference_mode():
        out = model(tensor)
    out = out.squeeze(0).clamp(0, 1).permute(1, 2, 0).cpu().numpy()
    out = (out * 255.0).round().astype(np.uint8)
    bgr = cv2.cvtColor(out, cv2.COLOR_RGB2BGR)
    if outscale != net_scale:
        h, w = image.shape[:2]
        bgr = cv2.resize(bgr, (int(w * outscale), int(h * outscale)), interpolation=cv2.INTER_LANCZOS4)
    return encode_png(bgr), engine
