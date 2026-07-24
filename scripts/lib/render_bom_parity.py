#!/usr/bin/env python3
"""render↔BoM part-parity — the SIGHT principle made executable for parts.

Motivation (2026-07-24): a part injected into the decomposition and DRAWN in the render
(the internal wiring harness) silently vanished from the BoM because TWO independent
filters dropped it (a requirements_bom name-skip + the interior packer). Nothing asserted
the thing a human actually checks on the delivered dossier: *does every part I can SEE in
the render appear on the bill, and does every part an augmenter promised to bill actually
appear?* This module encodes that invariant so iter-N catches iter-(N+1).

Two directions, different strengths:

  CHECK A — rendered-principal ⊆ BoM (HARD). Every placed principal in parts-manifest.json
    (a mesh carrying an equipment_tag, e.g. P-101) MUST have a BoM requirement line. Catches
    "we render a part the customer sees but never costed it". Low false-positive: only
    equipment-tagged principals are asserted (sub-features / decoration have no tag).

  CHECK B — declared-billable ⊆ BoM (HARD, the tight guard for the harness class). A universal
    completeness augmenter (power_subsystem chassis/harness/power) declares a part is BOTH
    rendered AND a BoM line. Every declared name MUST appear in the BoM. Zero ambiguity —
    these words carry an explicit "rendered → BoM" contract; if one is missing, a filter ate it.

The reverse direction (BoM physical line not rendered) is NOT hard-asserted: cabling, labour,
terminations, install and consumables are legitimate BoM lines with no mesh. It is reported
as INFO for the operator, never a fail.

Pure + deterministic (no Blender, no network). `check_parity()` is unit-testable; run
`python3 scripts/lib/render_bom_parity.py --selftest` for the proveCatch.
"""
from __future__ import annotations
import re
from typing import Any


def _norm(s: Any) -> str:
    return re.sub(r"[^a-z0-9]", "", str(s or "").lower())


# BoM lines that are legitimately NOT a rendered mesh — the reverse-direction INFO skips these.
_NON_MESH_BOM_RE = re.compile(
    r"cabl|wiring run|termination|install|labour|labor|freight|carriage|"
    r"consumable|media\b|reagent|calibration|commission|test\b|documentation|"
    r"assembly labour|contingency|markup|overhead", re.I)


def _bom_has(name: str, bom_norms: list[str]) -> bool:
    """True when a BoM requirement row shares this part's identity. Match is symmetric-
    substring on the normalised names, so 'Internal Wiring Harness' matches a BoM row
    'Internal Wiring Harness · loomed cable harness' and vice-versa. Guards against a
    too-short token matching everything (min 4 chars of overlap)."""
    n = _norm(name)
    if len(n) < 4:
        return False
    for b in bom_norms:
        if not b:
            continue
        if n in b or b in n:
            return True
    return False


def check_parity(manifest_parts: list[dict],
                 bom_names: list[str],
                 declared_billable: list[str] | None = None) -> dict:
    """Compare the RENDER (parts-manifest principals) + any DECLARED-billable augmenter parts
    against the delivered BoM requirement names. Returns
      {"ok": bool, "findings": [{severity, kind, part, detail}], "counts": {...}}.
    HARD findings (severity 'high') set ok=False; 'info' findings never do."""
    bom_norms = [_norm(x) for x in (bom_names or [])]
    findings: list[dict] = []

    # CHECK A — every equipment-tagged rendered principal must be a BoM line.
    n_principals = 0
    for p in manifest_parts or []:
        tag = str(p.get("equipment_tag") or "").strip()
        name = str(p.get("name") or "").strip()
        if not tag or not name:
            continue                 # decoration / sub-feature — not a billable principal
        n_principals += 1
        if not _bom_has(name, bom_norms):
            findings.append({
                "severity": "high", "kind": "RENDERED_PRINCIPAL_NOT_IN_BOM",
                "part": name, "detail": f"principal {tag} '{name}' is placed in the render "
                                        f"but has no BoM requirement line — a part the "
                                        f"customer sees that was never costed"})

    # CHECK B — every augmenter-declared 'rendered → BoM' part must be a BoM line.
    for name in (declared_billable or []):
        if not _bom_has(name, bom_norms):
            findings.append({
                "severity": "high", "kind": "DECLARED_BILLABLE_NOT_IN_BOM",
                "part": name, "detail": f"'{name}' was declared rendered-and-billable by a "
                                        f"completeness augmenter but is absent from the BoM — "
                                        f"a downstream filter dropped it (see the "
                                        f"requirements_bom name-skip / packer-skip class)"})

    # REVERSE (INFO only) — a physical-looking BoM line with no rendered mesh.
    manifest_norms = [_norm(p.get("name")) for p in (manifest_parts or [])]
    declared_norms = [_norm(x) for x in (declared_billable or [])]
    seen_rev = set()
    for nm in bom_names or []:
        if _NON_MESH_BOM_RE.search(str(nm)):
            continue
        bn = _norm(nm)
        if not bn or bn in seen_rev:
            continue
        seen_rev.add(bn)
        if any((bn in m or m in bn) for m in manifest_norms if m) \
                or any((bn in d or d in bn) for d in declared_norms if d):
            continue
        findings.append({
            "severity": "info", "kind": "BOM_LINE_NOT_RENDERED",
            "part": str(nm), "detail": "physical-looking BoM line with no matching rendered "
                                       "mesh (may be a legitimate off-mesh part or a render gap)"})

    hard = [f for f in findings if f["severity"] == "high"]
    return {"ok": not hard, "findings": findings,
            "counts": {"principals": n_principals, "bom_lines": len(bom_names or []),
                       "declared_billable": len(declared_billable or []),
                       "hard": len(hard), "info": len(findings) - len(hard)}}


def _selftest():
    # A realistic mini-run: 3 rendered principals + a declared-billable harness set.
    manifest = [
        {"equipment_tag": "P-101", "name": "Dosing Peristaltic Pump"},
        {"equipment_tag": "X-109", "name": "Magnetic Stirrer Drive"},
        {"equipment_tag": "V-101", "name": "Autoclavable Glass Culture Vessel"},
        {"equipment_tag": "", "name": "decoration bracket"},   # no tag → not asserted
    ]
    declared = ["Chassis Base Plate", "Interior Mounting Frame", "Internal Wiring Harness"]

    # GOOD BoM — every principal + every declared part present.
    good_bom = ["Dosing Peristaltic Pump · 14 ul/min", "Magnetic Stirrer Drive · 100 rpm",
                "Autoclavable Glass Culture Vessel · 20 ml", "Chassis Base Plate",
                "Interior Mounting Frame · standoff kit", "Internal Wiring Harness · loom",
                "Cabling 1.5 mm²", "Assembly labour"]
    r = check_parity(manifest, good_bom, declared)
    assert r["ok"], f"clean run must pass, got {r['findings']}"
    assert r["counts"]["principals"] == 3, r["counts"]
    assert r["counts"]["hard"] == 0, r

    # proveCatch B — the EXACT session bug: harness dropped from the BoM.
    bom_no_harness = [x for x in good_bom if "Wiring Harness" not in x]
    r2 = check_parity(manifest, bom_no_harness, declared)
    assert not r2["ok"], "must FAIL when a declared-billable part is missing from the BoM"
    kinds = {f["kind"] for f in r2["findings"] if f["severity"] == "high"}
    assert "DECLARED_BILLABLE_NOT_IN_BOM" in kinds, kinds
    assert any(f["part"] == "Internal Wiring Harness" for f in r2["findings"]), r2

    # proveCatch A — a rendered principal never costed.
    bom_no_pump = [x for x in good_bom if "Peristaltic" not in x]
    r3 = check_parity(manifest, bom_no_pump, declared)
    assert not r3["ok"], "must FAIL when a rendered principal has no BoM line"
    assert any(f["kind"] == "RENDERED_PRINCIPAL_NOT_IN_BOM" and "Pump" in f["part"]
               for f in r3["findings"]), r3

    # reverse direction is INFO only — never flips ok. Add an off-mesh physical line.
    r4 = check_parity(manifest, good_bom + ["Spare O-ring kit"], declared)
    assert r4["ok"], "an off-mesh BoM line must NOT hard-fail (INFO only)"
    assert any(f["kind"] == "BOM_LINE_NOT_RENDERED" and "O-ring" in f["part"]
               for f in r4["findings"]), r4
    # cabling/labour must be skipped from the reverse net entirely.
    assert not any("Cabling" in f["part"] or "labour" in f["part"].lower()
                   for f in r4["findings"]), "cabling/labour are legit off-mesh lines — skip"

    print("render_bom_parity _selftest: OK (A rendered-principal⊆BoM fires on un-costed pump; "
          "B declared-billable⊆BoM fires on the dropped wiring harness; reverse=INFO only; "
          "cabling/labour skipped; clean run passes)")


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1 and sys.argv[1] in ("--selftest", "selftest"):
        _selftest()
        sys.exit(0)
    # CLI: point at a run dir with parts-manifest.json; reads requirements-bom names if present.
    import json, os
    run_dir = sys.argv[1] if len(sys.argv) > 1 else "."
    pm = json.load(open(os.path.join(run_dir, "parts-manifest.json")))
    parts = pm.get("parts") if isinstance(pm, dict) else pm
    rb_path = os.path.join(run_dir, "requirements-bom.json")
    bom_names: list[str] = []
    if os.path.exists(rb_path):
        rb = json.load(open(rb_path))
        rows = rb.get("rows") if isinstance(rb, dict) else rb
        bom_names = [str((r or {}).get("requirement") or (r or {}).get("name") or "")
                     for r in (rows or [])]
    res = check_parity(parts, bom_names)
    print(json.dumps(res, indent=1))
    sys.exit(0 if res["ok"] else 1)
