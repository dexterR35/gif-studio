"""Background jobs — Celery when Redis is configured, else inline threadpool."""

from __future__ import annotations

import os
from typing import Any, Callable


def redis_url() -> str | None:
    return os.environ.get("REDIS_URL") or os.environ.get("CELERY_BROKER_URL")


def celery_available() -> bool:
    if not redis_url():
        return False
    try:
        import celery  # noqa: F401
    except ImportError:
        return False
    return True


def get_celery_app():
    if not celery_available():
        return None
    from celery import Celery

    app = Celery("gif_studio", broker=redis_url(), backend=redis_url())
    app.conf.task_track_started = True
    return app


celery_app = get_celery_app()


def task(name: str):
    """Decorator: Celery task when available, else plain function."""

    def wrap(fn: Callable):
        if celery_app is not None:
            return celery_app.task(name=name)(fn)
        fn.delay = lambda *a, **k: fn(*a, **k)  # type: ignore[attr-defined]
        return fn

    return wrap


@task("gif_studio.upscale")
def job_upscale(storage_key: str, scale: int = 2) -> dict[str, Any]:
    from .ai_pipeline import upscale_image
    from .storage import get_bytes, put_bytes

    data = get_bytes(storage_key)
    out, engine = upscale_image(data, scale=scale)
    key = put_bytes(out, content_type="image/png")
    return {"storage_key": key, "engine": engine}


@task("gif_studio.interpolate")
def job_interpolate(frame_keys: list[str], factor: int = 2) -> dict[str, Any]:
    from .ai_pipeline import interpolate_frames
    from .storage import get_bytes, put_bytes

    frames = [get_bytes(k) for k in frame_keys]
    outs, engine = interpolate_frames(frames, factor=factor)
    keys = [put_bytes(b, content_type="image/png") for b in outs]
    return {"frame_keys": keys, "engine": engine}


@task("gif_studio.export_gif")
def job_export_gif(frame_keys: list[str], fps: float = 24) -> dict[str, Any]:
    import imageio.v3 as iio
    import numpy as np
    from PIL import Image
    import io

    from .storage import get_bytes, put_bytes

    images = []
    for key in frame_keys:
        img = Image.open(io.BytesIO(get_bytes(key))).convert("RGBA")
        images.append(np.asarray(img))
    buf = io.BytesIO()
    iio.imwrite(buf, images, extension=".gif", duration=1 / max(1e-3, fps), loop=0)
    key = put_bytes(buf.getvalue(), content_type="image/gif")
    return {"storage_key": key}
