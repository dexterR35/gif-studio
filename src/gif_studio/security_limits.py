"""Production HTTP + AI resource limiters (backend only).

Layers
------
1. Per-IP sliding windows on heavy routes (abuse / DoS)
2. Global AI / export job queue (one heavy job at a time by default)
3. Free-RAM / VRAM gate before a job starts (prevents OOM)
4. Memory cleanup after each job (gc + torch empty_cache)
5. Per-route cooldowns between AI starts (anti-spam)

Env (all optional)
------------------
GIF_STUDIO_RATE_LIMIT_ENABLED=1
GIF_STUDIO_TRUST_PROXY=0
GIF_STUDIO_RATE_LIMIT_AI=8/minute
GIF_STUDIO_RATE_LIMIT_HEAVY=3/minute
GIF_STUDIO_RATE_LIMIT_EXPORT=12/minute
GIF_STUDIO_RATE_LIMIT_POST=60/minute
GIF_STUDIO_AI_MAX_CONCURRENT=1
GIF_STUDIO_AI_QUEUE_WAIT_S=120
GIF_STUDIO_MIN_FREE_RAM_GIB=3.0
GIF_STUDIO_MIN_FREE_VRAM_GIB=0.35
GIF_STUDIO_UNLOAD_MODELS=1
GIF_STUDIO_AI_COOLDOWN_<ROUTE>=seconds   e.g. UPSCALE, DETECT
GIF_STUDIO_RAM_RESERVE_<ROUTE>_GIB=…    override per-route RAM floor
"""

from __future__ import annotations

import asyncio
import os
import time
from collections import defaultdict, deque
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from typing import Deque

from fastapi import HTTPException, Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse, Response
from starlette.types import ASGIApp

from .resource_guard import (
    check_memory_for_route,
    memory_snapshot,
    release_inference_memory,
    route_reserve_bytes,
)


def _env_bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _parse_limit(spec: str, default_count: int, default_window: float) -> tuple[int, float]:
    """Parse ``N/minute``, ``N/second``, ``N/hour``, or bare ``N`` (per minute)."""
    text = (spec or "").strip().lower()
    if not text:
        return default_count, default_window
    if "/" in text:
        count_s, unit = text.split("/", 1)
        try:
            count = max(1, int(count_s))
        except ValueError:
            return default_count, default_window
        unit = unit.strip()
        if unit.startswith("sec"):
            return count, 1.0
        if unit.startswith("hour"):
            return count, 3600.0
        return count, 60.0
    try:
        return max(1, int(text)), default_window
    except ValueError:
        return default_count, default_window


RATE_LIMIT_ENABLED = _env_bool("GIF_STUDIO_RATE_LIMIT_ENABLED", True)
TRUST_PROXY = _env_bool("GIF_STUDIO_TRUST_PROXY", False)

_AI_COUNT, _AI_WINDOW = _parse_limit(
    os.environ.get("GIF_STUDIO_RATE_LIMIT_AI", "8/minute"), 8, 60.0
)
_HEAVY_COUNT, _HEAVY_WINDOW = _parse_limit(
    os.environ.get("GIF_STUDIO_RATE_LIMIT_HEAVY", "3/minute"), 3, 60.0
)
_EXPORT_COUNT, _EXPORT_WINDOW = _parse_limit(
    os.environ.get("GIF_STUDIO_RATE_LIMIT_EXPORT", "12/minute"), 12, 60.0
)
_POST_COUNT, _POST_WINDOW = _parse_limit(
    os.environ.get("GIF_STUDIO_RATE_LIMIT_POST", "60/minute"), 60, 60.0
)

# One heavy inference at a time by default.
_AI_MAX = max(1, int(os.environ.get("GIF_STUDIO_AI_MAX_CONCURRENT", "1")))
# How long a request may wait in the queue for a free slot / free memory.
_QUEUE_WAIT_S = max(5.0, float(os.environ.get("GIF_STUDIO_AI_QUEUE_WAIT_S", "120")))

_DEFAULT_COOLDOWN_S: dict[str, float] = {
    "smart_segment": 1.0,
    "segment": 1.0,
    "detect": 1.5,
    "matte": 1.5,
    "upscale": 4.0,
    "export": 2.0,
}

_AI_PATHS = {
    "/api/segment": ("ai", "smart_segment"),
    "/api/ai/detect": ("ai", "detect"),
    "/api/ai/matte": ("ai", "matte"),
    "/api/ai/upscale": ("heavy", "upscale"),
}

_EXPORT_PATHS = {"/api/export", "/api/optimize-png"}

_sem = asyncio.Semaphore(_AI_MAX)
_gate = asyncio.Lock()
_last_start: dict[str, float] = {}
_busy_route: str | None = None
_waiters = 0
_jobs_completed = 0
_last_cleanup: dict[str, object] | None = None

# ip -> bucket_key -> timestamps
_windows: dict[str, dict[str, Deque[float]]] = defaultdict(lambda: defaultdict(deque))
_windows_lock = asyncio.Lock()
_MAX_TRACKED_IPS = 4096


def _cooldown(route: str) -> float:
    env_key = f"GIF_STUDIO_AI_COOLDOWN_{route.upper()}"
    raw = os.environ.get(env_key)
    if raw is not None:
        try:
            return max(0.0, float(raw))
        except ValueError:
            pass
    return _DEFAULT_COOLDOWN_S.get(route, 1.0)


def client_ip(request: Request) -> str:
    if TRUST_PROXY:
        forwarded = request.headers.get("x-forwarded-for") or ""
        first = forwarded.split(",")[0].strip()
        if first:
            return first[:64]
        real = (request.headers.get("x-real-ip") or "").strip()
        if real:
            return real[:64]
    host = request.client.host if request.client else None
    return (host or "unknown")[:64]


def rate_limit_status() -> dict[str, object]:
    return {
        "enabled": RATE_LIMIT_ENABLED,
        "trust_proxy": TRUST_PROXY,
        "max_concurrent_ai": _AI_MAX,
        "queue_wait_s": _QUEUE_WAIT_S,
        "queue_waiting": _waiters,
        "busy": _busy_route,
        "jobs_completed": _jobs_completed,
        "last_cleanup": _last_cleanup,
        "memory": memory_snapshot(),
        "ram_reserves_bytes": {
            route: route_reserve_bytes(route) for route in _DEFAULT_COOLDOWN_S
        },
        "cooldowns_s": {route: _cooldown(route) for route in _DEFAULT_COOLDOWN_S},
        "windows": {
            "ai": {"limit": _AI_COUNT, "window_s": _AI_WINDOW},
            "heavy": {"limit": _HEAVY_COUNT, "window_s": _HEAVY_WINDOW},
            "export": {"limit": _EXPORT_COUNT, "window_s": _EXPORT_WINDOW},
            "post": {"limit": _POST_COUNT, "window_s": _POST_WINDOW},
        },
    }


def _prune_deque(q: Deque[float], now: float, window: float) -> None:
    while q and q[0] <= now - window:
        q.popleft()


async def _hit_window(
    ip: str,
    bucket: str,
    *,
    limit: int,
    window: float,
) -> tuple[bool, int, int]:
    """Record a hit. Returns (allowed, remaining, retry_after_s)."""
    now = time.monotonic()
    async with _windows_lock:
        if len(_windows) > _MAX_TRACKED_IPS and ip not in _windows:
            # Drop oldest-looking keys (arbitrary eviction under abuse).
            for stale in list(_windows.keys())[: max(1, len(_windows) // 10)]:
                _windows.pop(stale, None)

        q = _windows[ip][bucket]
        _prune_deque(q, now, window)
        if len(q) >= limit:
            retry = max(1, int(window - (now - q[0]) + 0.999))
            return False, 0, retry
        q.append(now)
        remaining = max(0, limit - len(q))
        return True, remaining, 0


def _limit_response(
    detail: str,
    *,
    retry_after: int,
    limit: int,
    remaining: int,
    window: float,
) -> JSONResponse:
    return JSONResponse(
        status_code=429,
        content={"detail": detail},
        headers={
            "Retry-After": str(max(1, retry_after)),
            "X-RateLimit-Limit": str(limit),
            "X-RateLimit-Remaining": str(max(0, remaining)),
            "X-RateLimit-Window": str(int(window)),
        },
    )


class SecurityRateLimitMiddleware(BaseHTTPMiddleware):
    """Per-IP sliding-window limits for POST / AI / export routes."""

    def __init__(self, app: ASGIApp) -> None:
        super().__init__(app)

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        if not RATE_LIMIT_ENABLED or request.method not in {"POST", "PUT", "DELETE"}:
            return await call_next(request)

        path = request.url.path.rstrip("/") or "/"
        # Normalize trailing slash variants used above
        lookup = path if path in _AI_PATHS or path in _EXPORT_PATHS else path

        ip = client_ip(request)
        checks: list[tuple[str, int, float, str]] = [
            ("post", _POST_COUNT, _POST_WINDOW, "Too many requests"),
        ]

        ai_meta = _AI_PATHS.get(lookup) or _AI_PATHS.get(path)
        if ai_meta:
            kind, _route = ai_meta
            if kind == "heavy":
                checks.append(
                    ("heavy", _HEAVY_COUNT, _HEAVY_WINDOW, "Heavy AI rate limit exceeded")
                )
            checks.append(("ai", _AI_COUNT, _AI_WINDOW, "AI rate limit exceeded"))
        elif lookup in _EXPORT_PATHS or path in _EXPORT_PATHS:
            checks.append(
                ("export", _EXPORT_COUNT, _EXPORT_WINDOW, "Export rate limit exceeded")
            )

        for bucket, limit, window, message in checks:
            allowed, remaining, retry = await _hit_window(
                ip, bucket, limit=limit, window=window
            )
            if not allowed:
                return _limit_response(
                    f"{message}. Try again in {retry}s.",
                    retry_after=retry,
                    limit=limit,
                    remaining=remaining,
                    window=window,
                )

        response = await call_next(request)
        # Advertise the tightest AI window when applicable
        if ai_meta:
            kind = ai_meta[0]
            limit, window = (
                (_HEAVY_COUNT, _HEAVY_WINDOW)
                if kind == "heavy"
                else (_AI_COUNT, _AI_WINDOW)
            )
            response.headers.setdefault("X-RateLimit-Limit", str(limit))
            response.headers.setdefault("X-RateLimit-Window", str(int(window)))
        return response


async def _cooldown_or_429(route: str) -> None:
    now = time.monotonic()
    cd = _cooldown(route)
    async with _gate:
        last = _last_start.get(route, 0.0)
        wait = last + cd - now
        if wait > 0:
            retry = max(1, int(wait + 0.999))
            raise HTTPException(
                status_code=429,
                detail=(
                    f"Rate limited: wait {wait:.1f}s before another {route} request "
                    "(protects CPU/GPU)."
                ),
                headers={"Retry-After": str(retry)},
            )


@asynccontextmanager
async def acquire_ai_slot(route: str) -> AsyncIterator[None]:
    """Queue for a global inference/export slot; gate on free memory; cleanup after.

    Waiters sit in an asyncio queue (semaphore) up to ``GIF_STUDIO_AI_QUEUE_WAIT_S``.
    Before the job runs, free RAM (and VRAM for heavy GPU routes) must clear the
    configured floor. After the job, ``release_inference_memory()`` runs.
    """
    global _busy_route, _waiters, _jobs_completed, _last_cleanup

    await _cooldown_or_429(route)

    deadline = time.monotonic() + _QUEUE_WAIT_S
    acquired = False
    _waiters += 1
    try:
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                busy = _busy_route or "inference"
                raise HTTPException(
                    status_code=503,
                    detail=(
                        f"AI queue timed out after {_QUEUE_WAIT_S:.0f}s "
                        f"(busy with {busy}, {_waiters - 1} still waiting). "
                        f"Retry shortly."
                    ),
                    headers={"Retry-After": "5"},
                )

            try:
                await asyncio.wait_for(_sem.acquire(), timeout=min(remaining, 5.0))
                acquired = True
            except asyncio.TimeoutError:
                continue

            ok, retryable, detail = check_memory_for_route(route)
            if ok:
                break

            _sem.release()
            acquired = False
            if not retryable:
                raise HTTPException(
                    status_code=503,
                    detail=detail,
                    headers={"Retry-After": "10"},
                )
            # Another job may free RAM/VRAM — wait and re-enter the queue.
            await asyncio.sleep(1.5)
            if time.monotonic() >= deadline:
                raise HTTPException(
                    status_code=503,
                    detail=f"{detail} (timed out waiting for free memory).",
                    headers={"Retry-After": "10"},
                )

        async with _gate:
            _last_start[route] = time.monotonic()
            _busy_route = route
        try:
            yield
        finally:
            try:
                _last_cleanup = release_inference_memory()
            except Exception:  # noqa: BLE001
                _last_cleanup = {"cleanup": ["error"]}
            _jobs_completed += 1
            async with _gate:
                if _busy_route == route:
                    _busy_route = None
    finally:
        _waiters = max(0, _waiters - 1)
        if acquired:
            _sem.release()
