from __future__ import annotations

import math
from collections.abc import Callable, Iterable, Sequence
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image, ImageColor, ImageOps

from .models import AnimationSettings, GifMetadata

ProgressCallback = Callable[[int, str], None]
CancelCallback = Callable[[], bool]


class RenderCancelled(RuntimeError):
    """Raised internally when the user cancels a preview or export."""


@dataclass(frozen=True, slots=True)
class FrameTransform:
    scale: float
    rotation_degrees: float
    offset_x_percent: float
    offset_y_percent: float
    opacity: float


def load_source_image(path: str | Path) -> Image.Image:
    source_path = Path(path)
    if not source_path.is_file():
        raise FileNotFoundError(f"Source image does not exist: {source_path}")
    try:
        with Image.open(source_path) as opened:
            oriented = ImageOps.exif_transpose(opened)
            return oriented.convert("RGBA")
    except Exception as exc:  # Pillow raises several format-specific exceptions.
        raise ValueError(f"Could not open '{source_path.name}' as an image: {exc}") from exc


def parse_rgba_color(value: str, alpha: int = 255) -> tuple[int, int, int, int]:
    try:
        rgb = ImageColor.getrgb(value)
    except ValueError as exc:
        raise ValueError(f"Invalid background color: {value}") from exc
    if len(rgb) == 4:
        return rgb
    return rgb[0], rgb[1], rgb[2], alpha


def _lerp(start: float, end: float, t: float) -> float:
    return start + ((end - start) * t)


def apply_easing(t: float, easing: str) -> float:
    t = max(0.0, min(1.0, t))
    if easing == "Linear":
        return t
    if easing == "Ease in":
        return t * t
    if easing == "Ease out":
        return 1.0 - ((1.0 - t) * (1.0 - t))
    if easing == "Ease in-out":
        return 2.0 * t * t if t < 0.5 else 1.0 - math.pow(-2.0 * t + 2.0, 2.0) / 2.0
    if easing == "Smoothstep":
        return t * t * (3.0 - 2.0 * t)
    if easing == "Smootherstep":
        return t * t * t * (t * (t * 6.0 - 15.0) + 10.0)
    if easing == "Spring":
        # Dampened overshoot; intentionally not clamped so motion can feel elastic.
        return 1.0 - (math.cos(t * math.pi * 4.5) * math.exp(-6.0 * t))
    raise ValueError(f"Unknown easing: {easing}")


def compute_transform(settings: AnimationSettings, frame_index: int) -> FrameTransform:
    frame_count = settings.frame_count
    endpoint_t = frame_index / max(1, frame_count - 1)
    periodic_t = frame_index / frame_count  # Avoid duplicate first/last phase in looping motion.

    interpolation_t = endpoint_t
    if settings.ping_pong:
        phase = endpoint_t * 2.0
        interpolation_t = phase if phase <= 1.0 else 2.0 - phase
    eased_t = apply_easing(interpolation_t, settings.easing)

    scale = _lerp(settings.scale_start_percent, settings.scale_end_percent, eased_t) / 100.0
    rotation = _lerp(
        settings.rotation_start_degrees,
        settings.rotation_end_degrees,
        eased_t,
    )
    offset_x = _lerp(
        settings.offset_x_start_percent,
        settings.offset_x_end_percent,
        eased_t,
    )
    offset_y = _lerp(
        settings.offset_y_start_percent,
        settings.offset_y_end_percent,
        eased_t,
    )
    opacity = (
        _lerp(
            settings.opacity_start_percent,
            settings.opacity_end_percent,
            eased_t,
        )
        / 100.0
    )

    amplitude = settings.amplitude_percent
    cycles = settings.cycles
    angle = 2.0 * math.pi * cycles * periodic_t

    if settings.preset == "Pulse":
        scale += (amplitude / 100.0) * math.sin(angle)
    elif settings.preset == "Bounce":
        # Start on the floor, move up, and return to the floor each half wave.
        offset_y -= amplitude * abs(math.sin(math.pi * cycles * periodic_t))
    elif settings.preset == "Shake":
        offset_x += amplitude * math.sin(angle)
        offset_y += amplitude * 0.35 * math.sin(angle * 2.13)
        rotation += amplitude * 0.45 * math.sin(angle * 0.93)
    elif settings.preset == "Orbit":
        offset_x += amplitude * math.cos(angle)
        offset_y += amplitude * math.sin(angle)
    elif settings.preset == "Wobble":
        rotation += amplitude * math.sin(angle)
        offset_x += amplitude * 0.25 * math.sin(angle * 2.0)

    return FrameTransform(
        scale=max(0.01, scale),
        rotation_degrees=rotation,
        offset_x_percent=offset_x,
        offset_y_percent=offset_y,
        opacity=max(0.0, min(1.0, opacity)),
    )


def _resampling_filter(name: str) -> Image.Resampling:
    return {
        "Nearest": Image.Resampling.NEAREST,
        "Bilinear": Image.Resampling.BILINEAR,
        "Bicubic": Image.Resampling.BICUBIC,
        "Lanczos": Image.Resampling.LANCZOS,
    }[name]


def _base_size(
    source_size: tuple[int, int],
    canvas_size: tuple[int, int],
    resize_mode: str,
) -> tuple[int, int]:
    source_w, source_h = source_size
    canvas_w, canvas_h = canvas_size

    if resize_mode == "Stretch":
        return canvas_w, canvas_h
    if resize_mode == "Original size":
        return source_w, source_h

    scale_x = canvas_w / source_w
    scale_y = canvas_h / source_h
    ratio = min(scale_x, scale_y) if resize_mode == "Contain" else max(scale_x, scale_y)
    return max(1, round(source_w * ratio)), max(1, round(source_h * ratio))


def render_frame(
    source: Image.Image,
    settings: AnimationSettings,
    frame_index: int,
) -> Image.Image:
    transform = compute_transform(settings, frame_index)
    canvas_size = (settings.canvas_width, settings.canvas_height)
    resampling = _resampling_filter(settings.resampling)

    base_w, base_h = _base_size(source.size, canvas_size, settings.resize_mode)
    scaled_w = max(1, int(round(base_w * transform.scale)))
    scaled_h = max(1, int(round(base_h * transform.scale)))
    transformed = source.resize((scaled_w, scaled_h), resample=resampling)

    if abs(transform.rotation_degrees) > 1e-6:
        # Pillow rotate accepts up to BICUBIC. LANCZOS is retained for resize operations.
        transformed = transformed.rotate(
            transform.rotation_degrees,
            resample=Image.Resampling.BICUBIC,
            expand=True,
            fillcolor=(0, 0, 0, 0),
        )

    if transform.opacity < 0.999:
        alpha = transformed.getchannel("A").point(
            lambda value: int(round(value * transform.opacity))
        )
        transformed.putalpha(alpha)

    if settings.transparent_background:
        background = (0, 0, 0, 0)
    else:
        background = parse_rgba_color(settings.background_color)
    canvas = Image.new("RGBA", canvas_size, background)

    x = int(round((settings.canvas_width - transformed.width) / 2.0))
    y = int(round((settings.canvas_height - transformed.height) / 2.0))
    x += int(round(settings.canvas_width * transform.offset_x_percent / 100.0))
    y += int(round(settings.canvas_height * transform.offset_y_percent / 100.0))

    # Pillow clips negative or overflowing destinations and preserves straight alpha.
    canvas.alpha_composite(transformed, dest=(x, y))
    return canvas


def render_frames(
    source: Image.Image,
    settings: AnimationSettings,
    progress: ProgressCallback | None = None,
    cancelled: CancelCallback | None = None,
) -> list[Image.Image]:
    settings.validate()
    source = source.convert("RGBA")
    frames: list[Image.Image] = []

    for frame_index in range(settings.frame_count):
        if cancelled and cancelled():
            raise RenderCancelled("Rendering cancelled.")
        frames.append(render_frame(source, settings, frame_index))
        if progress:
            percent = int(round(((frame_index + 1) / settings.frame_count) * 80))
            progress(percent, f"Rendering frame {frame_index + 1}/{settings.frame_count}")
    return frames


def _dither_mode(name: str) -> Image.Dither:
    return Image.Dither.NONE if name == "None" else Image.Dither.FLOYDSTEINBERG


def quantize_frame(frame: Image.Image, settings: AnimationSettings) -> Image.Image:
    rgba = frame.convert("RGBA")
    dither = _dither_mode(settings.dithering)

    if not settings.transparent_background:
        matte = Image.new("RGBA", rgba.size, parse_rgba_color(settings.background_color))
        flattened = Image.alpha_composite(matte, rgba).convert("RGB")
        return flattened.quantize(
            colors=settings.palette_colors,
            method=Image.Quantize.MEDIANCUT,
            dither=dither,
        )

    # GIF has one-bit transparency. Reserve palette index 255 for transparent pixels.
    rgb = rgba.convert("RGB")
    palette_color_count = min(255, max(2, settings.palette_colors - 1))
    paletted = rgb.quantize(
        colors=palette_color_count,
        method=Image.Quantize.MEDIANCUT,
        dither=dither,
    )

    alpha = np.asarray(rgba.getchannel("A"), dtype=np.uint8)
    pixels = np.asarray(paletted, dtype=np.uint8).copy()
    pixels[alpha <= settings.transparency_threshold] = 255

    result = Image.fromarray(pixels, mode="P")
    palette = list(paletted.getpalette() or [])
    if len(palette) < 768:
        palette.extend([0] * (768 - len(palette)))
    palette[765:768] = [0, 0, 0]
    result.putpalette(palette)
    result.info["transparency"] = 255
    return result


def save_gif(
    frames: Sequence[Image.Image],
    output_path: str | Path,
    settings: AnimationSettings,
    metadata: GifMetadata | None = None,
    progress: ProgressCallback | None = None,
    cancelled: CancelCallback | None = None,
) -> Path:
    if not frames:
        raise ValueError("Cannot save a GIF without frames.")
    output = Path(output_path).expanduser().resolve()
    output.parent.mkdir(parents=True, exist_ok=True)

    quantized: list[Image.Image] = []
    total = len(frames)
    for index, frame in enumerate(frames):
        if cancelled and cancelled():
            raise RenderCancelled("Export cancelled.")
        quantized.append(quantize_frame(frame, settings))
        if progress:
            percent = 80 + int(round(((index + 1) / total) * 18))
            progress(min(98, percent), f"Quantizing frame {index + 1}/{total}")

    save_arguments: dict[str, object] = {
        "save_all": True,
        "append_images": quantized[1:],
        "duration": [settings.frame_duration_ms] * len(quantized),
        "loop": settings.loop_count,
        "optimize": settings.optimize,
        "disposal": settings.disposal_method,
    }
    if settings.transparent_background:
        save_arguments["transparency"] = 255
    if metadata:
        comment = metadata.to_gif_comment()
        if comment:
            save_arguments["comment"] = comment

    if progress:
        progress(99, "Writing GIF file")
    quantized[0].save(output, format="GIF", **save_arguments)
    if progress:
        progress(100, f"Saved {output.name}")
    return output


def create_gif(
    source_path: str | Path,
    output_path: str | Path,
    settings: AnimationSettings,
    metadata: GifMetadata | None = None,
    progress: ProgressCallback | None = None,
    cancelled: CancelCallback | None = None,
) -> Path:
    source = load_source_image(source_path)
    frames = render_frames(source, settings, progress=progress, cancelled=cancelled)
    return save_gif(
        frames,
        output_path,
        settings,
        metadata=metadata,
        progress=progress,
        cancelled=cancelled,
    )


def iter_frame_transforms(settings: AnimationSettings) -> Iterable[FrameTransform]:
    """Convenience API for tests, automation, or future timeline visualization."""
    for index in range(settings.frame_count):
        yield compute_transform(settings, index)
