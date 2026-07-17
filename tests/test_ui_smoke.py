from __future__ import annotations

import os
from pathlib import Path

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")

from PIL import Image
from PySide6.QtWidgets import QApplication

from gif_studio.ui.main_window import MainWindow


def test_main_window_constructs_and_loads_source(tmp_path: Path) -> None:
    app = QApplication.instance() or QApplication([])
    source = tmp_path / "source.png"
    Image.new("RGBA", (96, 64), (30, 120, 220, 255)).save(source)

    window = MainWindow()
    window.load_image(source)
    settings = window.collect_settings()

    assert window._source_path == source.resolve()
    assert settings.preset == "Zoom In"
    assert settings.canvas_width == 96
    assert settings.canvas_height == 64
    assert window.preview_button.isEnabled()
    assert window.export_button.isEnabled()

    window.close()
    app.processEvents()
