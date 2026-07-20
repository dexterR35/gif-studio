from __future__ import annotations

import os
import sys
from pathlib import Path

import uvicorn

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "src"))


if __name__ == "__main__":
    host = os.environ.get("GIF_STUDIO_API_HOST", "127.0.0.1")
    port = int(os.environ.get("GIF_STUDIO_API_PORT", "8000"))
    # Default on for local dev so new routes (e.g. /api/models/install) load without a manual restart.
    reload = os.environ.get("GIF_STUDIO_API_RELOAD", "1").strip().lower() in {"1", "true", "yes"}
    uvicorn.run(
        "gif_studio.web_api:app",
        host=host,
        port=port,
        reload=reload,
        reload_dirs=[str(ROOT / "src")] if reload else None,
    )
