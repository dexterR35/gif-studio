"""APIRouter prefix /api/v1 — async job create/status/cancel/result."""

from __future__ import annotations

import threading
import time
from typing import Any

from fastapi import APIRouter, Request

from .errors import get_request_id, problem_response
from .job_store import JobRecord, job_store
from .schemas import JobCreate, JobStatus

router = APIRouter(prefix="/api/v1", tags=["jobs"])


def _run_job(record: JobRecord) -> None:
    """Minimal in-process runner so jobs reach a terminal state without Celery."""
    if record.cancel_event.is_set():
        return
    job_store.set_running(record.job_id)
    kind = record.kind
    # Cooperative cancel check + tiny progress steps for demo kinds.
    # "hang" / "slow" keep running long enough for cancel tests.
    steps = 200 if kind in {"hang", "slow"} else 4
    delay = 0.05 if kind in {"hang", "slow"} else 0.01
    for i in range(steps):
        if record.cancel_event.is_set():
            return
        time.sleep(delay)
        job_store.set_progress(record.job_id, (i + 1) / steps)
    if record.cancel_event.is_set():
        return
    params = record.params
    result: dict[str, Any] = {
        "kind": kind,
        "echo_params": params,
        "message": f"Job {kind} completed (in-memory runner)",
    }
    job_store.set_succeeded(record.job_id, result)


@router.post("/jobs", response_model=JobStatus)
def create_job(body: JobCreate, request: Request) -> JobStatus | Any:
    record = job_store.create(
        kind=body.kind,
        params=body.params,
        idempotency_key=body.idempotency_key,
    )
    # Start background work only for newly queued jobs.
    if record.status == "queued" and not record.cancel_event.is_set():
        thread = threading.Thread(target=_run_job, args=(record,), daemon=True)
        thread.start()
    return JobStatus(**record.to_status())


@router.get("/jobs/{job_id}", response_model=JobStatus)
def get_job(job_id: str, request: Request) -> JobStatus | Any:
    record = job_store.get(job_id)
    if record is None:
        return problem_response(
            status=404,
            title="Not Found",
            detail=f"Job {job_id} not found",
            code="JOB_NOT_FOUND",
            request_id=get_request_id(request),
            job_id=job_id,
        )
    return JobStatus(**record.to_status())


@router.post("/jobs/{job_id}/cancel", response_model=JobStatus)
def cancel_job(job_id: str, request: Request) -> JobStatus | Any:
    record = job_store.cancel(job_id)
    if record is None:
        return problem_response(
            status=404,
            title="Not Found",
            detail=f"Job {job_id} not found",
            code="JOB_NOT_FOUND",
            request_id=get_request_id(request),
            job_id=job_id,
        )
    return JobStatus(**record.to_status())


@router.get("/jobs/{job_id}/result")
def get_job_result(job_id: str, request: Request) -> dict[str, Any] | Any:
    record = job_store.get(job_id)
    if record is None:
        return problem_response(
            status=404,
            title="Not Found",
            detail=f"Job {job_id} not found",
            code="JOB_NOT_FOUND",
            request_id=get_request_id(request),
            job_id=job_id,
        )
    if record.status != "succeeded":
        return problem_response(
            status=409,
            title="Conflict",
            detail=f"Job {job_id} is {record.status}; result unavailable",
            code="JOB_NOT_READY",
            request_id=get_request_id(request),
            job_id=job_id,
            retryable=record.status in {"queued", "running"},
        )
    return {
        "job_id": record.job_id,
        "kind": record.kind,
        "status": record.status,
        "result": record.result,
    }
