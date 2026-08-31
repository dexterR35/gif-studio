"""Validation for supported Image Studio uploads."""

from __future__ import annotations

import io
from pathlib import Path

from PIL import Image, ImageOps

MAX_UPLOAD_BYTES = 20 * 1024 * 1024
MAX_UPLOAD_DIMENSION = 5000
ALLOWED_UPLOAD_FORMATS = frozenset({"PNG", "JPEG", "WEBP"})
ALLOWED_UPLOAD_EXTENSIONS = frozenset({".png", ".jpg", ".jpeg", ".webp"})
_FORMAT_ERROR = "Only PNG, JPG, and WEBP images are allowed."


def _sniff_image_format(payload: bytes) -> str | None:
    if len(payload) < 12:
        return None
    if payload[:8] == b"\x89PNG\r\n\x1a\n":
        return "PNG"
    if payload[:3] == b"\xff\xd8\xff":
        return "JPEG"
    if payload[:4] == b"RIFF" and payload[8:12] == b"WEBP":
        return "WEBP"
    return None


def validate_uploaded_image(payload: bytes, *, filename: str | None = None) -> Image.Image:
    """Validate and open a supported still-image upload."""
    if not payload:
        raise ValueError("An image file is required.")
    if len(payload) > MAX_UPLOAD_BYTES:
        raise ValueError("Image exceeds the 20 MB upload limit.")

    suffix = Path(filename or "").suffix.lower()
    if suffix and suffix not in ALLOWED_UPLOAD_EXTENSIONS:
        raise ValueError(_FORMAT_ERROR)

    sniffed = _sniff_image_format(payload)
    if sniffed not in ALLOWED_UPLOAD_FORMATS:
        raise ValueError(_FORMAT_ERROR)

    try:
        with Image.open(io.BytesIO(payload)) as opened:
            image_format = (opened.format or "").upper()
            if image_format == "JPG":
                image_format = "JPEG"
            if image_format not in ALLOWED_UPLOAD_FORMATS or image_format != sniffed:
                raise ValueError(_FORMAT_ERROR)
            oriented = ImageOps.exif_transpose(opened) or opened
            width, height = oriented.size
            if max(width, height) > MAX_UPLOAD_DIMENSION:
                raise ValueError(
                    f"Image dimensions must be at most {MAX_UPLOAD_DIMENSION}×{MAX_UPLOAD_DIMENSION} px "
                    f"(got {width}×{height})."
                )
            return oriented.convert("RGBA")
    except ValueError:
        raise
    except Exception as exc:
        raise ValueError(f"Could not open image: {exc}") from exc
