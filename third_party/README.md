# Third-party AI source trees

Populated by `python scripts/setup_ai_models.py` (not committed as weights).

| Folder | Upstream | When |
|--------|----------|------|
| `GroundingDINO/` | IDEA-Research/GroundingDINO | Model setup |

Grounding DINO weights, config, and BERT files live under `models/groundingdino/`.
The editable source clone provides the official Swin-B runtime used to ground text
before SAM 2.1 Large and BiRefNet produce the final contour.

```bash
# Typical setup (from repo root, venv active):
pip install -r requirements-ai.txt
pip install "git+https://github.com/facebookresearch/sam2.git"
python scripts/setup_ai_models.py
```

Do not commit `.pt` / `.pth` / large clones. See [models/README.md](../models/README.md).
