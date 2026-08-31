"""Regression tests for the fixed backend-only prompt selection stack."""

from __future__ import annotations

from contextlib import asynccontextmanager
from inspect import signature

import cv2
import httpx
import numpy as np
import pytest

from image_studio import ai_pipeline, web_api
from image_studio.ai import grounding_dino_runner, local_models


def _png() -> bytes:
    ok, encoded = cv2.imencode(".png", np.zeros((12, 16, 3), dtype=np.uint8))
    assert ok
    return encoded.tobytes()


def test_selection_inventory_contains_only_the_large_models():
    assert local_models.SAM2_LARGE["id"] == "sam2.1_hiera_large"
    assert local_models.GROUNDING_DINO_LARGE["id"] == "swinb_cogcoor"
    assert set(signature(web_api.ai_detect).parameters) == {
        "image",
        "prompt",
        "confidence",
    }


def test_pipeline_does_not_forward_model_choices(monkeypatch):
    calls: dict[str, object] = {}

    monkeypatch.setattr(ai_pipeline, "grounding_dino_available", lambda: True)
    monkeypatch.setattr(ai_pipeline, "sam2_available", lambda: True)

    def detect(payload: bytes, prompt: str, confidence: float):
        calls["detect"] = (payload, prompt, confidence)
        return {
            "engine": "fixed-detect",
            "boxes": [{"x": 1, "y": 2, "w": 3, "h": 4, "score": 0.9, "label": "chair"}],
        }

    monkeypatch.setattr(grounding_dino_runner, "detect_with_grounding_dino", detect)
    monkeypatch.setattr(
        ai_pipeline,
        "_refine_with_sam2",
        lambda payload, box: {
            "engine": "fixed-segment",
            "mask_png_base64": "mask",
            "cutout_png_base64": "cutout",
            "rect": {"x": 1, "y": 2, "width": 3, "height": 4},
            "score": 0.8,
        },
    )

    result = ai_pipeline.detect_objects(b"image", "chair", 0.42)

    assert calls["detect"] == (b"image", "chair", 0.42)
    assert result["pipeline"] == "detect→segment→rgba"
    assert result["refined"] is True


@pytest.mark.anyio
async def test_detect_endpoint_dispatches_only_image_prompt_and_confidence(monkeypatch):
    calls: dict[str, object] = {}

    @asynccontextmanager
    async def available_slot(route: str):
        calls["route"] = route
        yield

    def detect(payload: bytes, prompt: str, confidence: float):
        calls["args"] = (payload, prompt, confidence)
        return {"engine": "fixed", "boxes": [], "prompt": prompt}

    monkeypatch.setattr(web_api, "acquire_ai_slot", available_slot)
    monkeypatch.setattr(ai_pipeline, "detect_objects", detect)

    transport = httpx.ASGITransport(app=web_api.app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.post(
            "/api/ai/detect",
            files={"image": ("image.png", _png(), "image/png")},
            data={
                "prompt": "chair",
                "confidence": "0.4",
            },
        )

    assert response.status_code == 200
    assert calls["route"] == "detect"
    assert calls["args"][1:] == ("chair", 0.4)


@pytest.fixture()
def anyio_backend():
    return "asyncio"
