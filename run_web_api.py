from __future__ import annotations

import sys
from pathlib import Path

import uvicorn

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "src"))


if __name__ == "__main__":
    uvicorn.run("gif_studio.web_api:app", host="127.0.0.1", port=8000, reload=False)
