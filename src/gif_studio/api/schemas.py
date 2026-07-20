"""Pydantic models for /api/v1 jobs."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class JobCreate(BaseModel):
    kind: str = Field(..., min_length=1, description="Job operation kind")
    params: dict[str, Any] = Field(default_factory=dict)
    idempotency_key: str | None = None


class JobStatus(BaseModel):
    job_id: str
    kind: str
    status: str
    progress: float = 0.0
    error: str | None = None
    created_at: float = 0.0
    updated_at: float = 0.0


class ProblemDetail(BaseModel):
    type: str = "about:blank"
    title: str
    status: int
    detail: str
    code: str | None = None
    request_id: str | None = None
    retryable: bool = False
    job_id: str | None = None


class ModelsInstallRequest(BaseModel):
    """POST /api/models/install — download local AI weights."""

    profile: str = Field(
        default="recommended",
        description="'recommended' (--tiny-only) or 'full'",
    )
    with_sam3: bool = Field(
        default=False,
        description="Also install gated facebook/sam3 (requires HF login)",
    )
    install_packages: bool = Field(
        default=True,
        description="pip install SAM2 package when missing",
    )
