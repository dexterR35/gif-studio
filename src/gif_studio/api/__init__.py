"""Versioned FastAPI routers and schemas for GIF Studio."""

from .jobs_router import router as jobs_router

__all__ = ["jobs_router"]
