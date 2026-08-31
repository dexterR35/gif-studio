#!/usr/bin/env python3
"""Download local AI checkpoints (no Hugging Face Hub at runtime).

Weights go under ``models/``. Grounding DINO is cloned to ``third_party/``.

Usage:
  python scripts/setup_ai_models.py
"""

from __future__ import annotations

import argparse
import hashlib
import os
import shutil
import subprocess
import sys
from pathlib import Path
from urllib.request import urlretrieve

ROOT = Path(__file__).resolve().parents[1]
MODELS = ROOT / "models"
THIRD = ROOT / "third_party"

REALESRGAN_URLS = {
    "RealESRGAN_x2plus.pth": (
        "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.1/RealESRGAN_x2plus.pth"
    ),
    "RealESRGAN_x4plus.pth": (
        "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth"
    ),
}

SAM2_LARGE = {
    "file": "sam2.1_hiera_large.pt",
    "url": (
        "https://dl.fbaipublicfiles.com/segment_anything_2/092824/sam2.1_hiera_large.pt"
    ),
}

GROUNDING_DINO_LARGE = {
    "file": "groundingdino_swinb_cogcoor.pth",
    "config": "GroundingDINO_SwinB_cfg.py",
    "url": (
        "https://github.com/IDEA-Research/GroundingDINO/releases/download/"
        "v0.1.0-alpha2/groundingdino_swinb_cogcoor.pth"
    ),
}

BIREFNET = {
    "file": "birefnet-general.onnx",
    "url": (
        "https://github.com/danielgatis/rembg/releases/download/"
        "v0.0.0/BiRefNet-general-epoch_244.onnx"
    ),
    "md5": "7a35a0141cbbc80de11d9c9a28f52697",
}

BERT_RUNTIME_FILES = (
    "config.json",
    "model.safetensors",
    "tokenizer.json",
    "tokenizer_config.json",
    "vocab.txt",
)

# Same torchscript weight lama-cleaner / IOPaint uses for full big-lama erase.
# MD5 e3aa4aaa15225a33ec84f9f4bc47e500 — not a small/lite model.
LAMA_URL = (
    "https://github.com/Sanster/models/releases/download/add_big_lama/big-lama.pt"
)
LAMA_MD5 = "e3aa4aaa15225a33ec84f9f4bc47e500"


def download(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 1024:
        print(f"  skip (exists): {dest.relative_to(ROOT)}")
        return
    print(f"  downloading {url}")
    print(f"    → {dest.relative_to(ROOT)}")
    tmp = dest.with_suffix(dest.suffix + ".part")
    urlretrieve(url, tmp)
    tmp.replace(dest)


def run(cmd: list[str], cwd: Path | None = None) -> None:
    print("  $", " ".join(cmd))
    subprocess.check_call(cmd, cwd=cwd)


def clone_repo(url: str, dest: Path) -> None:
    if dest.exists():
        print(f"  skip (exists): {dest.relative_to(ROOT)}")
        return
    dest.parent.mkdir(parents=True, exist_ok=True)
    run(["git", "clone", "--depth", "1", url, str(dest)])


def patch_grounding_dino_compat() -> None:
    """Patch deprecated inference calls in the pinned upstream checkout."""
    replacements = {
        "groundingdino/models/GroundingDINO/bertwarper.py": (
            ("self.config.use_return_dict", "self.config.return_dict"),
        ),
        "groundingdino/models/GroundingDINO/transformer.py": (
            (
                "torch.cuda.amp.autocast(enabled=False)",
                'torch.amp.autocast("cuda", enabled=False)',
            ),
            (
                "                torch.linspace(0.5, W_ - 0.5, W_, "
                "dtype=torch.float32, device=device),\n"
                "            )",
                "                torch.linspace(0.5, W_ - 0.5, W_, "
                "dtype=torch.float32, device=device),\n"
                '                indexing="ij",\n'
                "            )",
            ),
        ),
        "groundingdino/models/GroundingDINO/backbone/swin_transformer.py": (
            ("from timm.models.layers import", "from timm.layers import"),
            (
                "torch.meshgrid([coords_h, coords_w])",
                'torch.meshgrid([coords_h, coords_w], indexing="ij")',
            ),
        ),
        "groundingdino/models/GroundingDINO/fuse_modules.py": (
            ("from timm.models.layers import", "from timm.layers import"),
        ),
        "groundingdino/models/GroundingDINO/utils.py": (
            (
                "            torch.linspace(0, W_ - 1, W_, "
                "dtype=torch.float32, device=memory.device),\n"
                "        )",
                "            torch.linspace(0, W_ - 1, W_, "
                "dtype=torch.float32, device=memory.device),\n"
                '            indexing="ij",\n'
                "        )",
            ),
            (r"\sum{hw}", "sum(hw)"),
        ),
        "groundingdino/util/box_ops.py": (
            ("torch.meshgrid(y, x)", 'torch.meshgrid(y, x, indexing="ij")'),
        ),
        "groundingdino/util/get_tokenlizer.py": (
            ('    print("final text_encoder_type: {}".format(text_encoder_type))\n', ""),
        ),
    }
    root = THIRD / "GroundingDINO"
    for relative, changes in replacements.items():
        path = root / relative
        if not path.exists():
            continue
        text = path.read_text(encoding="utf-8")
        patched = text
        for old, new in changes:
            patched = patched.replace(old, new)
        if patched != text:
            path.write_text(patched, encoding="utf-8")
            print(f"  patched compatibility → {path.relative_to(ROOT)}")


def setup_realesrgan() -> None:
    print("\n[Real-ESRGAN ×2 / ×4] GitHub releases → models/realesrgan/")
    for name, url in REALESRGAN_URLS.items():
        download(url, MODELS / "realesrgan" / name)


def setup_sam2() -> None:
    print("\n[SAM 2.1 Large] Meta CDN → models/sam2/")
    download(SAM2_LARGE["url"], MODELS / "sam2" / SAM2_LARGE["file"])
    print("  install package: pip install 'git+https://github.com/facebookresearch/sam2.git'")


def file_md5(path: Path) -> str:
    digest = hashlib.md5()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def setup_birefnet() -> None:
    """Install the single fixed matte weight under models/, never at runtime."""
    print("\n[BiRefNet] fixed soft-edge matte → models/matte/")
    dest = MODELS / "matte" / BIREFNET["file"]
    if dest.exists() and file_md5(dest) != BIREFNET["md5"]:
        print("  replacing invalid BiRefNet checkpoint")
        dest.unlink()

    # Reuse rembg's legacy cache when present instead of downloading another 928 MiB.
    xdg_home = Path(os.environ.get("XDG_DATA_HOME", "~")).expanduser()
    legacy = xdg_home / ".u2net" / BIREFNET["file"]
    if not dest.exists() and legacy.exists() and file_md5(legacy) == BIREFNET["md5"]:
        dest.parent.mkdir(parents=True, exist_ok=True)
        print(f"  copying existing cache → {dest.relative_to(ROOT)}")
        shutil.copy2(legacy, dest)

    download(BIREFNET["url"], dest)
    digest = file_md5(dest)
    if digest != BIREFNET["md5"]:
        dest.unlink(missing_ok=True)
        raise RuntimeError(
            f"BiRefNet checkpoint checksum failed ({digest} != {BIREFNET['md5']}); "
            "file removed"
        )
    print(f"  MD5 ok: {digest}")


def setup_lama() -> None:
    print("\n[LaMa] FULL big-lama erase → models/lama/big-lama.pt (~206 MB)")
    print("  (Places FFCResNetGenerator — same as lama-cleaner / IOPaint, not lite)")
    dest = MODELS / "lama" / "big-lama.pt"
    def checksum() -> str:
        return file_md5(dest)

    if dest.exists() and dest.stat().st_size > 1024:
        digest = checksum()
        if digest != LAMA_MD5:
            print(f"  replacing invalid checkpoint: MD5 {digest} != {LAMA_MD5}")
            dest.unlink()
    download(LAMA_URL, dest)
    digest = checksum()
    if digest != LAMA_MD5:
        dest.unlink(missing_ok=True)
        raise RuntimeError(
            f"LaMa checkpoint checksum failed ({digest} != {LAMA_MD5}); file removed"
        )
    print(f"  MD5 ok: {digest}")
    print("  runtime: image_studio.ai.lama_runner (HD crop + pad_mod 8)")


def setup_bert_local() -> None:
    """Download the required BERT text encoder under models/ once."""
    dest = MODELS / "groundingdino" / "bert-base-uncased"
    if all((dest / name).exists() for name in BERT_RUNTIME_FILES):
        print(f"  skip (exists): {dest.relative_to(ROOT)}")
        return
    print("  downloading google-bert/bert-base-uncased → models/groundingdino/bert-base-uncased")
    print("  (one-time; inference uses this folder, not the Hub)")
    from huggingface_hub import snapshot_download

    snapshot_download(
        repo_id="google-bert/bert-base-uncased",
        local_dir=str(dest),
        allow_patterns=[*BERT_RUNTIME_FILES, "special_tokens_map.json"],
    )


def setup_grounding_dino(install_pkg: bool) -> None:
    print("\n[Grounding DINO Swin-B] official checkpoint + local BERT")

    clone_repo(
        "https://github.com/IDEA-Research/GroundingDINO.git",
        THIRD / "GroundingDINO",
    )
    patch_grounding_dino_compat()
    cfg_dir = THIRD / "GroundingDINO" / "groundingdino" / "config"
    spec = GROUNDING_DINO_LARGE
    download(spec["url"], MODELS / "groundingdino" / spec["file"])
    cfg_src = cfg_dir / spec["config"]
    cfg_dst = MODELS / "groundingdino" / spec["config"]
    if not cfg_src.exists():
        raise FileNotFoundError(f"Grounding DINO config missing: {cfg_src}")
    cfg_dst.parent.mkdir(parents=True, exist_ok=True)
    cfg_dst.write_text(cfg_src.read_text(encoding="utf-8"), encoding="utf-8")
    print(f"  copied config → {cfg_dst.relative_to(ROOT)}")

    setup_bert_local()

    if install_pkg and (THIRD / "GroundingDINO").is_dir():
        run(
            [sys.executable, "-m", "pip", "install", "-e", ".", "--no-build-isolation"],
            cwd=THIRD / "GroundingDINO",
        )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--no-install-dino",
        action="store_true",
        help="Skip pip install -e third_party/GroundingDINO",
    )
    parser.add_argument(
        "--selection-only",
        action="store_true",
        help="Install only the fixed point/prompt selection checkpoints and runtime",
    )
    args = parser.parse_args()

    MODELS.mkdir(parents=True, exist_ok=True)
    THIRD.mkdir(parents=True, exist_ok=True)

    setup_sam2()
    setup_grounding_dino(
        install_pkg=not args.no_install_dino,
    )
    setup_birefnet()
    if not args.selection_only:
        setup_realesrgan()
        setup_lama()
    print("\nDone. Runtime inference is local-only.")
    print("  pip install -r requirements-ai.txt")
    print("  pip install 'git+https://github.com/facebookresearch/sam2.git'")
    print("  pip install rembg")
    if not args.selection_only:
        print("  LaMa: models/lama/big-lama.pt (downloaded above)")
    print("  See models/README.md and BUILD_SPEC.md.")
    print("Device auto-selects CUDA → MPS → CPU (override: IMAGE_STUDIO_TORCH_DEVICE).")
    print("Check /api/health for device + models.*.ready flags.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
