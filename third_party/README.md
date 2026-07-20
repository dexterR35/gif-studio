# Third-party AI source trees

Populated by `python scripts/setup_ai_models.py` (not committed as weights).

| Folder | Upstream | When |
|--------|----------|------|
| `Practical-RIFE/` | https://github.com/hzwer/Practical-RIFE | Default RIFE clone (`RIFE_REPO`) |
| `ECCV2022-RIFE/` | https://github.com/hzwer/ECCV2022-RIFE | Optional alternate |
| `sam3/` | facebookresearch/sam3 (gated) | Only with `--with-sam3` |

Grounding DINO weights/config live primarily under `models/groundingdino/` (Transformers / local ckpts). An editable GroundingDINO clone is **optional**, not required by the default setup script.

```bash
# Typical setup (from repo root, venv active):
pip install -r requirements-ai.txt
pip install "git+https://github.com/facebookresearch/sam2.git"
python scripts/setup_ai_models.py --tiny-only   # lighter
# or: python scripts/setup_ai_models.py          # fuller catalog
```

Do not commit `.pt` / `.pth` / large clones. See [models/README.md](../models/README.md).
