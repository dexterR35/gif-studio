"""Image Studio local model inventory with no remote access by default.

Weights live under ``models/``. Device: NVIDIA CUDA if present, else CPU/RAM
(``IMAGE_STUDIO_TORCH_DEVICE`` can force cpu|cuda|mps).
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from .paths import device_runtime_info, model_device_policy, models_dir


def device_info() -> dict[str, Any]:
    """NVIDIA → CPU/RAM fallback + per-engine policy."""
    info = device_runtime_info()
    info["engines"] = model_device_policy()
    return info


# --- SAM2 -----------------------------------------------------------------

SAM2_LARGE = {
    "id": "sam2.1_hiera_large",
    "label": "SAM 2.1 Large",
    "file": "sam2.1_hiera_large.pt",
    "config": "configs/sam2.1/sam2.1_hiera_l.yaml",
    "url": "https://dl.fbaipublicfiles.com/segment_anything_2/092824/sam2.1_hiera_large.pt",
}


def resolve_sam2() -> tuple[Path, str] | None:
    """Return the fixed SAM 2.1 Large local checkpoint and config."""
    spec = SAM2_LARGE
    path = models_dir() / "sam2" / spec["file"]
    if path.exists() and path.stat().st_size > 1024:
        return path, spec["config"]
    return None


# --- Grounding DINO -------------------------------------------------------

# Checkpoint table from IDEA-Research/GroundingDINO README
GROUNDING_DINO_LARGE = {
    "id": "swinb_cogcoor",
    "label": "Grounding DINO Large (Swin-B)",
    "file": "groundingdino_swinb_cogcoor.pth",
    "config": "GroundingDINO_SwinB_cfg.py",
    "url": (
        "https://github.com/IDEA-Research/GroundingDINO/releases/download/"
        "v0.1.0-alpha2/groundingdino_swinb_cogcoor.pth"
    ),
}


def resolve_grounding_dino() -> tuple[Path, Path] | None:
    """Return the fixed Swin-B config and checkpoint when both exist locally."""
    root = models_dir() / "groundingdino"
    spec = GROUNDING_DINO_LARGE
    ckpt = root / spec["file"]
    cfg = root / spec["config"]
    if ckpt.exists() and ckpt.stat().st_size > 1024 and cfg.exists():
        return cfg, ckpt
    return None


# --- Matte (fixed BiRefNet) -------------------------------------------------

BIREFNET = {
    "id": "birefnet",
    "label": "BiRefNet",
    "rembg": "birefnet-general",
    "file": "birefnet-general.onnx",
    "url": (
        "https://github.com/danielgatis/rembg/releases/download/"
        "v0.0.0/BiRefNet-general-epoch_244.onnx"
    ),
    "md5": "7a35a0141cbbc80de11d9c9a28f52697",
}


def list_matte_models() -> list[dict[str, Any]]:
    import importlib.util

    path = models_dir() / "matte" / BIREFNET["file"]
    ready = (
        importlib.util.find_spec("rembg") is not None
        and path.exists()
        and path.stat().st_size > 1024
    )
    return [{
        "id": BIREFNET["id"],
        "label": BIREFNET["label"],
        "rembg": BIREFNET["rembg"],
        "path": str(path),
        "ready": ready,
        "job": "matte",
    }]


def resolve_matte() -> dict[str, Any] | None:
    """Return the fixed local BiRefNet spec only when its weight is present."""
    path = models_dir() / "matte" / BIREFNET["file"]
    if path.exists() and path.stat().st_size > 1024:
        return {**BIREFNET, "path": str(path)}
    return None


# --- LaMa (erase / clean background) --------------------------------------

LAMA_VARIANTS = [
    {
        "id": "big-lama",
        "label": "LaMa big-lama (full Places erase)",
        "file": "big-lama.pt",
        "url": "https://github.com/Sanster/models/releases/download/add_big_lama/big-lama.pt",
        "md5": "e3aa4aaa15225a33ec84f9f4bc47e500",
        "note": "Full FFCResNetGenerator — not a small/lite checkpoint",
    },
]

_LAMA_MIN_BYTES = 1024 * 1024


def list_lama_models() -> list[dict[str, Any]]:
    import importlib.util

    torch_ok = importlib.util.find_spec("torch") is not None
    root = models_dir() / "lama"
    out = []
    for spec in LAMA_VARIANTS:
        path = root / spec["file"]
        ready = (
            torch_ok
            and path.exists()
            and path.stat().st_size > _LAMA_MIN_BYTES
        )
        out.append({
            "id": spec["id"],
            "label": spec["label"],
            "file": spec["file"],
            "path": str(path),
            "ready": ready,
            "job": "inpaint",
            "note": spec.get("note"),
            "md5": spec.get("md5"),
        })
    return out


def resolve_lama(model_id: str | None = None) -> Path | None:
    """Return path to a local LaMa torchscript checkpoint."""
    wanted = (model_id or os.environ.get("LAMA_MODEL") or "big-lama").strip()
    # Allow absolute / relative path override via LAMA_MODEL when it points at a file.
    env_path = os.environ.get("LAMA_MODEL", "").strip()
    if env_path and Path(env_path).expanduser().is_file():
        path = Path(env_path).expanduser().resolve()
        if path.stat().st_size > _LAMA_MIN_BYTES:
            return path
    root = models_dir() / "lama"
    by_id = {s["id"]: s for s in LAMA_VARIANTS}
    for spec in LAMA_VARIANTS:
        path = root / spec["file"]
        if wanted in {spec["id"], spec["file"], Path(spec["file"]).stem} and path.exists():
            return path
    if wanted in by_id:
        path = root / by_id[wanted]["file"]
        if path.exists():
            return path
    for spec in LAMA_VARIANTS:
        path = root / spec["file"]
        if path.exists() and path.stat().st_size > _LAMA_MIN_BYTES:
            return path
    return None


# --- Upscale (fixed Real-ESRGAN ×2 and ×4) --------------------------------

UPSCALE_VARIANTS = [
    {
        "id": "realesrgan-x2",
        "label": "Real-ESRGAN ×2",
        "scale": 2,
        "file": "RealESRGAN_x2plus.pth",
    },
    {
        "id": "realesrgan-x4",
        "label": "Real-ESRGAN ×4",
        "scale": 4,
        "file": "RealESRGAN_x4plus.pth",
    },
]


def list_upscale_models() -> list[dict[str, Any]]:
    root = models_dir() / "realesrgan"
    out = []
    for spec in UPSCALE_VARIANTS:
        path = root / spec["file"]
        out.append({
            **spec,
            "path": str(path),
            "ready": path.exists() and path.stat().st_size > 1024,
            "job": "upscale",
        })
    return out


def catalog() -> dict[str, Any]:
    return {
        "device": device_info(),
        "matte": list_matte_models(),
        "lama": list_lama_models(),
        "upscale": list_upscale_models(),
        "models_dir": str(models_dir()),
        "jobs": {
            "select_detect": ["grounding_dino", "sam2"],
            "matte": ["matte"],
            "inpaint": ["lama"],
            "upscale": ["upscale"],
        },
    }
