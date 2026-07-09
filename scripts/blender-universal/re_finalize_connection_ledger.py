#!/usr/bin/env python3
"""Re-finalize connection-ledger.json from state topology WITHOUT Blender.

INTENT: after a resolve_endpoint / discriminator fix, regenerate the authored
connection graph from orchestratorContract.topology so parts_ledger can attach
I/O to the correct equipment (codema TK-101: drain_water_tank was snapping onto
Nursery Drain Water Tank). bpy-free so excel rebuild loops stay cheap.

Usage:
  python3 scripts/blender-universal/re_finalize_connection_ledger.py <out_dir>
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import connection_ledger as cl  # noqa: E402

DISCRIMINATORS = {
    "h2", "co2", "hot", "cold", "saf", "naphtha", "recycle",
    "feed", "product", "tail", "syncrude",
    "nursery", "department", "zone", "primary", "secondary",
}
ABSTRACT_ENDPOINTS_RE = re.compile(
    r"^(?:bus|supply|none|abstract|atmosphere|grid|mains|battery[_ -]?limit)$", re.I
)
SYN = {
    "cleanwater_reservoir": "fresh water tank",
    "clean_water_reservoir": "fresh water tank",
    "drainwater_reservoir": "drain water tank",
    "drain_water_reservoir": "drain water tank",
}


def _tokenise(name: str) -> list[str]:
    return [t for t in re.split(r"[^a-z0-9]+", str(name or "").lower()) if t]


def _plural_fold(t: str) -> str:
    t = str(t)
    if len(t) >= 5 and t.endswith("s") and not t.endswith("ss"):
        return t[:-1]
    return t


def _token_match(x: str, y: str) -> bool:
    if x == y:
        return True
    s, l = (x, y) if len(x) <= len(y) else (y, x)
    return len(s) >= 6 and len(l) >= len(s) + 3 and l.startswith(s)


def _token_overlap(a_tokens: list[str], b_tokens: list[str]) -> int:
    a, b = set(a_tokens), set(b_tokens)
    qd = a & DISCRIMINATORS
    cd = b & DISCRIMINATORS
    if qd and (cd - qd):
        return 0
    n = 0
    for x in a:
        if any(_token_match(x, y) for y in b):
            n += 1
    return n


class _Part:
    def __init__(self, name: str):
        self.name = name
        self.match_tokens = _tokenise(name)


def resolve_endpoint(edge_part_name: str, parts: list[_Part]):
    """Mirror of build_universal_scene.resolve_endpoint (nursery discriminator +
    shortest-extra tie-break) — kept bpy-free for offline re-finalize."""
    if not edge_part_name or ABSTRACT_ENDPOINTS_RE.search(str(edge_part_name)):
        return None
    name = SYN.get(str(edge_part_name), str(edge_part_name))
    toks = _tokenise(name)
    head = toks[-1] if toks else None
    best = None
    query_set = set(toks)
    for p in parts:
        score = _token_overlap(toks, p.match_tokens)
        if score <= 0:
            continue
        if head is not None and not any(
            _token_match(head, y) or _plural_fold(head) == _plural_fold(y)
            for y in p.match_tokens
        ):
            continue
        extra = len(set(p.match_tokens) - query_set)
        cand = (score, -extra, p)
        if best is None or cand[:2] > best[:2]:
            best = cand
    return best[2] if best else None


def _parts_from_state(state: dict) -> list[_Part]:
    names: set[str] = set()
    for r in state.get("requirementsBom") or []:
        h = str(r.get("requirement") or "").split("·", 1)[0].strip()
        if h:
            names.add(h)
    for m in (state.get("moduleDecomposition") or {}).get("modules") or []:
        for sm in m.get("sub_modules") or []:
            for w in sm.get("words") or []:
                n = w.get("name_human")
                if n and "__" not in str(w.get("id") or ""):
                    names.add(str(n))
    return [_Part(n) for n in sorted(names)]


def main(out_dir: str) -> int:
    out = Path(out_dir)
    state_path = out / "state.json"
    if not state_path.exists():
        print(f"re_finalize: missing {state_path}", file=sys.stderr)
        return 2
    state = json.loads(state_path.read_text())
    topo = (state.get("orchestratorContract") or {}).get("topology") or []
    if not topo:
        print("re_finalize: no orchestratorContract.topology — nothing to do")
        return 0
    parts = _parts_from_state(state)
    quantities = (state.get("orchestratorContract") or {}).get("quantities") or {}
    final, dropped = cl.finalize_ledger(
        list(topo), parts, resolve_endpoint, log=print, quantities=quantities,
    )
    ledger = {
        "schema": "connection-ledger/v1",
        "count": len(final),
        "note": "re-finalized bpy-free from orchestratorContract.topology "
                "(scripts/blender-universal/re_finalize_connection_ledger.py)",
        "rows": final,
        "dropped": [
            {"from": d[0], "to": d[1], "mechanism": d[2], "reason": d[3]}
            if isinstance(d, (list, tuple)) and len(d) >= 4
            else d
            for d in (dropped or [])
        ],
        "adjacency": cl.build_adjacency(final),
    }
    part_names = {p for r in final for p in cl._row_endpoints(r) if p}
    violations = cl.audit_referential_integrity(final, part_names, log=lambda *a: None)
    ledger["referential_integrity"] = {
        "n_violations": len(violations), "violations": violations,
    }
    out_path = out / "connection-ledger.json"
    out_path.write_text(json.dumps(ledger, indent=2) + "\n")
    # Prove the TK-101 class of bug is gone when both tanks exist.
    names = {r.get("from_part") for r in final} | {r.get("to_part") for r in final}
    has_drain = any(n == "Drain Water Tank" for n in names)
    has_nursery = any(n == "Nursery Drain Water Tank" for n in names)
    print(f"re_finalize: wrote {out_path} — {len(final)} rows, "
          f"Drain Water Tank present={has_drain}, Nursery present={has_nursery}")
    if has_drain is False and any(
        "drain_water_tank" == str(e.get("to_part") or e.get("from_part") or "")
        for e in topo
    ):
        print("re_finalize: WARN topology names drain_water_tank but resolved "
              "name missing — check parts list", file=sys.stderr)
        return 1
    return 0


def _selftest() -> int:
    parts = [_Part("Drain Water Tank"), _Part("Nursery Drain Water Tank"),
             _Part("Cloth Filter")]
    hit = resolve_endpoint("drain_water_tank", parts)
    if not hit or hit.name != "Drain Water Tank":
        print(f"FAIL: drain_water_tank must resolve to Drain Water Tank, got "
              f"{getattr(hit, 'name', None)!r}")
        return 1
    hit2 = resolve_endpoint("nursery_drain_water_tank", parts)
    if not hit2 or hit2.name != "Nursery Drain Water Tank":
        print(f"FAIL: nursery_drain_water_tank must resolve to Nursery…, got "
              f"{getattr(hit2, 'name', None)!r}")
        return 1
    print("re_finalize_connection_ledger --selftest OK")
    return 0


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        raise SystemExit(_selftest())
    if len(sys.argv) < 2:
        print("Usage: re_finalize_connection_ledger.py <out_dir>", file=sys.stderr)
        raise SystemExit(2)
    raise SystemExit(main(sys.argv[1]))
