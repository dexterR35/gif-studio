# Third-party AI source trees

`scripts/setup_ai_models.py` clones:

| Folder | Upstream |
|--------|----------|
| `Practical-RIFE/` | https://github.com/hzwer/Practical-RIFE |
| `ECCV2022-RIFE/` | https://github.com/hzwer/ECCV2022-RIFE |

Set `RIFE_REPO=third_party/Practical-RIFE` (default auto-detected).

Optional local installs:

```bash
# SAM 2
git clone https://github.com/facebookresearch/sam2.git
cd sam2 && pip install -e .

# Grounding DINO (if not using transformers HF path)
git clone https://github.com/IDEA-Research/GroundingDINO.git
cd GroundingDINO && pip install -e .
```
