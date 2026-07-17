from __future__ import annotations

from PySide6.QtCore import Qt
from PySide6.QtGui import QColor, QImage, QPixmap, QResizeEvent
from PySide6.QtWidgets import QLabel, QPushButton


class ImagePreviewLabel(QLabel):
    """A preview surface that keeps the current image fitted to its available area."""

    def __init__(self, placeholder: str, parent=None) -> None:
        super().__init__(parent)
        self._image: QImage | None = None
        self._placeholder = placeholder
        self.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.setMinimumSize(280, 220)
        self.setWordWrap(True)
        self.setText(placeholder)
        self.setStyleSheet(
            "QLabel { border: 1px solid palette(mid); border-radius: 6px; "
            "background: palette(base); padding: 8px; }"
        )

    def set_image(self, image: QImage | None) -> None:
        self._image = image
        self._refresh()

    def clear_image(self, placeholder: str | None = None) -> None:
        self._image = None
        if placeholder is not None:
            self._placeholder = placeholder
        self._refresh()

    def resizeEvent(self, event: QResizeEvent) -> None:  # noqa: N802 (Qt naming)
        super().resizeEvent(event)
        self._refresh()

    def _refresh(self) -> None:
        if self._image is None or self._image.isNull():
            self.setPixmap(QPixmap())
            self.setText(self._placeholder)
            return
        pixmap = QPixmap.fromImage(self._image)
        available = self.contentsRect().size()
        scaled = pixmap.scaled(
            available,
            Qt.AspectRatioMode.KeepAspectRatio,
            Qt.TransformationMode.SmoothTransformation,
        )
        self.setText("")
        self.setPixmap(scaled)


class ColorButton(QPushButton):
    """A button that stores and displays a selected QColor."""

    def __init__(self, color: str = "#101216", parent=None) -> None:
        super().__init__(parent)
        self._color = QColor(color)
        self.setMinimumWidth(110)
        self._refresh()

    @property
    def color_name(self) -> str:
        return self._color.name(QColor.NameFormat.HexRgb)

    def set_color(self, color: QColor | str) -> None:
        candidate = QColor(color)
        if candidate.isValid():
            self._color = candidate
            self._refresh()

    def color(self) -> QColor:
        return QColor(self._color)

    def _refresh(self) -> None:
        foreground = "#000000" if self._color.lightness() > 145 else "#ffffff"
        self.setText(self._color.name(QColor.NameFormat.HexRgb).upper())
        self.setStyleSheet(
            "QPushButton {"
            f"background-color: {self._color.name()}; color: {foreground};"
            "border: 1px solid palette(mid); border-radius: 4px; padding: 5px 9px;"
            "}"
        )
