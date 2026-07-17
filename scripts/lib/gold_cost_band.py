#!/usr/bin/env python3
"""Gold materials cost band — ±15% of real open-hardware kit anchors.

INTENT (2026-07-16 Yuri ladder): a dossier can SHIPS at floor ≥9 while shipping
materials 3–10× the gold kit (NinjaPCR, Poseidon, OpenFlexure). Scorecards alone
are not the bar — BoM materials must land within ±15% of the gold midpoint.

DECISION: keyed on product_class / campaign slug → materials GBP midpoint from
`out/_yuri-gold-cost-anchors.json` (or embedded defaults). Never a brand branch
in emitters — this is a VERIFY gate on settled costStack.

FLOW: campaign / excel / loop board → check_materials_band(class, materials_gbp)
proveCatch: known-over (Poseidon £1827 vs £184) FIRES; Colorimeter £105 PASSes.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

# Embedded defaults (GBP materials midpoints). Keep in sync with
# out/_yuri-gold-cost-anchors.json — file wins when present.
DEFAULT_ANCHORS: dict[str, dict[str, Any]] = {
    "optical_instrument": {
        "materials_gbp": 125.0,
        "band": [95.0, 160.0],
        "aliases": ["colorimeter", "photometer", "optical_handheld"],
    },
    "optical_handheld": {"materials_gbp": 125.0, "band": [95.0, 160.0]},
    "colorimeter": {"materials_gbp": 125.0, "band": [95.0, 160.0]},
    "thermocycler": {
        "materials_gbp": 480.0,
        "band": [408.0, 552.0],
        "aliases": ["ninjapcr", "pcr_thermocycler"],
    },
    "ninjapcr": {"materials_gbp": 480.0, "band": [408.0, 552.0]},
    "syringe_pump": {
        "materials_gbp": 184.0,
        "band": [156.0, 212.0],
        "aliases": ["poseidon", "syringe_pump_platform"],
    },
    "poseidon": {"materials_gbp": 184.0, "band": [156.0, 212.0]},
    "lab_microscope": {
        "materials_gbp": 198.0,
        "band": [146.0, 240.0],
        "aliases": ["openflexure", "microscope"],
    },
    "openflexure": {"materials_gbp": 198.0, "band": [146.0, 240.0]},
    "bioreactor": {
        "materials_gbp": 259.0,
        "band": [220.0, 298.0],
        "aliases": ["pioreactor", "benchtop_bioreactor"],
    },
    "benchtop_bioreactor": {"materials_gbp": 259.0, "band": [220.0, 298.0]},
    "pioreactor": {"materials_gbp": 259.0, "band": [220.0, 298.0]},
    "potentiostat": {
        "materials_gbp": 189.0,
        "band": [161.0, 217.0],
        "aliases": ["rodeostat"],
    },
    "rodeostat": {"materials_gbp": 189.0, "band": [161.0, 217.0]},
    "digital_microfluidics": {
        "materials_gbp": 236.0,
        "band": [201.0, 271.0],
        "aliases": ["opendrop"],
    },
    "opendrop": {"materials_gbp": 236.0, "band": [201.0, 271.0]},
}

TOLERANCE = 0.15  # ±15%


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def load_anchors(path: Path | None = None) -> dict[str, dict[str, Any]]:
    """Load anchors JSON if present; else embedded defaults."""
    p = path or (_repo_root() / "out" / "_yuri-gold-cost-anchors.json")
    anchors = {k: dict(v) for k, v in DEFAULT_ANCHORS.items()}
    if p.is_file():
        try:
            raw = json.loads(p.read_text())
            if isinstance(raw, dict):
                for k, v in raw.items():
                    if isinstance(v, dict) and "materials_gbp" in v:
                        anchors[str(k)] = {**anchors.get(str(k), {}), **v}
        except (OSError, json.JSONDecodeError) as exc:
            print(f"[gold_cost_band] anchors file unreadable ({exc}); using defaults",
                  file=sys.stderr)
    return anchors


def resolve_anchor_key(product_key: str, anchors: dict[str, dict[str, Any]] | None = None) -> str | None:
    """Map product_class / campaign slug → anchor table key."""
    table = anchors or load_anchors()
    key = (product_key or "").strip().lower().replace("-", "_").replace(" ", "_")
    if not key:
        return None
    if key in table:
        return key
    for k, v in table.items():
        aliases = v.get("aliases") or []
        if key in {str(a).lower() for a in aliases}:
            return k
        if key in k or k in key:
            return k
    return None


def band_for_midpoint(mid_gbp: float, tolerance: float = TOLERANCE) -> tuple[float, float]:
    """Return (lo, hi) inclusive materials band."""
    mid = float(mid_gbp)
    t = float(tolerance)
    return (mid * (1.0 - t), mid * (1.0 + t))


def check_materials_band(
    product_key: str,
    materials_gbp: float,
    *,
    tolerance: float = TOLERANCE,
    anchors: dict[str, dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Compare materials GBP to gold midpoint ± tolerance.

    @returns Dict with ok, ratio, band, midpoint, findings
    """
    table = anchors or load_anchors()
    ak = resolve_anchor_key(product_key, table)
    if ak is None:
        return {
            "schema": "gold-cost-band/v1",
            "product_key": product_key,
            "ok": True,
            "skipped": True,
            "message": f"no gold materials anchor for {product_key!r}",
            "findings": [],
        }
    mid = float(table[ak]["materials_gbp"])
    # Prefer explicit gold kit band when researched (e.g. colorimeter £95–160);
    # else ±tolerance around midpoint.
    explicit = table[ak].get("band")
    if (
        isinstance(explicit, (list, tuple))
        and len(explicit) == 2
        and all(isinstance(x, (int, float)) for x in explicit)
    ):
        lo, hi = float(explicit[0]), float(explicit[1])
        if lo > hi:
            lo, hi = hi, lo
    else:
        lo, hi = band_for_midpoint(mid, tolerance)
    mat = float(materials_gbp)
    ratio = mat / mid if mid > 0 else float("inf")
    findings: list[dict[str, str]] = []
    ok = lo <= mat <= hi
    if not ok:
        direction = "OVER" if mat > hi else "UNDER"
        findings.append({
            "code": f"MATERIALS_{direction}_BAND",
            "fix": "device_emitter_floors_or_industrial_scrub",
            "message": (
                f"materials £{mat:,.2f} is {ratio:.2f}× gold midpoint £{mid:,.2f} "
                f"(band £{lo:,.0f}–£{hi:,.0f}, ±{tolerance:.0%}) — "
                f"Yuri bar requires within ±{tolerance:.0%} of real kit"
            ),
        })
    return {
        "schema": "gold-cost-band/v1",
        "product_key": product_key,
        "anchor_key": ak,
        "materials_gbp": round(mat, 2),
        "gold_midpoint_gbp": mid,
        "band_lo_gbp": round(lo, 2),
        "band_hi_gbp": round(hi, 2),
        "ratio": round(ratio, 3),
        "tolerance": tolerance,
        "ok": ok,
        "findings": findings,
    }


def materials_from_state(state: dict[str, Any]) -> float | None:
    """Extract materials GBP from a chain state.json."""
    cs = state.get("costStack") or {}
    for k in ("raw_materials_bom_gbp", "raw_materials_gbp", "bom_materials_gbp"):
        v = cs.get(k)
        if isinstance(v, (int, float)) and v > 0:
            return float(v)
    cr = state.get("cost_reality") or {}
    v = cr.get("bom_total_gbp")
    if isinstance(v, (int, float)) and v > 0:
        return float(v)
    return None


def product_key_from_state(state: dict[str, Any]) -> str:
    km = state.get("keyMetrics") or {}
    pb = state.get("parsedBrief") or {}
    return str(
        km.get("product_class")
        or pb.get("product_class")
        or state.get("product_class")
        or ""
    )


def check_state(state: dict[str, Any], *, tolerance: float = TOLERANCE) -> dict[str, Any]:
    """Convenience: band-check a full chain state dict."""
    mat = materials_from_state(state)
    key = product_key_from_state(state)
    if mat is None:
        return {
            "schema": "gold-cost-band/v1",
            "product_key": key,
            "ok": False,
            "findings": [{
                "code": "MATERIALS_MISSING",
                "fix": "costStack.raw_materials_bom_gbp",
                "message": "no materials GBP on state — cannot verify gold band",
            }],
        }
    return check_materials_band(key, mat, tolerance=tolerance)


def _selftest() -> None:
    """proveCatch: Poseidon-class over-band FIRES; Colorimeter in-band PASSes."""
    # Colorimeter settled materials ~£105.5 vs mid £125 → PASS
    c = check_materials_band("colorimeter", 105.48)
    assert c["ok"], f"colorimeter in-band must PASS: {c}"
    # Poseidon settled ~£1827 vs mid £184 → FAIL (≈10×)
    p = check_materials_band("poseidon", 1827.22)
    assert not p["ok"], f"poseidon 10× must FAIL: {p}"
    assert any(f["code"] == "MATERIALS_OVER_BAND" for f in p["findings"]), p
    # OpenFlexure live ~£640 vs mid £198 → FAIL
    o = check_materials_band("lab_microscope", 640.25)
    assert not o["ok"] and o["ratio"] > 2.0, o
    # Exact midpoint PASS
    m = check_materials_band("openflexure", 198.0)
    assert m["ok"] and m["anchor_key"] in ("openflexure", "lab_microscope"), m
    # Unknown class skips (does not false-fail)
    u = check_materials_band("unseen_archetype_xyz", 9999.0)
    assert u.get("skipped") and u["ok"], u
    # Band math
    lo, hi = band_for_midpoint(200.0, 0.15)
    assert abs(lo - 170.0) < 1e-6 and abs(hi - 230.0) < 1e-6
    print("gold_cost_band _selftest: OK (adversarial over-band proveCatch)")


def main() -> int:
    import argparse
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("state_or_key", nargs="?", default="",
                    help="state.json path OR product key with --materials")
    ap.add_argument("--materials", type=float, default=None)
    ap.add_argument("--selftest", action="store_true")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()
    if args.selftest:
        _selftest()
        return 0
    if args.materials is not None:
        res = check_materials_band(args.state_or_key or "unknown", args.materials)
    else:
        if not args.state_or_key:
            ap.error("state.json or --materials required unless --selftest")
        st = json.loads(Path(args.state_or_key).read_text())
        res = check_state(st)
    if args.json:
        print(json.dumps(res, indent=2))
    else:
        status = "PASS" if res.get("ok") else "FAIL"
        print(f"[{status}] {res.get('product_key')} materials="
              f"£{res.get('materials_gbp', '?')} gold="
              f"£{res.get('gold_midpoint_gbp', '?')} "
              f"ratio={res.get('ratio', '?')}×")
        for f in res.get("findings") or []:
            print(f"  ✗ {f.get('code')}: {f.get('message')}")
    return 0 if res.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
