# AI model weights (downloaded by scripts/setup_ai_models.py)
# Do not commit .pth / .pt / .pkl files.

Place downloaded checkpoints here:

```
models/
  realesrgan/RealESRGAN_x4plus.pth
  realesrgan/RealESRGAN_x2plus.pth
  sam2/sam2.1_hiera_tiny.pt          # optional if using Hugging Face
  groundingdino/groundingdino_swint_ogc.pth  # optional if using Transformers
  rife/train_log/flownet.pkl
  rife/train_log/RIFE_HDv3.py        # from Practical-RIFE model zip
```

Run:

```bash
pip install -r requirements-ai.txt
pip install "git+https://github.com/facebookresearch/sam2.git"
python scripts/setup_ai_models.py
```
