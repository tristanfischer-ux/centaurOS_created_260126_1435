"""Pure flange-emission rules for routed pipe runs (no Blender dependency).

INTENT: Free-end T-bars came from (a) pipe-end flange discs and (b) fat
nozzle-stub flange discs at every port tip (Sam/Codema visual, 2026-07-09).
Universal rule: pipe runs never emit end flanges; Stage-2 stubs are neck-only
(no disc). This module is importable from selftests without `bpy`.
"""
from __future__ import annotations

# DECISION: permanently suppress pipe-end flanges. Callers may still pass
# flanges=True for API compatibility; the decision refuses. Flip only with a
# proveCatch that shows a free-end T cannot reappear.
PIPE_END_FLANGES_ENABLED = False


def should_emit_pipe_end_flanges(flanges, connect=()) -> bool:
    """Return True only when pipe-end flange discs should be drawn.

    Universal rule (2026-07-09): never. Stub necks + pipe tube form the joint;
    a pipe-end disc is the free-end T residual whether or not `connect` is set.
    """
    del connect  # retained for API compatibility with callers
    if not PIPE_END_FLANGES_ENABLED:
        return False
    return bool(flanges)
