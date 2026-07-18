"""Shared torch / path helpers for optional heavy AI engines."""

from __future__ import annotations

import os
import sys
from functools import lru_cache
from pathlib import Path


def project_root() -> Path:
    # src/gif_studio/ai/paths.py → repo root
    return Path(__file__).resolve().parents[3]


def models_dir() -> Path:
    override = os.environ.get("GIF_STUDIO_MODELS_DIR")
    if override:
        return Path(override).expanduser().resolve()
    return project_root() / "models"


def third_party_dir() -> Path:
    override = os.environ.get("GIF_STUDIO_THIRD_PARTY")
    if override:
        return Path(override).expanduser().resolve()
    return project_root() / "third_party"


def env_path(*names: str) -> Path | None:
    for name in names:
        raw = os.environ.get(name)
        if not raw:
            continue
        path = Path(raw).expanduser().resolve()
        if path.exists():
            return path
    return None


@lru_cache(maxsize=1)
def torch_device():
    import torch

    prefer = (os.environ.get("GIF_STUDIO_TORCH_DEVICE") or "").strip().lower()
    if prefer == "cpu":
        return torch.device("cpu")
    if prefer.startswith("cuda") and torch.cuda.is_available():
        return torch.device(prefer if ":" in prefer else "cuda")
    if prefer == "mps" and getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
        return torch.device("mps")
    if torch.cuda.is_available():
        return torch.device("cuda")
    if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
        return torch.device("mps")
    return torch.device("cpu")


def ensure_sys_path(path: Path | str) -> None:
    resolved = str(Path(path).resolve())
    if resolved not in sys.path:
        sys.path.insert(0, resolved)


def decode_bgr(payload: bytes):
    import cv2
    import numpy as np

    image = cv2.imdecode(np.frombuffer(payload, np.uint8), cv2.IMREAD_UNCHANGED)
    if image is None:
        raise ValueError("Could not decode image bytes")
    return image


def encode_png(image) -> bytes:
    import cv2

    ok, buf = cv2.imencode(".png", image)
    if not ok:
        raise RuntimeError("Could not encode PNG")
    return buf.tobytes()
