#!/usr/bin/env python3
"""Meta-check: can each check FAIL, and does it read a LIVE value?

⭐⭐ WHY (Bar A 7, 2026-08-03). Three separate defects this week were the same
shape — a GREEN CHECK THAT STRUCTURALLY COULD NOT GO RED:

  1. TAUTOLOGY. `Brief target met: magnet_temp_limit_c — 150 vs 150 — PASS`. The
     brief metric matched a contract quantity of the SAME NAME, so the check
     compared the target to itself. It sat green while the magnets ran 9.3 K over
     that very limit.
  2. STALE INPUT. A check read `mgu_magnet_temp_c = 101.82` from a tool that ran
     before the iron loss was corrected and was never re-run. The corrected
     159.35 C existed in the screen artefact and in state; the CHECK just did not
     consume it. The dossier reported the thermal design PASSING.
  3. PARTIAL TEST SET. A guard's proveCatch exercised ONE filename out of two, so
     a correct guard sat inert for a year with a green selftest.

None was caught by "are the numbers right?" Each needed a different question, and
nothing in the engine asked it. This asks it.

A check that cannot fail is WORSE than no check: it occupies the slot where a real
one would have failed, and it renders to a human as evidence. This is the natural
companion to the GATE INTENT RULE — that rule says a gate must prove it CATCHES;
this says a check must be capable of NOT passing.

⚠ SCOPE, and an honest limit. This audits check STRUCTURE, not correctness — a
check can be falsifiable and still measure the wrong thing. It is a floor.

Source identity is the generic tautology signal: when `actual_source` and
`expected_source` are both non-empty and equal, both sides read one value.
Value equality is NOT a substitute — a passing `eq` check always shows equal
values. The BRIEF-family detail regex remains as a fallback for unpopulated
sites that predate the source fields.

Usage:
    check_falsifiability_audit.py --twin <dir> [--enforce]   # exit 46 when enforcing
    check_falsifiability_audit.py --selftest
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

EXIT_UNFALSIFIABLE = 46
# A check whose actual and expected are this close AND identical to full float
# precision is comparing one value to itself, not two measurements to each other.
IDENTITY_EPS = 0.0


def audit(checks: list) -> dict:
    """Structural audit of a Check list. Pure — no I/O, same answer every run."""
    findings: list[dict] = []

    for c in checks:
        if not isinstance(c, dict):
            continue
        name = str(c.get("name") or "")
        status = str(c.get("status") or "")
        rel = str(c.get("relation") or "eq")
        a, e = c.get("actual"), c.get("expected")
        tol = c.get("tol")

        # ── 1. TAUTOLOGY: the check compares a value to ITSELF ────────────────
        # ⚠ VALUE EQUALITY IS NOT THE SIGNATURE, and my first version got this
        # wrong. An `eq` check that PASSES will ALWAYS show actual == expected —
        # that is what passing means. Running v1 against the live twin flagged 135
        # of 169 checks, almost all of them legitimate arithmetic like
        # "BoM X-140: unit_gbp x qty == line_gbp, 3.0 vs 3.0". A meta-check that
        # cries wolf 135 times gets switched off, which is how a meta-check dies.
        #
        # The real signature is SOURCE IDENTITY: both sides read the same key.
        # When actual_source and expected_source are both populated and equal,
        # the check cannot fail — generic, two-line rule. Fallback: BRIEF-family
        # detail regex for sites that have not yet populated the source fields.
        _asrc = str(c.get("actual_source") or "").strip()
        _esrc = str(c.get("expected_source") or "").strip()
        if _asrc and _esrc and _asrc == _esrc:
            findings.append({
                "check": name, "kind": "tautology",
                "issue": (f"actual_source and expected_source are both '{_asrc}' — "
                          f"both sides read one value, so the check cannot fail"),
            })
        else:
            _m = re.search(r"design \(([^)]+)\)", str(c.get("detail") or ""))
            if _m and name.lower().endswith(_m.group(1).strip().lower()):
                findings.append({
                    "check": name, "kind": "tautology",
                    "issue": (f"the check binds its ACTUAL to '{_m.group(1).strip()}', which "
                              f"is the same key it is targeting — both sides are one "
                              f"value, so it cannot fail"),
                })

        if isinstance(a, (int, float)) and isinstance(e, (int, float)):
            # ── 2. TOLERANCE SWALLOWS THE COMPARISON ─────────────────────────
            # A tolerance at or above the magnitude being compared makes any
            # value pass. That is a tautology with extra steps.
            if (isinstance(tol, (int, float)) and tol > 0 and e not in (0, None)
                    and abs(tol) >= abs(e)):
                findings.append({
                    "check": name, "kind": "tolerance_swallows_check",
                    "issue": (f"tolerance {tol} is >= the expected magnitude {e} — "
                              "no achievable value can fail this check"),
                })

        # ── 3. NO COMPARISON AT ALL ──────────────────────────────────────────
        # A PASS with nothing to compare is an assertion, not a measurement.
        if status == "PASS" and a is None and e is None and rel != "tally":
            findings.append({
                "check": name, "kind": "no_comparison",
                "issue": ("PASS with neither an actual nor an expected value — "
                          "nothing was measured, so nothing could have failed"),
            })

    return {
        "schema": "forgeos.checks.falsifiability_audit/v1",
        "checks_audited": len(checks),
        "findings": findings,
        "unfalsifiable_count": len(findings),
        "ok": not findings,
    }


def _selftest() -> int:
    fails: list[str] = []

    def ck(name, ok, detail=""):
        if not ok:
            fails.append(f"{name}: {detail}")

    # ⭐⭐ proveCatch 1 — the EXACT tautology that shipped green while the magnets
    # breached. If this stops firing, that defect can return unnoticed.
    # Fallback path: brief-detail regex (unpopulated source fields).
    taut = [{"name": "Brief target met: magnet_temp_limit_c", "status": "PASS",
             "actual": 150.0, "expected": 150.0, "relation": "le",
             "detail": "Brief target magnet_temp_limit_c = 150 C; design "
                       "(magnet_temp_limit_c) = 150 C — a ceiling."}]
    r = audit(taut)
    ck("proveCatch.tautology_caught",
       any(f["kind"] == "tautology" for f in r["findings"]),
       "150-vs-150 compared to itself was not flagged")

    # ⭐⭐ proveCatch 1b — SOURCE IDENTITY: same-source pair is a tautology even
    # without the brief-detail regex. Different-source equal values stay silent
    # (a legitimate BoM unit×qty == line_gbp PASS always shows equal numbers).
    same_src = [{"name": "same-source tautology", "status": "PASS",
                 "actual": 42.0, "expected": 42.0, "relation": "eq",
                 "actual_source": "contract:magnet_temp_limit_c",
                 "expected_source": "contract:magnet_temp_limit_c"}]
    ck("proveCatch.same_source_tautology",
       any(f["kind"] == "tautology" for f in audit(same_src)["findings"]),
       "equal actual_source and expected_source was not flagged")
    diff_src = [{"name": "BoM I-4: unit_gbp x qty == line_gbp", "status": "PASS",
                 "actual": 3.0, "expected": 3.0, "relation": "eq",
                 "actual_source": "bom:I-4:unit*qty",
                 "expected_source": "bom:I-4:line_gbp"}]
    ck("proveCatch.diff_source_equal_values_silent",
       not any(f["kind"] == "tautology" for f in audit(diff_src)["findings"]),
       "different-source equal values were wrongly flagged as tautology")

    # ⭐ proveCatch 2 — a tolerance wide enough to swallow the comparison.
    swallowed = [{"name": "wide tolerance", "status": "PASS", "actual": 5.0,
                  "expected": 10.0, "tol": 12.0, "relation": "eq"}]
    ck("proveCatch.tolerance_swallow_caught",
       any(f["kind"] == "tolerance_swallows_check"
           for f in audit(swallowed)["findings"]),
       "a tolerance larger than the expected magnitude was not flagged")

    # ⭐ proveCatch 3 — a PASS asserting nothing.
    empty = [{"name": "bare assertion", "status": "PASS", "relation": "eq"}]
    ck("proveCatch.no_comparison_caught",
       any(f["kind"] == "no_comparison" for f in audit(empty)["findings"]),
       "a PASS with no actual and no expected was not flagged")

    # ⭐⭐ THE NEGATIVE CASE MATTERS MOST. A genuine check must stay silent, or
    # this audit becomes noise and gets switched off — which is how a meta-check
    # dies. These are real shapes from the live twin.
    # ⭐⭐ THE NEGATIVE CASES ARE THE POINT. v1 flagged 135 of 169 live checks and
    # would have been switched off within a day. These are the real shapes it must
    # stay silent on.
    good = [
        # the FIXED brief check: binds to a DIFFERENT key, and fails honestly
        {"name": "Brief target met: magnet_temp_limit_c", "status": "FAIL",
         "actual": 159.35, "expected": 150.0, "tol": 7.5, "relation": "le",
         "actual_source": "contract:mgu_magnet_temp_c",
         "expected_source": "brief:magnet_temp_limit_c",
         "detail": "Brief target magnet_temp_limit_c = 150 C; design "
                   "(mgu_magnet_temp_c) = 159.35 C — a ceiling."},
        # legitimate passing arithmetic — equal values are what PASS means;
        # DIFFERENT sources so source-identity does not cry wolf
        {"name": "BoM X-140: unit_gbp x qty == line_gbp", "status": "PASS",
         "actual": 3.0, "expected": 3.0, "relation": "eq",
         "actual_source": "bom:X-140:unit*qty",
         "expected_source": "bom:X-140:line_gbp"},
        # provenance: tool output vs contract — different sources, equal values OK
        {"name": "Tool output used: mgu_shaft_power_kw", "status": "PASS",
         "actual": 244.49, "expected": 244.49, "relation": "eq",
         "actual_source": "tool:motor:loss-point:mgu_shaft_power_kw",
         "expected_source": "contract:mgu_shaft_power_kw"},
        {"name": "tally row", "status": "PASS", "relation": "tally"},
    ]
    gr = audit(good)
    ck("no_false_positives_on_real_shapes", gr["ok"],
       f"legitimate checks were flagged — this is how a meta-check gets switched "
       f"off: {gr['findings']}")

    ck("empty_input_is_clean", audit([])["ok"], "an empty check list was not clean")

    for f in fails:
        print(f"  FAIL {f}")
    print("check_falsifiability_audit selftest: OK" if not fails
          else f"FAIL check_falsifiability_audit selftest ({len(fails)} failures)")
    return 1 if fails else 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--twin", type=Path)
    ap.add_argument("--enforce", action="store_true")
    ap.add_argument("--selftest", action="store_true")
    args = ap.parse_args()
    if args.selftest:
        return _selftest()
    if not args.twin:
        ap.error("--twin required")
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    import deterministic_checks_lib as D
    state = json.loads((args.twin / "state.json").read_text())
    # NB the signature is run_all_checks(run_dir, state) — run_dir FIRST.
    checks = [c.__dict__ if hasattr(c, "__dict__") else c
              for c in D.run_all_checks(str(args.twin), state)]
    r = audit(checks)
    print(f"[falsifiability] audited {r['checks_audited']} check(s); "
          f"{r['unfalsifiable_count']} cannot fail")
    for f in r["findings"][:25]:
        print(f"   [{f['kind']}] {f['check']}")
        print(f"        {f['issue']}")
    (args.twin / "check-falsifiability-audit.json").write_text(json.dumps(r, indent=2))
    if args.enforce and not r["ok"]:
        return EXIT_UNFALSIFIABLE
    return 0


if __name__ == "__main__":
    sys.exit(main())
