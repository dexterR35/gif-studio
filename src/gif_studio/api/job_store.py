"""In-memory job dictionary with cooperative cancel events."""

from __future__ import annotations

import threading
import time
import uuid
from dataclasses import dataclass, field
from typing import Any


@dataclass
class JobRecord:
    job_id: str
    kind: str
    params: dict[str, Any]
    status: str = "queued"
    progress: float = 0.0
    error: str | None = None
    result: Any | None = None
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)
    cancel_event: threading.Event = field(default_factory=threading.Event)

    def touch(self) -> None:
        self.updated_at = time.time()

    def to_status(self) -> dict[str, Any]:
        return {
            "job_id": self.job_id,
            "kind": self.kind,
            "status": self.status,
            "progress": self.progress,
            "error": self.error,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }


class JobStore:
    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._jobs: dict[str, JobRecord] = {}
        self._idempotency: dict[str, str] = {}

    def create(self, kind: str, params: dict[str, Any], idempotency_key: str | None = None) -> JobRecord:
        with self._lock:
            if idempotency_key and idempotency_key in self._idempotency:
                existing_id = self._idempotency[idempotency_key]
                existing = self._jobs.get(existing_id)
                if existing is not None:
                    return existing
            job_id = uuid.uuid4().hex
            record = JobRecord(job_id=job_id, kind=kind, params=dict(params or {}))
            self._jobs[job_id] = record
            if idempotency_key:
                self._idempotency[idempotency_key] = job_id
            return record

    def get(self, job_id: str) -> JobRecord | None:
        with self._lock:
            return self._jobs.get(job_id)

    def cancel(self, job_id: str) -> JobRecord | None:
        with self._lock:
            record = self._jobs.get(job_id)
            if record is None:
                return None
            if record.status in {"succeeded", "failed", "cancelled"}:
                return record
            record.cancel_event.set()
            record.status = "cancelled"
            record.error = "cancelled"
            record.touch()
            return record

    def set_running(self, job_id: str) -> None:
        with self._lock:
            record = self._jobs.get(job_id)
            if record is None or record.status == "cancelled":
                return
            record.status = "running"
            record.touch()

    def set_progress(self, job_id: str, progress: float) -> None:
        with self._lock:
            record = self._jobs.get(job_id)
            if record is None:
                return
            record.progress = max(0.0, min(1.0, float(progress)))
            record.touch()

    def set_succeeded(self, job_id: str, result: Any) -> None:
        with self._lock:
            record = self._jobs.get(job_id)
            if record is None or record.status == "cancelled":
                return
            record.status = "succeeded"
            record.progress = 1.0
            record.result = result
            record.touch()

    def set_failed(self, job_id: str, error: str) -> None:
        with self._lock:
            record = self._jobs.get(job_id)
            if record is None or record.status == "cancelled":
                return
            record.status = "failed"
            record.error = error
            record.touch()


# Process-wide store for the local API process.
job_store = JobStore()
