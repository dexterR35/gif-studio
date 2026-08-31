from __future__ import annotations

import sys
from types import SimpleNamespace

from image_studio.ai import paths


class _FakeCuda:
    def __init__(self, available: bool):
        self._available = available

    def is_available(self) -> bool:
        return self._available

    def device_count(self) -> int:
        return 1 if self._available else 0


def _fake_torch(cuda_available: bool):
    return SimpleNamespace(
        cuda=_FakeCuda(cuda_available),
        device=lambda name: SimpleNamespace(type=name.split(":", 1)[0], name=name),
    )


def test_torch_device_prefers_cuda(monkeypatch):
    monkeypatch.delenv("IMAGE_STUDIO_TORCH_DEVICE", raising=False)
    monkeypatch.setitem(sys.modules, "torch", _fake_torch(True))
    monkeypatch.setattr(paths, "cuda_usable", lambda: True)
    paths.torch_device.cache_clear()

    assert paths.torch_device().type == "cuda"


def test_torch_device_falls_back_to_cpu(monkeypatch):
    monkeypatch.delenv("IMAGE_STUDIO_TORCH_DEVICE", raising=False)
    monkeypatch.setitem(sys.modules, "torch", _fake_torch(False))
    monkeypatch.setattr(paths, "cuda_usable", lambda: False)
    paths.torch_device.cache_clear()

    assert paths.torch_device().type == "cpu"


def test_onnx_providers_prefer_cuda_then_cpu(monkeypatch):
    monkeypatch.delenv("IMAGE_STUDIO_TORCH_DEVICE", raising=False)
    monkeypatch.setattr(paths, "nvidia_present", lambda: True)
    monkeypatch.setitem(
        sys.modules,
        "onnxruntime",
        SimpleNamespace(
            get_available_providers=lambda: [
                "CUDAExecutionProvider",
                "CPUExecutionProvider",
            ]
        ),
    )

    assert paths.onnx_providers() == [
        "CUDAExecutionProvider",
        "CPUExecutionProvider",
    ]


def test_onnx_providers_fall_back_to_cpu(monkeypatch):
    monkeypatch.delenv("IMAGE_STUDIO_TORCH_DEVICE", raising=False)
    monkeypatch.setattr(paths, "nvidia_present", lambda: True)
    monkeypatch.setitem(
        sys.modules,
        "onnxruntime",
        SimpleNamespace(get_available_providers=lambda: ["CPUExecutionProvider"]),
    )

    assert paths.onnx_providers() == ["CPUExecutionProvider"]


def test_explicit_cpu_disables_onnx_cuda(monkeypatch):
    monkeypatch.setenv("IMAGE_STUDIO_TORCH_DEVICE", "cpu")

    assert paths.onnx_providers() == ["CPUExecutionProvider"]
