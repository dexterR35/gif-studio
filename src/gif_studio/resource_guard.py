"""Host RAM / VRAM probes, model unload, and post-inference cleanup.

Used by the AI job queue so heavy work (upscale, detect, export, …) only
starts when enough free memory is available, then releases caches afterward.
"""

from __future__ import annotations

import gc
import os
from collections.abc import Callable
from typing import Any


_GIB = 1024**3

# Conservative free-RAM floor required before starting a route (bytes).
_ROUTE_RESERVE_GIB: dict[str, float] = {
    "smart_segment": 0.75,
    "segment": 1.0,
    "detect": 1.25,
    "matte": 0.75,
    "depth": 1.0,
    "inpaint": 1.0,
    "upscale": 2.0,
    "interpolate": 2.5,
    "export": 1.5,
}

_unload_hooks: list[Callable[[], None]] = []


def _env_bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _env_float(name: str, default: float) -> float:
    raw = os.environ.get(name)
    if raw is None or not str(raw).strip():
        return default
    try:
        return float(raw)
    except ValueError:
        return default


def min_free_ram_bytes() -> int:
    """Global floor — never start heavy work below this much free RAM."""
    # Default 3 GiB so the API refuses work before the machine starts thrashing.
    return max(256 * 1024 * 1024, int(_env_float("GIF_STUDIO_MIN_FREE_RAM_GIB", 3.0) * _GIB))


def route_reserve_bytes(route: str) -> int:
    env_key = f"GIF_STUDIO_RAM_RESERVE_{route.upper()}_GIB"
    if os.environ.get(env_key):
        return max(0, int(_env_float(env_key, 0.0) * _GIB))
    gib = _ROUTE_RESERVE_GIB.get(route, 0.5)
    return int(gib * _GIB)


def unload_models_enabled() -> bool:
    """When true (default), drop cached AI weights after each job."""
    return _env_bool("GIF_STUDIO_UNLOAD_MODELS", True)


def register_unload_hook(fn: Callable[[], None]) -> None:
    """Allow web_api / other modules to clear non-lru sessions (e.g. rembg)."""
    if fn not in _unload_hooks:
        _unload_hooks.append(fn)


def available_ram_bytes() -> int | None:
    """Best-effort currently free/available system RAM."""
    try:
        import psutil  # type: ignore

        return int(psutil.virtual_memory().available)
    except Exception:  # noqa: BLE001
        pass
    return _meminfo_available()


def _meminfo_available() -> int | None:
    try:
        with open("/proc/meminfo", encoding="utf-8") as fh:
            for line in fh:
                if line.startswith("MemAvailable:"):
                    parts = line.split()
                    return int(parts[1]) * 1024
    except OSError:
        return None
    return None


def available_vram_bytes() -> int | None:
    try:
        import torch

        if not torch.cuda.is_available():
            return None
        free, _total = torch.cuda.mem_get_info(0)
        return int(free)
    except Exception:  # noqa: BLE001
        return None


def memory_snapshot() -> dict[str, Any]:
    ram = available_ram_bytes()
    vram = available_vram_bytes()
    out: dict[str, Any] = {
        "min_free_ram_bytes": min_free_ram_bytes(),
        "min_free_ram_gib": round(min_free_ram_bytes() / _GIB, 2),
        "unload_models": unload_models_enabled(),
    }
    if ram is not None:
        out["available_ram_bytes"] = ram
        out["available_ram_gib"] = round(ram / _GIB, 2)
    if vram is not None:
        out["available_vram_bytes"] = vram
        out["available_vram_gib"] = round(vram / _GIB, 2)
    return out


def check_memory_for_route(route: str) -> tuple[bool, bool, str]:
    """Return (ok, retryable, detail).

    ``retryable`` means another job finishing might free enough RAM/VRAM.
    """
    need = max(min_free_ram_bytes(), route_reserve_bytes(route))
    ram = available_ram_bytes()
    if ram is not None and ram < need:
        have_gib = ram / _GIB
        need_gib = need / _GIB
        return (
            False,
            True,
            (
                f"Not enough free RAM for {route}: "
                f"~{have_gib:.1f} GiB available, need ~{need_gib:.1f} GiB. "
                f"Wait for other jobs to finish or close other apps."
            ),
        )

    # Heavy CUDA routes also need a little free VRAM (models may already be resident).
    if route in {"upscale", "interpolate", "detect", "segment"}:
        vram = available_vram_bytes()
        min_vram = int(_env_float("GIF_STUDIO_MIN_FREE_VRAM_GIB", 0.35) * _GIB)
        if vram is not None and vram < min_vram:
            return (
                False,
                True,
                (
                    f"Not enough free VRAM for {route}: "
                    f"~{vram / _GIB:.2f} GiB free, need ~{min_vram / _GIB:.2f} GiB. "
                    f"Wait for the current GPU job to finish."
                ),
            )
    return True, False, "ok"


def _safe_cache_clear(fn: Any, label: str, notes: list[str]) -> None:
    clear = getattr(fn, "cache_clear", None)
    if not callable(clear):
        return
    try:
        clear()
        notes.append(label)
    except Exception:  # noqa: BLE001
        notes.append(f"{label}:fail")


def unload_inference_models() -> list[str]:
    """Drop cached runners so weights are not kept forever in RAM/VRAM."""
    notes: list[str] = []
    try:
        from .ai import depth_runner, grounding_dino_runner, realesrgan_runner
        from .ai import rife_runner, sam2_runner, sam3_runner, yolo_runner

        _safe_cache_clear(sam2_runner._predictor, "sam2", notes)
        _safe_cache_clear(sam3_runner._build_processor, "sam3", notes)
        _safe_cache_clear(grounding_dino_runner._official_model, "dino_official", notes)
        _safe_cache_clear(grounding_dino_runner._transformers_model, "dino_hf", notes)
        _safe_cache_clear(yolo_runner._load_yolo, "yolo", notes)
        _safe_cache_clear(realesrgan_runner._realesrganer, "realesrgan", notes)
        _safe_cache_clear(realesrgan_runner._spandrel_model, "spandrel", notes)
        _safe_cache_clear(rife_runner._load_rife_model, "rife", notes)
        _safe_cache_clear(depth_runner._load_pipeline, "depth", notes)
    except Exception as exc:  # noqa: BLE001
        notes.append(f"runners:{type(exc).__name__}")

    for hook in list(_unload_hooks):
        try:
            hook()
            notes.append("hook")
        except Exception:  # noqa: BLE001
            notes.append("hook:fail")
    return notes


def release_inference_memory() -> dict[str, Any]:
    """Unload models (optional), drop Python garbage, clear torch CUDA/MPS caches."""
    notes: list[str] = []
    if unload_models_enabled():
        notes.extend(unload_inference_models())
        notes.append("models_unloaded")
    else:
        notes.append("models_kept")

    collected = gc.collect()
    notes.append(f"gc:{collected}")
    try:
        import torch

        if torch.cuda.is_available():
            try:
                torch.cuda.synchronize()
            except Exception:  # noqa: BLE001
                pass
            torch.cuda.empty_cache()
            try:
                torch.cuda.ipc_collect()
            except Exception:  # noqa: BLE001
                pass
            notes.append("cuda_empty_cache")
        if hasattr(torch, "mps") and getattr(torch.backends, "mps", None):
            try:
                if torch.backends.mps.is_available():
                    torch.mps.empty_cache()
                    notes.append("mps_empty_cache")
            except Exception:  # noqa: BLE001
                pass
    except Exception:  # noqa: BLE001
        notes.append("torch_skip")
    # Second pass after cache drops may free more Python wrappers.
    collected2 = gc.collect()
    if collected2:
        notes.append(f"gc2:{collected2}")
    snap = memory_snapshot()
    snap["cleanup"] = notes
    return snap
