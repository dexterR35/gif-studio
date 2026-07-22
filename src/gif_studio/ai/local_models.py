"""Local-on-disk model inventory — no Hugging Face at runtime by default.

Weights live under ``models/``. Device: NVIDIA CUDA if present, else CPU/RAM
(``GIF_STUDIO_TORCH_DEVICE`` can force cpu|cuda|mps).
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from .paths import device_runtime_info, model_device_policy, models_dir, torch_device


def allow_huggingface() -> bool:
    """Opt-in only. Default is local files — never pull from the Hub at runtime."""
    return os.environ.get("GIF_STUDIO_ALLOW_HF", "").strip().lower() in {"1", "true", "yes"}


def device_info() -> dict[str, Any]:
    """NVIDIA → CPU/RAM fallback + per-engine policy."""
    info = device_runtime_info()
    info["engines"] = model_device_policy()
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


# --- SAM3 -----------------------------------------------------------------

SAM3_VARIANTS = [
    {
        "id": "sam3",
        "label": "SAM 3 (concept / text)",
        "file": "sam3.pt",
        "alt_files": ("sam3.pt",),
        "hf_repo": "facebook/sam3",
        "hf_filename": "sam3.pt",
    },
    {
        "id": "sam3.1",
        "label": "SAM 3.1 (faster video)",
        "file": "sam3.1.pt",
        "alt_files": ("sam3.1.pt", "sam3.1_multiplex.pt"),
        "hf_repo": "facebook/sam3.1",
        "hf_filename": "sam3.1_multiplex.pt",
    },
]


def _sam3_checkpoint_ready(root: Path, spec: dict[str, Any]) -> Path | None:
    """Return path to a usable local SAM3 checkpoint, or None."""
    for name in (spec["file"], *spec.get("alt_files", ())):
        path = root / name
        if path.exists() and path.stat().st_size > 1024 * 1024:  # >1MB
            return path
    snap = root / spec["id"]
    if snap.is_dir():
        for path in sorted(snap.glob("*.pt")):
            if path.stat().st_size > 1024 * 1024:
                return path
        if (snap / "config.json").exists():
            return snap
    return None


def list_sam3_models() -> list[dict[str, Any]]:
    root = models_dir() / "sam3"
    out = []
    for spec in SAM3_VARIANTS:
        found = _sam3_checkpoint_ready(root, spec)
        out.append({
            "id": spec["id"],
            "label": spec["label"] if found else f"{spec['label']} (needs HF access)",
            "file": spec["file"],
            "path": str(found or (root / spec["file"])),
            "ready": found is not None,
            "job": "select_detect",
            "note": None if found else (
                "Request access at huggingface.co/facebook/sam3 then: "
                "python scripts/setup_ai_models.py --with-sam3"
            ),
        })
    return out


def resolve_sam3(model_id: str | None = None) -> Path | None:
    wanted = (model_id or os.environ.get("SAM3_MODEL") or "sam3").strip()
    root = models_dir() / "sam3"
    env = os.environ.get("SAM3_CHECKPOINT") or os.environ.get("GIF_STUDIO_SAM3")
    if env:
        p = Path(env).expanduser()
        if p.exists():
            return p
    for spec in SAM3_VARIANTS:
        if wanted in {spec["id"], spec["file"], Path(spec["file"]).stem, *spec.get("alt_files", ())}:
            found = _sam3_checkpoint_ready(root, spec)
            if found is not None:
                return found
    for spec in SAM3_VARIANTS:
        found = _sam3_checkpoint_ready(root, spec)
        if found is not None:
            return found
    # Any large .pt dropped into models/sam3/
    if root.is_dir():
        for path in sorted(root.glob("*.pt")):
            if path.stat().st_size > 1024 * 1024:
                return path
    return None


# --- Matte (BiRefNet / RMBG / rembg) ---------------------------------------

MATTE_VARIANTS = [
    {
        "id": "birefnet",
        "label": "BiRefNet (soft edges)",
        "rembg": "birefnet-general",
        "file": "birefnet-general.onnx",
    },
    {
        "id": "rmbg-2.0",
        "label": "RMBG-2.0",
        "rembg": "bria-rmbg",
        "file": "rmbg-2.0.onnx",
        "hf_dir": "rmbg-2.0",
    },
    {
        "id": "rembg-isnet",
        "label": "rembg isnet-general-use",
        "rembg": "isnet-general-use",
        "file": None,
    },
]


def list_matte_models() -> list[dict[str, Any]]:
    import importlib.util

    rembg_ok = importlib.util.find_spec("rembg") is not None
    root = models_dir() / "matte"
    out = []
    for spec in MATTE_VARIANTS:
        path = root / spec["file"] if spec.get("file") else None
        hf = root / spec["hf_dir"] if spec.get("hf_dir") else None
        file_ready = bool(path and path.exists() and path.stat().st_size > 1024)
        hf_ready = bool(hf and (hf / "config.json").exists())
        # rembg can download/cache its own weights — mark ready if package present
        ready = rembg_ok and (spec["id"] == "rembg-isnet" or file_ready or hf_ready or rembg_ok)
        if spec["id"] in {"birefnet", "rmbg-2.0"} and not (file_ready or hf_ready):
            # Still usable via rembg session name when package installed
            ready = rembg_ok
        out.append({
            "id": spec["id"],
            "label": spec["label"],
            "rembg": spec.get("rembg"),
            "path": str(path) if path else None,
            "ready": ready,
            "job": "matte",
        })
    return out


def resolve_matte(model_id: str | None = None) -> dict[str, Any] | None:
    wanted = (model_id or os.environ.get("MATTE_MODEL") or "rembg-isnet").strip().lower()
    aliases = {
        "isnet": "rembg-isnet",
        "isnet-general-use": "rembg-isnet",
        "rmbg": "rmbg-2.0",
        "bria-rmbg": "rmbg-2.0",
        "birefnet-general": "birefnet",
    }
    wanted = aliases.get(wanted, wanted)
    for spec in MATTE_VARIANTS:
        if wanted == spec["id"]:
            return spec
    return MATTE_VARIANTS[-1]


# --- Upscale (+ GFPGAN slot) ----------------------------------------------

UPSCALE_VARIANTS = [
    {
        "id": "esrgan",
        "label": "ESRGAN",
        "file": "ESRGAN_SRx4_DF2KOST_official-ff704c30.pth",
    },
    {"id": "realesrgan", "label": "Real-ESRGAN", "file": "RealESRGAN_x4plus.pth"},
    {"id": "realesrgan-x2", "label": "Real-ESRGAN x2", "file": "RealESRGAN_x2plus.pth"},
    {"id": "a-esrgan", "label": "A-ESRGAN (anime)", "file": "RealESRGAN_x4plus_anime_6B.pth"},
    {"id": "gfpgan", "label": "GFPGAN (face polish slot)", "file": "GFPGANv1.4.pth", "dir": "gfpgan"},
]


def list_upscale_models() -> list[dict[str, Any]]:
    root = models_dir() / "realesrgan"
    out = []
    for spec in UPSCALE_VARIANTS:
        base = models_dir() / spec["dir"] if spec.get("dir") else root
        path = base / spec["file"]
        out.append({
            **spec,
            "path": str(path),
            "ready": path.exists() and path.stat().st_size > 1024,
            "job": "upscale",
        })
    return out


def list_select_detect_engines() -> list[dict[str, Any]]:
    """Text/class find engines — roles, not a stack."""
    sam3_ready = any(m.get("ready") for m in list_sam3_models())
    return [
        {
            "id": "sam3",
            "label": "SAM 3 (text → mask)",
            "ready": sam3_ready,
            "job": "select_detect",
            "note": "Replaces Grounding DINO + SAM2 refine when ready",
        },
        {
            "id": "grounding_dino",
            "label": "Grounding DINO + SAM2 refine",
            "ready": any(m.get("ready") for m in list_grounding_dino_models()),
            "job": "select_detect",
            "note": "Open-vocab box, then SAM2 contour",
        },
    ]


def catalog() -> dict[str, Any]:
    return {
        "device": device_info(),
        "allow_huggingface": allow_huggingface(),
        "sam2": list_sam2_models(),
        "sam3": list_sam3_models(),
        "select_detect": list_select_detect_engines(),
        "grounding_dino": list_grounding_dino_models(),
        "matte": list_matte_models(),
        "upscale": list_upscale_models(),
        "models_dir": str(models_dir()),
        "jobs": {
            "select_detect": ["sam3", "grounding_dino"],
            "matte": ["matte"],
            "upscale": ["upscale"],
        },
    }
