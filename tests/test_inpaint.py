"""Regression tests for mask decoding and LaMa-only inpaint."""

from __future__ import annotations

from unittest.mock import patch

import cv2
import numpy as np
import pytest

from image_studio.ai_pipeline import _decode_inpaint_mask, inpaint_image


def _png(image: np.ndarray) -> bytes:
    ok, encoded = cv2.imencode(".png", image)
    assert ok
    return encoded.tobytes()


def test_opaque_black_white_mask_does_not_use_full_alpha_channel():
    mask = np.zeros((12, 16, 4), dtype=np.uint8)
    mask[:, :, 3] = 255
    mask[3:7, 5:11, :3] = 255

    decoded = _decode_inpaint_mask(_png(mask))

    assert np.count_nonzero(decoded) == 4 * 6
    assert np.all(decoded[3:7, 5:11] == 255)
    assert decoded[0, 0] == 0


def test_alpha_only_mask_is_supported():
    mask = np.zeros((10, 10, 4), dtype=np.uint8)
    mask[2:6, 4:8, 3] = 255

    decoded = _decode_inpaint_mask(_png(mask))

    assert np.count_nonzero(decoded) == 4 * 4
    assert decoded[3, 5] == 255
    assert decoded[0, 0] == 0


def test_inpaint_requires_lama():
    source = np.zeros((20, 20, 3), dtype=np.uint8)
    source[:, :, :] = (20, 80, 160)
    mask = np.zeros((20, 20, 4), dtype=np.uint8)
    mask[:, :, 3] = 255
    mask[8:12, 8:12, :3] = 255

    with patch("image_studio.ai.lama_runner.inpaint_background", side_effect=RuntimeError("LaMa missing")):
        with pytest.raises(RuntimeError, match="LaMa missing"):
            inpaint_image(_png(source), _png(mask))
