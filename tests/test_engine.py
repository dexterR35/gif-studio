from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw

from gif_studio.engine import (
    apply_easing,
    compute_transform,
    render_frames,
    save_gif,
)
from gif_studio.metadata import write_sidecar_json
from gif_studio.models import AnimationSettings, GifMetadata


def make_source() -> Image.Image:
    image = Image.new("RGBA", (120, 80), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.rectangle((5, 5, 115, 75), fill=(25, 100, 220, 255))
    draw.ellipse((35, 15, 85, 65), fill=(255, 180, 20, 210))
    return image


def test_easing_boundaries() -> None:
    for name in (
        "Linear",
        "Ease in",
        "Ease out",
        "Ease in-out",
        "Smoothstep",
        "Smootherstep",
        "Spring",
    ):
        assert apply_easing(0.0, name) == 0.0
        assert abs(apply_easing(1.0, name) - 1.0) < 0.003


def test_linear_transform_reaches_configured_endpoints() -> None:
    settings = AnimationSettings(
        duration_seconds=1,
        fps=5,
        preset="Custom",
        scale_start_percent=80,
        scale_end_percent=120,
        rotation_start_degrees=-10,
        rotation_end_degrees=30,
        offset_x_start_percent=-5,
        offset_x_end_percent=15,
        opacity_start_percent=20,
        opacity_end_percent=90,
        easing="Linear",
    )
    first = compute_transform(settings, 0)
    last = compute_transform(settings, settings.frame_count - 1)
    assert first.scale == 0.8
    assert last.scale == 1.2
    assert first.rotation_degrees == -10
    assert last.rotation_degrees == 30
    assert first.offset_x_percent == -5
    assert last.offset_x_percent == 15
    assert first.opacity == 0.2
    assert last.opacity == 0.9


def test_procedural_pulse_changes_frames() -> None:
    settings = AnimationSettings(
        canvas_width=160,
        canvas_height=100,
        duration_seconds=1,
        fps=8,
        preset="Pulse",
        scale_start_percent=100,
        scale_end_percent=100,
        amplitude_percent=12,
        cycles=1,
    )
    frames = render_frames(make_source(), settings)
    assert len(frames) == 8
    assert all(frame.size == (160, 100) for frame in frames)
    difference = ImageChops.difference(frames[0].convert("RGB"), frames[2].convert("RGB"))
    assert difference.getbbox() is not None


def test_save_gif_preserves_frame_count_comment_and_transparency(tmp_path: Path) -> None:
    settings = AnimationSettings(
        canvas_width=140,
        canvas_height=100,
        duration_seconds=1,
        fps=6,
        preset="Zoom In",
        scale_start_percent=90,
        scale_end_percent=110,
        transparent_background=True,
        palette_colors=128,
    )
    frames = render_frames(make_source(), settings)
    metadata = GifMetadata(title="Unit test", author="pytest", description="transparent export")
    output = save_gif(frames, tmp_path / "result.gif", settings, metadata)

    with Image.open(output) as opened:
        assert opened.n_frames == settings.frame_count
        assert opened.size == (140, 100)
        assert b"Title: Unit test" in opened.info["comment"]
        opened.seek(2)
        rgba = opened.convert("RGBA")
        assert rgba.getpixel((0, 0))[3] == 0


def test_sidecar_contains_settings_metadata_and_hash(tmp_path: Path) -> None:
    source_path = tmp_path / "source.png"
    make_source().save(source_path)
    output_path = tmp_path / "result.gif"
    output_path.write_bytes(b"GIF89a")
    settings = AnimationSettings(canvas_width=320, canvas_height=240)
    metadata = GifMetadata(title="Sidecar test", source_filename=source_path.name)

    sidecar = write_sidecar_json(source_path, output_path, settings, metadata)
    payload = json.loads(sidecar.read_text(encoding="utf-8"))
    assert payload["schema_version"] == 1
    assert payload["settings"]["canvas_width"] == 320
    assert payload["metadata"]["title"] == "Sidecar test"
    assert len(payload["source"]["sha256"]) == 64
