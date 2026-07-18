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
    uvicorn.run("gif_studio.web_api:app", host=host, port=port, reload=False)
