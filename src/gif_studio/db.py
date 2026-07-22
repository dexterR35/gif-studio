"""PostgreSQL models for GIF Studio projects.

Uses SQLAlchemy when installed and DATABASE_URL is set. Otherwise callers
fall back to in-memory / client-side behaviour.
"""

from __future__ import annotations

import os
from datetime import datetime
from typing import Any
from uuid import uuid4

try:
    from sqlalchemy import JSON, DateTime, String, create_engine
    from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

    _HAS_SA = True
except ImportError:
    _HAS_SA = False
    JSON = DateTime = String = create_engine = None  # type: ignore
    DeclarativeBase = object  # type: ignore
    Mapped = Any  # type: ignore
    mapped_column = sessionmaker = None  # type: ignore


if _HAS_SA:
    class Base(DeclarativeBase):
        pass

    class Project(Base):
        __tablename__ = "projects"

        id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
        name: Mapped[str] = mapped_column(String(255), default="Untitled")
        document: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
        created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
        updated_at: Mapped[datetime] = mapped_column(
            DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
        )
else:
    Base = Project = None  # type: ignore


_engine = None
_SessionLocal = None


def database_url() -> str | None:
    return os.environ.get("DATABASE_URL") or os.environ.get("GIF_STUDIO_DATABASE_URL")


def get_engine():
    global _engine, _SessionLocal
    if not _HAS_SA:
        return None
    url = database_url()
    if not url:
        return None
    if _engine is None:
        _engine = create_engine(url, pool_pre_ping=True)
        _SessionLocal = sessionmaker(bind=_engine, autoflush=False, autocommit=False)
        Base.metadata.create_all(_engine)
    return _engine


def get_session():
    if get_engine() is None:
        return None
    return _SessionLocal()


def db_available() -> bool:
    return _HAS_SA and database_url() is not None
