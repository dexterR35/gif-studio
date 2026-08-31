"""Tests for /api/v1 jobs API through an in-process async ASGI transport."""

from __future__ import annotations

import asyncio

import pytest

pytest.importorskip("fastapi")
httpx = pytest.importorskip("httpx")

from image_studio.api.job_store import job_store  # noqa: E402
from image_studio.web_api import app  # noqa: E402

pytestmark = pytest.mark.anyio


@pytest.fixture()
def anyio_backend():
    return "asyncio"


@pytest.fixture()
async def client():
    # Fresh-ish store between tests: clear internal maps
    job_store._jobs.clear()
    job_store._idempotency.clear()
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as value:
        yield value


async def test_health_still_works(client: httpx.AsyncClient):
    res = await client.get("/api/health")
    assert res.status_code == 200
    assert "status" in res.json()
    assert res.headers.get("X-Request-Id")


async def test_create_and_get_job(client: httpx.AsyncClient):
    res = await client.post("/api/v1/jobs", json={"kind": "demo", "params": {"x": 1}})
    assert res.status_code == 200
    body = res.json()
    assert body["job_id"]
    assert body["status"] in {"queued", "running", "succeeded"}
    assert res.headers.get("X-Request-Id")

    job_id = body["job_id"]
    # Wait for in-memory runner
    for _ in range(50):
        status = (await client.get(f"/api/v1/jobs/{job_id}")).json()
        if status["status"] in {"succeeded", "failed", "cancelled"}:
            break
        await asyncio.sleep(0.02)
    assert status["status"] == "succeeded"

    result = await client.get(f"/api/v1/jobs/{job_id}/result")
    assert result.status_code == 200
    payload = result.json()
    assert payload["result"]["kind"] == "demo"
    assert payload["result"]["echo_params"]["x"] == 1


async def test_cancel_job(client: httpx.AsyncClient):
    res = await client.post("/api/v1/jobs", json={"kind": "hang", "params": {}})
    job_id = res.json()["job_id"]
    await asyncio.sleep(0.02)
    cancel = await client.post(f"/api/v1/jobs/{job_id}/cancel")
    assert cancel.status_code == 200
    assert cancel.json()["status"] == "cancelled"


async def test_missing_job_problem_json(client: httpx.AsyncClient):
    res = await client.get("/api/v1/jobs/does-not-exist")
    assert res.status_code == 404
    assert "problem+json" in res.headers.get("content-type", "")
    body = res.json()
    assert body["code"] == "JOB_NOT_FOUND"
    assert body.get("request_id") or res.headers.get("X-Request-Id")


async def test_result_conflict_while_running(client: httpx.AsyncClient):
    # Create job then immediately ask for result — may be 409 if not done
    res = await client.post("/api/v1/jobs", json={"kind": "demo2", "params": {}})
    job_id = res.json()["job_id"]
    early = await client.get(f"/api/v1/jobs/{job_id}/result")
    if early.status_code == 409:
        assert early.json()["code"] == "JOB_NOT_READY"
    else:
        assert early.status_code == 200


async def test_echo_request_id(client: httpx.AsyncClient):
    res = await client.get("/api/health", headers={"X-Request-Id": "client-rid-1"})
    assert res.headers.get("X-Request-Id") == "client-rid-1"
