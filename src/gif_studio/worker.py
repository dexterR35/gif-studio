from __future__ import annotations

import threading
import traceback
from pathlib import Path

from PySide6.QtCore import QObject, Signal, Slot

from .engine import RenderCancelled, create_gif, load_source_image, render_frames
from .metadata import write_sidecar_json
from .models import AnimationSettings, GifMetadata


class RenderWorker(QObject):
    """Background worker for preview rendering and full-resolution GIF export."""

    progress = Signal(int, str)
    preview_ready = Signal(object, int)
    export_ready = Signal(str, str)
    failed = Signal(str)
    cancelled = Signal()
    completed = Signal()

    def __init__(
        self,
        mode: str,
        source_path: str | Path,
        settings: AnimationSettings,
        metadata: GifMetadata,
        output_path: str | Path | None = None,
        write_sidecar: bool = True,
    ) -> None:
        super().__init__()
        if mode not in {"preview", "export"}:
            raise ValueError(f"Unsupported worker mode: {mode}")
        self.mode = mode
        self.source_path = Path(source_path)
        self.settings = settings
        self.metadata = metadata
        self.output_path = Path(output_path) if output_path else None
        self.write_sidecar = write_sidecar
        self._cancel_event = threading.Event()

    def cancel(self) -> None:
        self._cancel_event.set()

    def _is_cancelled(self) -> bool:
        return self._cancel_event.is_set()

    @Slot()
    def run(self) -> None:
        try:
            if self.mode == "preview":
                preview_settings = self.settings.for_preview()
                source = load_source_image(self.source_path)
                frames = render_frames(
                    source,
                    preview_settings,
                    progress=self.progress.emit,
                    cancelled=self._is_cancelled,
                )
                if self._is_cancelled():
                    raise RenderCancelled("Preview cancelled.")
                self.progress.emit(100, "Preview ready")
                self.preview_ready.emit(frames, preview_settings.frame_duration_ms)
                return

            if self.output_path is None:
                raise ValueError("An output path is required for export.")
            exported = create_gif(
                self.source_path,
                self.output_path,
                self.settings,
                metadata=self.metadata,
                progress=self.progress.emit,
                cancelled=self._is_cancelled,
            )
            sidecar_path = ""
            if self.write_sidecar and not self._is_cancelled():
                sidecar_path = str(
                    write_sidecar_json(
                        self.source_path,
                        exported,
                        self.settings,
                        self.metadata,
                    )
                )
            if self._is_cancelled():
                raise RenderCancelled("Export cancelled.")
            self.export_ready.emit(str(exported), sidecar_path)
        except RenderCancelled:
            self.cancelled.emit()
        except Exception as exc:
            traceback.print_exc()
            self.failed.emit(str(exc))
        finally:
            self.completed.emit()
