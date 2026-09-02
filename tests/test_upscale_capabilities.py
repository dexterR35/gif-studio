"""Regression tests for model-weight-aware upscale readiness."""

from __future__ import annotations

from contextlib import nullcontext
from inspect import signature

import cv2
import numpy as np
import pytest

from image_studio import ai_pipeline
from image_studio.ai import realesrgan_runner
from image_studio.ai.paths import encode_png
from image_studio.web_api import ai_upscale


def test_upscale_readiness_uses_the_requested_scale(monkeypatch, tmp_path):
    x2 = tmp_path / "x2.pth"
    x4 = tmp_path / "x4.pth"
    x4.write_bytes(b"x" * 2048)

    monkeypatch.setattr(realesrgan_runner, "realesrgan_ready", lambda: True)
    monkeypatch.setattr(
        realesrgan_runner,
        "_weight_path",
        lambda scale: x2 if scale == 2 else x4,
    )

    assert not realesrgan_runner.upscale_available(2)
    assert realesrgan_runner.upscale_available(4)


def test_pipeline_passes_scale_to_readiness_check(monkeypatch):
    calls: list[int] = []

    def available(scale: int) -> bool:
        calls.append(scale)
        return True

    monkeypatch.setattr(realesrgan_runner, "upscale_available", available)
    monkeypatch.setattr(
        realesrgan_runner,
        "upscale_with_realesrgan",
        lambda payload, *, scale: (payload, f"realesrgan-x{scale}"),
    )

    output, engine = ai_pipeline.upscale_image(b"png", scale=4)

    assert output == b"png"
    assert engine == "realesrgan-x4"
    assert calls == [4]


@pytest.mark.parametrize("scale", [1, 2.5, 3, 5])
def test_only_fixed_scales_are_accepted(scale):
    with pytest.raises(ValueError, match="must be 2 or 4"):
        realesrgan_runner.normalize_scale(scale)


def test_upscale_endpoint_has_no_model_parameter():
    assert list(signature(ai_upscale).parameters) == ["image", "scale"]


def test_rgba_upscale_preserves_soft_alpha(monkeypatch):
    source = np.zeros((2, 2, 4), dtype=np.uint8)
    source[:, :, :3] = (20, 40, 80)
    source[:, :, 3] = np.array([[0, 64], [128, 255]], dtype=np.uint8)
    opaque_upscale = np.full((4, 4, 3), (30, 60, 120), dtype=np.uint8)
    seen: dict[str, np.ndarray] = {}

    def fake_spandrel(image, scale):
        seen["image"] = image
        assert scale == 2
        return encode_png(opaque_upscale), "fake-realesrgan-x2"

    monkeypatch.setattr(realesrgan_runner, "spandrel_ready", lambda: True)
    monkeypatch.setattr(realesrgan_runner, "_upscale_spandrel", fake_spandrel)
    monkeypatch.setattr(realesrgan_runner, "_upscale_resource_limits", nullcontext)

    output, engine = realesrgan_runner.upscale_with_realesrgan(
        encode_png(source),
        scale=2,
    )
    decoded = cv2.imdecode(np.frombuffer(output, np.uint8), cv2.IMREAD_UNCHANGED)
    expected_alpha = cv2.resize(
        source[:, :, 3],
        (4, 4),
        interpolation=cv2.INTER_LINEAR,
    )

    assert engine == "fake-realesrgan-x2"
    assert seen["image"].shape == (2, 2, 3)
    assert decoded.shape == (4, 4, 4)
    np.testing.assert_array_equal(decoded[:, :, 3], expected_alpha)
    assert 0 < decoded[1, 1, 3] < 255


def test_rgb_upscale_remains_rgb(monkeypatch):
    source = np.full((2, 2, 3), (20, 40, 80), dtype=np.uint8)
    opaque_upscale = np.full((4, 4, 3), (30, 60, 120), dtype=np.uint8)
    encoded_upscale = encode_png(opaque_upscale)

    monkeypatch.setattr(realesrgan_runner, "spandrel_ready", lambda: True)
    monkeypatch.setattr(
        realesrgan_runner,
        "_upscale_spandrel",
        lambda image, scale: (encoded_upscale, "fake-realesrgan-x2"),
    )
    monkeypatch.setattr(realesrgan_runner, "_upscale_resource_limits", nullcontext)

    output, _engine = realesrgan_runner.upscale_with_realesrgan(
        encode_png(source),
        scale=2,
    )
    decoded = cv2.imdecode(np.frombuffer(output, np.uint8), cv2.IMREAD_UNCHANGED)

    assert decoded.shape == (4, 4, 3)
