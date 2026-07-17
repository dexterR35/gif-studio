from __future__ import annotations

from dataclasses import asdict, dataclass, replace
from pathlib import Path
from typing import Any

SUPPORTED_RESIZE_MODES = ("Contain", "Cover", "Stretch", "Original size")
SUPPORTED_RESAMPLING = ("Nearest", "Bilinear", "Bicubic", "Lanczos")
SUPPORTED_DITHERING = ("None", "Floyd-Steinberg")
SUPPORTED_EASING = (
    "Linear",
    "Ease in",
    "Ease out",
    "Ease in-out",
    "Smoothstep",
    "Smootherstep",
    "Spring",
)


@dataclass(slots=True)
class AnimationSettings:
    """Complete render settings for turning one source image into an animated GIF."""

    canvas_width: int = 800
    canvas_height: int = 800
    resize_mode: str = "Contain"
    background_color: str = "#101216"
    transparent_background: bool = False

    preset: str = "Zoom In"
    duration_seconds: float = 2.5
    fps: int = 15
    easing: str = "Ease in-out"
    ping_pong: bool = False

    scale_start_percent: float = 100.0
    scale_end_percent: float = 118.0
    rotation_start_degrees: float = 0.0
    rotation_end_degrees: float = 0.0
    offset_x_start_percent: float = 0.0
    offset_x_end_percent: float = 0.0
    offset_y_start_percent: float = 0.0
    offset_y_end_percent: float = 0.0
    opacity_start_percent: float = 100.0
    opacity_end_percent: float = 100.0
    amplitude_percent: float = 4.0
    cycles: float = 2.0

    loop_count: int = 0  # 0 means forever in the GIF specification/Pillow.
    palette_colors: int = 256
    dithering: str = "Floyd-Steinberg"
    resampling: str = "Lanczos"
    optimize: bool = True
    disposal_method: int = 2
    transparency_threshold: int = 8

    def validate(self) -> None:
        if not 1 <= self.canvas_width <= 8192:
            raise ValueError("Canvas width must be between 1 and 8192 pixels.")
        if not 1 <= self.canvas_height <= 8192:
            raise ValueError("Canvas height must be between 1 and 8192 pixels.")
        if not 0.1 <= self.duration_seconds <= 120:
            raise ValueError("Duration must be between 0.1 and 120 seconds.")
        if not 1 <= self.fps <= 60:
            raise ValueError("FPS must be between 1 and 60.")
        if self.frame_count > 1200:
            raise ValueError(
                f"This configuration creates {self.frame_count} frames. "
                "The desktop app limits one export to 1200 frames to avoid excessive memory use."
            )
        if self.resize_mode not in SUPPORTED_RESIZE_MODES:
            raise ValueError(f"Unsupported resize mode: {self.resize_mode}")
        if self.resampling not in SUPPORTED_RESAMPLING:
            raise ValueError(f"Unsupported resampling filter: {self.resampling}")
        if self.dithering not in SUPPORTED_DITHERING:
            raise ValueError(f"Unsupported dithering mode: {self.dithering}")
        if self.easing not in SUPPORTED_EASING:
            raise ValueError(f"Unsupported easing mode: {self.easing}")
        if not 2 <= self.palette_colors <= 256:
            raise ValueError("Palette colors must be between 2 and 256.")
        if not 0 <= self.loop_count <= 65535:
            raise ValueError("Loop count must be between 0 and 65535.")
        if self.disposal_method not in (1, 2, 3):
            raise ValueError("Disposal method must be 1, 2, or 3.")
        if not 0 <= self.transparency_threshold <= 255:
            raise ValueError("Transparency threshold must be between 0 and 255.")
        if min(self.scale_start_percent, self.scale_end_percent) <= 0:
            raise ValueError("Scale percentages must be greater than zero.")
        if not 0 <= self.opacity_start_percent <= 100:
            raise ValueError("Start opacity must be between 0 and 100 percent.")
        if not 0 <= self.opacity_end_percent <= 100:
            raise ValueError("End opacity must be between 0 and 100 percent.")
        if not 0 <= self.amplitude_percent <= 100:
            raise ValueError("Amplitude must be between 0 and 100 percent.")
        if not 0.1 <= self.cycles <= 50:
            raise ValueError("Cycles must be between 0.1 and 50.")

        # A full RGBA render is held in memory before Pillow writes the GIF.
        estimated = self.estimated_raw_bytes
        if estimated > 1_800_000_000:
            gib = estimated / (1024**3)
            raise ValueError(
                f"Estimated uncompressed frame memory is {gib:.2f} GiB. "
                "Reduce output dimensions, duration, or FPS."
            )

    @property
    def frame_count(self) -> int:
        return max(2, int(round(self.duration_seconds * self.fps)))

    @property
    def frame_duration_ms(self) -> int:
        return max(10, int(round(1000 / self.fps)))

    @property
    def estimated_raw_bytes(self) -> int:
        return self.canvas_width * self.canvas_height * 4 * self.frame_count

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    def for_preview(self, max_dimension: int = 520, max_frames: int = 90) -> AnimationSettings:
        """Return a visually equivalent but bounded configuration for responsive previews."""
        ratio = min(1.0, max_dimension / max(self.canvas_width, self.canvas_height))
        width = max(1, int(round(self.canvas_width * ratio)))
        height = max(1, int(round(self.canvas_height * ratio)))

        preview_fps = min(self.fps, 20)
        preview_duration = self.duration_seconds
        if int(round(preview_fps * preview_duration)) > max_frames:
            preview_fps = max(1, int(max_frames / preview_duration))
        if int(round(preview_fps * preview_duration)) > max_frames:
            preview_duration = max_frames / preview_fps

        return replace(
            self,
            canvas_width=width,
            canvas_height=height,
            fps=preview_fps,
            duration_seconds=max(0.1, preview_duration),
            optimize=False,
        )


@dataclass(slots=True)
class GifMetadata:
    title: str = ""
    author: str = ""
    description: str = ""
    software: str = "GIF Studio"
    copyright_notice: str = ""
    source_filename: str = ""

    def to_dict(self) -> dict[str, str]:
        return asdict(self)

    def to_gif_comment(self) -> bytes:
        """Serialize portable metadata into a GIF Comment Extension payload."""
        fields = (
            ("Title", self.title),
            ("Author", self.author),
            ("Description", self.description),
            ("Software", self.software),
            ("Copyright", self.copyright_notice),
            ("Source", self.source_filename),
        )
        lines = [f"{key}: {value.strip()}" for key, value in fields if value and value.strip()]
        return "\n".join(lines).encode("utf-8", errors="replace")

    @classmethod
    def from_source(cls, source: str | Path) -> GifMetadata:
        path = Path(source)
        return cls(title=path.stem, source_filename=path.name)
