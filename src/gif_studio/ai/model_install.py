"""In-app local model installer — runs ``scripts/setup_ai_models.py``.

Downloads checkpoints under ``models/``. Optional pip install for the SAM2
package when it is missing. Progress is polled via ``GET /api/models/install``.
"""

from __future__ import annotations

import importlib.util
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .paths import project_root


@dataclass
class InstallState:
    status: str = "idle"  # idle | running | succeeded | failed
    profile: str = "recommended"
    with_sam3: bool = False
    progress: float = 0.0
    message: str = ""
    log: list[str] = field(default_factory=list)
    error: str | None = None
    started_at: float | None = None
    finished_at: float | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "status": self.status,
            "profile": self.profile,
            "with_sam3": self.with_sam3,
            "progress": round(self.progress, 3),
            "message": self.message,
            "log": self.log[-40:],
            "error": self.error,
            "started_at": self.started_at,
            "finished_at": self.finished_at,
        }


_lock = threading.Lock()
_state = InstallState()
_thread: threading.Thread | None = None


def get_install_status() -> dict[str, Any]:
    with _lock:
        return _state.to_dict()


def _append(line: str) -> None:
    text = (line or "").rstrip()
    if not text:
        return
    with _lock:
        _state.log.append(text)
        if len(_state.log) > 200:
            _state.log = _state.log[-120:]
        # Prefer the last meaningful setup section / download line as the message.
        if text.startswith("[") or "downloading" in text.lower() or text.startswith("  →"):
            _state.message = text.lstrip(" →")
        elif text.startswith("Done.") or text.startswith("WARNING"):
            _state.message = text


def _set_progress(value: float, message: str | None = None) -> None:
    with _lock:
        _state.progress = max(0.0, min(1.0, float(value)))
        if message:
            _state.message = message


def _sam2_package_ready() -> bool:
    return importlib.util.find_spec("sam2") is not None


def _run_command(cmd: list[str], *, cwd: Path, on_line) -> int:
    import subprocess

    proc = subprocess.Popen(
        cmd,
        cwd=str(cwd),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
        bufsize=1,
    )
    assert proc.stdout is not None
    for line in proc.stdout:
        on_line(line)
    return int(proc.wait())


def _estimate_progress_from_log(line: str, current: float) -> float:
    """Bump progress when setup prints section headers / downloads."""
    lower = line.lower()
    bumps = [
        ("[real-esrgan", 0.08),
        ("[sam2]", 0.22),
        ("[grounding dino]", 0.38),
        ("[yolo]", 0.52),
        ("[matte]", 0.58),
        ("[depth]", 0.68),
        ("[inpaint]", 0.72),
        ("[slots]", 0.78),
        ("[sam3]", 0.85),
        ("[rife]", 0.92),
        ("done.", 0.98),
    ]
    for needle, target in bumps:
        if needle in lower:
            return max(current, target)
    if "downloading" in lower:
        return min(0.95, current + 0.02)
    return current


def _worker(*, profile: str, with_sam3: bool, install_packages: bool) -> None:
    root = project_root()
    script = root / "scripts" / "setup_ai_models.py"
    try:
        if not script.is_file():
            raise FileNotFoundError(f"Setup script missing: {script}")

        progress = 0.05
        _set_progress(progress, "Preparing model download…")

        if install_packages and not _sam2_package_ready():
            _set_progress(0.08, "Installing SAM2 Python package…")
            _append("Installing SAM2 package (git+https://github.com/facebookresearch/sam2.git)")
            import sys

            code = _run_command(
                [
                    sys.executable,
                    "-m",
                    "pip",
                    "install",
                    "git+https://github.com/facebookresearch/sam2.git",
                ],
                cwd=root,
                on_line=lambda line: _append(f"pip: {line.rstrip()}"),
            )
            if code != 0:
                _append(f"WARNING: SAM2 pip install exited with {code} (weights will still download)")
            else:
                _append("SAM2 package installed")
            progress = 0.15
            _set_progress(progress, "Downloading model weights…")

        import sys

        args = [sys.executable, str(script), "--no-install-dino"]
        if profile != "full":
            args.append("--tiny-only")
        if with_sam3:
            args.append("--with-sam3")

        _append(f"$ {' '.join(args)}")
        _set_progress(progress, "Downloading model weights…")

        def on_line(line: str) -> None:
            nonlocal progress
            _append(line)
            progress = _estimate_progress_from_log(line, progress)
            _set_progress(progress)

        code = _run_command(args, cwd=root, on_line=on_line)
        if code != 0:
            raise RuntimeError(f"setup_ai_models.py exited with code {code}")

        marker = root / "models" / ".setup-complete"
        marker.parent.mkdir(parents=True, exist_ok=True)
        marker.write_text(
            f"setup={'full' if profile == 'full' else 'tiny-only'}\n"
            f"with_sam3={1 if with_sam3 else 0}\n"
            f"via=api\n"
            f"at={time.time():.0f}\n",
            encoding="utf-8",
        )

        with _lock:
            _state.status = "succeeded"
            _state.progress = 1.0
            _state.message = "Models installed — refreshing capabilities…"
            _state.finished_at = time.time()
            _state.error = None
        _append("Done. Local models ready.")
    except Exception as exc:  # noqa: BLE001
        with _lock:
            _state.status = "failed"
            _state.message = "Model install failed"
            _state.error = str(exc)
            _state.finished_at = time.time()
        _append(f"ERROR: {exc}")


def start_install(
    *,
    profile: str = "recommended",
    with_sam3: bool = False,
    install_packages: bool = True,
) -> dict[str, Any]:
    """Start a background install. Returns current status (409 if already running)."""
    global _thread, _state

    wanted = (profile or "recommended").strip().lower()
    if wanted not in {"recommended", "tiny", "tiny-only", "full"}:
        raise ValueError("profile must be 'recommended' or 'full'")
    if wanted in {"tiny", "tiny-only"}:
        wanted = "recommended"

    with _lock:
        if _state.status == "running":
            return {**_state.to_dict(), "accepted": False, "reason": "already_running"}
        _state = InstallState(
            status="running",
            profile=wanted,
            with_sam3=bool(with_sam3),
            progress=0.01,
            message="Starting model install…",
            started_at=time.time(),
        )
        _thread = threading.Thread(
            target=_worker,
            kwargs={
                "profile": wanted,
                "with_sam3": bool(with_sam3),
                "install_packages": bool(install_packages),
            },
            daemon=True,
            name="gif-studio-model-install",
        )
        _thread.start()
        return {**_state.to_dict(), "accepted": True}
