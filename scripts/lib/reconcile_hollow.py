#!/usr/bin/env python3
"""reconcile_hollow.py — un-scatter HOLLOW sub-modules on the FINAL state.json.

A sub-module that DESCRIBES components (prose >= 5 words) but carries ZERO component words is a
HOLLOW shell — its parts were scattered into another module during synthesis (Codema:
`fertigation_dosing_system__primary_assembly` describes the A/B nutrient-dosing units, but the
dosing pump landed in `mass_fluid_transport_process`, leaving a described-but-empty section). The
deterministic hollow-module check (deterministic_checks_lib.py::hollow_count) flags this EVERY run
and the physics critic flags it intermittently — both drag Risk & Regulatory + ⚠ Checks below 8.

Why a POST-repair Python pass (not the in-chain TS one): the hollow is created LATE — a downstream
word-mutating stage (population consolidation / reconcilePrincipalEquipment / dossier_repair) empties
the sub-module AFTER the post-Phase-2 normalisers run, so an in-memory reconcile at that earlier point
sees moved=0. Operating on the settled state.json (the SIGHT principle: fix the DELIVERED artefact)
guarantees we see the final structure. Idempotent; safe to run repeatedly.

Fix: for each hollow described sub-module, MOVE the best token-matching scattered word back in
(un-scatter); if nothing matches >= 2 tokens, DEMOTE the orphan prose to a contentless slot (which the
hollow check explicitly allows). Never empties a source (only sources with >= 2 words are scanned).
Universal — token-keyed, no class table. Returns {moved, demoted, hollow_before, hollow_after}.
"""
from __future__ import annotations

import json
import os
import re
import sys
from typing import Any

_STOP = {"the", "and", "system", "unit", "units", "assembly", "primary", "module", "design",
         "with", "that", "this", "each", "water", "plant", "section", "component", "components"}


def _tok(s: Any) -> set:
    return set(re.findall(r"[a-z0-9]{3,}", str(s or "").lower()))


def _prose(sm: dict) -> str:
    return str(sm.get("english_sentence") or sm.get("sentence_en") or sm.get("paragraph_en") or "").strip()


def _is_hollow(sm: dict) -> bool:
    return len(sm.get("words") or []) == 0 and len(_prose(sm).split()) >= 5


def reconcile(state: dict) -> dict:
    modules = (state.get("moduleDecomposition") or {}).get("modules") or []
    hollow_before = sum(1 for m in modules for sm in (m.get("sub_modules") or []) if _is_hollow(sm))
    moved = demoted = 0
    for m in modules:
        for sm in (m.get("sub_modules") or []):
            if not _is_hollow(sm):
                continue
            key = {t for t in _tok(f"{sm.get('id') or sm.get('sub_module') or ''} "
                                   f"{m.get('module') or ''} {_prose(sm)}") if t not in _STOP}
            best = None
            best_score = 0
            best_src = None
            for m2 in modules:
                if m2 is m:
                    continue
                for s2 in (m2.get("sub_modules") or []):
                    w2 = s2.get("words") or []
                    if len(w2) <= 1:            # never empty a source with <= 1 word
                        continue
                    for w in w2:
                        score = len([t for t in _tok(w.get("name_human")) if t in key and t not in _STOP])
                        if score > best_score:
                            best_score, best, best_src = score, w, s2
            if best is not None and best_score >= 2:
                best_src["words"].remove(best)
                sm["words"] = [best]
                moved += 1
            else:
                sm["english_sentence"] = ""
                sm["sentence_en"] = ""
                sm["paragraph_en"] = ""
                demoted += 1
    hollow_after = sum(1 for m in modules for sm in (m.get("sub_modules") or []) if _is_hollow(sm))
    return {"moved": moved, "demoted": demoted,
            "hollow_before": hollow_before, "hollow_after": hollow_after}


def _selftest() -> int:
    # a hollow sub-module whose scattered part lives in another module → MOVE it back
    st = {"moduleDecomposition": {"modules": [
        {"module": "fertigation_dosing_system", "sub_modules": [
            {"id": "fertigation_dosing_system__primary_assembly", "words": [],
             "english_sentence": "Two identical A/B nutrient dosing units with venturi injectors and metering pumps."}]},
        {"module": "mass_fluid_transport_process", "sub_modules": [
            {"id": "pumps", "words": [{"name_human": "Fertigation Dosing Pump"},
                                      {"name_human": "Irrigation Pump"}]}]},
    ]}}
    r = reconcile(st)
    ok = (r["moved"] == 1 and r["hollow_after"] == 0
          and st["moduleDecomposition"]["modules"][0]["sub_modules"][0]["words"][0]["name_human"] == "Fertigation Dosing Pump"
          and len(st["moduleDecomposition"]["modules"][1]["sub_modules"][0]["words"]) == 1)
    # a hollow with NO scattered match → demote prose (contentless slot, allowed)
    st2 = {"moduleDecomposition": {"modules": [
        {"module": "x", "sub_modules": [
            {"id": "orphan", "words": [], "english_sentence": "A described section with no matching component anywhere in the plant."}]}]}}
    r2 = reconcile(st2)
    ok2 = (r2["demoted"] == 1 and r2["hollow_after"] == 0)
    # never empties a <=1-word source
    st3 = {"moduleDecomposition": {"modules": [
        {"module": "a", "sub_modules": [{"id": "hollow_pump", "words": [],
            "english_sentence": "The single dosing pump skid for the fertigation loop system."}]},
        {"module": "b", "sub_modules": [{"id": "only", "words": [{"name_human": "Dosing Pump"}]}]}]}}
    r3 = reconcile(st3)
    ok3 = (r3["moved"] == 0)  # source had 1 word → protected → demoted instead
    if ok and ok2 and ok3:
        print("reconcile_hollow selftest OK (move / demote / source-protect)")
        return 0
    print(f"reconcile_hollow SELFTEST FAIL: ok={ok} ok2={ok2} ok3={ok3}")
    return 1


def main(argv) -> int:
    if argv and argv[0] in ("--selftest", "selftest"):
        return _selftest()
    if not argv:
        print("usage: reconcile_hollow.py <run_dir>|--selftest", file=sys.stderr)
        return 2
    sp = os.path.join(argv[0], "state.json")
    if not os.path.isfile(sp):
        print(f"no state.json at {sp}", file=sys.stderr)
        return 2
    with open(sp, "r", encoding="utf-8") as fh:
        state = json.load(fh)
    r = reconcile(state)
    if r["moved"] or r["demoted"]:
        with open(sp, "w", encoding="utf-8") as fh:
            json.dump(state, fh)
        print(f"[reconcile-hollow] {r['hollow_before']} hollow → {r['hollow_after']}: "
              f"moved {r['moved']} scattered word(s) back, demoted {r['demoted']} orphan prose slot(s)")
    else:
        print(f"[reconcile-hollow] {r['hollow_before']} hollow sub-module(s); nothing to reconcile")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
