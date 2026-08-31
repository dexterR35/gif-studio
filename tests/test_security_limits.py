"""Regression coverage for loop-safe blocking inference dispatch."""

from __future__ import annotations

import asyncio

from image_studio.security_limits import run_blocking


def _increment(value: int) -> int:
    return value + 1


def test_run_blocking_completes_across_fresh_event_loops():
    assert asyncio.run(run_blocking(_increment, 1)) == 2
    assert asyncio.run(run_blocking(_increment, 9)) == 10
