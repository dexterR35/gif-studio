"""Regression tests for the fixed backend-only prompt selection stack."""

from __future__ import annotations

import base64
from contextlib import asynccontextmanager
from inspect import signature

import cv2
import httpx
import numpy as np
import pytest

from image_studio import ai_pipeline, web_api
from image_studio.ai import grounding_dino_runner, local_models, sam2_runner


def _png() -> bytes:
    ok, encoded = cv2.imencode(".png", np.zeros((12, 16, 3), dtype=np.uint8))
    assert ok
    return encoded.tobytes()


def test_selection_inventory_contains_only_the_large_models():
    assert local_models.SAM2_LARGE["id"] == "sam2.1_hiera_large"
    assert local_models.GROUNDING_DINO_LARGE["id"] == "swinb_cogcoor"
    assert local_models.BIREFNET["id"] == "birefnet"
    assert set(signature(web_api.ai_point_cut).parameters) == {"image", "x", "y"}
    assert set(signature(web_api.ai_detect).parameters) == {
        "image",
        "prompt",
        "confidence",
    }


def test_local_dino_config_disables_training_checkpointing(monkeypatch, tmp_path):
    bert = tmp_path / "bert"
    bert.mkdir()
    config = tmp_path / "GroundingDINO_SwinB_cfg.py"
    config.write_text(
        'text_encoder_type = "bert-base-uncased"\n'
        "use_checkpoint = True\n"
        "use_transformer_ckpt = True\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(grounding_dino_runner, "_local_bert_dir", lambda: bert)

    local_config = grounding_dino_runner._config_with_local_bert(config)
    text = local_config.read_text(encoding="utf-8")

    assert f'text_encoder_type = "{bert}"' in text
    assert "use_checkpoint = False" in text
    assert "use_transformer_ckpt = False" in text


def test_pipeline_does_not_forward_model_choices(monkeypatch):
    calls: dict[str, object] = {}

    monkeypatch.setattr(ai_pipeline, "grounding_dino_available", lambda: True)
    monkeypatch.setattr(ai_pipeline, "sam2_available", lambda: True)
    monkeypatch.setattr(ai_pipeline, "matte_available", lambda: True)

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
    assert result["pipeline"] == "detect→segment→matte→rgba"
    assert result["refined"] is True


def test_point_pipeline_keeps_contour_and_forwards_only_the_click(monkeypatch):
    mask = np.zeros((12, 16), dtype=np.uint8)
    mask[3:9, 4:12] = 255
    ok, encoded_mask = cv2.imencode(".png", mask)
    assert ok
    calls: dict[str, object] = {}

    monkeypatch.setattr(ai_pipeline, "sam2_available", lambda: True)

    def segment(payload: bytes, point):
        calls["segment"] = (payload, point)
        return {
            "mask_png_base64": base64.b64encode(encoded_mask.tobytes()).decode("ascii"),
            "score": 0.97,
        }

    monkeypatch.setattr(sam2_runner, "segment_with_sam2", segment)
    result = ai_pipeline.point_cutout(_png(), 7.5, 6.0)

    assert calls["segment"] == (_png(), (7.5, 6.0))
    assert result["pipeline"] == "point→segment→rgba"
    assert result["rect"] == {"x": 2.0, "y": 1.0, "width": 12.0, "height": 10.0}
    assert result["cutout_png_base64"]


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


@pytest.mark.anyio
async def test_point_endpoint_dispatches_only_image_and_click(monkeypatch):
    calls: dict[str, object] = {}

    @asynccontextmanager
    async def available_slot(route: str):
        calls["route"] = route
        yield

    def point_cut(payload: bytes, x: float, y: float):
        calls["args"] = (payload, x, y)
        return {"engine": "point-selection", "rect": {"x": 1, "y": 2, "width": 3, "height": 4}}

    monkeypatch.setattr(web_api, "acquire_ai_slot", available_slot)
    monkeypatch.setattr(ai_pipeline, "point_cutout", point_cut)

    transport = httpx.ASGITransport(app=web_api.app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.post(
            "/api/ai/point-cut",
            files={"image": ("image.png", _png(), "image/png")},
            data={"x": "7.5", "y": "6"},
        )

    assert response.status_code == 200
    assert calls["route"] == "point_cut"
    assert calls["args"][1:] == (7.5, 6.0)


@pytest.fixture()
def anyio_backend():
    return "asyncio"
