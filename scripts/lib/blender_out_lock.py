#!/usr/bin/env python3
"""Exclusive lock so only one Blender may own an out/ dir at a time.

INTENT (colorimeter 2254 / Poseidon 2324): blender-bg-runner (product cams) and
generate_drawing_set (CAD/inspect) both invoke build_universal_scene.py on the
SAME out_dir. Concurrent writers race 00-hero.png into a byte-identical copy of
inspect-hero.png and floor Renders via vision. Serialize every headless Blender
launch that targets an out_dir — never two Blenders on one stamp dir.

FLOW: render-blender-scene / generate_drawing_set acquire before spawn →
Blender writes → release. proveCatch: second non-blocking acquire fails.
"""
from __future__ import annotations

import fcntl
import os
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator


LOCK_NAME = ".blender-out.lock"


@contextmanager
def blender_out_dir_lock(
    out_dir: str | Path,
    *,
    timeout_s: float = 2400.0,
    poll_s: float = 0.5,
) -> Iterator[Path]:
    """Block until exclusive lock on ``out_dir/.blender-out.lock`` is held.

    @param out_dir Chain run directory Blender will write into
    @param timeout_s Max wait before raising TimeoutError
    @param poll_s Sleep between non-blocking flock attempts
    @yields Path to the lock file (held exclusive until context exit)
    @throws TimeoutError when another Blender holds the lock past timeout_s
    """
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    lock_path = out / LOCK_NAME
    fd = os.open(str(lock_path), os.O_CREAT | os.O_RDWR, 0o644)
    deadline = time.monotonic() + max(1.0, float(timeout_s))
    try:
        while True:
            try:
                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except BlockingIOError:
                if time.monotonic() >= deadline:
                    os.close(fd)
                    raise TimeoutError(
                        f"blender out-dir lock timeout after {timeout_s:.0f}s: {lock_path}"
                    ) from None
                time.sleep(poll_s)
        os.write(fd, f"{os.getpid()}\n".encode("utf-8"))
        try:
            os.fsync(fd)
        except OSError:
            pass
        yield lock_path
    finally:
        try:
            fcntl.flock(fd, fcntl.LOCK_UN)
        except OSError:
            pass
        try:
            os.close(fd)
        except OSError:
            pass


def _selftest() -> None:
    """proveCatch: exclusive lock; second non-blocking holder cannot enter."""
    import tempfile

    with tempfile.TemporaryDirectory(prefix="blender-out-lock-") as tmp:
        held = []

        def _try_nb() -> bool:
            fd = os.open(str(Path(tmp) / LOCK_NAME), os.O_CREAT | os.O_RDWR, 0o644)
            try:
                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                fcntl.flock(fd, fcntl.LOCK_UN)
                return True
            except BlockingIOError:
                return False
            finally:
                os.close(fd)

        with blender_out_dir_lock(tmp, timeout_s=5.0):
            held.append(True)
            assert _try_nb() is False, "second holder must block while lock held"
        assert _try_nb() is True, "lock must release on context exit"
        assert held == [True]
    print("blender_out_lock _selftest: OK")


if __name__ == "__main__":
    _selftest()
