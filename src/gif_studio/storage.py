"""S3-compatible object storage helpers (MinIO, AWS S3, R2, etc.)."""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import BinaryIO
from uuid import uuid4


def storage_configured() -> bool:
    return bool(os.environ.get("S3_BUCKET") or os.environ.get("GIF_STUDIO_S3_BUCKET"))


def _bucket() -> str:
    return os.environ.get("S3_BUCKET") or os.environ.get("GIF_STUDIO_S3_BUCKET") or "gif-studio"


def _endpoint() -> str | None:
    return os.environ.get("S3_ENDPOINT") or os.environ.get("GIF_STUDIO_S3_ENDPOINT")


@lru_cache(maxsize=1)
def _client():
    if not storage_configured():
        return None
    try:
        import boto3
    except ImportError as exc:
        raise RuntimeError("boto3 is required for S3 storage — pip install boto3") from exc

    kwargs: dict = {
        "service_name": "s3",
        "aws_access_key_id": os.environ.get("S3_ACCESS_KEY") or os.environ.get("AWS_ACCESS_KEY_ID"),
        "aws_secret_access_key": os.environ.get("S3_SECRET_KEY") or os.environ.get("AWS_SECRET_ACCESS_KEY"),
        "region_name": os.environ.get("S3_REGION") or os.environ.get("AWS_DEFAULT_REGION") or "us-east-1",
    }
    endpoint = _endpoint()
    if endpoint:
        kwargs["endpoint_url"] = endpoint
    return boto3.client(**kwargs)


def local_storage_dir() -> Path:
    root = Path(os.environ.get("GIF_STUDIO_LOCAL_STORAGE", ".gif-studio-storage"))
    root.mkdir(parents=True, exist_ok=True)
    return root.resolve()


def _safe_local_path(key: str) -> Path:
    """Resolve a local:// key under the storage root; reject path traversal."""
    raw = key.removeprefix("local://") if key.startswith("local://") else key
    if not raw or raw.startswith("/") or Path(raw).is_absolute() or ".." in Path(raw).parts:
        raise ValueError(f"Invalid local storage key: {key!r}")
    root = local_storage_dir()
    path = (root / raw).resolve()
    if not path.is_relative_to(root):
        raise ValueError(f"Invalid local storage key: {key!r}")
    return path


def put_bytes(data: bytes, *, key: str | None = None, content_type: str = "application/octet-stream") -> str:
    object_key = key or f"uploads/{uuid4().hex}"
    client = _client()
    if client is None:
        path = _safe_local_path(object_key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return f"local://{object_key}"

    client.put_object(Bucket=_bucket(), Key=object_key, Body=data, ContentType=content_type)
    return object_key


def put_file(fileobj: BinaryIO, *, key: str | None = None, content_type: str = "application/octet-stream") -> str:
    return put_bytes(fileobj.read(), key=key, content_type=content_type)


def get_bytes(key: str) -> bytes:
    if key.startswith("local://"):
        return _safe_local_path(key).read_bytes()
    client = _client()
    if client is None:
        raise FileNotFoundError(key)
    obj = client.get_object(Bucket=_bucket(), Key=key)
    return obj["Body"].read()


def presign_url(key: str, expires: int = 3600) -> str | None:
    if key.startswith("local://"):
        return None
    client = _client()
    if client is None:
        return None
    return client.generate_presigned_url(
        "get_object",
        Params={"Bucket": _bucket(), "Key": key},
        ExpiresIn=expires,
    )
