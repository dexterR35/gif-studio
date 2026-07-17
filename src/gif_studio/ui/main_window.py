from __future__ import annotations

from collections.abc import Iterable
from pathlib import Path

from PIL import Image
from PySide6.QtCore import QSettings, QSignalBlocker, Qt, QThread, QTimer, QUrl
from PySide6.QtGui import (
    QAction,
    QCloseEvent,
    QColor,
    QDesktopServices,
    QDragEnterEvent,
    QDropEvent,
    QImage,
    QKeySequence,
)
from PySide6.QtWidgets import (
    QCheckBox,
    QColorDialog,
    QComboBox,
    QDoubleSpinBox,
    QFileDialog,
    QFormLayout,
    QGridLayout,
    QGroupBox,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QMainWindow,
    QMessageBox,
    QPlainTextEdit,
    QProgressBar,
    QPushButton,
    QScrollArea,
    QSizePolicy,
    QSpinBox,
    QSplitter,
    QTabWidget,
    QToolBar,
    QVBoxLayout,
    QWidget,
)

from ..engine import load_source_image
from ..numbers import nice
from ..models import (
    SUPPORTED_DITHERING,
    SUPPORTED_EASING,
    SUPPORTED_RESAMPLING,
    SUPPORTED_RESIZE_MODES,
    AnimationSettings,
    GifMetadata,
)
from ..presets import PRESET_NAMES, PRESET_VALUES
from ..worker import RenderWorker
from .widgets import ColorButton, ImagePreviewLabel

IMAGE_FILTER = (
    "Images (*.png *.jpg *.jpeg);;"
    "PNG (*.png);;JPEG (*.jpg *.jpeg)"
)


class MainWindow(QMainWindow):
    def __init__(self) -> None:
        super().__init__()
        self.setWindowTitle("GIF Studio — Static Image Animator")
        self.setMinimumSize(1100, 720)
        self.resize(1380, 880)
        self.setAcceptDrops(True)

        self._settings_store = QSettings("OpenAI", "GIFStudio")
        self._source_path: Path | None = None
        self._source_size: tuple[int, int] | None = None
        self._source_aspect = 1.0
        self._preview_images: list[QImage] = []
        self._preview_index = 0
        self._preview_dirty = True
        self._active_worker: RenderWorker | None = None
        self._active_thread: QThread | None = None
        self._last_output_path: Path | None = None
        self._close_when_idle = False

        self._preview_timer = QTimer(self)
        self._preview_timer.timeout.connect(self._advance_preview)

        self._build_actions()
        self._build_ui()
        self._connect_change_signals()
        with QSignalBlocker(self.preset_combo):
            self.preset_combo.setCurrentText("Zoom In")
        self._apply_preset("Zoom In")
        self._apply_quality_profile("High quality")
        self._restore_window_state()
        self._update_estimate()
        self._set_busy(False)

    # ------------------------------------------------------------------ UI setup
    def _build_actions(self) -> None:
        self.open_action = QAction("Open image…", self)
        self.open_action.setShortcut(QKeySequence.StandardKey.Open)
        self.open_action.triggered.connect(self.open_image_dialog)

        self.preview_action = QAction("Render preview", self)
        self.preview_action.setShortcut(QKeySequence("Ctrl+R"))
        self.preview_action.triggered.connect(self.render_preview)

        self.export_action = QAction("Export GIF…", self)
        self.export_action.setShortcut(QKeySequence("Ctrl+E"))
        self.export_action.triggered.connect(self.export_gif)

        self.cancel_action = QAction("Cancel", self)
        self.cancel_action.setShortcut(QKeySequence("Esc"))
        self.cancel_action.triggered.connect(self.cancel_active_task)

        self.reset_action = QAction("Reset settings", self)
        self.reset_action.triggered.connect(self.reset_settings)

        toolbar = QToolBar("Main", self)
        toolbar.setMovable(False)
        toolbar.addAction(self.open_action)
        toolbar.addSeparator()
        toolbar.addAction(self.preview_action)
        toolbar.addAction(self.export_action)
        toolbar.addAction(self.cancel_action)
        toolbar.addSeparator()
        toolbar.addAction(self.reset_action)
        self.addToolBar(toolbar)

    def _build_ui(self) -> None:
        root = QSplitter(Qt.Orientation.Horizontal, self)
        root.setChildrenCollapsible(False)
        self.setCentralWidget(root)

        controls_scroll = QScrollArea(root)
        controls_scroll.setWidgetResizable(True)
        controls_scroll.setMinimumWidth(430)
        controls_scroll.setMaximumWidth(610)
        controls_host = QWidget()
        controls_layout = QVBoxLayout(controls_host)
        controls_layout.setContentsMargins(8, 8, 8, 8)

        source_group = QGroupBox("Source image")
        source_layout = QVBoxLayout(source_group)
        self.source_info_label = QLabel(
            "No image selected. Open a PNG, JPEG, WebP, BMP, TIFF, or GIF."
        )
        self.source_info_label.setWordWrap(True)
        source_buttons = QHBoxLayout()
        self.open_button = QPushButton("Open image…")
        self.open_button.clicked.connect(self.open_image_dialog)
        self.use_source_size_button = QPushButton("Use source size")
        self.use_source_size_button.clicked.connect(self._use_source_size)
        source_buttons.addWidget(self.open_button)
        source_buttons.addWidget(self.use_source_size_button)
        source_layout.addWidget(self.source_info_label)
        source_layout.addLayout(source_buttons)
        controls_layout.addWidget(source_group)

        self.settings_tabs = QTabWidget()
        self.settings_tabs.addTab(self._build_animation_tab(), "Animation")
        self.settings_tabs.addTab(self._build_output_tab(), "Output")
        self.settings_tabs.addTab(self._build_metadata_tab(), "Metadata")
        controls_layout.addWidget(self.settings_tabs)

        action_row = QHBoxLayout()
        self.preview_button = QPushButton("Render preview")
        self.preview_button.clicked.connect(self.render_preview)
        self.export_button = QPushButton("Export GIF…")
        self.export_button.setDefault(True)
        self.export_button.clicked.connect(self.export_gif)
        action_row.addWidget(self.preview_button)
        action_row.addWidget(self.export_button)
        controls_layout.addLayout(action_row)
        controls_layout.addStretch(1)

        controls_scroll.setWidget(controls_host)
        root.addWidget(controls_scroll)

        preview_host = QWidget(root)
        preview_layout = QVBoxLayout(preview_host)
        preview_layout.setContentsMargins(8, 8, 8, 8)

        source_preview_group = QGroupBox("Source preview")
        source_preview_layout = QVBoxLayout(source_preview_group)
        self.source_preview = ImagePreviewLabel("Drop an image here or use Open image.")
        source_preview_layout.addWidget(self.source_preview)

        animation_preview_group = QGroupBox("Animated preview")
        animation_preview_layout = QVBoxLayout(animation_preview_group)
        self.animation_preview = ImagePreviewLabel(
            "Render a preview after choosing an image and animation settings."
        )
        animation_preview_layout.addWidget(self.animation_preview)
        preview_controls = QHBoxLayout()
        self.play_pause_button = QPushButton("Pause preview")
        self.play_pause_button.clicked.connect(self._toggle_preview_playback)
        self.play_pause_button.setEnabled(False)
        self.preview_state_label = QLabel("Preview not rendered")
        self.preview_state_label.setSizePolicy(
            QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Preferred
        )
        preview_controls.addWidget(self.play_pause_button)
        preview_controls.addWidget(self.preview_state_label)
        animation_preview_layout.addLayout(preview_controls)

        preview_splitter = QSplitter(Qt.Orientation.Vertical)
        preview_splitter.setChildrenCollapsible(False)
        preview_splitter.addWidget(source_preview_group)
        preview_splitter.addWidget(animation_preview_group)
        preview_splitter.setStretchFactor(0, 1)
        preview_splitter.setStretchFactor(1, 2)
        preview_layout.addWidget(preview_splitter)
        root.addWidget(preview_host)
        root.setStretchFactor(0, 0)
        root.setStretchFactor(1, 1)
        root.setSizes([500, 880])

        self.progress_bar = QProgressBar()
        self.progress_bar.setRange(0, 100)
        self.progress_bar.setValue(0)
        self.progress_bar.setMaximumWidth(240)
        self.statusBar().addPermanentWidget(self.progress_bar)
        self.statusBar().showMessage("Ready")

    def _build_animation_tab(self) -> QWidget:
        tab = QWidget()
        layout = QVBoxLayout(tab)

        timing_group = QGroupBox("Preset and timing")
        timing_form = QFormLayout(timing_group)
        self.preset_combo = QComboBox()
        self.preset_combo.addItems(PRESET_NAMES)
        timing_form.addRow("Preset", self.preset_combo)

        self.duration_spin = self._double_spin(0.1, 120.0, 0.1, " s", 2)
        self.duration_spin.setValue(2.5)
        timing_form.addRow("Duration", self.duration_spin)

        self.fps_spin = QSpinBox()
        self.fps_spin.setRange(1, 60)
        self.fps_spin.setValue(15)
        self.fps_spin.setSuffix(" fps")
        timing_form.addRow("Frame rate", self.fps_spin)

        self.easing_combo = QComboBox()
        self.easing_combo.addItems(SUPPORTED_EASING)
        self.easing_combo.setCurrentText("Ease in-out")
        timing_form.addRow("Easing", self.easing_combo)

        self.ping_pong_check = QCheckBox("Return to the start for a smoother loop")
        timing_form.addRow("Ping-pong", self.ping_pong_check)
        layout.addWidget(timing_group)

        transform_group = QGroupBox("Transform timeline")
        transform_layout = QGridLayout(transform_group)
        transform_layout.addWidget(QLabel("Property"), 0, 0)
        transform_layout.addWidget(QLabel("Start"), 0, 1)
        transform_layout.addWidget(QLabel("End"), 0, 2)

        self.scale_start_spin = self._double_spin(1, 1000, 1, " %", 1)
        self.scale_end_spin = self._double_spin(1, 1000, 1, " %", 1)
        self.rotation_start_spin = self._double_spin(-3600, 3600, 1, "°", 1)
        self.rotation_end_spin = self._double_spin(-3600, 3600, 1, "°", 1)
        self.offset_x_start_spin = self._double_spin(-300, 300, 1, " %", 1)
        self.offset_x_end_spin = self._double_spin(-300, 300, 1, " %", 1)
        self.offset_y_start_spin = self._double_spin(-300, 300, 1, " %", 1)
        self.offset_y_end_spin = self._double_spin(-300, 300, 1, " %", 1)
        self.opacity_start_spin = self._double_spin(0, 100, 1, " %", 1)
        self.opacity_end_spin = self._double_spin(0, 100, 1, " %", 1)

        transform_rows = (
            ("Scale", self.scale_start_spin, self.scale_end_spin),
            ("Rotation", self.rotation_start_spin, self.rotation_end_spin),
            ("Horizontal offset", self.offset_x_start_spin, self.offset_x_end_spin),
            ("Vertical offset", self.offset_y_start_spin, self.offset_y_end_spin),
            ("Opacity", self.opacity_start_spin, self.opacity_end_spin),
        )
        for row, (label, start_widget, end_widget) in enumerate(transform_rows, start=1):
            transform_layout.addWidget(QLabel(label), row, 0)
            transform_layout.addWidget(start_widget, row, 1)
            transform_layout.addWidget(end_widget, row, 2)
        layout.addWidget(transform_group)

        procedural_group = QGroupBox("Procedural motion")
        procedural_form = QFormLayout(procedural_group)
        self.amplitude_spin = self._double_spin(0, 100, 0.5, " %")
        self.cycles_spin = self._double_spin(0.1, 50, 0.1, " cycles", 1)
        procedural_form.addRow("Amplitude", self.amplitude_spin)
        procedural_form.addRow("Cycles", self.cycles_spin)
        hint = QLabel(
            "Amplitude and cycles affect Pulse, Bounce, Shake, Orbit, and Wobble presets. "
            "All start/end fields remain editable after selecting a preset."
        )
        hint.setWordWrap(True)
        procedural_form.addRow(hint)
        layout.addWidget(procedural_group)
        layout.addStretch(1)
        self.preset_combo.currentTextChanged.connect(self._apply_preset)
        return tab

    def _build_output_tab(self) -> QWidget:
        tab = QWidget()
        layout = QVBoxLayout(tab)

        canvas_group = QGroupBox("Canvas")
        canvas_form = QFormLayout(canvas_group)
        dimensions_host = QWidget()
        dimensions_layout = QHBoxLayout(dimensions_host)
        dimensions_layout.setContentsMargins(0, 0, 0, 0)
        self.width_spin = QSpinBox()
        self.width_spin.setRange(1, 8192)
        self.width_spin.setValue(800)
        self.height_spin = QSpinBox()
        self.height_spin.setRange(1, 8192)
        self.height_spin.setValue(800)
        dimensions_layout.addWidget(self.width_spin)
        dimensions_layout.addWidget(QLabel("×"))
        dimensions_layout.addWidget(self.height_spin)
        canvas_form.addRow("Size", dimensions_host)

        self.lock_aspect_check = QCheckBox("Lock source aspect ratio")
        self.lock_aspect_check.setChecked(True)
        canvas_form.addRow("Aspect ratio", self.lock_aspect_check)

        self.resize_mode_combo = QComboBox()
        self.resize_mode_combo.addItems(SUPPORTED_RESIZE_MODES)
        canvas_form.addRow("Image fitting", self.resize_mode_combo)

        self.transparent_check = QCheckBox("Transparent canvas (GIF uses binary transparency)")
        canvas_form.addRow("Transparency", self.transparent_check)

        self.background_button = ColorButton("#101216")
        self.background_button.clicked.connect(self._choose_background_color)
        canvas_form.addRow("Background", self.background_button)
        layout.addWidget(canvas_group)

        quality_group = QGroupBox("GIF quality and encoding")
        quality_form = QFormLayout(quality_group)
        self.quality_combo = QComboBox()
        self.quality_combo.addItems(("Low / small file", "Balanced", "High quality", "Custom"))
        quality_form.addRow("Quality profile", self.quality_combo)

        self.palette_spin = QSpinBox()
        self.palette_spin.setRange(2, 256)
        self.palette_spin.setValue(256)
        self.palette_spin.setSuffix(" colors")
        quality_form.addRow("Palette", self.palette_spin)

        self.dither_combo = QComboBox()
        self.dither_combo.addItems(SUPPORTED_DITHERING)
        self.dither_combo.setCurrentText("Floyd-Steinberg")
        quality_form.addRow("Dithering", self.dither_combo)

        self.resampling_combo = QComboBox()
        self.resampling_combo.addItems(SUPPORTED_RESAMPLING)
        self.resampling_combo.setCurrentText("Lanczos")
        quality_form.addRow("Resize filter", self.resampling_combo)

        self.optimize_check = QCheckBox("Optimize GIF frame data")
        self.optimize_check.setChecked(True)
        quality_form.addRow("Optimization", self.optimize_check)

        self.loop_spin = QSpinBox()
        self.loop_spin.setRange(0, 65535)
        self.loop_spin.setValue(0)
        self.loop_spin.setSpecialValueText("Forever")
        quality_form.addRow("Loop count", self.loop_spin)

        self.disposal_combo = QComboBox()
        self.disposal_combo.addItem("Keep previous frame", 1)
        self.disposal_combo.addItem("Restore background", 2)
        self.disposal_combo.addItem("Restore previous frame", 3)
        self.disposal_combo.setCurrentIndex(1)
        quality_form.addRow("Frame disposal", self.disposal_combo)

        self.transparency_threshold_spin = QSpinBox()
        self.transparency_threshold_spin.setRange(0, 255)
        self.transparency_threshold_spin.setValue(8)
        quality_form.addRow("Alpha threshold", self.transparency_threshold_spin)
        layout.addWidget(quality_group)

        estimate_group = QGroupBox("Export estimate")
        estimate_layout = QVBoxLayout(estimate_group)
        self.estimate_label = QLabel()
        self.estimate_label.setWordWrap(True)
        estimate_layout.addWidget(self.estimate_label)
        limitation = QLabel(
            "GIF is limited to 256 palette entries and one-bit transparency. "
            "Use WebP or APNG in a future exporter when full alpha or smaller files are required."
        )
        limitation.setWordWrap(True)
        estimate_layout.addWidget(limitation)
        layout.addWidget(estimate_group)
        layout.addStretch(1)
        self.quality_combo.setCurrentText("High quality")
        self.quality_combo.currentTextChanged.connect(self._apply_quality_profile)
        return tab

    def _build_metadata_tab(self) -> QWidget:
        tab = QWidget()
        layout = QVBoxLayout(tab)
        metadata_group = QGroupBox("Embedded and sidecar metadata")
        form = QFormLayout(metadata_group)
        self.title_edit = QLineEdit()
        self.author_edit = QLineEdit()
        self.copyright_edit = QLineEdit()
        self.description_edit = QPlainTextEdit()
        self.description_edit.setPlaceholderText(
            "Purpose, campaign, asset notes, or generation details…"
        )
        self.description_edit.setMaximumHeight(150)
        self.sidecar_check = QCheckBox("Write a .gif.json sidecar with settings and source SHA-256")
        self.sidecar_check.setChecked(True)
        form.addRow("Title", self.title_edit)
        form.addRow("Author", self.author_edit)
        form.addRow("Copyright", self.copyright_edit)
        form.addRow("Description", self.description_edit)
        form.addRow("Sidecar JSON", self.sidecar_check)
        note = QLabel(
            "Title, author, description, software, copyright, and source filename are written "
            "to a GIF Comment Extension. Metadata support varies by viewer, so the JSON sidecar "
            "is the reliable record of all render settings."
        )
        note.setWordWrap(True)
        form.addRow(note)
        layout.addWidget(metadata_group)
        layout.addStretch(1)
        return tab

    @staticmethod
    def _double_spin(
        minimum: float,
        maximum: float,
        step: float,
        suffix: str = "",
        decimals: int = 1,
    ) -> QDoubleSpinBox:
        spin = QDoubleSpinBox()
        spin.setRange(minimum, maximum)
        spin.setSingleStep(step)
        spin.setDecimals(decimals)
        spin.setSuffix(suffix)
        # Keep displayed/edited values tidy (no 212.75675675765).
        spin.setCorrectionMode(QDoubleSpinBox.CorrectionMode.CorrectToNearestValue)
        return spin

    @staticmethod
    def _set_double(spin: QDoubleSpinBox, value: float) -> None:
        spin.setValue(nice(value, spin.decimals()))

    # --------------------------------------------------------------- event wiring
    def _connect_change_signals(self) -> None:
        numeric_widgets: Iterable[QSpinBox | QDoubleSpinBox] = (
            self.duration_spin,
            self.fps_spin,
            self.scale_start_spin,
            self.scale_end_spin,
            self.rotation_start_spin,
            self.rotation_end_spin,
            self.offset_x_start_spin,
            self.offset_x_end_spin,
            self.offset_y_start_spin,
            self.offset_y_end_spin,
            self.opacity_start_spin,
            self.opacity_end_spin,
            self.amplitude_spin,
            self.cycles_spin,
            self.width_spin,
            self.height_spin,
            self.palette_spin,
            self.loop_spin,
            self.transparency_threshold_spin,
        )
        for widget in numeric_widgets:
            widget.valueChanged.connect(self._settings_changed)

        combos = (
            self.easing_combo,
            self.resize_mode_combo,
            self.dither_combo,
            self.resampling_combo,
            self.disposal_combo,
        )
        for combo in combos:
            combo.currentIndexChanged.connect(self._settings_changed)

        checks = (
            self.ping_pong_check,
            self.lock_aspect_check,
            self.transparent_check,
            self.optimize_check,
        )
        for check in checks:
            check.toggled.connect(self._settings_changed)

        self.width_spin.valueChanged.connect(self._width_changed)
        self.height_spin.valueChanged.connect(self._height_changed)
        self.transparent_check.toggled.connect(self._update_background_enabled)
        self._update_background_enabled(self.transparent_check.isChecked())

    # ------------------------------------------------------------- source handling
    def open_image_dialog(self) -> None:
        start_directory = str(self._settings_store.value("last_image_directory", str(Path.home())))
        filename, _ = QFileDialog.getOpenFileName(
            self,
            "Open source image",
            start_directory,
            IMAGE_FILTER,
        )
        if filename:
            self.load_image(filename)

    def load_image(self, filename: str | Path) -> None:
        path = Path(filename).expanduser().resolve()
        try:
            image = load_source_image(path)
        except Exception as exc:
            QMessageBox.critical(self, "Could not open image", str(exc))
            return

        self._source_path = path
        self._source_size = image.size
        self._source_aspect = image.width / max(1, image.height)
        self._settings_store.setValue("last_image_directory", str(path.parent))
        self.source_info_label.setText(
            f"{path.name}\n{image.width} × {image.height} px · {path.suffix.upper().lstrip('.')}"
        )
        self.source_preview.set_image(self._pil_to_qimage(image))
        self.title_edit.setText(path.stem)
        self._set_default_canvas_from_source()
        self._clear_animation_preview("Settings changed — render a new preview.")
        self.statusBar().showMessage(f"Loaded {path.name}", 5000)
        self._set_busy(False)

    def _set_default_canvas_from_source(self) -> None:
        if not self._source_size:
            return
        source_w, source_h = self._source_size
        # Start at original image size (safety-capped), matching the web studio.
        width = max(1, min(8192, source_w))
        height = max(1, min(8192, source_h))
        with QSignalBlocker(self.width_spin), QSignalBlocker(self.height_spin):
            self.width_spin.setValue(width)
            self.height_spin.setValue(height)
        self._update_estimate()

    def _use_source_size(self) -> None:
        if not self._source_size:
            QMessageBox.information(self, "No source image", "Open an image first.")
            return
        width, height = self._source_size
        if width > 8192 or height > 8192:
            QMessageBox.warning(
                self,
                "Source is too large",
                "The desktop safety limit is 8192 × 8192 pixels. Enter a smaller output size.",
            )
            return
        with QSignalBlocker(self.width_spin), QSignalBlocker(self.height_spin):
            self.width_spin.setValue(width)
            self.height_spin.setValue(height)
        self._settings_changed()

    def dragEnterEvent(self, event: QDragEnterEvent) -> None:  # noqa: N802
        if event.mimeData().hasUrls() and any(url.isLocalFile() for url in event.mimeData().urls()):
            event.acceptProposedAction()

    def dropEvent(self, event: QDropEvent) -> None:  # noqa: N802
        for url in event.mimeData().urls():
            if url.isLocalFile():
                self.load_image(url.toLocalFile())
                event.acceptProposedAction()
                return

    # -------------------------------------------------------------- settings model
    def _apply_preset(self, preset_name: str) -> None:
        values = PRESET_VALUES.get(preset_name, {})
        mapping = {
            "scale_start_percent": self.scale_start_spin,
            "scale_end_percent": self.scale_end_spin,
            "rotation_start_degrees": self.rotation_start_spin,
            "rotation_end_degrees": self.rotation_end_spin,
            "offset_x_start_percent": self.offset_x_start_spin,
            "offset_x_end_percent": self.offset_x_end_spin,
            "offset_y_start_percent": self.offset_y_start_spin,
            "offset_y_end_percent": self.offset_y_end_spin,
            "opacity_start_percent": self.opacity_start_spin,
            "opacity_end_percent": self.opacity_end_spin,
            "amplitude_percent": self.amplitude_spin,
            "cycles": self.cycles_spin,
        }
        blockers = [QSignalBlocker(widget) for widget in mapping.values()]
        try:
            for key, widget in mapping.items():
                if key in values:
                    if isinstance(widget, QDoubleSpinBox):
                        self._set_double(widget, values[key])
                    else:
                        widget.setValue(values[key])
            if "ping_pong" in values:
                with QSignalBlocker(self.ping_pong_check):
                    self.ping_pong_check.setChecked(bool(values["ping_pong"]))
        finally:
            del blockers
        self._settings_changed()

    def _apply_quality_profile(self, profile: str) -> None:
        profiles = {
            "Low / small file": (64, "None", "Bilinear", True),
            "Balanced": (128, "Floyd-Steinberg", "Bicubic", True),
            "High quality": (256, "Floyd-Steinberg", "Lanczos", True),
        }
        if profile not in profiles:
            self._settings_changed()
            return
        colors, dither, resampling, optimize = profiles[profile]
        widgets = (
            self.palette_spin,
            self.dither_combo,
            self.resampling_combo,
            self.optimize_check,
        )
        blockers = [QSignalBlocker(widget) for widget in widgets]
        try:
            self.palette_spin.setValue(colors)
            self.dither_combo.setCurrentText(dither)
            self.resampling_combo.setCurrentText(resampling)
            self.optimize_check.setChecked(optimize)
        finally:
            del blockers
        self._settings_changed()

    def _choose_background_color(self) -> None:
        selected = QColorDialog.getColor(
            self.background_button.color(),
            self,
            "Choose GIF background color",
        )
        if selected.isValid():
            self.background_button.set_color(selected)
            self._settings_changed()

    def _update_background_enabled(self, transparent: bool) -> None:
        self.background_button.setEnabled(not transparent)
        self.transparency_threshold_spin.setEnabled(transparent)

    def _width_changed(self, width: int) -> None:
        if self.lock_aspect_check.isChecked() and self._source_size:
            height = max(1, min(8192, int(round(width / self._source_aspect))))
            with QSignalBlocker(self.height_spin):
                self.height_spin.setValue(height)
        self._settings_changed()

    def _height_changed(self, height: int) -> None:
        if self.lock_aspect_check.isChecked() and self._source_size:
            width = max(1, min(8192, int(round(height * self._source_aspect))))
            with QSignalBlocker(self.width_spin):
                self.width_spin.setValue(width)
        self._settings_changed()

    def _settings_changed(self, *_args) -> None:
        self._preview_dirty = True
        if self._preview_images:
            self.preview_state_label.setText("Preview is out of date")
        self._update_estimate()

    def _update_estimate(self) -> None:
        frame_count = max(2, int(round(self.duration_spin.value() * self.fps_spin.value())))
        raw_bytes = self.width_spin.value() * self.height_spin.value() * 4 * frame_count
        mib = raw_bytes / (1024**2)
        warning = ""
        if frame_count > 1200:
            warning = " Configuration exceeds the 1200-frame safety limit."
        elif raw_bytes > 1_800_000_000:
            warning = " Estimated memory exceeds the export safety limit."
        self.estimate_label.setText(
            f"{frame_count} frames · {self.width_spin.value()} × {self.height_spin.value()} px · "
            f"approximately {mib:,.0f} MiB uncompressed during rendering. "
            "Final GIF size depends on image detail, motion, palette, and optimization."
            f"{warning}"
        )

    def collect_settings(self) -> AnimationSettings:
        settings = AnimationSettings(
            canvas_width=self.width_spin.value(),
            canvas_height=self.height_spin.value(),
            resize_mode=self.resize_mode_combo.currentText(),
            background_color=self.background_button.color_name,
            transparent_background=self.transparent_check.isChecked(),
            preset=self.preset_combo.currentText(),
            duration_seconds=nice(self.duration_spin.value(), 2),
            fps=self.fps_spin.value(),
            easing=self.easing_combo.currentText(),
            ping_pong=self.ping_pong_check.isChecked(),
            scale_start_percent=nice(self.scale_start_spin.value(), 1),
            scale_end_percent=nice(self.scale_end_spin.value(), 1),
            rotation_start_degrees=nice(self.rotation_start_spin.value(), 1),
            rotation_end_degrees=nice(self.rotation_end_spin.value(), 1),
            offset_x_start_percent=nice(self.offset_x_start_spin.value(), 1),
            offset_x_end_percent=nice(self.offset_x_end_spin.value(), 1),
            offset_y_start_percent=nice(self.offset_y_start_spin.value(), 1),
            offset_y_end_percent=nice(self.offset_y_end_spin.value(), 1),
            opacity_start_percent=nice(self.opacity_start_spin.value(), 1),
            opacity_end_percent=nice(self.opacity_end_spin.value(), 1),
            amplitude_percent=nice(self.amplitude_spin.value(), 1),
            cycles=nice(self.cycles_spin.value(), 1),
            loop_count=self.loop_spin.value(),
            palette_colors=self.palette_spin.value(),
            dithering=self.dither_combo.currentText(),
            resampling=self.resampling_combo.currentText(),
            optimize=self.optimize_check.isChecked(),
            disposal_method=int(self.disposal_combo.currentData()),
            transparency_threshold=self.transparency_threshold_spin.value(),
        )
        settings.validate()
        return settings

    def collect_metadata(self) -> GifMetadata:
        return GifMetadata(
            title=self.title_edit.text().strip(),
            author=self.author_edit.text().strip(),
            description=self.description_edit.toPlainText().strip(),
            software="GIF Studio 0.1.0",
            copyright_notice=self.copyright_edit.text().strip(),
            source_filename=self._source_path.name if self._source_path else "",
        )

    # ------------------------------------------------------------ preview/export
    def render_preview(self) -> None:
        if not self._require_source():
            return
        try:
            settings = self.collect_settings()
        except ValueError as exc:
            QMessageBox.warning(self, "Invalid settings", str(exc))
            return
        self._start_worker("preview", settings, self.collect_metadata())

    def export_gif(self) -> None:
        if not self._require_source():
            return
        try:
            settings = self.collect_settings()
        except ValueError as exc:
            QMessageBox.warning(self, "Invalid settings", str(exc))
            return

        last_directory = Path(
            str(self._settings_store.value("last_output_directory", str(self._source_path.parent)))
        )
        suggested = (
            last_directory
            / f"{self._source_path.stem}_{self._slug(self.preset_combo.currentText())}.gif"
        )
        filename, _ = QFileDialog.getSaveFileName(
            self,
            "Export animated GIF",
            str(suggested),
            "GIF image (*.gif)",
        )
        if not filename:
            return
        output = Path(filename)
        if output.suffix.lower() != ".gif":
            output = output.with_suffix(".gif")
        self._settings_store.setValue("last_output_directory", str(output.parent))
        self._last_output_path = output
        self._start_worker(
            "export",
            settings,
            self.collect_metadata(),
            output_path=output,
        )

    def _start_worker(
        self,
        mode: str,
        settings: AnimationSettings,
        metadata: GifMetadata,
        output_path: Path | None = None,
    ) -> None:
        if self._active_worker is not None:
            QMessageBox.information(
                self, "Task running", "Cancel the current task before starting another."
            )
            return
        assert self._source_path is not None

        thread = QThread(self)
        worker = RenderWorker(
            mode=mode,
            source_path=self._source_path,
            settings=settings,
            metadata=metadata,
            output_path=output_path,
            write_sidecar=self.sidecar_check.isChecked(),
        )
        worker.moveToThread(thread)
        thread.started.connect(worker.run)
        worker.progress.connect(self._on_progress)
        worker.preview_ready.connect(self._on_preview_ready)
        worker.export_ready.connect(self._on_export_ready)
        worker.failed.connect(self._on_worker_failed)
        worker.cancelled.connect(self._on_worker_cancelled)
        worker.completed.connect(thread.quit)
        worker.completed.connect(worker.deleteLater)
        thread.finished.connect(self._on_thread_finished)
        thread.finished.connect(thread.deleteLater)

        self._active_thread = thread
        self._active_worker = worker
        self._set_busy(True, mode)
        thread.start()

    def cancel_active_task(self) -> None:
        if self._active_worker is not None:
            self._active_worker.cancel()
            self.statusBar().showMessage("Cancelling…")
            self.cancel_action.setEnabled(False)

    def _on_progress(self, percent: int, message: str) -> None:
        self.progress_bar.setValue(max(0, min(100, percent)))
        self.statusBar().showMessage(message)

    def _on_preview_ready(self, frames: object, frame_duration_ms: int) -> None:
        pil_frames = list(frames)
        self._preview_images = [self._pil_to_qimage(frame) for frame in pil_frames]
        self._preview_index = 0
        self._preview_dirty = False
        if self._preview_images:
            self.animation_preview.set_image(self._preview_images[0])
            self._preview_timer.setInterval(max(10, frame_duration_ms))
            self._preview_timer.start()
            self.play_pause_button.setEnabled(True)
            self.play_pause_button.setText("Pause preview")
            self.preview_state_label.setText(f"Playing {len(self._preview_images)} preview frames")

    def _on_export_ready(self, output_path: str, sidecar_path: str) -> None:
        output = Path(output_path)
        self.statusBar().showMessage(f"Exported {output.name}", 10000)
        message = f"Animated GIF saved to:\n{output}"
        if sidecar_path:
            message += f"\n\nMetadata sidecar:\n{sidecar_path}"
        dialog = QMessageBox(self)
        dialog.setWindowTitle("Export complete")
        dialog.setIcon(QMessageBox.Icon.Information)
        dialog.setText(message)
        open_folder = dialog.addButton("Open folder", QMessageBox.ButtonRole.ActionRole)
        dialog.addButton(QMessageBox.StandardButton.Close)
        dialog.exec()
        if dialog.clickedButton() is open_folder:
            QDesktopServices.openUrl(QUrl.fromLocalFile(str(output.parent)))

    def _on_worker_failed(self, message: str) -> None:
        self.statusBar().showMessage("Task failed", 5000)
        QMessageBox.critical(self, "GIF Studio error", message)

    def _on_worker_cancelled(self) -> None:
        self.statusBar().showMessage("Task cancelled", 5000)
        self.progress_bar.setValue(0)

    def _on_thread_finished(self) -> None:
        self._active_worker = None
        self._active_thread = None
        self._set_busy(False)
        if self._close_when_idle:
            self._close_when_idle = False
            self.close()

    def _set_busy(self, busy: bool, mode: str = "") -> None:
        has_source = self._source_path is not None
        self.open_action.setEnabled(not busy)
        self.open_button.setEnabled(not busy)
        self.preview_action.setEnabled(not busy and has_source)
        self.preview_button.setEnabled(not busy and has_source)
        self.export_action.setEnabled(not busy and has_source)
        self.export_button.setEnabled(not busy and has_source)
        self.reset_action.setEnabled(not busy)
        self.cancel_action.setEnabled(busy)
        self.settings_tabs.setEnabled(not busy)
        self.use_source_size_button.setEnabled(not busy and has_source)
        if busy:
            self.progress_bar.setValue(0)
            self.statusBar().showMessage(
                "Rendering preview…" if mode == "preview" else "Exporting GIF…"
            )
        elif self.progress_bar.value() != 100:
            self.progress_bar.setValue(0)

    def _require_source(self) -> bool:
        if self._source_path is None:
            QMessageBox.information(self, "No source image", "Open or drop an image first.")
            return False
        return True

    # ------------------------------------------------------------- preview player
    def _advance_preview(self) -> None:
        if not self._preview_images:
            return
        self._preview_index = (self._preview_index + 1) % len(self._preview_images)
        self.animation_preview.set_image(self._preview_images[self._preview_index])

    def _toggle_preview_playback(self) -> None:
        if not self._preview_images:
            return
        if self._preview_timer.isActive():
            self._preview_timer.stop()
            self.play_pause_button.setText("Play preview")
            self.preview_state_label.setText("Preview paused")
        else:
            self._preview_timer.start()
            self.play_pause_button.setText("Pause preview")
            state = "Playing out-of-date preview" if self._preview_dirty else "Preview playing"
            self.preview_state_label.setText(state)

    def _clear_animation_preview(self, message: str) -> None:
        self._preview_timer.stop()
        self._preview_images.clear()
        self._preview_index = 0
        self._preview_dirty = True
        self.animation_preview.clear_image(message)
        self.play_pause_button.setEnabled(False)
        self.preview_state_label.setText("Preview not rendered")

    # ------------------------------------------------------------------ utilities
    @staticmethod
    def _pil_to_qimage(image: Image.Image) -> QImage:
        rgba = image.convert("RGBA")
        raw = rgba.tobytes("raw", "RGBA")
        qimage = QImage(
            raw,
            rgba.width,
            rgba.height,
            rgba.width * 4,
            QImage.Format.Format_RGBA8888,
        )
        return qimage.copy()

    @staticmethod
    def _slug(value: str) -> str:
        slug = "".join(character.lower() if character.isalnum() else "_" for character in value)
        return "_".join(filter(None, slug.split("_"))) or "animation"

    def reset_settings(self) -> None:
        with QSignalBlocker(self.preset_combo):
            self.preset_combo.setCurrentText("Zoom In")
        self.duration_spin.setValue(2.5)
        self.fps_spin.setValue(15)
        self.easing_combo.setCurrentText("Ease in-out")
        self.resize_mode_combo.setCurrentText("Contain")
        self.transparent_check.setChecked(False)
        self.background_button.set_color(QColor("#101216"))
        self.quality_combo.setCurrentText("High quality")
        self._apply_quality_profile("High quality")
        self.loop_spin.setValue(0)
        self.disposal_combo.setCurrentIndex(1)
        self.transparency_threshold_spin.setValue(8)
        self._apply_preset("Zoom In")
        if self._source_size:
            self._set_default_canvas_from_source()
        else:
            self.width_spin.setValue(800)
            self.height_spin.setValue(800)
        self._settings_changed()

    def _restore_window_state(self) -> None:
        geometry = self._settings_store.value("window_geometry")
        if geometry:
            self.restoreGeometry(geometry)

    def closeEvent(self, event: QCloseEvent) -> None:  # noqa: N802
        if self._active_worker is not None:
            answer = QMessageBox.question(
                self,
                "Cancel current task?",
                "A render is still running. Cancel it and close GIF Studio?",
                QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
                QMessageBox.StandardButton.No,
            )
            if answer != QMessageBox.StandardButton.Yes:
                event.ignore()
                return
            self._close_when_idle = True
            self._active_worker.cancel()
            self.statusBar().showMessage("Cancelling before close…")
            event.ignore()
            return
        self._settings_store.setValue("window_geometry", self.saveGeometry())
        event.accept()
