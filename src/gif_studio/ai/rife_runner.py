"""RIFE frame interpolation — hzwer/ECCV2022-RIFE (+ Practical-RIFE).

Requires a local clone of the RIFE repo (model code) and pretrained weights
in train_log/ (flownet.pkl + matching architecture .py).

Env:
  RIFE_REPO / GIF_STUDIO_RIFE_REPO  — path to ECCV2022-RIFE or Practical-RIFE
  RIFE_MODEL / GIF_STUDIO_RIFE      — path to train_log directory

Default lookup:
  third_party/Practical-RIFE or third_party/ECCV2022-RIFE
  models/rife/train_log

See: https://github.com/hzwer/ECCV2022-RIFE
     https://github.com/hzwer/Practical-RIFE
"""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import Any

import cv2
import numpy as np

from .paths import (
    decode_bgr,
    encode_png,
    ensure_sys_path,
    env_path,
    models_dir,
    third_party_dir,
    torch_device,
)


def _candidate_repos() -> list[Path]:
    found: list[Path] = []
    env = env_path("RIFE_REPO", "GIF_STUDIO_RIFE_REPO")
    if env:
        found.append(env)
    tp = third_party_dir()
    for name in ("Practical-RIFE", "ECCV2022-RIFE", "RIFE"):
        candidate = tp / name
        if candidate.is_dir():
            found.append(candidate)
    return found


def _train_log_dir() -> Path | None:
    env = env_path("RIFE_MODEL", "GIF_STUDIO_RIFE")
    if env:
        return env if env.is_dir() else env.parent
    default = models_dir() / "rife" / "train_log"
    if default.is_dir() and any(default.glob("*.pkl")):
        return default
    for repo in _candidate_repos():
        train_log = repo / "train_log"
        if train_log.is_dir() and any(train_log.glob("*.pkl")):
            return train_log
    return None


def rife_ready() -> bool:
    """Ready only when torch + weights + a RIFE repo (inference code) are present."""
    try:
        import torch  # noqa: F401
    except ImportError:
        return False
    return _train_log_dir() is not None and bool(_candidate_repos())


def _train_log_has_arch() -> bool:
    train_log = _train_log_dir()
    if not train_log:
        return False
    return any(train_log.glob("RIFE*.py")) or any(train_log.glob("*.py"))


@lru_cache(maxsize=1)
def _load_rife_model() -> tuple[Any, str]:
    try:
        import torch  # noqa: F401
    except ImportError as exc:
        raise RuntimeError("PyTorch is required for RIFE. pip install torch") from exc

    train_log = _train_log_dir()
    if train_log is None:
        raise RuntimeError(
            "RIFE weights not found. Place flownet.pkl under models/rife/train_log "
            "or set RIFE_MODEL / clone Practical-RIFE into third_party/."
        )

    repos = _candidate_repos()
    if not repos:
        raise RuntimeError(
            "RIFE repo not found. Clone https://github.com/hzwer/Practical-RIFE "
            "into third_party/Practical-RIFE (or set RIFE_REPO)."
        )

    repo = repos[0]
    # Practical-RIFE provides model.warplayer / model.loss
    ensure_sys_path(repo)
    # Parent of train_log so `import train_log.RIFE_HDv3` works
    ensure_sys_path(train_log.parent)
    # Also allow flat imports from inside train_log
    ensure_sys_path(train_log)

    init_py = train_log / "__init__.py"
    if not init_py.exists():
        init_py.write_text("# auto-created so train_log is importable\n", encoding="utf-8")

    errors: list[str] = []
    model = None
    version = "unknown"

    # Prefer Practical-RIFE train_log.RIFE_HDv3 (MonsterMMORPG / v4.x weights)
    for label, importer in (
        ("v3", lambda: __import__("train_log.RIFE_HDv3", fromlist=["Model"]).Model),
        ("v3-flat", lambda: __import__("RIFE_HDv3", fromlist=["Model"]).Model),
        ("v2", lambda: __import__("model.RIFE_HDv2", fromlist=["Model"]).Model),
        ("v1", lambda: __import__("model.RIFE_HD", fromlist=["Model"]).Model),
        ("arxiv", lambda: __import__("model.RIFE", fromlist=["Model"]).Model),
    ):
        try:
            Model = importer()
            model = Model()
            # Some loaders only keep keys with "module." — patch empty loads
            try:
                model.load_model(str(train_log), -1)
            except Exception:
                # Some loaders expect module. prefixes — load state dict manually (CPU-safe)
                import torch

                ckpt = torch.load(str(train_log / "flownet.pkl"), map_location="cpu")
                if isinstance(ckpt, dict) and any(k.startswith("module.") for k in ckpt):
                    ckpt = {k.replace("module.", ""): v for k, v in ckpt.items()}
                model.flownet.load_state_dict(ckpt, strict=False)
            version = label
            break
        except Exception as exc:  # noqa: BLE001
            errors.append(f"{label}: {exc}")
            model = None

    if model is None:
        raise RuntimeError(
            "Could not load RIFE model. Tried HD v3/v2/v1/arxiv. Errors:\n"
            + "\n".join(errors)
        )

    model.eval()
    if hasattr(model, "device"):
        model.device()
    if hasattr(model, "flownet"):
        model.flownet.to(torch_device())
    return model, f"rife-{version}"


def _to_tensor(bgr: np.ndarray, device) -> tuple[Any, int, int]:
    import torch
    from torch.nn import functional as F

    if bgr.ndim == 2:
        bgr = cv2.cvtColor(bgr, cv2.COLOR_GRAY2BGR)
    if bgr.shape[2] == 4:
        bgr = bgr[:, :, :3]
    h, w = bgr.shape[:2]
    tensor = torch.from_numpy(np.transpose(bgr, (2, 0, 1))).float().to(device) / 255.0
    tensor = tensor.unsqueeze(0)
    ph = ((h - 1) // 32 + 1) * 32
    pw = ((w - 1) // 32 + 1) * 32
    padding = (0, pw - w, 0, ph - h)
    tensor = F.pad(tensor, padding)
    return tensor, h, w


def _from_tensor(tensor, h: int, w: int) -> np.ndarray:
    arr = (tensor[0] * 255.0).byte().cpu().numpy().transpose(1, 2, 0)
    return arr[:h, :w]


def _interpolate_pair(model, img0: np.ndarray, img1: np.ndarray, exp: int) -> list[np.ndarray]:
    import torch
    from torch.nn import functional as F

    device = torch_device()
    t0, h, w = _to_tensor(img0, device)
    t1, _, _ = _to_tensor(img1, device)
    # Ensure same spatial size
    if t0.shape != t1.shape:
        t1 = F.interpolate(t1, size=t0.shape[2:], mode="bilinear", align_corners=False)

    frames = [t0, t1]
    with torch.inference_mode():
        for _ in range(max(1, exp)):
            nxt: list = []
            for i in range(len(frames) - 1):
                mid = model.inference(frames[i], frames[i + 1])
                nxt.append(frames[i])
                nxt.append(mid)
            nxt.append(frames[-1])
            frames = nxt

    return [_from_tensor(f, h, w) for f in frames]


def interpolate_with_rife(frames: list[bytes], factor: int = 2) -> tuple[list[bytes], str]:
    """Insert mid-frames between consecutive inputs. factor=2 → 1 mid per pair."""
    if len(frames) < 2:
        return frames, "identity"

    factor = max(1, min(8, int(factor)))
    if factor == 1:
        return frames, "identity"

    # exp in RIFE: each step doubles → factor 2 ⇒ exp=1, factor 4 ⇒ exp=2
    exp = int(np.log2(factor))
    if 2 ** exp != factor:
        # Non-power-of-two: use exp=1 repeatedly to approximate
        exp = 1

    model, engine = _load_rife_model()
    decoded = [decode_bgr(f) for f in frames]
    # Normalize sizes to first frame
    h0, w0 = decoded[0].shape[:2]
    normalized = []
    for img in decoded:
        if img.shape[0] != h0 or img.shape[1] != w0:
            img = cv2.resize(img, (w0, h0), interpolation=cv2.INTER_AREA)
        normalized.append(img)

    out_images: list[np.ndarray] = []
    for i in range(len(normalized) - 1):
        pair_frames = _interpolate_pair(model, normalized[i], normalized[i + 1], exp=max(1, exp))
        # pair_frames includes both endpoints; drop the last to avoid duplicates
        if i < len(normalized) - 2:
            out_images.extend(pair_frames[:-1])
        else:
            out_images.extend(pair_frames)

    # If factor wasn't power of 2, densify with additional single mids
    if 2 ** exp < factor and factor > 1:
        denser: list[np.ndarray] = []
        for i in range(len(out_images) - 1):
            denser.append(out_images[i])
            needed = factor - 1  # already have endpoints from exp path; simple mid
            mid_list = _interpolate_pair(model, out_images[i], out_images[i + 1], exp=1)
            # mid_list = [a, mid, b]
            if len(mid_list) >= 3:
                denser.append(mid_list[1])
        denser.append(out_images[-1])
        out_images = denser

    return [encode_png(img) for img in out_images], engine
