# AI model weights (local only)

Downloaded by `python scripts/setup_ai_models.py` or `npm run setup`.
Do not commit `.pth` / `.pt` / `.pkl` files.

Runtime inference uses files under this folder and never fetches model weights.

```
models/
  realesrgan/          # fixed RealESRGAN_x2plus.pth + RealESRGAN_x4plus.pth
  sam2/                # fixed sam2.1_hiera_large.pt checkpoint
  groundingdino/       # fixed Swin-B checkpoint + local BERT text encoder
  matte/               # fixed birefnet-general.onnx soft-edge model
  lama/                # big-lama.pt FULL Places erase (~206 MB, not lite)
                       # MD5 e3aa4aaa15225a33ec84f9f4bc47e500
```

```bash
pip install -r requirements-ai.txt
pip install 'git+https://github.com/facebookresearch/sam2.git'
pip install rembg
python scripts/setup_ai_models.py
# Or install just the fixed selection stack:
python scripts/setup_ai_models.py --selection-only
```

Point cut uses SAM 2.1 Large directly. Prompt selection has one backend-only
stack: Grounding DINO Swin-B → SAM 2.1 Large → BiRefNet. There are no model
variants or selectors in the editor. Model weights are installed during setup;
runtime inference never downloads them.

Upscaling has exactly two fixed choices: Real-ESRGAN ×2 and Real-ESRGAN ×4.

Device auto-selects **CUDA → MPS → CPU**. Override with `IMAGE_STUDIO_TORCH_DEVICE=cpu|cuda|mps`.

Build contracts: [`BUILD_SPEC.md`](../BUILD_SPEC.md). Check `/api/health` for
`device` and `models.*.ready`.
