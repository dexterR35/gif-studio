"""Numeric helpers for clean UI values (avoid float junk like 212.75675675765)."""

from __future__ import annotations


def nice(value: float, decimals: int = 1) -> float:
    """Round a number to a stable UI precision."""
    try:
        number = float(value)
    except (TypeError, ValueError):
        return 0.0
    places = max(0, min(6, int(decimals)))
    rounded = round(number, places)
    # Avoid signed zero in spin boxes / labels.
    return 0.0 if rounded == 0 else rounded


def nice_int(value: float) -> int:
    return int(round(float(value)))
