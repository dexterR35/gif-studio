"""Local-on-disk model inventory — no Hugging Face at runtime by default.

Weights live under ``models/``. Device is auto-selected (CUDA → MPS → CPU)
unless ``GIF_STUDIO_TORCH_DEVICE`` is set.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from .paths import models_dir, torch_device


def allow_huggingface() -> bool:
    """Opt-in only. Default is local files — never pull from the Hub at runtime."""
    return os.environ.get("GIF_STUDIO_ALLOW_HF", "").strip().lower() in {"1", "true", "yes"}


def device_info() -> dict[str, Any]:
    import torch

    device = torch_device()
    info: dict[str, Any] = {
        "device": str(device),
        "cuda": bool(torch.cuda.is_available()),
        "mps": bool(getattr(torch.backends, "mps", None) and torch.backends.mps.is_available()),
        "cpu": True,
    }
    if device.type == "cuda" and torch.cuda.is_available():
        try:
            info["gpu_name"] = torch.cuda.get_device_name(0)
            info["gpu_count"] = torch.cuda.device_count()
        except Exception:  # noqa: BLE001
            pass
    return info


# --- SAM2 -----------------------------------------------------------------

SAM2_VARIANTS = [
    {
        "id": "sam2.1_hiera_tiny",
        "label": "SAM2.1 Tiny",
        "file": "sam2.1_hiera_tiny.pt",
        "config": "configs/sam2.1/sam2.1_hiera_t.yaml",
        "url": "https://dl.fbaipublicfiles.com/segment_anything_2/092824/sam2.1_hiera_tiny.pt",
    },
    {
        "id": "sam2.1_hiera_small",
        "label": "SAM2.1 Small",
        "file": "sam2.1_hiera_small.pt",
        "config": "configs/sam2.1/sam2.1_hiera_s.yaml",
        "url": "https://dl.fbaipublicfiles.com/segment_anything_2/092824/sam2.1_hiera_small.pt",
    },
    {
        "id": "sam2.1_hiera_base_plus",
        "label": "SAM2.1 Base+",
        "file": "sam2.1_hiera_base_plus.pt",
        "config": "configs/sam2.1/sam2.1_hiera_b+.yaml",
        "url": "https://dl.fbaipublicfiles.com/segment_anything_2/092824/sam2.1_hiera_base_plus.pt",
    },
    {
        "id": "sam2.1_hiera_large",
        "label": "SAM2.1 Large",
        "file": "sam2.1_hiera_large.pt",
        "config": "configs/sam2.1/sam2.1_hiera_l.yaml",
        "url": "https://dl.fbaipublicfiles.com/segment_anything_2/092824/sam2.1_hiera_large.pt",
    },
]


def list_sam2_models() -> list[dict[str, Any]]:
    root = models_dir() / "sam2"
    out = []
    for spec in SAM2_VARIANTS:
        path = root / spec["file"]
        out.append({
            "id": spec["id"],
            "label": spec["label"],
            "file": spec["file"],
            "config": spec["config"],
            "path": str(path),
            "ready": path.exists() and path.stat().st_size > 1024,
        })
    return out


def resolve_sam2(model_id: str | None = None) -> tuple[Path, str] | None:
    """Return (checkpoint_path, config_yaml) for a local SAM2 weight."""
    wanted = (model_id or os.environ.get("SAM2_MODEL") or "sam2.1_hiera_tiny").strip()
    by_id = {s["id"]: s for s in SAM2_VARIANTS}
    # Also match by filename stem
    for spec in SAM2_VARIANTS:
        path = models_dir() / "sam2" / spec["file"]
        if wanted in {spec["id"], spec["file"], Path(spec["file"]).stem} and path.exists():
            return path, spec["config"]
    if wanted in by_id:
        path = models_dir() / "sam2" / by_id[wanted]["file"]
        if path.exists():
            return path, by_id[wanted]["config"]
    # First available on disk
    for spec in SAM2_VARIANTS:
        path = models_dir() / "sam2" / spec["file"]
        if path.exists() and path.stat().st_size > 1024:
            return path, spec["config"]
    return None


# --- Grounding DINO -------------------------------------------------------

# Checkpoint table from IDEA-Research/GroundingDINO README
GROUNDING_DINO_VARIANTS = [
    {
        "id": "swint_ogc",
        "label": "GroundingDINO-T (Swin-T)",
        "hf_dir": "hf-tiny",
        "hf_repo": "IDEA-Research/grounding-dino-tiny",
        "file": "groundingdino_swint_ogc.pth",
        "config": "GroundingDINO_SwinT_OGC.py",
        "url": (
            "https://github.com/IDEA-Research/GroundingDINO/releases/download/"
            "v0.1.0-alpha/groundingdino_swint_ogc.pth"
        ),
    },
    {
        "id": "swinb_cogcoor",
        "label": "GroundingDINO-B (Swin-B)",
        "hf_dir": "hf-base",
        "hf_repo": "IDEA-Research/grounding-dino-base",
        "file": "groundingdino_swinb_cogcoor.pth",
        "config": "GroundingDINO_SwinB_cfg.py",
        "url": (
            "https://github.com/IDEA-Research/GroundingDINO/releases/download/"
            "v0.1.0-alpha2/groundingdino_swinb_cogcoor.pth"
        ),
    },
]


def list_grounding_dino_models() -> list[dict[str, Any]]:
    root = models_dir() / "groundingdino"
    out = []
    for spec in GROUNDING_DINO_VARIANTS:
        hf = root / spec["hf_dir"]
        ckpt = root / spec["file"]
        cfg = root / spec["config"]
        hf_ready = (hf / "config.json").exists()
        pth_ready = ckpt.exists() and ckpt.stat().st_size > 1024 and cfg.exists()
        out.append({
            "id": spec["id"],
            "label": spec["label"],
            "file": spec["file"],
            "config": spec["config"],
            "hf_dir": str(hf),
            "path": str(ckpt),
            "config_path": str(cfg),
            "ready": hf_ready or pth_ready,
        })
    return out


def resolve_grounding_dino(model_id: str | None = None) -> tuple[Path, Path] | None:
    """Return (config_path, checkpoint_path) for local Grounding DINO."""
    wanted = (model_id or os.environ.get("GROUNDING_DINO_MODEL") or "swint_ogc").strip()
    root = models_dir() / "groundingdino"
    for spec in GROUNDING_DINO_VARIANTS:
        if wanted not in {spec["id"], spec["file"], Path(spec["file"]).stem}:
            continue
        ckpt = root / spec["file"]
        cfg = root / spec["config"]
        if ckpt.exists() and cfg.exists():
            return cfg, ckpt
    for spec in GROUNDING_DINO_VARIANTS:
        ckpt = root / spec["file"]
        cfg = root / spec["config"]
        if ckpt.exists() and cfg.exists():
            return cfg, ckpt
    return None


# --- YOLO (Ultralytics) ---------------------------------------------------

# Official weights: https://github.com/ultralytics/ultralytics
YOLO_VARIANTS = [
    {
        "id": "yolov8n",
        "label": "YOLOv8n (nano)",
        "file": "yolov8n.pt",
        "url": "https://github.com/ultralytics/assets/releases/download/v8.3.0/yolov8n.pt",
    },
    {
        "id": "yolov8s",
        "label": "YOLOv8s (small)",
        "file": "yolov8s.pt",
        "url": "https://github.com/ultralytics/assets/releases/download/v8.3.0/yolov8s.pt",
    },
    {
        "id": "yolov8m",
        "label": "YOLOv8m (medium)",
        "file": "yolov8m.pt",
        "url": "https://github.com/ultralytics/assets/releases/download/v8.3.0/yolov8m.pt",
    },
    {
        "id": "yolo11n",
        "label": "YOLO11n (nano)",
        "file": "yolo11n.pt",
        "url": "https://github.com/ultralytics/assets/releases/download/v8.3.0/yolo11n.pt",
    },
]


def list_yolo_models() -> list[dict[str, Any]]:
    root = models_dir() / "yolo"
    out = []
    for spec in YOLO_VARIANTS:
        path = root / spec["file"]
        out.append({
            "id": spec["id"],
            "label": spec["label"],
            "file": spec["file"],
            "path": str(path),
            "ready": path.exists() and path.stat().st_size > 1024,
        })
    return out


def resolve_yolo(model_id: str | None = None) -> tuple[Path, str] | None:
    """Return (checkpoint_path, engine_label) for a local Ultralytics .pt."""
    wanted = (model_id or "").strip()
    if not wanted:
        env = (
            os.environ.get("YOLO_MODEL")
            or os.environ.get("GIF_STUDIO_YOLO")
            or os.environ.get("YOLO_MODEL_ID")
            or "yolov8n"
        )
        path = Path(env).expanduser()
        if path.is_file():
            return path, f"yolo-local:{path.stem}"
        wanted = env.strip()
    root = models_dir() / "yolo"
    by_id = {s["id"]: s for s in YOLO_VARIANTS}
    for spec in YOLO_VARIANTS:
        path = root / spec["file"]
        if wanted in {spec["id"], spec["file"], Path(spec["file"]).stem} and path.exists():
            return path, f"yolo-local:{path.stem}"
    if wanted in by_id:
        path = root / by_id[wanted]["file"]
        if path.exists():
            return path, f"yolo-local:{path.stem}"
    for spec in YOLO_VARIANTS:
        path = root / spec["file"]
        if path.exists() and path.stat().st_size > 1024:
            return path, f"yolo-local:{path.stem}"
    # Any .pt dropped into models/yolo/
    if root.is_dir():
        for path in sorted(root.glob("*.pt")):
            if path.stat().st_size > 1024:
                return path, f"yolo-local:{path.stem}"
    return None


# --- Upscale --------------------------------------------------------------

UPSCALE_VARIANTS = [
    {"id": "bicubic", "label": "Bicubic", "file": None},
    {
        "id": "esrgan",
        "label": "ESRGAN",
        "file": "ESRGAN_SRx4_DF2KOST_official-ff704c30.pth",
    },
    {"id": "realesrgan", "label": "Real-ESRGAN", "file": "RealESRGAN_x4plus.pth"},
    {"id": "realesrgan-x2", "label": "Real-ESRGAN x2", "file": "RealESRGAN_x2plus.pth"},
    {"id": "a-esrgan", "label": "A-ESRGAN (anime)", "file": "RealESRGAN_x4plus_anime_6B.pth"},
]


def list_upscale_models() -> list[dict[str, Any]]:
    root = models_dir() / "realesrgan"
    out = []
    for spec in UPSCALE_VARIANTS:
        if spec["id"] == "bicubic":
            out.append({**spec, "ready": True, "path": None})
            continue
        path = root / spec["file"]
        out.append({
            **spec,
            "path": str(path),
            "ready": path.exists() and path.stat().st_size > 1024,
        })
    return out


def catalog() -> dict[str, Any]:
    return {
        "device": device_info(),
        "allow_huggingface": allow_huggingface(),
        "sam2": list_sam2_models(),
        "grounding_dino": list_grounding_dino_models(),
        "yolo": list_yolo_models(),
        "upscale": list_upscale_models(),
        "models_dir": str(models_dir()),
    }
