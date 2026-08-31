"""HTTP contract tests for the inpaint endpoint."""

from __future__ import annotations

import base64
from contextlib import asynccontextmanager

import cv2
import httpx
import numpy as np
import pytest

from image_studio import ai_pipeline, web_api

pytestmark = pytest.mark.anyio


@pytest.fixture()
def anyio_backend():
    return "asyncio"


def _png(image: np.ndarray) -> bytes:
    ok, encoded = cv2.imencode(".png", image)
    assert ok
    return encoded.tobytes()


async def test_inpaint_endpoint_validates_files_and_dispatches(monkeypatch):
    calls: dict[str, object] = {}

    @asynccontextmanager
    async def available_slot(route: str):
        calls["route"] = route
        yield

    def fake_inpaint(image_payload, mask_payload, *, model):
        calls.update({
            "image": image_payload,
            "mask": mask_payload,
            "model": model,
        })
        return {
            "engine": "test-inpaint",
            "fill": "lama",
            "image_png_base64": base64.b64encode(image_payload).decode("ascii"),
        }

    monkeypatch.setattr(web_api, "acquire_ai_slot", available_slot)
    monkeypatch.setattr(ai_pipeline, "inpaint_image", fake_inpaint)

    plate = _png(np.full((12, 16, 3), 80, dtype=np.uint8))
    mask = _png(np.zeros((12, 16), dtype=np.uint8))
    transport = httpx.ASGITransport(app=web_api.app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.post(
            "/api/ai/inpaint",
            files={
                "image": ("plate.png", plate, "image/png"),
                "mask": ("mask.png", mask, "image/png"),
            },
            data={"model": "big-lama"},
        )

    assert response.status_code == 200
    assert response.json()["engine"] == "test-inpaint"
    assert calls["route"] == "inpaint"
    assert calls["model"] == "big-lama"
    assert calls["image"] == plate
    assert calls["mask"] == mask
