"""problem+json responses and X-Request-Id middleware helpers."""

from __future__ import annotations

import uuid
from typing import Any, Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response


REQUEST_ID_HEADER = "X-Request-Id"


def new_request_id() -> str:
    return uuid.uuid4().hex


def get_request_id(request: Request) -> str:
    existing = request.headers.get(REQUEST_ID_HEADER) or request.headers.get("x-request-id")
    if existing and existing.strip():
        return existing.strip()
    stored = getattr(request.state, "request_id", None)
    if stored:
        return str(stored)
    rid = new_request_id()
    request.state.request_id = rid
    return rid


def problem_response(
    *,
    status: int,
    title: str,
    detail: str,
    code: str | None = None,
    request_id: str | None = None,
    retryable: bool = False,
    job_id: str | None = None,
    extra: dict[str, Any] | None = None,
) -> JSONResponse:
    body: dict[str, Any] = {
        "type": "about:blank",
        "title": title,
        "status": status,
        "detail": detail,
        "retryable": retryable,
    }
    if code:
        body["code"] = code
    if request_id:
        body["request_id"] = request_id
    if job_id:
        body["job_id"] = job_id
    if extra:
        body.update(extra)
    headers = {}
    if request_id:
        headers[REQUEST_ID_HEADER] = request_id
    return JSONResponse(
        status_code=status,
        content=body,
        media_type="application/problem+json",
        headers=headers,
    )


class RequestIdMiddleware(BaseHTTPMiddleware):
    """Ensure every response carries X-Request-Id (echo client or generate)."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        request_id = get_request_id(request)
        request.state.request_id = request_id
        response = await call_next(request)
        if REQUEST_ID_HEADER not in response.headers:
            response.headers[REQUEST_ID_HEADER] = request_id
        return response
