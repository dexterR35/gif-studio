"""Tests for /api/v1 jobs API (FastAPI TestClient)."""

from __future__ import annotations

import time

import pytest

fastapi = pytest.importorskip("fastapi")
httpx = pytest.importorskip("httpx")

from fastapi.testclient import TestClient  # noqa: E402

from gif_studio.web_api import app  # noqa: E402
from gif_studio.api.job_store import job_store  # noqa: E402


@pytest.fixture()
def client():
    # Fresh-ish store between tests: clear internal maps
    job_store._jobs.clear()
    job_store._idempotency.clear()
    with TestClient(app) as c:
        yield c


def test_health_still_works(client: TestClient):
    res = client.get("/api/health")
    assert res.status_code == 200
    assert "status" in res.json()
    assert res.headers.get("X-Request-Id")


def test_create_and_get_job(client: TestClient):
    res = client.post("/api/v1/jobs", json={"kind": "demo", "params": {"x": 1}})
    assert res.status_code == 200
    body = res.json()
    assert body["job_id"]
    assert body["status"] in {"queued", "running", "succeeded"}
    assert res.headers.get("X-Request-Id")

    job_id = body["job_id"]
    # Wait for in-memory runner
    for _ in range(50):
        status = client.get(f"/api/v1/jobs/{job_id}").json()
        if status["status"] in {"succeeded", "failed", "cancelled"}:
            break
        time.sleep(0.02)
    assert status["status"] == "succeeded"

    result = client.get(f"/api/v1/jobs/{job_id}/result")
    assert result.status_code == 200
    payload = result.json()
    assert payload["result"]["kind"] == "demo"
    assert payload["result"]["echo_params"]["x"] == 1


def test_cancel_job(client: TestClient):
    res = client.post("/api/v1/jobs", json={"kind": "hang", "params": {}})
    job_id = res.json()["job_id"]
    time.sleep(0.02)
    cancel = client.post(f"/api/v1/jobs/{job_id}/cancel")
    assert cancel.status_code == 200
    assert cancel.json()["status"] == "cancelled"


def test_missing_job_problem_json(client: TestClient):
    res = client.get("/api/v1/jobs/does-not-exist")
    assert res.status_code == 404
    assert "problem+json" in res.headers.get("content-type", "")
    body = res.json()
    assert body["code"] == "JOB_NOT_FOUND"
    assert body.get("request_id") or res.headers.get("X-Request-Id")


def test_result_conflict_while_running(client: TestClient):
    # Create job then immediately ask for result — may be 409 if not done
    res = client.post("/api/v1/jobs", json={"kind": "demo2", "params": {}})
    job_id = res.json()["job_id"]
    early = client.get(f"/api/v1/jobs/{job_id}/result")
    if early.status_code == 409:
        assert early.json()["code"] == "JOB_NOT_READY"
    else:
        assert early.status_code == 200


def test_echo_request_id(client: TestClient):
    res = client.get("/api/health", headers={"X-Request-Id": "client-rid-1"})
    assert res.headers.get("X-Request-Id") == "client-rid-1"
