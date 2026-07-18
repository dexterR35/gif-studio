# AI model weights (local only)

Downloaded by `python scripts/setup_ai_models.py`. Do not commit `.pth` / `.pt` / `.pkl` files.

Runtime inference uses files under this folder — **not** the Hugging Face Hub
(unless you explicitly set `GIF_STUDIO_ALLOW_HF=1`).

```
models/
  realesrgan/
    RealESRGAN_x4plus.pth
    RealESRGAN_x2plus.pth
    ESRGAN_SRx4_DF2KOST_official-ff704c30.pth
    RealESRGAN_x4plus_anime_6B.pth
  sam2/
    sam2.1_hiera_tiny.pt
    sam2.1_hiera_small.pt
    sam2.1_hiera_base_plus.pt
    sam2.1_hiera_large.pt
  groundingdino/
    groundingdino_swint_ogc.pth          # official GitHub .pth (primary)
    GroundingDINO_SwinT_OGC.py
    groundingdino_swinb_cogcoor.pth
    GroundingDINO_SwinB_cfg.py
    bert-base-uncased/                   # text encoder (local)
    hf-tiny/  hf-base/                   # optional Transformers snapshots
  yolo/                                  # Ultralytics — https://github.com/ultralytics/ultralytics
    yolov8n.pt
    yolov8s.pt
    yolov8m.pt
    yolo11n.pt
  rife/train_log/flownet.pkl
```

```bash
pip install -r requirements-ai.txt
pip install 'git+https://github.com/facebookresearch/sam2.git'
pip install ultralytics
python scripts/setup_ai_models.py
```

Device auto-selects **CUDA → MPS → CPU**. Override with `GIF_STUDIO_TORCH_DEVICE=cpu|cuda|mps`.

Check `/api/health` for `device` and `models.*.ready`.
