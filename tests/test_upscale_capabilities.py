"""Regression tests for model-weight-aware upscale readiness."""

from __future__ import annotations

from inspect import signature

import pytest

from image_studio import ai_pipeline
from image_studio.ai import realesrgan_runner
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
