from __future__ import annotations

import argparse
import json
import sys
from dataclasses import fields, replace
from pathlib import Path
from typing import Any

from .engine import create_gif
from .metadata import write_sidecar_json
from .models import AnimationSettings, GifMetadata
from .presets import PRESET_NAMES, PRESET_VALUES

QUALITY_PROFILES: dict[str, dict[str, Any]] = {
    "low": {
        "palette_colors": 64,
        "dithering": "None",
        "resampling": "Bilinear",
        "optimize": True,
    },
    "balanced": {
        "palette_colors": 128,
        "dithering": "Floyd-Steinberg",
        "resampling": "Bicubic",
        "optimize": True,
    },
    "high": {
        "palette_colors": 256,
        "dithering": "Floyd-Steinberg",
        "resampling": "Lanczos",
        "optimize": True,
    },
}


def _parse_size(value: str) -> tuple[int, int]:
    normalized = value.lower().replace(" ", "")
    try:
        width_text, height_text = normalized.split("x", 1)
        width, height = int(width_text), int(height_text)
    except (ValueError, TypeError) as exc:
        raise argparse.ArgumentTypeError("Size must look like 800x600.") from exc
    if width < 1 or height < 1:
        raise argparse.ArgumentTypeError("Width and height must be positive integers.")
    return width, height


def _filtered_dataclass_values(cls: type, values: dict[str, Any]) -> dict[str, Any]:
    allowed = {field.name for field in fields(cls)}
    return {key: value for key, value in values.items() if key in allowed}


def _load_config(path: Path) -> tuple[AnimationSettings, GifMetadata]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    settings_values = payload.get("settings", payload)
    metadata_values = payload.get("metadata", {})
    if not isinstance(settings_values, dict) or not isinstance(metadata_values, dict):
        raise ValueError(
            "Config must contain JSON objects named 'settings' and optionally 'metadata'."
        )
    settings = AnimationSettings(**_filtered_dataclass_values(AnimationSettings, settings_values))
    metadata = GifMetadata(**_filtered_dataclass_values(GifMetadata, metadata_values))
    return settings, metadata


def _apply_preset(settings: AnimationSettings, preset: str) -> AnimationSettings:
    values = PRESET_VALUES.get(preset, {})
    allowed = {field.name for field in fields(AnimationSettings)}
    updates = {key: value for key, value in values.items() if key in allowed}
    updates["preset"] = preset
    return replace(settings, **updates)


def _progress(percent: int, message: str) -> None:
    print(f"\r{percent:3d}%  {message:<50}", end="", file=sys.stderr, flush=True)
    if percent >= 100:
        print(file=sys.stderr)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="gif-studio-cli",
        description="Create an animated GIF from one static image.",
    )
    parser.add_argument("input", nargs="?", type=Path, help="Source image path")
    parser.add_argument("output", nargs="?", type=Path, help="Destination .gif path")
    parser.add_argument("--config", type=Path, help="Load settings/metadata from a JSON file")
    parser.add_argument(
        "--dump-default-config",
        type=Path,
        metavar="PATH",
        help="Write a complete editable JSON configuration and exit",
    )
    parser.add_argument("--preset", choices=PRESET_NAMES, help="Animation preset")
    parser.add_argument("--duration", type=float, help="Animation duration in seconds")
    parser.add_argument("--fps", type=int, help="Frames per second")
    parser.add_argument(
        "--size", type=_parse_size, metavar="WIDTHxHEIGHT", help="Output canvas size"
    )
    parser.add_argument(
        "--fit",
        choices=("contain", "cover", "stretch", "original"),
        help="How the source image fits the canvas",
    )
    parser.add_argument("--transparent", action="store_true", help="Use a transparent GIF canvas")
    parser.add_argument("--background", help="Solid background color, such as #101216")
    parser.add_argument("--quality", choices=tuple(QUALITY_PROFILES), help="Encoding profile")
    parser.add_argument("--loop", type=int, help="0 means forever; otherwise the repeat count")
    parser.add_argument("--title", help="Embedded title")
    parser.add_argument("--author", help="Embedded author")
    parser.add_argument("--description", help="Embedded description")
    parser.add_argument("--copyright", dest="copyright_notice", help="Embedded copyright notice")
    parser.add_argument("--no-sidecar", action="store_true", help="Do not write .gif.json metadata")
    return parser


def _dump_default_config(path: Path) -> None:
    payload = {
        "settings": AnimationSettings().to_dict(),
        "metadata": GifMetadata().to_dict(),
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    print(path.resolve())


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.dump_default_config:
        _dump_default_config(args.dump_default_config)
        return 0
    if args.input is None or args.output is None:
        parser.error("input and output are required unless --dump-default-config is used")

    try:
        if args.config:
            settings, metadata = _load_config(args.config)
        else:
            settings, metadata = AnimationSettings(), GifMetadata.from_source(args.input)

        if args.preset:
            settings = _apply_preset(settings, args.preset)
        if args.duration is not None:
            settings = replace(settings, duration_seconds=args.duration)
        if args.fps is not None:
            settings = replace(settings, fps=args.fps)
        if args.size is not None:
            settings = replace(settings, canvas_width=args.size[0], canvas_height=args.size[1])
        if args.fit:
            fit_map = {
                "contain": "Contain",
                "cover": "Cover",
                "stretch": "Stretch",
                "original": "Original size",
            }
            settings = replace(settings, resize_mode=fit_map[args.fit])
        if args.transparent:
            settings = replace(settings, transparent_background=True)
        if args.background:
            settings = replace(settings, background_color=args.background)
        if args.quality:
            settings = replace(settings, **QUALITY_PROFILES[args.quality])
        if args.loop is not None:
            settings = replace(settings, loop_count=args.loop)

        metadata_updates = {
            key: value
            for key, value in {
                "title": args.title,
                "author": args.author,
                "description": args.description,
                "copyright_notice": args.copyright_notice,
            }.items()
            if value is not None
        }
        metadata = replace(
            metadata,
            source_filename=args.input.name,
            software="GIF Studio CLI 0.1.0",
            **metadata_updates,
        )

        output = (
            args.output if args.output.suffix.lower() == ".gif" else args.output.with_suffix(".gif")
        )
        settings.validate()
        exported = create_gif(args.input, output, settings, metadata, progress=_progress)
        if not args.no_sidecar:
            sidecar = write_sidecar_json(args.input, exported, settings, metadata)
            print(f"Metadata: {sidecar}", file=sys.stderr)
        print(exported)
        return 0
    except Exception as exc:
        print(f"gif-studio-cli: error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
