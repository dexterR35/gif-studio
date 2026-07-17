from __future__ import annotations

from dataclasses import replace
from pathlib import Path

from gif_studio.engine import create_gif
from gif_studio.metadata import write_sidecar_json
from gif_studio.models import AnimationSettings, GifMetadata
from gif_studio.presets import PRESET_VALUES


def main() -> None:
    input_directory = Path("input_images")
    output_directory = Path("generated_gifs")
    output_directory.mkdir(exist_ok=True)

    settings = AnimationSettings(
        canvas_width=900,
        canvas_height=600,
        duration_seconds=2.5,
        fps=15,
        preset="Ken Burns",
        palette_colors=256,
    )
    settings = replace(settings, **PRESET_VALUES["Ken Burns"])

    for source in input_directory.glob("*.png"):
        output = output_directory / f"{source.stem}.gif"
        metadata = GifMetadata(
            title=source.stem,
            author="Batch automation",
            description="Generated from the GIF Studio Python API.",
            source_filename=source.name,
        )
        create_gif(source, output, settings, metadata)
        write_sidecar_json(source, output, settings, metadata)
        print(output)


if __name__ == "__main__":
    main()
