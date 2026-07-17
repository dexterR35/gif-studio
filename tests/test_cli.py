from __future__ import annotations

import json
from pathlib import Path

from PIL import Image

from gif_studio.cli import main


def test_cli_dump_config(tmp_path: Path) -> None:
    config = tmp_path / "default.json"
    assert main(["--dump-default-config", str(config)]) == 0
    payload = json.loads(config.read_text(encoding="utf-8"))
    assert "settings" in payload
    assert "metadata" in payload


def test_cli_export(tmp_path: Path) -> None:
    source = tmp_path / "source.png"
    output = tmp_path / "output.gif"
    image = Image.new("RGB", (64, 48), "navy")
    for x in range(8, 56):
        image.putpixel((x, 12), (255, 180, 20))
        image.putpixel((x, 35), (255, 180, 20))
    image.save(source)

    exit_code = main(
        [
            str(source),
            str(output),
            "--preset",
            "Zoom In",
            "--duration",
            "0.5",
            "--fps",
            "4",
            "--size",
            "80x60",
            "--quality",
            "low",
        ]
    )
    assert exit_code == 0
    assert output.is_file()
    assert output.with_suffix(".gif.json").is_file()
    with Image.open(output) as opened:
        assert opened.size == (80, 60)
        assert opened.n_frames == 2
