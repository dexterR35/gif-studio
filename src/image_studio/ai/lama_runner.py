"""Full big-LaMa erase inpainting for Image Studio.

Uses ``models/lama/big-lama.pt`` — the full FFCResNetGenerator torchscript
(~206 MB, MD5 e3aa4aaa…), **not** a small / lite variant.

Inference matches Sanster IOPaint / lama-cleaner:
  - pad to modulo 8
  - HD crop strategy for large images (run LaMa on mask boxes + margin)
  - keep unmasked pixels from the source plate

Official paper repo (train/eval only): https://github.com/advimman/lama
"""

from __future__ import annotations

import hashlib
import importlib.util
import logging
import os
from functools import lru_cache
from typing import Any

import cv2
import numpy as np

from .local_models import resolve_lama
from .paths import torch_device

logger = logging.getLogger(__name__)

# Same file lama-cleaner / IOPaint ships as the erase model.
BIG_LAMA_MD5 = "e3aa4aaa15225a33ec84f9f4bc47e500"
PAD_MOD = 8

# HD crop defaults aligned with lama-cleaner / IOPaint.
_DEFAULT_CROP_TRIGGER = 800
_DEFAULT_CROP_MARGIN = 128
_DEFAULT_RESIZE_LIMIT = 1280


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None or not str(raw).strip():
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def lama_hd_strategy() -> str:
    """``crop`` (default, best for large images) | ``original`` | ``resize``."""
    return (os.environ.get("IMAGE_STUDIO_LAMA_HD") or "crop").strip().lower()


def lama_ready(model_id: str | None = None) -> bool:
    if importlib.util.find_spec("torch") is None:
        return False
    path = resolve_lama(model_id)
    return path is not None and path.exists() and path.stat().st_size > 1024 * 1024


def file_md5(path) -> str:
    h = hashlib.md5()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def prepare_inpaint_mask(mask: np.ndarray, image_shape: tuple[int, ...]) -> np.ndarray:
    """Close + dilate foreground so fringe / soft matte edges are covered."""
    h, w = image_shape[:2]
    if mask.ndim == 3:
        mask = cv2.cvtColor(mask, cv2.COLOR_BGR2GRAY)
    if mask.shape[:2] != (h, w):
        mask = cv2.resize(mask, (w, h), interpolation=cv2.INTER_NEAREST)
    binary = (mask > 24).astype(np.uint8) * 255
    kernel_size = max(3, min(11, int(round(max(w, h) * 0.006)) | 1))
    kernel = np.ones((kernel_size, kernel_size), np.uint8)
    closed = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel)
    return cv2.dilate(closed, kernel, iterations=1)


def opencv_content_aware_fill(source_bgr: np.ndarray, inpaint_mask: np.ndarray) -> np.ndarray:
    """Fallback only when big-lama is missing."""
    h, w = source_bgr.shape[:2]
    radius = max(3, min(15, int(round(max(w, h) * 0.008))))
    telea = cv2.inpaint(source_bgr, inpaint_mask, radius, cv2.INPAINT_TELEA)
    navier_stokes = cv2.inpaint(source_bgr, inpaint_mask, radius, cv2.INPAINT_NS)
    reconstructed = cv2.addWeighted(telea, 0.72, navier_stokes, 0.28, 0)
    background = source_bgr.copy()
    background[inpaint_mask > 0] = reconstructed[inpaint_mask > 0]
    return background


def _ceil_modulo(x: int, mod: int) -> int:
    if x % mod == 0:
        return x
    return (x // mod + 1) * mod


def _pad_hwc_to_modulo(img: np.ndarray, mod: int = PAD_MOD) -> np.ndarray:
    """Pad HWC (or HW) with symmetric edges — same as IOPaint ``pad_img_to_modulo``."""
    if img.ndim == 2:
        img = img[:, :, np.newaxis]
    height, width = img.shape[:2]
    out_h = _ceil_modulo(height, mod)
    out_w = _ceil_modulo(width, mod)
    return np.pad(
        img,
        ((0, out_h - height), (0, out_w - width), (0, 0)),
        mode="symmetric",
    )


def _norm_chw(np_img: np.ndarray) -> np.ndarray:
    if np_img.ndim == 2:
        np_img = np_img[:, :, np.newaxis]
    return np.transpose(np_img.astype(np.float32) / 255.0, (2, 0, 1))


def _resize_max_size(np_img: np.ndarray, size_limit: int) -> np.ndarray:
    h, w = np_img.shape[:2]
    if max(h, w) <= size_limit:
        return np_img
    ratio = size_limit / max(h, w)
    new_w = int(w * ratio + 0.5)
    new_h = int(h * ratio + 0.5)
    interp = cv2.INTER_NEAREST if np_img.ndim == 2 or (
        np_img.ndim == 3 and np_img.shape[2] == 1
    ) else cv2.INTER_CUBIC
    return cv2.resize(np_img, (new_w, new_h), interpolation=interp)


def _boxes_from_mask(mask: np.ndarray) -> list[np.ndarray]:
    height, width = mask.shape[:2]
    _, thresh = cv2.threshold(mask, 127, 255, 0)
    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    boxes: list[np.ndarray] = []
    for cnt in contours:
        x, y, w, h = cv2.boundingRect(cnt)
        box = np.array([x, y, x + w, y + h], dtype=int)
        box[::2] = np.clip(box[::2], 0, width)
        box[1::2] = np.clip(box[1::2], 0, height)
        boxes.append(box)
    return boxes


def _disable_jit_fusers() -> None:
    """IOPaint tip — avoids rare CPU/GPU fusion slowdowns / crashes on torchscript."""
    try:
        import torch

        torch._C._jit_override_can_fuse_on_cpu(False)
        torch._C._jit_override_can_fuse_on_gpu(False)
        torch._C._jit_set_texpr_fuser_enabled(False)
        try:
            torch._C._jit_set_nvfuser_enabled(False)
        except Exception:  # noqa: BLE001
            pass
    except Exception:  # noqa: BLE001
        pass


@lru_cache(maxsize=2)
def _load_lama(model_path: str):
    import torch

    _disable_jit_fusers()
    digest = file_md5(model_path)
    if digest != BIG_LAMA_MD5:
        logger.warning(
            "big-lama.pt MD5 %s != expected %s — still loading (re-download if quality is off)",
            digest,
            BIG_LAMA_MD5,
        )
    device = torch_device()
    model = torch.jit.load(model_path, map_location="cpu")
    model.eval()
    model.to(device)
    return model, device


def unload_lama() -> None:
    _load_lama.cache_clear()


def _forward_pad(
    model,
    device,
    rgb: np.ndarray,
    mask: np.ndarray,
) -> np.ndarray:
    """Run big-lama on one RGB crop; return BGR at the same size."""
    import torch

    origin_h, origin_w = rgb.shape[:2]
    pad_rgb = _pad_hwc_to_modulo(rgb, PAD_MOD)
    pad_mask = _pad_hwc_to_modulo(mask, PAD_MOD)
    if pad_mask.shape[2] != 1:
        pad_mask = pad_mask[:, :, :1]

    image_t = torch.from_numpy(_norm_chw(pad_rgb)).unsqueeze(0).to(device)
    mask_t = torch.from_numpy(_norm_chw(pad_mask)).unsqueeze(0).to(device)
    mask_t = (mask_t > 0).float()

    with torch.inference_mode():
        inpainted = model(image_t, mask_t)

    cur = inpainted[0].permute(1, 2, 0).detach().cpu().numpy()
    cur = np.clip(cur * 255, 0, 255).astype(np.uint8)
    cur = cur[:origin_h, :origin_w]
    out_bgr = cv2.cvtColor(cur, cv2.COLOR_RGB2BGR)
    # Keep unmasked source pixels exactly (IOPaint sd_keep_unmasked_area style).
    src_bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    m = mask
    if m.ndim == 3:
        m = m[:, :, 0]
    keep = m < 127
    out_bgr[keep] = src_bgr[keep]
    return out_bgr


def _crop_box(
    rgb: np.ndarray,
    mask: np.ndarray,
    box: np.ndarray,
    margin: int,
) -> tuple[np.ndarray, np.ndarray, list[int]]:
    box_h = int(box[3] - box[1])
    box_w = int(box[2] - box[0])
    cx = int((box[0] + box[2]) // 2)
    cy = int((box[1] + box[3]) // 2)
    img_h, img_w = rgb.shape[:2]
    w = box_w + margin * 2
    h = box_h + margin * 2
    raw_left = cx - w // 2
    raw_right = cx + w // 2
    raw_top = cy - h // 2
    raw_bottom = cy + h // 2
    left = max(raw_left, 0)
    right = min(raw_right, img_w)
    top = max(raw_top, 0)
    bottom = min(raw_bottom, img_h)
    if raw_left < 0:
        right += abs(raw_left)
    if raw_right > img_w:
        left -= raw_right - img_w
    if raw_top < 0:
        bottom += abs(raw_top)
    if raw_bottom > img_h:
        top -= raw_bottom - img_h
    left, right = max(left, 0), min(right, img_w)
    top, bottom = max(top, 0), min(bottom, img_h)
    return (
        rgb[top:bottom, left:right],
        mask[top:bottom, left:right],
        [left, top, right, bottom],
    )


def _run_hd(
    model,
    device,
    rgb: np.ndarray,
    mask: np.ndarray,
    strategy: str,
) -> tuple[np.ndarray, str]:
    """Return BGR result + strategy label used."""
    strategy = strategy or "crop"
    crop_trigger = _env_int("IMAGE_STUDIO_LAMA_CROP_TRIGGER", _DEFAULT_CROP_TRIGGER)
    crop_margin = _env_int("IMAGE_STUDIO_LAMA_CROP_MARGIN", _DEFAULT_CROP_MARGIN)
    resize_limit = _env_int("IMAGE_STUDIO_LAMA_RESIZE_LIMIT", _DEFAULT_RESIZE_LIMIT)

    if strategy == "crop" and max(rgb.shape[:2]) > crop_trigger:
        boxes = _boxes_from_mask(mask)
        if boxes:
            result = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
            for box in boxes:
                crop_rgb, crop_mask, (left, top, right, bottom) = _crop_box(
                    rgb, mask, box, crop_margin
                )
                if crop_rgb.size == 0:
                    continue
                piece = _forward_pad(model, device, crop_rgb, crop_mask)
                result[top:bottom, left:right] = piece
            return result, "lama:hd-crop"

    if strategy == "resize" and max(rgb.shape[:2]) > resize_limit:
        origin = rgb.shape[:2]
        down_rgb = _resize_max_size(rgb, resize_limit)
        down_mask = _resize_max_size(mask, resize_limit)
        piece = _forward_pad(model, device, down_rgb, down_mask)
        piece = cv2.resize(piece, (origin[1], origin[0]), interpolation=cv2.INTER_CUBIC)
        src_bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
        keep = mask < 127
        piece[keep] = src_bgr[keep]
        return piece, "lama:hd-resize"

    return _forward_pad(model, device, rgb, mask), "lama:original"


def inpaint_with_lama(
    source_bgr: np.ndarray,
    mask: np.ndarray,
    *,
    model_id: str | None = None,
    prepare_mask: bool = True,
    hd_strategy: str | None = None,
) -> dict[str, Any]:
    """Full big-lama erase. Raises if the weight is missing."""
    if not lama_ready(model_id):
        raise RuntimeError(
            "Full big-lama is not ready. Run: python scripts/setup_ai_models.py "
            "(downloads models/lama/big-lama.pt) and ensure PyTorch is installed."
        )

    path = resolve_lama(model_id)
    assert path is not None
    inpaint_mask = prepare_inpaint_mask(mask, source_bgr.shape) if prepare_mask else mask
    if np.count_nonzero(inpaint_mask) == 0:
        return {
            "image_bgr": source_bgr.copy(),
            "engine": "lama:noop",
            "fill": "none",
            "mask": inpaint_mask,
        }

    model, device = _load_lama(str(path))
    rgb = cv2.cvtColor(source_bgr, cv2.COLOR_BGR2RGB)
    strategy = hd_strategy or lama_hd_strategy()
    out_bgr, used = _run_hd(model, device, rgb, inpaint_mask, strategy)
    return {
        "image_bgr": out_bgr,
        "engine": f"{used}:{path.name}",
        "fill": "lama",
        "mask": inpaint_mask,
        "model": "big-lama",
        "hd_strategy": strategy,
    }


def inpaint_background(
    source_bgr: np.ndarray,
    mask: np.ndarray,
    *,
    model_id: str | None = None,
) -> dict[str, Any]:
    """Full big-lama erase only — no OpenCV inpaint fallback."""
    inpaint_mask = prepare_inpaint_mask(mask, source_bgr.shape)
    if not lama_ready(model_id):
        raise RuntimeError(
            "LaMa is not ready. Run: python scripts/setup_ai_models.py "
            "(downloads models/lama/big-lama.pt) and ensure PyTorch is installed."
        )
    return inpaint_with_lama(
        source_bgr, inpaint_mask, model_id=model_id, prepare_mask=False
    )
