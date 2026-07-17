from __future__ import annotations

import sys

from PySide6.QtCore import QCoreApplication
from PySide6.QtWidgets import QApplication

from .ui.main_window import MainWindow


def main() -> int:
    QCoreApplication.setOrganizationName("OpenAI")
    QCoreApplication.setApplicationName("GIF Studio")
    QCoreApplication.setApplicationVersion("0.1.0")

    app = QApplication(sys.argv)
    app.setApplicationDisplayName("GIF Studio")
    app.setStyle("Fusion")

    window = MainWindow()
    window.show()
    return app.exec()


if __name__ == "__main__":
    raise SystemExit(main())
