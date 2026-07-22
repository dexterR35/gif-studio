"""Upscale engines: ESRGAN, Real-ESRGAN, A-ESRGAN (anime).

Real-ESRGAN / ESRGAN / A-ESRGAN use xinntao weights via Spandrel or
realesrgan+basicsr. Missing weights or packages raise.

Guards: refuse output > 5k px on a side; refuse if estimated peak RAM > 20 GB;
tile + limit torch/OMP threads so upscale does not freeze the machine.

See: https://github.com/xinntao/Real-ESRGAN
"""

from __future__ import annotations

import os
from contextlib import contextmanager
from functools import lru_cache
from pathlib import Path
from typing import Any
from urllib.request import urlretrieve

import cv2
import numpy as np

from .paths import decode_bgr, encode_png, env_path, models_dir, torch_device

# Hard product limits — keep upscale from locking the PC / blowing RAM.
MAX_UPSCALE_DIMENSION = 5000
MAX_UPSCALE_MEMORY_BYTES = 20 * 1024 * 1024 * 1024  # 20 GiB
# Default tile so RealESRGAN never holds a full huge activation map (0 = whole image).
DEFAULT_UPSCALE_TILE = 256
# Keep CPU inference from saturating all cores.
DEFAULT_UPSCALE_THREADS = 2

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
    if key not in ALIASES:
        known = ", ".join(sorted(set(ALIASES.values())))
        raise RuntimeError(f"Unknown upscale model {model!r}. Supported: {known}.")
    return ALIASES[key]


def estimate_upscale_memory_bytes(width: int, height: int, scale: int) -> int:
    """Conservative peak RAM for float32 in/out + RRDB workspace (tiled path still capped)."""
    w = max(1, int(width))
    h = max(1, int(height))
    s = max(1, int(scale))
    ow, oh = w * s, h * s
    # uint8 decode + float32 RGB in/out + ~4× activation overhead on the larger side
    bytes_u8 = w * h * 4 + ow * oh * 4
    bytes_f32 = (w * h + ow * oh) * 3 * 4
    workspace = max(w * h, ow * oh) * 3 * 4 * 4
    return int(bytes_u8 + bytes_f32 + workspace)


def check_upscale_limits(width: int, height: int, scale: int) -> dict[str, Any]:
    """Validate upscale size/memory. Raises ValueError if unsafe."""
    w = max(1, int(width))
    h = max(1, int(height))
    s = max(1, min(4, int(scale)))
    ow, oh = w * s, h * s
    mem = estimate_upscale_memory_bytes(w, h, s)
    info = {
        "width": w,
        "height": h,
        "scale": s,
        "out_width": ow,
        "out_height": oh,
        "est_memory_bytes": mem,
        "max_dimension": MAX_UPSCALE_DIMENSION,
        "max_memory_bytes": MAX_UPSCALE_MEMORY_BYTES,
    }
    if max(ow, oh) > MAX_UPSCALE_DIMENSION:
        raise ValueError(
            f"Upscale refused: output would be {ow}×{oh} px "
            f"(max {MAX_UPSCALE_DIMENSION}×{MAX_UPSCALE_DIMENSION}). "
            f"Use a smaller scale or source."
        )
    if mem > MAX_UPSCALE_MEMORY_BYTES:
        gib = mem / (1024 ** 3)
        raise ValueError(
            f"Upscale refused: estimated ~{gib:.1f} GiB peak memory "
            f"(cap {MAX_UPSCALE_MEMORY_BYTES // (1024 ** 3)} GiB). "
            f"Use a smaller scale or source."
        )
    return info


_UPSCALE_NICE_APPLIED = False


@contextmanager
def _upscale_resource_limits():
    """Cap threads so upscale does not freeze the desktop (API already uses a worker thread)."""
    global _UPSCALE_NICE_APPLIED
    threads = max(1, int(os.environ.get("GIF_STUDIO_UPSCALE_THREADS", DEFAULT_UPSCALE_THREADS) or DEFAULT_UPSCALE_THREADS))
    prev_omp = os.environ.get("OMP_NUM_THREADS")
    prev_mkl = os.environ.get("MKL_NUM_THREADS")
    os.environ["OMP_NUM_THREADS"] = str(threads)
    os.environ["MKL_NUM_THREADS"] = str(threads)
    # Lower process priority once (os.nice is cumulative).
    if not _UPSCALE_NICE_APPLIED:
        try:
            nice_delta = int(os.environ.get("GIF_STUDIO_UPSCALE_NICE", "5") or 5)
        except ValueError:
            nice_delta = 5
        try:
            if nice_delta > 0:
                os.nice(nice_delta)
                _UPSCALE_NICE_APPLIED = True
        except (AttributeError, OSError, PermissionError):
            _UPSCALE_NICE_APPLIED = True  # don't retry forever

    torch_prev = None
    try:
        import torch

        try:
            torch_prev = torch.get_num_threads()
            torch.set_num_threads(threads)
        except Exception:
            torch_prev = None
        yield
    finally:
        if prev_omp is None:
            os.environ.pop("OMP_NUM_THREADS", None)
        else:
            os.environ["OMP_NUM_THREADS"] = prev_omp
        if prev_mkl is None:
            os.environ.pop("MKL_NUM_THREADS", None)
        else:
            os.environ["MKL_NUM_THREADS"] = prev_mkl
        try:
            import torch

            if torch_prev is not None:
                torch.set_num_threads(torch_prev)
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
        except Exception:
            pass


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
    try:
        mid = normalize_model(model)
    except RuntimeError:
        return False
    if not realesrgan_ready():
        return False
    try:
        path = _weight_path(mid, 2 if mid in {"realesrgan", "realesrgan-x2"} else 4)
        return path.exists() and path.stat().st_size > 1024
    except Exception:
        return False


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
    # Tile by default — whole-image enhance can pin all RAM/CPU on large frames.
    tile = int(os.environ.get("REALESRGAN_TILE", str(DEFAULT_UPSCALE_TILE)) or DEFAULT_UPSCALE_TILE)
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
    """Return (png_bytes, engine_name). Enforces 5k / 20 GiB guards; runs under thread caps."""
    scale = max(1, min(4, int(scale)))
    mid = normalize_model(model)
    image = decode_bgr(payload)
    h, w = image.shape[:2]
    check_upscale_limits(w, h, scale)

    with _upscale_resource_limits():
        if mid not in MODEL_SPECS and mid != "realesrgan-x2":
            raise RuntimeError(
                f"Unknown upscale model {model!r}. "
                f"Supported: {', '.join(sorted(set(ALIASES.values())))}."
            )

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
        "(or realesrgan + basicsr on older Python) and place weights under models/realesrgan/."
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

    tile = int(os.environ.get("REALESRGAN_TILE", str(DEFAULT_UPSCALE_TILE)) or DEFAULT_UPSCALE_TILE)
    h, w = rgb.shape[:2]
    # Small frames: one forward. Large: tile to keep peak VRAM/RAM down.
    if tile <= 0 or max(h, w) <= tile:
        bgr = _spandrel_forward(loaded, rgb, device)
    else:
        bgr = _spandrel_tiled(loaded, rgb, device, tile=tile, pad=16)

    if outscale != net_scale:
        bgr = cv2.resize(
            bgr,
            (int(w * outscale), int(h * outscale)),
            interpolation=cv2.INTER_LANCZOS4,
        )
    return encode_png(bgr), engine


def _spandrel_forward(loaded, rgb: np.ndarray, device) -> np.ndarray:
    import torch

    tensor = torch.from_numpy(np.ascontiguousarray(rgb)).float().permute(2, 0, 1).unsqueeze(0) / 255.0
    tensor = tensor.to(device)
    with torch.inference_mode():
        out = loaded(tensor)
    out = out.squeeze(0).clamp(0, 1).permute(1, 2, 0).detach().cpu().numpy()
    out = (out * 255.0).round().astype(np.uint8)
    return cv2.cvtColor(out, cv2.COLOR_RGB2BGR)


def _spandrel_tiled(loaded, rgb: np.ndarray, device, tile: int = 256, pad: int = 16) -> np.ndarray:
    """Tile Spandrel inference so large frames do not allocate one giant activation."""
    import torch

    h, w = rgb.shape[:2]
    # Probe scale from a tiny corner
    probe = _spandrel_forward(loaded, rgb[: min(64, h), : min(64, w)], device)
    scale_y = max(1, round(probe.shape[0] / min(64, h)))
    scale_x = max(1, round(probe.shape[1] / min(64, w)))
    out = np.zeros((h * scale_y, w * scale_x, 3), dtype=np.uint8)

    for y0 in range(0, h, tile):
        for x0 in range(0, w, tile):
            y1 = min(h, y0 + tile)
            x1 = min(w, x0 + tile)
            ys = max(0, y0 - pad)
            xs = max(0, x0 - pad)
            ye = min(h, y1 + pad)
            xe = min(w, x1 + pad)
            patch = rgb[ys:ye, xs:xe]
            patch_bgr = _spandrel_forward(loaded, patch, device)
            # Map padded region back
            top = (y0 - ys) * scale_y
            left = (x0 - xs) * scale_x
            ph = (y1 - y0) * scale_y
            pw = (x1 - x0) * scale_x
            oy0, ox0 = y0 * scale_y, x0 * scale_x
            crop = patch_bgr[top:top + ph, left:left + pw]
            out[oy0:oy0 + crop.shape[0], ox0:ox0 + crop.shape[1]] = crop
            if device.type == "cuda":
                torch.cuda.empty_cache()
    return out
