#!/usr/bin/env python3
"""Download local AI checkpoints (no Hugging Face Hub at runtime).

Weights go under ``models/``. Grounding DINO is cloned to ``third_party/``.

Usage:
  python scripts/setup_ai_models.py              # all local ckpts (default)
  python scripts/setup_ai_models.py --skip-rife
  python scripts/setup_ai_models.py --tiny-only  # SAM2 tiny + DINO Swin-T only
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
    "ESRGAN_SRx4_DF2KOST_official-ff704c30.pth": (
        "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.1/"
        "ESRGAN_SRx4_DF2KOST_official-ff704c30.pth"
    ),
    "RealESRGAN_x4plus_anime_6B.pth": (
        "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.2.4/"
        "RealESRGAN_x4plus_anime_6B.pth"
    ),
}

SAM2_URLS = {
    "sam2.1_hiera_tiny.pt": (
        "https://dl.fbaipublicfiles.com/segment_anything_2/092824/sam2.1_hiera_tiny.pt"
    ),
    "sam2.1_hiera_small.pt": (
        "https://dl.fbaipublicfiles.com/segment_anything_2/092824/sam2.1_hiera_small.pt"
    ),
    "sam2.1_hiera_base_plus.pt": (
        "https://dl.fbaipublicfiles.com/segment_anything_2/092824/sam2.1_hiera_base_plus.pt"
    ),
    "sam2.1_hiera_large.pt": (
        "https://dl.fbaipublicfiles.com/segment_anything_2/092824/sam2.1_hiera_large.pt"
    ),
}

GROUNDING_DINO = [
    {
        "file": "groundingdino_swint_ogc.pth",
        "config": "GroundingDINO_SwinT_OGC.py",
        "url": (
            "https://github.com/IDEA-Research/GroundingDINO/releases/download/"
            "v0.1.0-alpha/groundingdino_swint_ogc.pth"
        ),
    },
    {
        "file": "groundingdino_swinb_cogcoor.pth",
        "config": "GroundingDINO_SwinB_cfg.py",
        "url": (
            "https://github.com/IDEA-Research/GroundingDINO/releases/download/"
            "v0.1.0-alpha2/groundingdino_swinb_cogcoor.pth"
        ),
    },
]


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


def setup_sam2(tiny_only: bool) -> None:
    print("\n[SAM2] Meta CDN → models/sam2/")
    items = list(SAM2_URLS.items())
    if tiny_only:
        items = items[:1]
    for name, url in items:
        download(url, MODELS / "sam2" / name)
    print("  install package: pip install 'git+https://github.com/facebookresearch/sam2.git'")


def setup_matte_dirs() -> None:
    print("\n[Matte] BiRefNet / RMBG via rembg — models/matte/")
    (MODELS / "matte").mkdir(parents=True, exist_ok=True)
    print("  rembg downloads session weights on first use (birefnet-general, isnet, …)")
    print("  optional: drop ONNX under models/matte/; pip install rembg")


def setup_depth(tiny_only: bool = True) -> None:
    print("\n[Depth] Depth Anything V2 Small → models/depth/v2-small-hf/")
    dest = MODELS / "depth" / "v2-small-hf"
    if (dest / "config.json").exists():
        print(f"  skip (exists): {dest.relative_to(ROOT)}")
        return
    try:
        from huggingface_hub import snapshot_download

        print("  downloading depth-anything/Depth-Anything-V2-Small-hf (one-time local snapshot)")
        snapshot_download(
            repo_id="depth-anything/Depth-Anything-V2-Small-hf",
            local_dir=str(dest),
        )
    except Exception as exc:  # noqa: BLE001
        print(f"  WARNING: depth download failed ({exc})")
        print("  Place Transformers snapshot under models/depth/v2-small-hf/")
    del tiny_only


def setup_slots() -> None:
    print("\n[Slots] GFPGAN / SAM3 dirs")
    for name in ("gfpgan", "sam3"):
        (MODELS / name).mkdir(parents=True, exist_ok=True)
    print("  gfpgan/   — GFPGANv1.4.pth face polish slot")
    print("  sam3/     — use --with-sam3 after HF access is granted")


def setup_sam3() -> None:
    """Clone facebookresearch/sam3, pip install -e, download gated Hub weights."""
    print("\n[SAM3] https://github.com/facebookresearch/sam3 (gated Hugging Face)")
    dest_pkg = THIRD / "sam3"
    dest_w = MODELS / "sam3"
    dest_w.mkdir(parents=True, exist_ok=True)

    clone_repo("https://github.com/facebookresearch/sam3.git", dest_pkg)
    try:
        run([sys.executable, "-m", "pip", "install", "-e", str(dest_pkg)])
    except subprocess.CalledProcessError as exc:
        print(f"  WARNING: pip install sam3 failed ({exc})")
        print("  Retry: pip install -e third_party/sam3")

    # Official Hub layout: facebook/sam3 → sam3.pt
    ckpt = dest_w / "sam3.pt"
    if ckpt.exists() and ckpt.stat().st_size > 1024 * 1024:
        print(f"  skip (exists): {ckpt.relative_to(ROOT)}")
        return

    try:
        from huggingface_hub import hf_hub_download
    except ImportError:
        print("  WARNING: huggingface_hub missing — cannot download sam3.pt")
        print("  pip install huggingface_hub && hf auth login")
        return

    print("  downloading facebook/sam3 → models/sam3/sam3.pt (requires HF access + login)")
    try:
        path = hf_hub_download(
            repo_id="facebook/sam3",
            filename="sam3.pt",
            local_dir=str(dest_w),
        )
        # Ensure canonical name if hub laid out differently
        downloaded = Path(path)
        if downloaded.resolve() != ckpt.resolve() and downloaded.exists():
            if not ckpt.exists():
                downloaded.replace(ckpt)
        print(f"  ready: {ckpt.relative_to(ROOT)}")
    except Exception as exc:  # noqa: BLE001
        print(f"  WARNING: sam3.pt download failed ({exc})")
        print("  1. Request access: https://huggingface.co/facebook/sam3")
        print("  2. hf auth login")
        print("  3. Re-run: python scripts/setup_ai_models.py --with-sam3")
        print("  Or copy sam3.pt manually into models/sam3/")


def setup_bert_local() -> None:
    """Optional BERT for official .pth path — stored under models/ once."""
    dest = MODELS / "groundingdino" / "bert-base-uncased"
    if (dest / "config.json").exists():
        print(f"  skip (exists): {dest.relative_to(ROOT)}")
        return
    print("  downloading google-bert/bert-base-uncased → models/groundingdino/bert-base-uncased")
    print("  (one-time; inference uses this folder, not the Hub)")
    try:
        from huggingface_hub import snapshot_download

        snapshot_download(
            repo_id="google-bert/bert-base-uncased",
            local_dir=str(dest),
        )
    except Exception as exc:  # noqa: BLE001
        print(f"  WARNING: BERT download failed ({exc})")


def setup_dino_transformers(tiny_only: bool) -> None:
    """Primary runtime path: Transformers snapshots on disk (local_files_only)."""
    try:
        from huggingface_hub import snapshot_download
    except ImportError:
        print("  WARNING: huggingface_hub missing — cannot download Transformers DINO snapshots")
        return
    repos = [
        ("IDEA-Research/grounding-dino-tiny", MODELS / "groundingdino" / "hf-tiny"),
    ]
    if not tiny_only:
        repos.append(
            ("IDEA-Research/grounding-dino-base", MODELS / "groundingdino" / "hf-base"),
        )
    for repo_id, dest in repos:
        if (dest / "config.json").exists():
            print(f"  skip (exists): {dest.relative_to(ROOT)}")
            continue
        print(f"  downloading {repo_id} → {dest.relative_to(ROOT)}")
        print("  (one-time; runtime uses local_files_only — no Hub)")
        try:
            snapshot_download(repo_id=repo_id, local_dir=str(dest))
        except Exception as exc:  # noqa: BLE001
            print(f"  WARNING: {repo_id} failed ({exc})")


def setup_grounding_dino(tiny_only: bool, install_pkg: bool) -> None:
    print("\n[Grounding DINO] local Transformers snapshots + optional official .pth")
    setup_dino_transformers(tiny_only=tiny_only)

    clone_repo(
        "https://github.com/IDEA-Research/GroundingDINO.git",
        THIRD / "GroundingDINO",
    )
    specs = GROUNDING_DINO[:1] if tiny_only else GROUNDING_DINO
    cfg_dir = THIRD / "GroundingDINO" / "groundingdino" / "config"
    for spec in specs:
        download(spec["url"], MODELS / "groundingdino" / spec["file"])
        cfg_src = cfg_dir / spec["config"]
        cfg_dst = MODELS / "groundingdino" / spec["config"]
        if cfg_src.exists():
            cfg_dst.parent.mkdir(parents=True, exist_ok=True)
            cfg_dst.write_text(cfg_src.read_text(encoding="utf-8"), encoding="utf-8")
            print(f"  copied config → {cfg_dst.relative_to(ROOT)}")
        else:
            print(f"  WARNING: config missing at {cfg_src}")

    setup_bert_local()

    if install_pkg and (THIRD / "GroundingDINO").is_dir():
        print("  optional: official package already installed or skip with --no-install-dino")
        # Keep install best-effort; Transformers local path is primary.
        try:
            run(
                [sys.executable, "-m", "pip", "install", "-e", ".", "--no-build-isolation"],
                cwd=THIRD / "GroundingDINO",
            )
        except subprocess.CalledProcessError as exc:
            print(f"  WARNING: official package install skipped ({exc})")


def setup_rife(hf_repo: str | None) -> None:
    print("\n[RIFE]")
    clone_repo("https://github.com/hzwer/Practical-RIFE.git", THIRD / "Practical-RIFE")
    clone_repo("https://github.com/hzwer/ECCV2022-RIFE.git", THIRD / "ECCV2022-RIFE")

    train_log = MODELS / "rife" / "train_log"
    train_log.mkdir(parents=True, exist_ok=True)

    if hf_repo:
        try:
            from huggingface_hub import snapshot_download

            print(f"  downloading RIFE weights once from hf.co/{hf_repo}")
            snapshot_download(
                repo_id=hf_repo,
                local_dir=str(MODELS / "rife" / "hf"),
                local_dir_use_symlinks=False,
            )
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
            print(f"  WARNING: download failed ({exc})")
            print("  Place flownet.pkl (+ RIFE_HDv3.py) manually in models/rife/train_log/")
    else:
        print("  clone done. Place weights in:")
        print(f"    {train_log}")

    print("  set RIFE_REPO=third_party/Practical-RIFE")
    print("  set RIFE_MODEL=models/rife/train_log")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--skip-rife", action="store_true")
    parser.add_argument("--skip-depth", action="store_true")
    parser.add_argument(
        "--tiny-only",
        action="store_true",
        help="Smaller set: SAM2 tiny + DINO Swin-T + depth small",
    )
    parser.add_argument(
        "--no-install-dino",
        action="store_true",
        help="Skip pip install -e third_party/GroundingDINO",
    )
    parser.add_argument(
        "--with-sam3",
        action="store_true",
        help="Install sam3 package + download facebook/sam3 weights (gated HF)",
    )
    parser.add_argument(
        "--rife-hf",
        default=os.environ.get("RIFE_HF_REPO", "MonsterMMORPG/RIFE_4_26"),
        help="One-time download source for RIFE train_log (stored locally after)",
    )
    parser.add_argument("--no-rife-hf", action="store_true")
    # Keep old flag as no-op alias (local is now default)
    parser.add_argument("--local-ckpts", action="store_true", help=argparse.SUPPRESS)
    args = parser.parse_args()

    MODELS.mkdir(parents=True, exist_ok=True)
    THIRD.mkdir(parents=True, exist_ok=True)

    setup_realesrgan()
    setup_sam2(tiny_only=args.tiny_only)
    setup_grounding_dino(
        tiny_only=args.tiny_only,
        install_pkg=not args.no_install_dino,
    )
    setup_matte_dirs()
    if not args.skip_depth:
        setup_depth(tiny_only=args.tiny_only)
    setup_slots()
    if args.with_sam3:
        setup_sam3()
    if not args.skip_rife:
        setup_rife(None if args.no_rife_hf else args.rife_hf)

    print("\nDone. Local-only inference (GIF_STUDIO_ALLOW_HF unset).")
    print("  pip install -r requirements-ai.txt")
    print("  pip install 'git+https://github.com/facebookresearch/sam2.git'")
    print("  pip install rembg")
    print("  See docs/GIF_STUDIO_MEGA_SENIOR_BUILD.md (§10 AI subsystem).")
    print("Device auto-selects CUDA → MPS → CPU (override: GIF_STUDIO_TORCH_DEVICE).")
    print("Check /api/health for device + models.*.ready flags.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
