"""Image upscaling with fixed Real-ESRGAN ×2 and ×4 weights.

The two Real-ESRGAN checkpoints use Spandrel or realesrgan+basicsr. Missing
weights or packages raise; no alternate model family is accepted.

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

from .paths import decode_bgr, encode_png, models_dir, torch_device

# Hard product limits — keep upscale from locking the PC / blowing RAM.
MAX_UPSCALE_DIMENSION = 5000
MAX_UPSCALE_MEMORY_BYTES = 20 * 1024 * 1024 * 1024  # 20 GiB
# Default tile so RealESRGAN never holds a full huge activation map (0 = whole image).
DEFAULT_UPSCALE_TILE = 256
# Keep CPU inference from saturating all cores.
DEFAULT_UPSCALE_THREADS = 2

# Output scale → exact fixed Real-ESRGAN checkpoint.
MODEL_SPECS: dict[int, dict[str, Any]] = {
    2: {
        "file": "RealESRGAN_x2plus.pth",
        "url": (
            "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.1/"
            "RealESRGAN_x2plus.pth"
        ),
        "num_block": 23,
    },
    4: {
        "file": "RealESRGAN_x4plus.pth",
        "url": (
            "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/"
            "RealESRGAN_x4plus.pth"
        ),
        "num_block": 23,
    },
}

SUPPORTED_SCALES = frozenset(MODEL_SPECS)


def normalize_scale(scale: int) -> int:
    try:
        numeric = float(scale)
    except (TypeError, ValueError) as exc:
        raise ValueError("Real-ESRGAN scale must be 2 or 4.") from exc
    if not numeric.is_integer():
        raise ValueError("Real-ESRGAN scale must be 2 or 4.")
    value = int(numeric)
    if value not in SUPPORTED_SCALES:
        raise ValueError("Real-ESRGAN scale must be 2 or 4.")
    return value


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
    s = normalize_scale(scale)
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
    """Cap threads so upscale does not stall the API process."""
    global _UPSCALE_NICE_APPLIED
    threads = max(1, int(os.environ.get("IMAGE_STUDIO_UPSCALE_THREADS", DEFAULT_UPSCALE_THREADS) or DEFAULT_UPSCALE_THREADS))
    prev_omp = os.environ.get("OMP_NUM_THREADS")
    prev_mkl = os.environ.get("MKL_NUM_THREADS")
    os.environ["OMP_NUM_THREADS"] = str(threads)
    os.environ["MKL_NUM_THREADS"] = str(threads)
    # Lower process priority once (os.nice is cumulative).
    if not _UPSCALE_NICE_APPLIED:
        try:
            nice_delta = int(os.environ.get("IMAGE_STUDIO_UPSCALE_NICE", "5") or 5)
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


def _weight_path(scale: int) -> Path:
    spec = MODEL_SPECS[normalize_scale(scale)]
    return models_dir() / "realesrgan" / spec["file"]


def _ensure_weights(scale: int) -> Path:
    """Require local weights under models/realesrgan (no runtime Hub downloads)."""
    normalized_scale = normalize_scale(scale)
    path = _weight_path(normalized_scale)
    if path.exists() and path.stat().st_size > 1024:
        return path
    # Optional one-shot fetch from GitHub releases (not Hugging Face)
    allow = os.environ.get("IMAGE_STUDIO_FETCH_WEIGHTS", "").strip().lower() in {
        "1", "true", "yes",
    }
    if not allow:
        raise FileNotFoundError(
            f"Missing local upscale weights: {path}. "
            "Run: python scripts/setup_ai_models.py"
        )
    path.parent.mkdir(parents=True, exist_ok=True)
    url = MODEL_SPECS[normalized_scale]["url"]
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


def upscale_available(scale: int = 2) -> bool:
    try:
        normalized_scale = normalize_scale(scale)
    except (TypeError, ValueError):
        return False
    if not realesrgan_ready():
        return False
    try:
        path = _weight_path(normalized_scale)
        return path.exists() and path.stat().st_size > 1024
    except Exception:
        return False


@lru_cache(maxsize=2)
def _realesrganer(net_scale: int):
    from basicsr.archs.rrdbnet_arch import RRDBNet
    from realesrgan import RealESRGANer

    net_scale = normalize_scale(net_scale)
    spec = MODEL_SPECS[net_scale]
    weights = _ensure_weights(net_scale)
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
    # Tile by default — whole-image enhance can pin all RAM/CPU on large images.
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
    return upsampler, f"realesrgan-x{net_scale}"


@lru_cache(maxsize=2)
def _spandrel_model(net_scale: int):
    from spandrel import ImageModelDescriptor, ModelLoader

    net_scale = normalize_scale(net_scale)
    weights = _ensure_weights(net_scale)
    loaded = ModelLoader().load_from_file(str(weights))
    if not isinstance(loaded, ImageModelDescriptor):
        raise RuntimeError(f"Unexpected Spandrel model type: {type(loaded)}")
    loaded_scale = int(loaded.scale)
    if loaded_scale != net_scale:
        raise RuntimeError(
            f"Real-ESRGAN checkpoint scale mismatch: expected ×{net_scale}, "
            f"loaded ×{loaded_scale}."
        )
    device = torch_device()
    loaded.to(device).eval()
    engine = f"realesrgan-x{loaded_scale}-spandrel"
    return loaded, engine, device


def upscale_with_realesrgan(
    payload: bytes,
    scale: int = 2,
) -> tuple[bytes, str]:
    """Return (png_bytes, engine_name). Enforces 5k / 20 GiB guards; runs under thread caps."""
    scale = normalize_scale(scale)
    image = decode_bgr(payload)
    h, w = image.shape[:2]
    check_upscale_limits(w, h, scale)

    with _upscale_resource_limits():
        # Prefer Spandrel — works on modern Python without broken basicsr builds.
        if spandrel_ready():
            return _upscale_spandrel(image, scale)

        if realesrgan_package_ready():
            upsampler, engine = _realesrganer(scale)
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


def _upscale_spandrel(image: np.ndarray, outscale: int) -> tuple[bytes, str]:
    loaded, engine, device = _spandrel_model(outscale)
    if image.ndim == 2:
        rgb = cv2.cvtColor(image, cv2.COLOR_GRAY2RGB)
    elif image.shape[2] == 4:
        rgb = cv2.cvtColor(image, cv2.COLOR_BGRA2RGB)
    else:
        rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)

    tile = int(os.environ.get("REALESRGAN_TILE", str(DEFAULT_UPSCALE_TILE)) or DEFAULT_UPSCALE_TILE)
    h, w = rgb.shape[:2]
    # Small images: one forward pass. Large images: tile to limit peak VRAM/RAM.
    if tile <= 0 or max(h, w) <= tile:
        bgr = _spandrel_forward(loaded, rgb, device)
    else:
        bgr = _spandrel_tiled(loaded, rgb, device, tile=tile, pad=16)

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
    """Tile Spandrel inference so large images do not allocate one giant activation."""
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
