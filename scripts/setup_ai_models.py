#!/usr/bin/env python3
"""Download / clone weights for SAM2, Real-ESRGAN, Grounding DINO, and RIFE.

Usage:
  python scripts/setup_ai_models.py
  python scripts/setup_ai_models.py --skip-rife
  python scripts/setup_ai_models.py --rife-hf MonsterMMORPG/RIFE_4_26

This does NOT install pip packages — see requirements-ai.txt for that.
"""

from __future__ import annotations

import argparse
import os
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
}

GROUNDING_DINO_CKPT = (
    "https://github.com/IDEA-Research/GroundingDINO/releases/download/"
    "v0.1.0-alpha/groundingdino_swint_ogc.pth"
)
SAM2_TINY = (
    "https://dl.fbaipublicfiles.com/segment_anything_2/092824/sam2.1_hiera_tiny.pt"
)


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
    print("\n[Real-ESRGAN]")
    for name, url in REALESRGAN_URLS.items():
        download(url, MODELS / "realesrgan" / name)


def setup_sam2(local_ckpt: bool) -> None:
    print("\n[SAM2]")
    if local_ckpt:
        download(SAM2_TINY, MODELS / "sam2" / "sam2.1_hiera_tiny.pt")
        print("  tip: set SAM2_CHECKPOINT=models/sam2/sam2.1_hiera_tiny.pt")
        print("       SAM2_CONFIG=configs/sam2.1/sam2.1_hiera_t.yaml")
    else:
        print("  using Hugging Face on first inference (facebook/sam2-hiera-tiny)")
        print("  install: pip install 'git+https://github.com/facebookresearch/sam2.git'")


def setup_grounding_dino(local_ckpt: bool) -> None:
    print("\n[Grounding DINO]")
    if local_ckpt:
        download(GROUNDING_DINO_CKPT, MODELS / "groundingdino" / "groundingdino_swint_ogc.pth")
        print("  tip: install official package from IDEA-Research/GroundingDINO")
        print("       and set GROUNDING_DINO_CONFIG + GROUNDING_DINO_CHECKPOINT")
    else:
        print("  using Hugging Face Transformers on first inference")
        print("  (IDEA-Research/grounding-dino-tiny)")
        print("  install: pip install transformers")


def setup_rife(hf_repo: str | None) -> None:
    print("\n[RIFE]")
    clone_repo("https://github.com/hzwer/Practical-RIFE.git", THIRD / "Practical-RIFE")
    # Also keep ECCV2022-RIFE available as alternate
    clone_repo("https://github.com/hzwer/ECCV2022-RIFE.git", THIRD / "ECCV2022-RIFE")

    train_log = MODELS / "rife" / "train_log"
    train_log.mkdir(parents=True, exist_ok=True)

    if hf_repo:
        try:
            from huggingface_hub import snapshot_download

            print(f"  downloading weights from hf.co/{hf_repo}")
            snapshot_download(
                repo_id=hf_repo,
                local_dir=str(MODELS / "rife" / "hf"),
                local_dir_use_symlinks=False,
            )
            # Prefer nested train_log if present
            nested = MODELS / "rife" / "hf" / "train_log"
            if nested.is_dir():
                for item in nested.iterdir():
                    target = train_log / item.name
                    if not target.exists():
                        if item.is_file():
                            target.write_bytes(item.read_bytes())
                        else:
                            run(["cp", "-a", str(item), str(target)])
            (train_log / "__init__.py").write_text(
                "# so `import train_log.RIFE_HDv3` works\n", encoding="utf-8"
            )
            print(f"  weights → {train_log.relative_to(ROOT)}")
        except Exception as exc:  # noqa: BLE001
            print(f"  WARNING: HF download failed ({exc})")
            print("  Place flownet.pkl (+ RIFE_HDv3.py) manually in models/rife/train_log/")
    else:
        print("  clone done. Download a Practical-RIFE model zip and extract into:")
        print(f"    {train_log}")
        print("  or re-run with: --rife-hf MonsterMMORPG/RIFE_4_26")

    print("  set RIFE_REPO=third_party/Practical-RIFE")
    print("  set RIFE_MODEL=models/rife/train_log")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--skip-rife", action="store_true")
    parser.add_argument("--local-ckpts", action="store_true", help="Also download SAM2/DINO .pth files")
    parser.add_argument(
        "--rife-hf",
        default=os.environ.get("RIFE_HF_REPO", "MonsterMMORPG/RIFE_4_26"),
        help="Hugging Face repo id containing train_log/ for RIFE",
    )
    parser.add_argument("--no-rife-hf", action="store_true")
    args = parser.parse_args()

    MODELS.mkdir(parents=True, exist_ok=True)
    THIRD.mkdir(parents=True, exist_ok=True)

    setup_realesrgan()
    setup_sam2(local_ckpt=args.local_ckpts)
    setup_grounding_dino(local_ckpt=args.local_ckpts)
    if not args.skip_rife:
        setup_rife(None if args.no_rife_hf else args.rife_hf)

    print("\nDone. Install Python deps with:")
    print("  pip install -r requirements-ai.txt")
    print("Then restart the API and check /api/health for sam2 / grounding_dino / realesrgan / rife.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
