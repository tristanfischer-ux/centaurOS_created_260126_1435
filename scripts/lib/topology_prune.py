#!/usr/bin/env python3
"""Shared connection topology prune for gold-spine instruments (Anvil U6).

Extracts the instrument ghost-connection prune used by parts_ledger so excel
scoring, twin repair, and pack selftests share one rule:

  * Remap absorbed host endpoints onto compute / LED principals when present
  * Drop edges that do not resolve to two distinct equipment rows
  * Rebuild inputs/outputs on equipment from survivors
  * Ghost-majority score trip: ledger ≥ 20 AND ledger > 3× rendered rows
"""
from __future__ import annotations

import re
from typing import Any, Callable, Optional

# Ghost-majority threshold (mirrors build-excel-export connection scorer).
GHOST_MIN_LEDGER = 20
GHOST_RATIO = 3.0

_COMPUTE_PRINCIPAL_RE = re.compile(
    r"compute\s*ui|main\s*controller|mcu\b|controller\s*board|"
    r"control\s*board|single[\s-]*board\s*computer|\bsbc\b",
    re.I,
)
_HOST_INTO_COMPUTE_RE = re.compile(
    r"usb|regulator|fuse|esd|ferrite|polyfuse|debug\s*header|"
    r"power\s*entry|gpio|header|connector",
    re.I,
)
_HOST_INTO_LED_RE = re.compile(
    r"led|photodiode|optical|od\s*sensor|source\s*board",
    re.I,
)


def _norm(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", str(name or "").lower()).strip()


def connection_ghost_majority(
    n_ledger_connections: int,
    n_rendered_rows: int,
    *,
    min_ledger: int = GHOST_MIN_LEDGER,
    ratio: float = GHOST_RATIO,
) -> bool:
    """True when ledger connections dominate rendered connection-trace rows."""
    n_rows = max(int(n_rendered_rows), 1)
    n_led = int(n_ledger_connections)
    return n_led >= min_ledger and n_led > n_rows * ratio


def prune_instrument_ghost_connections(
    equipment: list,
    connections: list,
    *,
    compute_re: re.Pattern[str] = _COMPUTE_PRINCIPAL_RE,
    led_name_re: Optional[re.Pattern[str]] = None,
) -> tuple[list, int]:
    """Prune procurement/admin ghost edges; keep topology principals.

    @returns (pruned_connections, n_dropped)
    """
    if not connections or not equipment:
        return list(connections or []), 0
    led_re = led_name_re or re.compile(r"led\s*source\s*board", re.I)
    by_norm = {_norm(e.get("name") or ""): e for e in equipment if e.get("name")}
    compute = next(
        (e for e in equipment if compute_re.search(e.get("name") or "")),
        None,
    )
    led = next(
        (e for e in equipment if led_re.search(e.get("name") or "")),
        None,
    )

    def _map_endpoint(name: str):
        nn = _norm(name or "")
        if not nn:
            return None
        if nn in by_norm:
            return by_norm[nn]
        for k, e in by_norm.items():
            if nn in k or k in nn:
                return e
        if led and _HOST_INTO_LED_RE.search(name or ""):
            return led
        if compute and _HOST_INTO_COMPUTE_RE.search(name or ""):
            return compute
        return None

    kept: list = []
    seen: set = set()
    dropped = 0
    for c in connections:
        if not isinstance(c, dict):
            dropped += 1
            continue
        fe = _map_endpoint(str(c.get("from_part") or c.get("from") or ""))
        te = _map_endpoint(str(c.get("to_part") or c.get("to") or ""))
        if not fe or not te or fe is te:
            dropped += 1
            continue
        key = (fe["name"], te["name"], c.get("mechanism") or c.get("kind") or "")
        rkey = (te["name"], fe["name"], key[2])
        if key in seen or rkey in seen:
            dropped += 1
            continue
        seen.add(key)
        kept.append({
            **c,
            "from_part": fe["name"],
            "from_tag": fe.get("tag"),
            "to_part": te["name"],
            "to_tag": te.get("tag"),
        })

    for e in equipment:
        if isinstance(e, dict):
            e["inputs"] = []
            e["outputs"] = []
    for c in kept:
        fe = by_norm.get(_norm(c["from_part"]))
        te = by_norm.get(_norm(c["to_part"]))
        via = c.get("via") or c.get("kind") or "tie"
        mech = c.get("mechanism") or ""
        if te is not None:
            te.setdefault("inputs", []).append(
                f"{c['from_part']} ({c.get('from_tag') or '?'}) via {via} [{mech}]"
            )
        if fe is not None:
            fe.setdefault("outputs", []).append(
                f"{c['to_part']} ({c.get('to_tag') or '?'}) via {via} [{mech}]"
            )
    return kept, dropped


def prune_parts_ledger_dict(ledger: dict) -> dict[str, Any]:
    """In-place-ish prune of a parts-ledger.json shaped dict; returns report."""
    equipment = list(ledger.get("equipment") or [])
    connections = list(ledger.get("connections") or [])
    kept, n_drop = prune_instrument_ghost_connections(equipment, connections)
    ledger["equipment"] = equipment
    ledger["connections"] = kept
    ledger["n_connections"] = len(kept)
    return {
        "n_before": len(connections),
        "n_after": len(kept),
        "n_dropped": n_drop,
        "ghost_majority_if_rendered_1": connection_ghost_majority(len(kept), 1),
    }


if __name__ == "__main__":
    assert not connection_ghost_majority(7, 7)
    assert connection_ghost_majority(36, 1)

    equip = [
        {"name": "Compute UI Module", "tag": "X-1"},
        {"name": "Culture Vessel", "tag": "X-2"},
        {"name": "USB Port", "tag": "X-3"},
    ]
    conns = [
        {"from_part": "USB Port", "to_part": "Compute UI Module", "kind": "power"},
        {"from_part": "Ghost Fuse", "to_part": "Ghost Regulator", "kind": "power"},
        {"from_part": "Culture Vessel", "to_part": "Compute UI Module", "kind": "signal"},
    ]
    kept, n = prune_instrument_ghost_connections(equip, conns)
    assert n >= 1
    assert len(kept) >= 1
    assert all(
        c["from_part"] in {e["name"] for e in equip}
        and c["to_part"] in {e["name"] for e in equip}
        for c in kept
    )
    print("topology_prune selftest OK", {"kept": len(kept), "dropped": n})
