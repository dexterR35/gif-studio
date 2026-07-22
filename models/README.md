# AI model weights (local only)

Downloaded by `python scripts/setup_ai_models.py` or `npm run setup`.
Do not commit `.pth` / `.pt` / `.pkl` files.

Runtime inference uses files under this folder — **not** the Hugging Face Hub
(unless you explicitly set `GIF_STUDIO_ALLOW_HF=1`).

```
models/
  realesrgan/          # Real-ESRGAN / ESRGAN / anime
  sam2/                # SAM 2.1 checkpoints
  sam3/                # SAM 3 / 3.1 (gated HF — optional)
  groundingdino/       # Grounding DINO + BERT / HF snapshots
  matte/               # optional BiRefNet / RMBG ONNX (rembg also caches)
  depth/
    v2-small-hf/       # Depth Anything V2 Small (Transformers snapshot)
  rife/train_log/      # RIFE flownet
  gfpgan/              # GFPGANv1.4.pth face polish slot
```

```bash
pip install -r requirements-ai.txt
pip install 'git+https://github.com/facebookresearch/sam2.git'
pip install rembg
python scripts/setup_ai_models.py --tiny-only
# SAM3 (optional, gated Hub — request access + hf auth login first):
# https://huggingface.co/facebook/sam3
python scripts/setup_ai_models.py --with-sam3
```

`--with-sam3` clones `third_party/sam3`, `pip install -e`, and downloads `sam3.pt` into `models/sam3/`. Until that succeeds, the AI panel shows SAM 3 as missing — use SAM 2.

Device auto-selects **CUDA → MPS → CPU**. Override with `GIF_STUDIO_TORCH_DEVICE=cpu|cuda|mps`.

Build / AI contracts: [`docs/GIF_STUDIO_MEGA_SENIOR_BUILD.md`](../docs/GIF_STUDIO_MEGA_SENIOR_BUILD.md) (§10).  
Check `/api/health` for `device` and `models.*.ready`.
