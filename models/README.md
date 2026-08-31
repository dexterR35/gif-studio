# AI model weights (local only)

Downloaded by `python scripts/setup_ai_models.py` or `npm run setup`.
Do not commit `.pth` / `.pt` / `.pkl` files.

Runtime inference uses files under this folder and never fetches model weights.

```
models/
  realesrgan/          # Real-ESRGAN / ESRGAN / anime
  sam2/                # fixed sam2.1_hiera_large.pt checkpoint
  groundingdino/       # fixed Swin-B checkpoint + local BERT text encoder
  matte/               # optional BiRefNet / RMBG ONNX (rembg also caches)
  lama/                # big-lama.pt FULL Places erase (~206 MB, not lite)
                       # MD5 e3aa4aaa15225a33ec84f9f4bc47e500
  gfpgan/              # GFPGANv1.4.pth face polish slot
```

```bash
pip install -r requirements-ai.txt
pip install 'git+https://github.com/facebookresearch/sam2.git'
pip install rembg
python scripts/setup_ai_models.py
# Or install just the fixed prompt-selection stack:
python scripts/setup_ai_models.py --selection-only
```

Prompt selection has one backend-only stack: Grounding DINO Swin-B followed by
SAM 2.1 Large. There are no model variants or selectors in the editor.

Device auto-selects **CUDA → MPS → CPU**. Override with `IMAGE_STUDIO_TORCH_DEVICE=cpu|cuda|mps`.

Build contracts: [`BUILD_SPEC.md`](../BUILD_SPEC.md). Check `/api/health` for
`device` and `models.*.ready`.
