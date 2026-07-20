"""Tests for /api/models/install status endpoint."""

from __future__ import annotations

import pytest

fastapi = pytest.importorskip("fastapi")
pytest.importorskip("httpx")

from fastapi.testclient import TestClient  # noqa: E402

from gif_studio.web_api import app  # noqa: E402
from gif_studio.ai import model_install  # noqa: E402


@pytest.fixture()
def client():
    with TestClient(app) as c:
        yield c


def test_models_install_status_idle(client: TestClient):
    # Reset to idle so CI is deterministic
    with model_install._lock:
        model_install._state = model_install.InstallState()
    res = client.get("/api/models/install")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] in {"idle", "succeeded", "failed", "running"}
    assert "progress" in body
    assert "message" in body


def test_models_install_rejects_bad_profile(client: TestClient):
    with model_install._lock:
        if model_install._state.status == "running":
            pytest.skip("install already running")
        model_install._state = model_install.InstallState()
    res = client.post("/api/models/install", json={"profile": "nope"})
    assert res.status_code == 422
