"""Shared torch / path helpers for optional heavy AI engines."""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
from functools import lru_cache
from pathlib import Path
from typing import Any


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


def nvidia_present() -> bool:
    """True when an NVIDIA GPU is usable via CUDA (or nvidia-smi is visible)."""
    try:
        import torch

        if torch.cuda.is_available() and torch.cuda.device_count() > 0:
            return True
    except Exception:  # noqa: BLE001
        pass
    smi = shutil.which("nvidia-smi")
    if not smi:
        return False
    try:
        proc = subprocess.run(
            [smi, "-L"],
            capture_output=True,
            text=True,
            timeout=3,
            check=False,
        )
        return proc.returncode == 0 and "GPU" in (proc.stdout or "")
    except Exception:  # noqa: BLE001
        return False


@lru_cache(maxsize=1)
def torch_device():
    """Pick compute device: NVIDIA CUDA if present, else CPU (RAM).

    Override with ``GIF_STUDIO_TORCH_DEVICE=cpu|cuda|cuda:0|mps``.
    Default policy skips MPS — NVIDIA → CPU only unless explicitly requested.
    """
    try:
        import torch
    except ImportError as exc:
        raise RuntimeError(
            "PyTorch is not installed. pip install -r requirements-ai.txt"
        ) from exc

    prefer = (os.environ.get("GIF_STUDIO_TORCH_DEVICE") or "").strip().lower()
    if prefer == "cpu":
        return torch.device("cpu")
    if prefer.startswith("cuda"):
        if torch.cuda.is_available():
            return torch.device(prefer if ":" in prefer else "cuda")
        raise RuntimeError(
            "GIF_STUDIO_TORCH_DEVICE requests CUDA but no NVIDIA GPU / CUDA is available. "
            "Unset the env var to fall back to CPU, or install CUDA torch."
        )
    if prefer == "mps":
        if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
            return torch.device("mps")
        raise RuntimeError("GIF_STUDIO_TORCH_DEVICE=mps but MPS is not available.")

    # Auto: NVIDIA first, then CPU (system RAM). No silent MPS.
    if torch.cuda.is_available() and nvidia_present():
        return torch.device("cuda")
    if torch.cuda.is_available():
        return torch.device("cuda")
    return torch.device("cpu")


def host_memory_bytes() -> int | None:
    """Best-effort total system RAM in bytes."""
    try:
        page = os.sysconf("SC_PAGE_SIZE")
        pages = os.sysconf("SC_PHYS_PAGES")
        if page > 0 and pages > 0:
            return int(page * pages)
    except (AttributeError, OSError, ValueError):
        pass
    try:
        import psutil  # type: ignore

        return int(psutil.virtual_memory().total)
    except Exception:  # noqa: BLE001
        return None


def device_runtime_info() -> dict[str, Any]:
    """Honest device report for /api/health — NVIDIA vs CPU/RAM fallback."""
    mem = host_memory_bytes()
    try:
        import torch
    except ImportError:
        info: dict[str, Any] = {
            "device": "cpu",
            "nvidia": nvidia_present(),
            "cuda": False,
            "cpu": True,
            "fallback": "cpu",
            "policy": "nvidia→cpu (override GIF_STUDIO_TORCH_DEVICE)",
            "torch": False,
            "note": "PyTorch not installed — heavy AI engines unavailable (pip install -r requirements-ai.txt).",
        }
        if mem is not None:
            info["ram_bytes"] = mem
            info["ram_gib"] = round(mem / (1024 ** 3), 2)
        return info

    device = torch_device()
    info: dict[str, Any] = {
        "device": str(device),
        "nvidia": nvidia_present(),
        "cuda": bool(torch.cuda.is_available()),
        "cpu": True,
        "fallback": "cpu" if device.type == "cpu" else None,
        "policy": "nvidia→cpu (override GIF_STUDIO_TORCH_DEVICE)",
        "torch": True,
    }
    if mem is not None:
        info["ram_bytes"] = mem
        info["ram_gib"] = round(mem / (1024 ** 3), 2)
    if device.type == "cuda" and torch.cuda.is_available():
        try:
            info["gpu_name"] = torch.cuda.get_device_name(0)
            info["gpu_count"] = torch.cuda.device_count()
            props = torch.cuda.get_device_properties(0)
            info["vram_bytes"] = int(props.total_memory)
            info["vram_gib"] = round(props.total_memory / (1024 ** 3), 2)
        except Exception:  # noqa: BLE001
            pass
    elif device.type == "cpu":
        info["note"] = "No NVIDIA CUDA — running on CPU / system RAM (slower)."
    return info


# Models that refuse to run without NVIDIA. Everything else is CPU/RAM-ok (slow).
# Keep empty unless a runner truly cannot execute on CPU.
NVIDIA_REQUIRED_ENGINES: frozenset[str] = frozenset()


def model_device_policy() -> dict[str, dict[str, Any]]:
    """Per-engine: prefers NVIDIA, can use CPU/RAM, or hard-requires NVIDIA."""
    nvidia = nvidia_present()
    try:
        import torch  # noqa: F401
    except ImportError:
        device = "cpu (torch not installed)"
    else:
        try:
            device = str(torch_device())
        except RuntimeError as exc:
            device = f"error:{exc}"

    def row(*, prefers: str, cpu_ok: bool, requires_nvidia: bool = False, note: str = "") -> dict[str, Any]:
        available = True
        reason = None
        if requires_nvidia and not nvidia:
            available = False
            reason = "needs NVIDIA GPU (no CPU/RAM path)"
        return {
            "prefers": prefers,
            "cpu_ok": cpu_ok,
            "requires_nvidia": requires_nvidia,
            "available_on_this_host": available,
            "active_device": device if available else None,
            "note": note or (
                "CUDA when NVIDIA present, else CPU/RAM"
                if cpu_ok
                else "NVIDIA only"
            ),
        }

    return {
        "opencv": row(prefers="cpu", cpu_ok=True, note="Always CPU"),
        "bicubic": row(prefers="cpu", cpu_ok=True, note="Always CPU"),
        "matte_rembg": row(prefers="cpu", cpu_ok=True, note="ONNX / CPU ok"),
        "yolo": row(prefers="cuda", cpu_ok=True),
        "grounding_dino": row(prefers="cuda", cpu_ok=True),
        "sam2": row(prefers="cuda", cpu_ok=True),
        "sam3": row(prefers="cuda", cpu_ok=True, note="Heavy on CPU/RAM; gated weights"),
        "depth": row(prefers="cuda", cpu_ok=True),
        "realesrgan": row(prefers="cuda", cpu_ok=True, note="Tiled; 5k / 20 GiB server caps"),
        "rife": row(prefers="cuda", cpu_ok=True),
        "lama": row(prefers="cuda", cpu_ok=True, note="OpenCV Telea fallback is CPU"),
    }


def ensure_engine_device(engine: str) -> None:
    """Raise if ``engine`` requires NVIDIA and none is present."""
    key = (engine or "").strip().lower()
    if key in NVIDIA_REQUIRED_ENGINES and not nvidia_present():
        raise RuntimeError(
            f"{engine} requires an NVIDIA GPU and has no CPU/RAM fallback on this host."
        )


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
