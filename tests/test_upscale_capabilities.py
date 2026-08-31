"""Regression tests for model-weight-aware upscale readiness."""

from __future__ import annotations

from image_studio import ai_pipeline
from image_studio.ai import realesrgan_runner


def test_upscale_readiness_uses_the_requested_scale(monkeypatch, tmp_path):
    x2 = tmp_path / "x2.pth"
    x4 = tmp_path / "x4.pth"
    x4.write_bytes(b"x" * 2048)

    monkeypatch.setattr(realesrgan_runner, "realesrgan_ready", lambda: True)
    monkeypatch.setattr(
        realesrgan_runner,
        "_weight_path",
        lambda _model, scale: x2 if scale == 2 else x4,
    )

    assert not realesrgan_runner.upscale_available("realesrgan", 2)
    assert realesrgan_runner.upscale_available("realesrgan", 4)


def test_pipeline_passes_scale_to_readiness_check(monkeypatch):
    calls: list[tuple[str, int]] = []

    def available(model: str, scale: int) -> bool:
        calls.append((model, scale))
        return True

    monkeypatch.setattr(realesrgan_runner, "upscale_available", available)
    monkeypatch.setattr(
        realesrgan_runner,
        "upscale_with_realesrgan",
        lambda payload, *, scale, model: (payload, f"{model}:{scale}"),
    )

    output, engine = ai_pipeline.upscale_image(b"png", scale=4, model="realesrgan")

    assert output == b"png"
    assert engine == "realesrgan:4"
    assert calls == [("realesrgan", 4)]
