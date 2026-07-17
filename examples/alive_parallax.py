#!/usr/bin/env python3
"""Subtle 'alive' GIF: clean subject cutout + content fill + micro parallax.

Defaults:
  - original image size
  - 12-frame smooth loop (not 24 fps spam)
  - 256-color dithered GIF
  - halo-free cutout + inpainted background under the subject

Usage:
  .venv/bin/python examples/alive_parallax.py path/to/image.png
  .venv/bin/python examples/alive_parallax.py photo.png --style casino -o out.gif
"""

from __future__ import annotations

import argparse
import math
import sys
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image, ImageEnhance, ImageFilter, ImageOps

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from gif_studio.engine import load_source_image, save_gif  # noqa: E402
from gif_studio.models import AnimationSettings  # noqa: E402


def smootherstep(t: float) -> float:
    t = max(0.0, min(1.0, t))
    return t * t * t * (t * (t * 6.0 - 15.0) + 10.0)


def ping_pong(t: float) -> float:
    phase = t * 2.0
    return phase if phase <= 1.0 else 2.0 - phase


@dataclass(frozen=True, slots=True)
class Style:
    frames: int  # total GIF frames (smooth 12-frame loop)
    duration: float  # playback length in seconds
    zoom_start: float
    zoom_end: float
    bg_pan_x_px: float
    bg_pan_y_px: float
    fg_pan_x_px: float
    fg_pan_y_px: float
    breathe: float
    light_sweep: bool
    switch_pulse: bool

    @property
    def fps(self) -> int:
        return max(1, int(round(self.frames / max(0.1, self.duration))))


STYLES: dict[str, Style] = {
    # 12 frames, ~1–2 px parallax, calm loop
    "subtle": Style(
        frames=12,
        duration=1.6,
        zoom_start=1.0,
        zoom_end=1.003,
        bg_pan_x_px=1.2,
        bg_pan_y_px=0.8,
        fg_pan_x_px=-2.0,
        fg_pan_y_px=-1.0,
        breathe=0.0015,
        light_sweep=False,
        switch_pulse=False,
    ),
    "casino": Style(
        frames=12,
        duration=1.4,
        zoom_start=1.0,
        zoom_end=1.004,
        bg_pan_x_px=1.0,
        bg_pan_y_px=0.7,
        fg_pan_x_px=-1.8,
        fg_pan_y_px=-1.0,
        breathe=0.002,
        light_sweep=True,
        switch_pulse=True,
    ),
}


def edge_extend_rgba(image: Image.Image, pad: int) -> Image.Image:
    if pad <= 0:
        return image.convert("RGBA")
    rgba = image.convert("RGBA")
    arr = np.asarray(rgba.convert("RGB"), dtype=np.uint8)
    a = np.asarray(rgba.getchannel("A"), dtype=np.uint8)
    arr = np.pad(arr, ((pad, pad), (pad, pad), (0, 0)), mode="edge")
    a = np.pad(a, ((pad, pad), (pad, pad)), mode="edge")
    out = Image.fromarray(arr, mode="RGB").convert("RGBA")
    out.putalpha(Image.fromarray(a, mode="L"))
    return out


def _erode_alpha(alpha_u8: np.ndarray, pixels: int = 1) -> np.ndarray:
    """Shrink mask to kill rembg fringe / white border."""
    if pixels <= 0:
        return alpha_u8
    try:
        import cv2  # type: ignore

        k = max(3, pixels * 2 + 1)
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))
        closed = cv2.morphologyEx(alpha_u8, cv2.MORPH_CLOSE, kernel, iterations=1)
        eroded = cv2.erode(closed, kernel, iterations=max(1, pixels))
        # Tiny blur for anti-alias — keep hard enough to avoid halo
        eroded = cv2.GaussianBlur(eroded, (0, 0), 0.45)
        return eroded
    except Exception:
        img = Image.fromarray(alpha_u8, mode="L")
        for _ in range(pixels):
            img = img.filter(ImageFilter.MinFilter(3))
        img = img.filter(ImageFilter.GaussianBlur(radius=0.4))
        return np.asarray(img, dtype=np.uint8)


def clean_foreground(original: Image.Image, cut: Image.Image) -> tuple[Image.Image, np.ndarray]:
    """
    Halo-free FG:
      - keep ORIGINAL RGB (rembg fringe colors discarded)
      - erode + threshold alpha so the light border is gone
    """
    orig_rgba = np.asarray(original.convert("RGBA"), dtype=np.uint8)
    cut_rgba = np.asarray(cut.convert("RGBA"), dtype=np.uint8)
    alpha = cut_rgba[..., 3]

    alpha = _erode_alpha(alpha, pixels=2)
    # Harder threshold removes leftover fringe haze
    alpha = np.where(alpha < 40, 0, alpha).astype(np.uint8)
    alpha = np.where(alpha > 220, 255, alpha).astype(np.uint8)

    # Optional light feather only on remaining soft band
    try:
        import cv2  # type: ignore

        soft = cv2.GaussianBlur(alpha, (0, 0), 0.35)
        alpha = np.maximum(alpha, soft)
    except Exception:
        pass

    # RGB always from source photo — no white/gray cutout rim
    out = orig_rgba.copy()
    out[..., 3] = alpha
    fg = Image.fromarray(out, mode="RGBA")
    return fg, alpha.astype(np.float32) / 255.0


def fill_subject_hole(rgba: Image.Image, alpha: np.ndarray) -> Image.Image:
    """Inpaint under the subject so parallax BG has real content (no holes / seams)."""
    rgb = np.asarray(rgba.convert("RGB"), dtype=np.uint8)
    mask_u8 = (np.clip(alpha, 0, 1) * 255).astype(np.uint8)

    # Dilate hole so fill covers under the soft FG edge (prevents seam when FG moves).
    try:
        import cv2  # type: ignore

        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
        hole = cv2.dilate(mask_u8, kernel, iterations=2)
        hole = cv2.GaussianBlur(hole, (0, 0), 1.2)
    except Exception:
        hole_img = Image.fromarray(mask_u8, mode="L").filter(ImageFilter.MaxFilter(7))
        hole_img = hole_img.filter(ImageFilter.GaussianBlur(radius=1.2))
        hole = np.asarray(hole_img, dtype=np.uint8)

    try:
        import cv2  # type: ignore

        inpaint_mask = (hole > 24).astype(np.uint8) * 255
        if int(inpaint_mask.sum()) > 0:
            bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
            # Slightly larger radius for cleaner fill under dark subjects
            filled = cv2.inpaint(bgr, inpaint_mask, inpaintRadius=9, flags=cv2.INPAINT_TELEA)
            # Second pass NS for smoother texture
            filled = cv2.inpaint(filled, inpaint_mask, inpaintRadius=3, flags=cv2.INPAINT_NS)
            filled_rgb = cv2.cvtColor(filled, cv2.COLOR_BGR2RGB)
            m = (hole.astype(np.float32) / 255.0)[..., None]
            blended = (
                filled_rgb.astype(np.float32) * m + rgb.astype(np.float32) * (1.0 - m)
            ).astype(np.uint8)
            return Image.fromarray(blended, mode="RGB").convert("RGBA")
    except Exception:
        pass

    base = Image.fromarray(rgb, mode="RGB")
    filled = base.copy()
    hole_img = Image.fromarray(hole, mode="L")
    for radius in (2, 5, 11, 21, 35):
        blurred = filled.filter(ImageFilter.GaussianBlur(radius=radius))
        filled = Image.composite(blurred, filled, hole_img)
    soft = hole_img.filter(ImageFilter.GaussianBlur(radius=3))
    return Image.composite(filled, base, soft).convert("RGBA")


def try_split_layers(rgba: Image.Image) -> tuple[Image.Image, Image.Image, str]:
    """BG with content fill + clean FG cutout."""
    try:
        from rembg import new_session, remove  # type: ignore

        # isnet tends to give cleaner edges than default u2net for product/casino art
        session = None
        for model in ("isnet-general-use", "u2net"):
            try:
                session = new_session(model)
                break
            except Exception:
                continue

        kwargs: dict = {"post_process_mask": True}
        if session is not None:
            kwargs["session"] = session
        # Alpha matting tightens hair/edges when the model supports it
        try:
            cut = remove(
                rgba,
                alpha_matting=True,
                alpha_matting_foreground_threshold=240,
                alpha_matting_background_threshold=10,
                alpha_matting_erode_size=4,
                **kwargs,
            )
        except TypeError:
            cut = remove(rgba, **kwargs)

        if not isinstance(cut, Image.Image):
            cut = Image.open(__import__("io").BytesIO(cut)).convert("RGBA")
        else:
            cut = cut.convert("RGBA")

        fg, alpha = clean_foreground(rgba, cut)
        if float(alpha.mean()) < 0.02:
            return _soft_center_split(rgba)

        bg = fill_subject_hole(rgba, alpha)
        return bg, fg, "rembg"
    except Exception:
        return _soft_center_split(rgba)


def _soft_center_split(rgba: Image.Image) -> tuple[Image.Image, Image.Image, str]:
    w, h = rgba.size
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = (w - 1) / 2.0, (h - 1) / 2.0
    rx, ry = w * 0.38, h * 0.42
    dist = ((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2
    alpha = np.clip(1.0 - dist, 0.0, 1.0)
    alpha_u8 = (alpha**1.45 * 255).astype(np.uint8)
    alpha_u8 = _erode_alpha(alpha_u8, pixels=1)

    fg = rgba.copy()
    fg.putalpha(Image.fromarray(alpha_u8, mode="L"))
    return rgba.copy(), fg, "soft-center"


def sample_layer(
    layer: Image.Image,
    canvas: tuple[int, int],
    *,
    zoom: float,
    pan_x: float,
    pan_y: float,
    pad: int,
) -> Image.Image:
    cw, ch = canvas
    lw, lh = layer.size
    zw = max(1, round(lw * zoom))
    zh = max(1, round(lh * zoom))
    zoomed = layer.resize((zw, zh), Image.Resampling.LANCZOS)
    ox = int(round((zw - cw) / 2 + pan_x * cw))
    oy = int(round((zh - ch) / 2 + pan_y * ch))
    ox = max(0, min(max(0, zw - cw), ox))
    oy = max(0, min(max(0, zh - ch), oy))
    _ = pad
    return zoomed.crop((ox, oy, ox + cw, oy + ch))


def light_sweep_overlay(size: tuple[int, int], t: float) -> Image.Image:
    w, h = size
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    pos = (xx / w + yy / h) * 0.5
    center = ping_pong(t)
    band = np.exp(-((pos - center) ** 2) / (2 * 0.035**2))
    alpha = (band * 36).astype(np.uint8)
    overlay = Image.new("RGBA", size, (255, 230, 180, 0))
    overlay.putalpha(Image.fromarray(alpha, mode="L"))
    return overlay


def switch_pulse_factor(t: float) -> float:
    pulse = 0.0
    for peak in (0.22, 0.68):
        pulse = max(pulse, math.exp(-((t - peak) ** 2) / (2 * 0.012**2)))
    return 1.0 + 0.05 * pulse


def maybe_downscale(source: Image.Image, max_side: int | None) -> Image.Image:
    if not max_side or max_side <= 0:
        return source
    w, h = source.size
    longest = max(w, h)
    if longest <= max_side:
        return source
    scale = max_side / longest
    return source.resize(
        (max(1, round(w * scale)), max(1, round(h * scale))),
        Image.Resampling.LANCZOS,
    )


def render_alive(
    source: Image.Image,
    style: Style,
    canvas: tuple[int, int],
) -> tuple[list[Image.Image], str]:
    bg_src, fg_src, engine = try_split_layers(source.convert("RGBA"))
    cw, ch = canvas

    bg_pan_x = style.bg_pan_x_px / max(1, cw)
    bg_pan_y = style.bg_pan_y_px / max(1, ch)
    fg_pan_x = style.fg_pan_x_px / max(1, cw)
    fg_pan_y = style.fg_pan_y_px / max(1, ch)

    max_pan_px = max(
        abs(style.bg_pan_x_px),
        abs(style.bg_pan_y_px),
        abs(style.fg_pan_x_px),
        abs(style.fg_pan_y_px),
    )
    max_zoom = max(style.zoom_end * (1.0 + style.breathe), style.zoom_start)
    pad = max(8, int(math.ceil(max_pan_px + max(cw, ch) * (max_zoom - 1.0) + 4)))
    bg_src = edge_extend_rgba(bg_src, pad)
    fg_src = edge_extend_rgba(fg_src, pad)

    frame_count = max(2, style.frames)
    frames: list[Image.Image] = []

    for i in range(frame_count):
        raw = i / frame_count
        eased = smootherstep(ping_pong(raw))
        wave_x = math.sin(raw * math.pi * 2)
        wave_y = math.sin(raw * math.pi * 2 + 0.9)

        zoom = style.zoom_start + (style.zoom_end - style.zoom_start) * eased
        fg_zoom = zoom * (1.0 + style.breathe * wave_x)

        bg = sample_layer(
            bg_src, canvas, zoom=zoom, pan_x=bg_pan_x * wave_x, pan_y=bg_pan_y * wave_y, pad=pad,
        )
        fg = sample_layer(
            fg_src, canvas, zoom=fg_zoom, pan_x=fg_pan_x * wave_x, pan_y=fg_pan_y * wave_y, pad=pad,
        )
        frame = Image.alpha_composite(bg.convert("RGBA"), fg.convert("RGBA"))

        if style.light_sweep:
            frame = Image.alpha_composite(frame, light_sweep_overlay(canvas, raw))
        if style.switch_pulse:
            factor = switch_pulse_factor(raw)
            bright = ImageEnhance.Brightness(frame.convert("RGB")).enhance(factor)
            frame = bright.convert("RGBA")

        frames.append(frame)

    return frames, engine


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="High-quality 12-frame alive/parallax GIF at original size.",
    )
    parser.add_argument("image", type=Path, help="Source PNG or JPG")
    parser.add_argument("-o", "--output", type=Path, default=None)
    parser.add_argument("--style", choices=sorted(STYLES), default="subtle")
    parser.add_argument("--width", type=int, default=0, help="0 = original width")
    parser.add_argument("--height", type=int, default=0, help="0 = original height")
    parser.add_argument("--max-side", type=int, default=0)
    parser.add_argument("--colors", type=int, default=256)
    parser.add_argument(
        "--frames",
        type=int,
        default=0,
        help="Override frame count (default 12 from style)",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    style = STYLES[args.style]
    if args.frames > 0:
        style = Style(**{**style.__dict__, "frames": max(2, args.frames)})

    source = load_source_image(args.image)
    source = maybe_downscale(source, args.max_side or None)

    width = args.width if args.width > 0 else source.width
    height = args.height if args.height > 0 else source.height
    if args.width > 0 or args.height > 0:
        source = ImageOps.fit(
            source,
            (max(64, width), max(64, height)),
            method=Image.Resampling.LANCZOS,
            centering=(0.5, 0.5),
        )
        width, height = source.size

    canvas = (max(64, width), max(64, height))
    frames, engine = render_alive(source, style, canvas)
    output = args.output or args.image.with_name(f"{args.image.stem}_alive.gif")

    palette = max(2, min(256, args.colors))
    # Timing: style.duration / frame_count — keep save_gif fps in sync
    fps = max(1, int(round(style.frames / style.duration)))
    settings = AnimationSettings(
        canvas_width=canvas[0],
        canvas_height=canvas[1],
        duration_seconds=style.duration,
        fps=fps,
        palette_colors=palette,
        dithering="Floyd-Steinberg",
        optimize=True,
        transparent_background=False,
        background_color="#000000",
        resampling="Lanczos",
    )
    # Force exact frame list length (don't re-derive from fps rounding)
    settings.validate()
    # If fps rounding changed frame count, nudge duration to match rendered frames
    if settings.frame_count != len(frames):
        settings = AnimationSettings(
            **{
                **settings.to_dict(),
                "duration_seconds": len(frames) / max(1, settings.fps),
            }
        )
        # Re-build without invalid keys — AnimationSettings may have extras
        settings = AnimationSettings(
            canvas_width=canvas[0],
            canvas_height=canvas[1],
            duration_seconds=len(frames) / max(1, fps),
            fps=fps,
            palette_colors=palette,
            dithering="Floyd-Steinberg",
            optimize=True,
            transparent_background=False,
            background_color="#000000",
            resampling="Lanczos",
        )
        settings.validate()

    # Truncate/pad frames to settings.frame_count if needed
    target_n = settings.frame_count
    if len(frames) > target_n:
        frames = frames[:target_n]
    elif len(frames) < target_n:
        frames = frames + [frames[-1]] * (target_n - len(frames))

    save_gif(frames, output, settings)

    print(f"Saved {output}")
    print(
        f"Size {canvas[0]}×{canvas[1]} · {palette} colors · "
        f"layers={engine} · style={args.style} · {len(frames)} frames "
        f"({style.duration:.1f}s loop)"
    )
    if engine == "soft-center":
        print("Tip: pip install -r requirements-web.txt for rembg + opencv fill.")


if __name__ == "__main__":
    main()
