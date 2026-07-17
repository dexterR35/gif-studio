from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from .models import AnimationSettings, GifMetadata


def sha256_file(path: str | Path, chunk_size: int = 1024 * 1024) -> str:
    digest = hashlib.sha256()
    with Path(path).open("rb") as stream:
        while chunk := stream.read(chunk_size):
            digest.update(chunk)
    return digest.hexdigest()


def build_sidecar_payload(
    source_path: str | Path,
    output_path: str | Path,
    settings: AnimationSettings,
    metadata: GifMetadata,
) -> dict[str, Any]:
    source = Path(source_path).expanduser().resolve()
    output = Path(output_path).expanduser().resolve()
    return {
        "schema_version": 1,
        "generated_at_utc": datetime.now(UTC).isoformat(),
        "generator": "GIF Studio",
        "source": {
            "filename": source.name,
            "sha256": sha256_file(source),
        },
        "output": {
            "filename": output.name,
            "format": "GIF89a",
        },
        "metadata": metadata.to_dict(),
        "settings": settings.to_dict(),
    }


def write_sidecar_json(
    source_path: str | Path,
    output_path: str | Path,
    settings: AnimationSettings,
    metadata: GifMetadata,
) -> Path:
    output = Path(output_path).expanduser().resolve()
    sidecar = output.with_suffix(output.suffix + ".json")
    payload = build_sidecar_payload(source_path, output, settings, metadata)
    sidecar.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    return sidecar
