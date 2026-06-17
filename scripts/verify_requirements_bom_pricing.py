#!/usr/bin/env python3
"""verify_requirements_bom_pricing.py — deterministic price-reality check for the
universal requirements-driven BoM (council 2026-06-16/17).

Re-applies requirements_bom.assemble() to a run dir's state.json (does NOT run the
90-min chain) and reports the four things the council asked for:
  1. count of equipment lines still at £0 (target: 0 for rated kit),
  2. the genset + blower prices (must be in the £/kVA / £/kW market band),
  3. any equipment line still > 20× its rating-implied cost,
  4. the BoM Σ before → after (this is "the real price").

"Before" is taken from the run's CACHED `requirementsBom` in state.json when present
(the figure the council scored); "after" is the freshly re-applied assemble(). Usage:
  python3 scripts/verify_requirements_bom_pricing.py            # defaults to out/ras-v8 then v7
  python3 scripts/verify_requirements_bom_pricing.py out/ras-v8
"""
from __future__ import annotations
import sys, os, json, re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import requirements_bom as R


def _rating(req: str):
    m = re.search(r"([\d.]+)\s*(kVA|kW)\b", req or "")
    return (float(m.group(1)), m.group(2)) if m else (None, None)


def _cached_total(out_dir: str):
    """Σ of the run's cached requirementsBom (the council-scored 'before'), or None."""
    p = os.path.join(out_dir, "state.json")
    if not os.path.exists(p):
        return None
    try:
        st = json.load(open(p))
    except Exception:
        return None
    rb = st.get("requirementsBom")
    if isinstance(rb, list) and rb:
        return sum(float(r.get("line_gbp") or 0) for r in rb)
    return None


def verify(out_dir: str) -> int:
    rows = R.assemble(out_dir)
    sigma_after = sum(r["line_gbp"] for r in rows)
    sigma_before = _cached_total(out_dir)

    # 1) equipment lines (not connections, not breakdown-only sub-components) at £0
    #    that carry a real rating → the council's "rated kit at £0" defect.
    zero_rated = [r for r in rows
                  if r.get("line_gbp", 0) == 0 and r.get("status") != "SUB-COMPONENT"
                  and _rating(r.get("requirement", ""))[0]]
    zero_any = [r for r in rows
                if r.get("line_gbp", 0) == 0 and r.get("status") != "SUB-COMPONENT"
                and not r.get("connection")]
    # rated SUB-COMPONENTS whose displayed breakdown is still £0
    zero_sub = [r for r in rows if r.get("status") == "SUB-COMPONENT"
                and _rating(r.get("requirement", ""))[0] and r.get("breakdown_gbp", 0) == 0]

    # 2) genset + blower bands
    band_lines = []
    for r in rows:
        req = r.get("requirement", "")
        nm = req.split("·")[0].strip()
        if re.search(r"diesel[_ -]?generat|standby[_ -]?generat|aeration[_ -]?blower|\bblower\b", nm, re.I) \
                and r.get("status") in ("UTILITY", "ACTUATOR"):
            rv, ru = _rating(req)
            m = R._rated_equipment_cost(nm, rv, ru == "kVA") if rv else None
            inband = None
            if m and rv:
                lo, hi = m[2] / rv, m[3] / rv
                inband = (lo * 0.6) <= (r["unit_gbp"] / rv) <= (hi * 1.5)
            band_lines.append((nm, rv, ru, r["unit_gbp"], m, inband))

    # 3) any equipment line > 20× (or < 1/20×) its rating-implied mid
    outliers = []
    for r in rows:
        if r.get("status") == "SUB-COMPONENT" or r.get("connection"):
            continue
        nm = r.get("requirement", "").split("·")[0].strip()
        rv, ru = _rating(r.get("requirement", ""))
        if rv:
            m = R._rated_equipment_cost(nm, rv, ru == "kVA")
            if m and r["unit_gbp"] > 0:
                ratio = r["unit_gbp"] / m[0]
                if ratio > 20 or ratio < 0.05:
                    outliers.append((ratio, r["unit_gbp"], m[0], r["requirement"][:55]))

    # ── report ──
    print(f"\n===== requirements_bom price-reality check · {out_dir} =====")
    print(f"rows: {len(rows)}")
    print()
    print(f"[1] rated equipment lines at £0 : {len(zero_rated)}   (target 0)")
    print(f"    any non-connection £0 line  : {len(zero_any)}")
    print(f"    rated sub-components £0 disp : {len(zero_sub)}")
    for r in (zero_rated + zero_any)[:8]:
        print(f"      £0  [{r.get('status')}] {r.get('requirement', '')[:70]}")
    print()
    print("[2] genset + blower bands (must be in-band):")
    for nm, rv, ru, unit, m, inband in band_lines:
        band = f"£{m[2]/rv:.0f}-{m[3]/rv:.0f}/{ru}" if (m and rv) else "n/a"
        per = unit / rv if rv else 0
        flag = "OK " if inband else ("OUT" if inband is False else "?  ")
        print(f"      {flag} £{unit:>9,} ({per:>5.0f}/{ru}, band {band:>14})  {nm[:36]}")
    print()
    print(f"[3] equipment lines > 20× rating-implied mid : {len(outliers)}   (target 0)")
    for ratio, unit, mid, req in sorted(outliers, reverse=True):
        print(f"      {ratio:6.1f}×  £{unit:>9,} vs mid £{mid:>9,}  {req}")
    print()
    bstr = f"£{sigma_before:,.0f}" if sigma_before is not None else "n/a (no cached BoM)"
    print(f"[4] BoM Σ  before → after :  {bstr}  →  £{sigma_after:,.0f}   ← the real price")
    print()

    genset_blower_ok = all(ib for *_, ib in band_lines) if band_lines else True
    ok = (len(zero_rated) == 0 and len(zero_any) == 0 and len(zero_sub) == 0
          and len(outliers) == 0 and genset_blower_ok)
    print("VERDICT:", "PASS" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if args:
        targets = args
    else:
        targets = [d for d in ("out/ras-v8", "out/ras-v7")
                   if os.path.exists(os.path.join(d, "state.json"))][:1] or ["out/ras-v8"]
    rc = 0
    for t in targets:
        rc |= verify(t)
    sys.exit(rc)
