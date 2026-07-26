"""Verify-before-bind for the semantic self-audit's blocking_defects (2026-07-25).

Council-unanimous architecture "LLM discovers, code binds"
(mempalace drawer_forgeos_decisions_3d529331a410101e): a self-audit blocking_defect
must NOT hard-floor the dossier on its own (the old rule in compute_verdict was
"len(blocking_defects) > 0 -> floor 4.0", which floored the whole dossier on any
stochastic LLM finding — different every run, a treadmill). Instead each defect is
routed to a DETERMINISTIC check compiled from its family; it BINDS only if that check
CONFIRMS the violation. A finding whose compiled check PASSES is noise / already-fixed
and is RETIRED (advisory). Families WITHOUT a compiled check yet KEEP binding
(conservative — never weaken the gate until a real check exists) and are tracked as
compile-debt. The signal-vs-noise distinction is FALSIFIABILITY + REPLAY, never judge
confidence or majority.

Pure + deterministic (no bpy, no LLM, no I/O) so it is unit-testable and can be called
from compute_verdict. Run `python3 scripts/lib/self_audit_verify.py --selftest`.
"""
import re

_FAMILY_RE = re.compile(r"^\s*\[([a-z_]+)\]", re.I)


def defect_family(defect) -> str:
    """The `[family]` prefix a self-audit defect carries (e.g. '[brief_compliance] …')."""
    m = _FAMILY_RE.match(str(defect or ""))
    return m.group(1).lower() if m else "unknown"


def _target_present(v) -> bool:
    """Is a brief-constraint slot's TARGET actually specified (not null / source:missing)?"""
    if v is None:
        return False
    if isinstance(v, dict):
        if str(v.get("source", "")).lower() == "missing":
            return False
        if "value" in v:
            return v.get("value") is not None
        # nested slot (max_dimensions_mm w/d/h, operating_environment temp_min/max):
        # present iff ANY non-`source` sub-field is non-null.
        return any(sv is not None for sk, sv in v.items() if sk != "source")
    return True


def brief_constraint_slots(state):
    """Enumerate the TOP-LEVEL brief constraint slots as (key, has_target: bool). A slot
    whose target is null/missing MUST be disclosed N/A in the compliance table — never
    counted PASS, never silently absent (the self-audit's exact concern: "brief has
    mass_cap=null and operating_env missing … none disclosed as unverified or N/A").

    Deliberately EXCLUDES target_performance.metrics: those are per-ROW compliance entries
    whose null-target case is handled deterministically at render time by
    _compliance_row_pass / _render_brief_compliance_section (commit afef9585 — a
    quantitative null-target metric row renders UNVERIFIED). A metric with a null
    metrics[].target frequently STILL resolves to a real value via
    orchestratorContract.quantities (r7: name/target null but 20 ml / 37 C resolve
    downstream), so enumerating them here would false-flag verifiable metrics."""
    pb = (state or {}).get("parsedBrief") or {}
    c = pb.get("constraints") or {}
    slots = []
    for key in ("unit_cost_ceiling", "max_mass_kg", "max_dimensions_mm",
                "operating_environment", "design_life", "batch_size"):
        if key in c:
            slots.append((key, _target_present(c.get(key))))
    return slots


def brief_compliance_honest(state, disclosed_na_keys=None):
    """The DETERMINISTIC check the self-audit's `[brief_compliance]` over-claim finding
    compiles to (the honest-scoring precondition: never claim PASS over a null/unverifiable
    cell, never silently drop a brief constraint). Every brief constraint whose target is
    null/missing MUST appear in `disclosed_na_keys` (the set of keys the DELIVERED compliance
    table marks UNVERIFIED / N/A — a SIGHT input read from the rendered artefact). A null-target
    constraint that is NOT so disclosed is a violation.

    Returns {honest: bool, violations: [key, …]}. `disclosed_na_keys=None` means nothing was
    disclosed N/A (the pre-fix state, where null constraints are silently absent -> dishonest)."""
    na = set(disclosed_na_keys or ())
    violations = [key for key, has_target in brief_constraint_slots(state)
                  if (not has_target) and key not in na]
    return {"honest": len(violations) == 0, "violations": violations}


def _bom_cost_band(state):
    """The brief's BoM cost plausibility band (floor, ceiling) from its derived cost anchors,
    or (None, None) if the brief states none. floor = bom_cost_floor_gbp; ceiling =
    unit_cost_ceiling_gbp, else reconstructed from the midpoint (2·mid − floor)."""
    def _num(x):
        try:
            return float(str(x).replace(",", "").replace("£", "").strip())
        except (TypeError, ValueError):
            return None
    floor = mid = ceil = None
    km = (state or {}).get("keyMetrics") or {}
    for grp in ("supporting_metrics", "primary_metrics"):
        for m in (km.get(grp) or []):
            if not isinstance(m, dict):
                continue
            mid = _num(m.get("value")) if m.get("id") == "bom_cost_midpoint_gbp" else mid
            floor = _num(m.get("value")) if m.get("id") == "bom_cost_floor_gbp" else floor
    con = (((state or {}).get("parsedBrief") or {}).get("constraints") or {})
    _uc = con.get("unit_cost_ceiling")
    if isinstance(_uc, dict):
        ceil = _num(_uc.get("value"))
    elif _uc is not None:
        ceil = _num(_uc)
    if ceil is None and mid is not None and floor is not None:
        ceil = 2 * mid - floor
    return (floor, ceil)


def bom_plausible(state):
    """The DETERMINISTIC check a `[bill_of_materials]` self-audit finding compiles to.

    The self-audit exists to catch a BROKEN / deceptive bill — an empty £0 fallback, a
    single line that dominates the rollup implausibly (the organoid r11 finding's "£186
    thermal pad = 64% of the bill" class), or a total wildly outside the brief's own cost
    band. When NONE of those hold, the bill is deterministically sound and the LLM's BoM
    complaint is noise / stale (r11: the £186 pad and the £114 estimate it cited no longer
    exist in the £287 bill). Minor per-line data gaps (a £0 commodity line) are scored by
    the deterministic Bill-of-Materials ledger tab itself, not re-litigated here.

    Returns {plausible: bool, reasons: [str, …]}. Conservative: any real brokenness binds."""
    rb = (state or {}).get("requirementsBom")
    if not isinstance(rb, list) or not rb:
        return {"plausible": False, "reasons": ["no assembled BoM (empty / fallback bill)"]}
    lines = [float((r or {}).get("line_gbp", 0) or 0) for r in rb if isinstance(r, dict)]
    total = round(sum(lines), 2)
    reasons = []
    if total <= 0:
        reasons.append("BoM total is £0 (empty / fallback bill)")
    else:
        top = max(lines) if lines else 0.0
        if top / total > 0.40:
            reasons.append(f"a single line is £{top:.0f} = {top/total*100:.0f}% of the "
                           f"£{total:.0f} bill (implausible dominant line)")
        floor, ceil = _bom_cost_band(state)
        if floor is not None and total < floor * 0.5:
            reasons.append(f"BoM £{total:.0f} is < half the brief cost floor £{floor:.0f}")
        if ceil is not None and total > ceil * 2.0:
            reasons.append(f"BoM £{total:.0f} is > 2× the brief cost ceiling £{ceil:.0f}")
    return {"plausible": len(reasons) == 0, "reasons": reasons}


# Families that have a compiled deterministic check. Everything else binds conservatively
# (KEEP the old behaviour) until its check is written — never a silent downgrade.
_COMPILED_FAMILIES = ("brief_compliance", "bill_of_materials")


def verify_blocking_defect(defect, state, disclosed_na_keys=None):
    """Route ONE blocking_defect to its compiled check.
    Returns {binds, family, compiled, reason}."""
    fam = defect_family(defect)
    if fam == "brief_compliance":
        v = brief_compliance_honest(state, disclosed_na_keys)
        if not v["honest"]:
            return {"binds": True, "family": fam, "compiled": True,
                    "reason": ("compliance disclosure DISHONEST — null-target constraint(s) "
                               "not disclosed N/A: " + ", ".join(v["violations"]))}
        return {"binds": False, "family": fam, "compiled": True,
                "reason": "compliance disclosure honest (every null-target constraint disclosed "
                          "N/A) — LLM finding retired as noise"}
    if fam == "bill_of_materials":
        v = bom_plausible(state)
        if not v["plausible"]:
            return {"binds": True, "family": fam, "compiled": True,
                    "reason": "BoM deterministically BROKEN — " + "; ".join(v["reasons"])}
        return {"binds": False, "family": fam, "compiled": True,
                "reason": ("BoM deterministically sound (real total · no dominant line · cost in "
                           "band) — LLM finding retired as noise / stale")}
    return {"binds": True, "family": fam, "compiled": False,
            "reason": f"no deterministic check compiled for family '{fam}' yet — binds "
                      f"conservatively (compile-debt; do not weaken the gate)"}


def partition_blocking_defects(blocking_defects, state, disclosed_na_keys=None):
    """Split blocking_defects into {binding, retired, uncompiled}. `binding` floors the
    verdict; `retired` = LLM noise a compiled check cleared; `uncompiled` = no check yet
    (still binds, tracked as debt). compute_verdict floors iff `binding` is non-empty."""
    binding, retired, uncompiled = [], [], []
    for d in (blocking_defects or []):
        r = verify_blocking_defect(d, state, disclosed_na_keys)
        entry = {"defect": str(d)[:200], **r}
        if not r["compiled"]:
            uncompiled.append(entry)
            binding.append(entry)
        elif r["binds"]:
            binding.append(entry)
        else:
            retired.append(entry)
    return {"binding": binding, "retired": retired, "uncompiled": uncompiled}


def _selftest() -> None:
    # defect_family parsing
    assert defect_family("[brief_compliance] banner over-claims") == "brief_compliance"
    assert defect_family("[physics_fidelity] 13.07mm path") == "physics_fidelity"
    assert defect_family("no prefix") == "unknown"

    # brief with a null mass_cap + a present cost ceiling + a present metric
    st = {"parsedBrief": {"constraints": {
        "unit_cost_ceiling": {"value": 385, "source": "user"},
        "max_mass_kg": {"value": None, "source": "missing"},
        "operating_environment": {"temp_min_c": None, "temp_max_c": None, "source": "missing"},
        "target_performance": {"metrics": [{"name": "working_volume_ml", "target": 20}]},
    }}}

    # (a) brief_compliance finding + NOTHING disclosed N/A -> the two null slots are
    #     violations -> the finding is deterministically confirmed -> BINDS.
    r = verify_blocking_defect("[brief_compliance] banner claims all PASS", st, disclosed_na_keys=None)
    assert r["binds"] is True and r["compiled"] is True, r
    assert "max_mass_kg" in r["reason"] and "operating_environment" in r["reason"], r

    # (b) SAME finding but both null slots ARE disclosed N/A -> disclosure honest ->
    #     finding RETIRED as noise (does NOT floor).
    r = verify_blocking_defect("[brief_compliance] banner claims all PASS", st,
                               disclosed_na_keys={"max_mass_kg", "operating_environment"})
    assert r["binds"] is False and r["compiled"] is True, r

    # (c) a brief with every constraint present -> no violations -> honest -> retired.
    st_full = {"parsedBrief": {"constraints": {
        "unit_cost_ceiling": {"value": 385, "source": "user"},
        "target_performance": {"metrics": [{"name": "v", "target": 20}]},
    }}}
    r = verify_blocking_defect("[brief_compliance] x", st_full)
    assert r["binds"] is False, r

    # (d) an UNCOMPILED family (physics_fidelity) -> binds conservatively, flagged compile-debt.
    r = verify_blocking_defect("[physics_fidelity] 13.07mm OD path vs 20ml vial", st)
    assert r["binds"] is True and r["compiled"] is False, r

    # (e) partition: a mix -> physics binds (uncompiled), brief_compliance retired when honest.
    part = partition_blocking_defects(
        ["[brief_compliance] over-claim", "[physics_fidelity] path"],
        st, disclosed_na_keys={"max_mass_kg", "operating_environment"})
    assert len(part["binding"]) == 1 and part["binding"][0]["family"] == "physics_fidelity", part
    assert len(part["retired"]) == 1 and part["retired"][0]["family"] == "brief_compliance", part
    assert len(part["uncompiled"]) == 1, part

    # (f) partition floors when brief_compliance is genuinely dishonest.
    part = partition_blocking_defects(["[brief_compliance] over-claim"], st, disclosed_na_keys=None)
    assert len(part["binding"]) == 1 and part["binding"][0]["compiled"] is True, part
    assert len(part["retired"]) == 0, part

    # (g) bill_of_materials — a SOUND bill retires the LLM's stale complaint (organoid r11:
    #     £287 total, top line £60 = 21%, cost in the £275-385 band → noise).
    _bom_ok_state = {
        "keyMetrics": {"supporting_metrics": [
            {"id": "bom_cost_floor_gbp", "value": "275"},
            {"id": "bom_cost_midpoint_gbp", "value": "330"}]},
        "requirementsBom": [{"line_gbp": 60}, {"line_gbp": 45}, {"line_gbp": 30},
                            {"line_gbp": 25}, {"line_gbp": 25}, {"line_gbp": 22},
                            {"line_gbp": 20}, {"line_gbp": 18}, {"line_gbp": 15},
                            {"line_gbp": 15}, {"line_gbp": 12}],  # Σ 287, top 60 = 21%
    }
    r = verify_blocking_defect("[bill_of_materials] a £186 pad dominates the rollup", _bom_ok_state)
    assert r["binds"] is False and r["compiled"] is True, r
    # (h) a BROKEN bill (one line = 64% of the total) still BINDS — the gate is not weakened.
    _bom_bad_state = {"requirementsBom": [{"line_gbp": 186}, {"line_gbp": 60}, {"line_gbp": 45}]}
    r = verify_blocking_defect("[bill_of_materials] dominant line", _bom_bad_state)
    assert r["binds"] is True and r["compiled"] is True and "dominant" in r["reason"], r
    # (i) an empty / £0 fallback bill BINDS.
    r = verify_blocking_defect("[bill_of_materials] empty", {"requirementsBom": []})
    assert r["binds"] is True and r["compiled"] is True, r

    print("self_audit_verify _selftest: OK "
          "(HONESTY.compiled_finding_binds_only_when_check_fails — brief_compliance compiled, "
          "uncompiled families bind conservatively, 6 proveCatch directions)")


if __name__ == "__main__":
    import sys
    if "--selftest" in sys.argv:
        _selftest()
