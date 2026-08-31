#!/usr/bin/env python3
"""Download local AI checkpoints (no Hugging Face Hub at runtime).

Weights go under ``models/``. Grounding DINO is cloned to ``third_party/``.

Usage:
  python scripts/setup_ai_models.py
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path
from urllib.request import urlretrieve

ROOT = Path(__file__).resolve().parents[1]
MODELS = ROOT / "models"
THIRD = ROOT / "third_party"

REALESRGAN_URLS = {
    "RealESRGAN_x4plus.pth": (
        "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth"
    ),
    "RealESRGAN_x2plus.pth": (
        "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.1/RealESRGAN_x2plus.pth"
    ),
    "ESRGAN_SRx4_DF2KOST_official-ff704c30.pth": (
        "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.1/"
        "ESRGAN_SRx4_DF2KOST_official-ff704c30.pth"
    ),
    "RealESRGAN_x4plus_anime_6B.pth": (
        "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.2.4/"
        "RealESRGAN_x4plus_anime_6B.pth"
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


def setup_realesrgan() -> None:
    print("\n[Real-ESRGAN / ESRGAN / A-ESRGAN] GitHub releases → models/realesrgan/")
    for name, url in REALESRGAN_URLS.items():
        download(url, MODELS / "realesrgan" / name)


def setup_sam2() -> None:
    print("\n[SAM 2.1 Large] Meta CDN → models/sam2/")
    download(SAM2_LARGE["url"], MODELS / "sam2" / SAM2_LARGE["file"])
    print("  install package: pip install 'git+https://github.com/facebookresearch/sam2.git'")


def setup_matte_dirs() -> None:
    print("\n[Matte] BiRefNet / RMBG via rembg — models/matte/")
    (MODELS / "matte").mkdir(parents=True, exist_ok=True)
    print("  rembg downloads session weights on first use (birefnet-general, isnet, …)")
    print("  optional: drop ONNX under models/matte/; pip install rembg")


def setup_lama() -> None:
    print("\n[LaMa] FULL big-lama erase → models/lama/big-lama.pt (~206 MB)")
    print("  (Places FFCResNetGenerator — same as lama-cleaner / IOPaint, not lite)")
    dest = MODELS / "lama" / "big-lama.pt"
    import hashlib

    def checksum() -> str:
        h = hashlib.md5()
        with dest.open("rb") as fh:
            for chunk in iter(lambda: fh.read(1024 * 1024), b""):
                h.update(chunk)
        return h.hexdigest()

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


def setup_slots() -> None:
    print("\n[Slots] GFPGAN / LaMa dirs")
    for name in ("gfpgan", "lama"):
        (MODELS / name).mkdir(parents=True, exist_ok=True)
    print("  gfpgan/   — GFPGANv1.4.pth face polish slot")
    print("  lama/     — big-lama.pt from setup_lama()")


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
        help="Install only the fixed prompt-selection checkpoints and runtime",
    )
    args = parser.parse_args()

    MODELS.mkdir(parents=True, exist_ok=True)
    THIRD.mkdir(parents=True, exist_ok=True)

    setup_sam2()
    setup_grounding_dino(
        install_pkg=not args.no_install_dino,
    )
    if not args.selection_only:
        setup_realesrgan()
        setup_matte_dirs()
        setup_slots()
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
