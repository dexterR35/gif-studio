"""PostgreSQL models for GIF Studio projects, assets, and jobs.

Uses SQLAlchemy when installed and DATABASE_URL is set. Otherwise callers
fall back to in-memory / local filesystem behaviour.
"""

from __future__ import annotations

import os
from datetime import datetime
from typing import Any
from uuid import uuid4

try:
    from sqlalchemy import JSON, DateTime, Integer, String, Text, create_engine
    from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

    _HAS_SA = True
except ImportError:
    _HAS_SA = False
    JSON = DateTime = Integer = String = Text = create_engine = None  # type: ignore
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

    class Asset(Base):
        __tablename__ = "assets"

        id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
        project_id: Mapped[str] = mapped_column(String(36), index=True)
        kind: Mapped[str] = mapped_column(String(64), default="image")
        storage_key: Mapped[str] = mapped_column(String(512))
        filename: Mapped[str] = mapped_column(String(255), default="")
        width: Mapped[int] = mapped_column(Integer, default=0)
        height: Mapped[int] = mapped_column(Integer, default=0)
        bytes: Mapped[int] = mapped_column(Integer, default=0)
        created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    class Job(Base):
        __tablename__ = "jobs"

        id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
        project_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
        kind: Mapped[str] = mapped_column(String(64))
        status: Mapped[str] = mapped_column(String(32), default="queued")
        progress: Mapped[int] = mapped_column(Integer, default=0)
        result: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
        error: Mapped[str | None] = mapped_column(Text, nullable=True)
        created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
        updated_at: Mapped[datetime] = mapped_column(
            DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
        )
else:
    Base = Project = Asset = Job = None  # type: ignore


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
