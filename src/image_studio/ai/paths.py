"""Shared path and device helpers for optional Image Studio AI engines."""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
from functools import lru_cache
from pathlib import Path
from typing import Any


def project_root() -> Path:
    # src/image_studio/ai/paths.py → repo root
    return Path(__file__).resolve().parents[3]


def models_dir() -> Path:
    override = os.environ.get("IMAGE_STUDIO_MODELS_DIR")
    if override:
        return Path(override).expanduser().resolve()
    return project_root() / "models"


def third_party_dir() -> Path:
    override = os.environ.get("IMAGE_STUDIO_THIRD_PARTY")
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
        # A broken or CPU-only torch install must not hide physical NVIDIA
        # hardware from setup/health diagnostics.
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
def cuda_usable() -> bool:
    """True only when PyTorch can execute a real CUDA kernel on this GPU."""
    try:
        import torch

        if not torch.cuda.is_available() or torch.cuda.device_count() < 1:
            return False
        probe = torch.ones(1, device="cuda")
        return float(probe.item()) == 1.0
    except Exception:  # noqa: BLE001
        return False


@lru_cache(maxsize=1)
def torch_device():
    """Pick compute device: NVIDIA CUDA if present, else CPU (RAM).

    Override with ``IMAGE_STUDIO_TORCH_DEVICE=cpu|cuda|cuda:0|mps``.
    Default policy skips MPS — NVIDIA → CPU only unless explicitly requested.
    """
    try:
        import torch
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(
            "PyTorch is not usable in this environment: " + str(exc)
        ) from exc

    prefer = (os.environ.get("IMAGE_STUDIO_TORCH_DEVICE") or "").strip().lower()
    if prefer == "cpu":
        return torch.device("cpu")
    if prefer.startswith("cuda"):
        if cuda_usable():
            return torch.device(prefer if ":" in prefer else "cuda")
        raise RuntimeError(
            "IMAGE_STUDIO_TORCH_DEVICE requests CUDA but no compatible CUDA GPU is usable. "
            "Unset the env var to fall back to CPU, or install CUDA torch."
        )
    if prefer == "mps":
        if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
            return torch.device("mps")
        raise RuntimeError("IMAGE_STUDIO_TORCH_DEVICE=mps but MPS is not available.")

    # Auto: CUDA first, then CPU (system RAM). Every torch-backed model uses
    # this selector, so the policy stays consistent across all runners.
    if cuda_usable():
        return torch.device("cuda")
    return torch.device("cpu")


def onnx_providers() -> list[str]:
    """Return ONNX providers in CUDA-first, CPU-fallback order.

    ``CPUExecutionProvider`` is always included so ONNX Runtime can fall back
    for unsupported operators or when no CUDA provider is installed.
    """
    prefer = (os.environ.get("IMAGE_STUDIO_TORCH_DEVICE") or "").strip().lower()
    if prefer == "cpu":
        return ["CPUExecutionProvider"]

    try:
        import onnxruntime as ort

        available = set(ort.get_available_providers())
    except Exception:  # noqa: BLE001
        return ["CPUExecutionProvider"]

    if "CUDAExecutionProvider" in available and nvidia_present():
        return ["CUDAExecutionProvider", "CPUExecutionProvider"]
    return ["CPUExecutionProvider"]


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
    except Exception:  # noqa: BLE001
        info: dict[str, Any] = {
            "device": "cpu",
            "nvidia": False,
            "cuda": False,
            "cpu": True,
            "fallback": "cpu",
            "policy": "nvidia→cpu (override IMAGE_STUDIO_TORCH_DEVICE)",
            "torch": False,
            "note": "PyTorch is not usable in this environment — heavy AI engines are unavailable.",
        }
        if mem is not None:
            info["ram_bytes"] = mem
            info["ram_gib"] = round(mem / (1024 ** 3), 2)
        return info

    try:
        device = torch_device()
    except Exception as exc:  # noqa: BLE001
        info = {
            "device": "cpu",
            "nvidia": False,
            "cuda": False,
            "cpu": True,
            "fallback": "cpu",
            "policy": "nvidia→cpu (override IMAGE_STUDIO_TORCH_DEVICE)",
            "torch": False,
            "note": f"PyTorch import failed: {exc}",
        }
        if mem is not None:
            info["ram_bytes"] = mem
            info["ram_gib"] = round(mem / (1024 ** 3), 2)
        return info
    providers = onnx_providers()
    info: dict[str, Any] = {
        "device": str(device),
        "nvidia": nvidia_present(),
        "cuda": cuda_usable(),
        "cuda_detected": bool(torch.cuda.is_available()),
        "cpu": True,
        "fallback": "cpu" if device.type == "cpu" else None,
        "policy": "nvidia→cpu (override IMAGE_STUDIO_TORCH_DEVICE)",
        "torch": True,
        "onnx_device": "cuda" if providers[0] == "CUDAExecutionProvider" else "cpu",
        "onnx_providers": providers,
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
        info["note"] = (
            "CUDA was detected but cannot execute on this GPU/PyTorch build; "
            "using CPU / system RAM."
            if torch.cuda.is_available()
            else (
                "NVIDIA GPU detected, but CUDA PyTorch is unavailable; "
                "using CPU / system RAM."
                if nvidia_present()
                else "No NVIDIA CUDA — running on CPU / system RAM (slower)."
            )
        )
    return info


# Models that refuse to run without NVIDIA. Everything else is CPU/RAM-ok (slow).
# Keep empty unless a runner truly cannot execute on CPU.
NVIDIA_REQUIRED_ENGINES: frozenset[str] = frozenset()


def model_device_policy() -> dict[str, dict[str, Any]]:
    """Per-engine: prefers NVIDIA, can use CPU/RAM, or hard-requires NVIDIA."""
    nvidia = nvidia_present()
    try:
        import torch  # noqa: F401
    except Exception as exc:  # noqa: BLE001 — ImportError, OSError (Win DLL), etc.
        device = f"cpu (torch unavailable: {exc})"
    else:
        try:
            device = str(torch_device())
        except RuntimeError as exc:
            device = f"error:{exc}"

    def row(
        *,
        prefers: str,
        cpu_ok: bool,
        requires_nvidia: bool = False,
        note: str = "",
        active_device: str | None = None,
    ) -> dict[str, Any]:
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
            "unavailable_reason": reason,
            "active_device": (active_device or device) if available else None,
            "note": note or (
                "CUDA when NVIDIA present, else CPU/RAM"
                if cpu_ok
                else "NVIDIA only"
            ),
        }

    providers = onnx_providers()
    onnx_device = "cuda" if providers[0] == "CUDAExecutionProvider" else "cpu"
    return {
        "opencv": row(prefers="cpu", cpu_ok=True, note="Always CPU"),
        "matte_rembg": row(
            prefers="cuda",
            cpu_ok=True,
            active_device=onnx_device,
            note="ONNX CUDA when available, else CPU",
        ),
        "grounding_dino": row(prefers="cuda", cpu_ok=True),
        "sam2": row(prefers="cuda", cpu_ok=True),
        "realesrgan": row(prefers="cuda", cpu_ok=True, note="Tiled; 5k / 20 GiB server caps"),
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
