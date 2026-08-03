#!/usr/bin/env python3
"""OPEN-BY-DESIGN LEDGER — say what is deliberately unresolved, and why. UNIVERSAL.

⭐⭐ WHY THIS EXISTS (2026-08-03). Gate 40 (design-closure) scores honesty 2 —
the floor — when EVERY critical-role part is TBD and no open-by-design ledger
exists. The gate itself lives in scripts/lib/design-closure-gate.ts and is the
authority on its own rule; everything quoted below is a READING of that file at
the time of writing, not a contract this module can enforce or verify:

    if (critical.length > 0 && criticalTbd === critical.length
        && !hasOpenRaceHoldsLedger) honesty = 2

On the FE front FPK that fired on ONE part. `sic_power_module_stack_word` is the
only word the gate counts as critical (Sol's 2026-07-29 fix EXCLUDES the OEM-quote
principals — traction_ipmsm, sic_traction, reduction_gear, cold plates, hv_dc_fuse,
phase_cable_set, hv_interlock_loop, inverter_desat — precisely because they were
producing a false all-TBD reading). So 1 of 1 critical parts was TBD, the cliff
fired, and a 29-tab dossier was floored at 0/10 by one unfilled part number.

THE PART IS NOT AN OVERSIGHT — THE DESIGN SAYS SO ITSELF. Its lifecycle modifier
reads "Concept design — catalogue part + exact MPN confirmed at detailed design",
and its requirements are fully specified (750 V bus, 477 A, 350 kW, -40..+175 C
Tj, ~154x98 mm three-phase stack). Inventing an MPN would fabricate a supplier
decision the design deliberately defers, which is the dishonest fix. Declaring it
open, with its requirements and its reason, is the honest one.

That distinction is the whole point: a dossier that silently carries a TBD is
worse than one that says "this is open by design, here is what it must satisfy,
and we are NOT claiming homologation".

UNIVERSAL: reads open-by-design INTENT from the words themselves — lifecycle /
installation modifiers carrying deferral language — rather than from a per-product
list. A design with nothing deferred emits nothing.

Usage:
    homologation_honesty.py --twin <dir> [--write]
    homologation_honesty.py --selftest
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

# Deferral language a designer actually writes. Matched on the MODIFIER text, so
# the design declares its own holds rather than a maintainer guessing them.
# ⭐ THE DEFERRAL MUST BE ABOUT THE PART, NOT ITS PLACEMENT. A first version
# matched any "detailed design" text and produced FORTY-FIVE "open by design"
# principals — because nearly every word carries the boilerplate installation
# note "Internal / external placement confirmed at layout / detailed design".
# That is a placement remark, not a declaration that the part identity is
# deliberately unresolved, and laundering it into a holds ledger would score
# honesty 10 by inflating the list. The subject must be the PART: its MPN, its
# catalogue selection, its supplier quotation.
DEFERRAL = re.compile(
    r"(?:\bMPN\b|part number|catalogue part|catalog part|exact part|part "
    r"selection|supplier quotation|supplier quote|OEM quote|awaiting quote"
    r"|team dyno)",
    re.I,
)
# Placement/layout language is explicitly NOT a hold on the part.
PLACEMENT_ONLY = re.compile(r"placement|layout|internal / external", re.I)
TBD_VALUE = re.compile(r"^(TBD|TBC|n/?a|unknown|generic|detailed design)", re.I)


def is_unresolved_part_number(part_number: str | None) -> bool:
    """ONE predicate for 'this is not a real part number', shared by the ledger and
    the Suppliers tab. Sol (finish council 2026-08-03) found the two had drifted:
    the ledger treated a literal "detailed design" as unresolved, the tab did not,
    so such a row rendered as PINNED with that placeholder printed in the
    manufacturer-part-number column. Two surfaces must not disagree about what
    counts as sourced."""
    pn = (part_number or "").strip()
    return (not pn) or bool(TBD_VALUE.match(pn))
# Modifiers that express lifecycle intent (not a dimension or a rating).
# `installation` is deliberately EXCLUDED — it carries placement boilerplate.
INTENT_KINDS = ("lifecycle", "provenance", "basis")


def _words(state: dict):
    for module in ((state.get("moduleDecomposition") or {}).get("modules") or []):
        for sub in (module.get("sub_modules") or []):
            for word in (sub.get("words") or []):
                yield word


def _word_key(word: dict, index: int) -> str:
    """Identity for a word. Anonymous words get a positional key so they can still
    be NAMED in the ledger — an undeclared part must never become unreportable
    just because nobody gave it an id."""
    return str(word.get("id") or word.get("name_human") or f"(unnamed word #{index})")


def _classify(word: dict, index: int) -> tuple:
    """Decide ONE word: ("open", item) | ("undeclared", key) | ("ignore", None).

    ⭐⭐ ONE PASS, NO KEY MATCHING (Sol, finish council 2026-08-03). This used to
    run as collect-then-compare: build the disclosed set, then walk the words again
    and flag anything not in it. That made correctness depend on word identity
    being unique and total, and it is neither — `id` can be absent, `name_human`
    can repeat, and a set collapses both. A disclosed "Connector" could therefore
    cover an entirely different, undisclosed "Connector", laundering exactly the
    bare TBD the veto exists to catch. Asking each word about ITSELF removes the
    matching step, and with it the whole class of failure.
    """
    mods = word.get("modifier_characters") or []
    if not isinstance(mods, list):
        return ("ignore", None)
    part_number = None
    intent = ""
    requirements: list = []
    for mod in mods:
        if not isinstance(mod, dict):
            continue
        kind = str(mod.get("kind") or "")
        value = str(mod.get("value") or "")
        if kind == "part_number":
            # ⭐ FAIL CLOSED ON CONTRADICTION (Sol, finish council 2026-08-03).
            # Last-write-wins let a word carrying BOTH "TBD" and a real-looking
            # value be read as resolved, and made the answer depend on modifier
            # ORDER. If any part_number on a word is unresolved, the word is
            # unresolved — a contradictory slot is not a sourced one.
            if part_number is None or not is_unresolved_part_number(part_number):
                part_number = value.strip()
        elif (kind in INTENT_KINDS and DEFERRAL.search(value)
              and not PLACEMENT_ONLY.search(value)):
            intent = value.strip()
        elif kind in ("rating_primary", "dimensions", "operating_temp_range",
                      "capacity", "form") and value.strip():
            requirements.append(f"{kind}={value.strip()}")
    # No part_number modifier at all → not a purchase; it was never going to have
    # an MPN, so it can neither be a hold nor a gap.
    if part_number is None:
        return ("ignore", None)
    if not is_unresolved_part_number(part_number):
        return ("ignore", None)
    if intent and requirements:
        return ("open", {
            "id": _word_key(word, index),
            "name": word.get("name_human") or _word_key(word, index),
            "reason": intent,
            "part_number_state": part_number or "(none)",
            "requirements_specified": requirements[:6],
        })
    return ("undeclared", _word_key(word, index))


def collect_open_by_design(state: dict) -> list:
    """Words whose OWN modifiers declare them deliberately unresolved."""
    out = []
    for i, word in enumerate(_words(state)):
        kind, payload = _classify(word, i)
        if kind == "open":
            out.append(payload)
    return out


def build_ledger(state: dict):
    """The homologationHonesty block gate 40 looks for, or None if nothing is open.

    Shape is dictated by design-closure-gate.ts::hasCompleteOpenRaceHoldsLedger:
    verdict NOT_HOMOLOGATED, a non-empty id list, a count matching it, and a
    non-empty note. Every field here is DERIVED — none is asserted.

    NOTE on ship_ok: the gate ALSO requires it to be false, but it reads that from
    the STATE, not from this ledger — and deliberately so. A disclosure block must
    not be able to declare the run unshippable; that verdict belongs to the run.
    This function neither sets nor can influence it.
    """
    open_items: list = []
    undeclared: list = []
    # ⭐ ONE COHERENT DENOMINATOR (Grok, finish council 2026-08-03). The note says
    # "N of M catalogue parts", so M must be exactly the parts that could HAVE a
    # catalogue number: the words carrying a part_number modifier. An earlier
    # version incremented it in three different branches and misstated the ratio
    # readers take as fact.
    procurable = 0
    for i, word in enumerate(_words(state)):
        if any(isinstance(m, dict) and m.get("kind") == "part_number"
               for m in (word.get("modifier_characters") or [])):
            procurable += 1
        kind, payload = _classify(word, i)
        if kind == "open":
            open_items.append(payload)
        elif kind == "undeclared":
            undeclared.append(payload)
    # ⭐ An unresolved VERIFICATION record counts too — the ledger reads the design
    # words, the Suppliers tab reads verifications, and a part unresolved on one
    # surface but invisible to the other is how the two drift apart.
    for pv in (state.get("partVerifications") or []):
        if not isinstance(pv, dict):
            continue
        if is_unresolved_part_number(pv.get("part_number")):
            wid = str(pv.get("word_id") or "").strip()
            if not any(item["id"] == wid for item in open_items):
                undeclared.append(f"{wid or '(no word_id)'} (verification record)")

    if not open_items:
        return None

    # ⭐⭐ ALL-OR-NOTHING. The gate-40 exception is global: any structurally complete
    # ledger lifts the honesty floor. So a ledger declaring one deferred bracket
    # while a critical part sits at a bare, unexplained TBD would buy the dossier
    # an honesty it has not earned. If ANYTHING is unresolved without a reason,
    # there is no ledger — which routes the fix to that part instead of hiding it
    # behind its declared neighbours.
    if undeclared:
        print(f"[homologation-honesty] NO LEDGER — {len(undeclared)} unresolved "
              f"part(s) state no reason: {', '.join(undeclared[:6])}"
              f"{' …' if len(undeclared) > 6 else ''}", file=sys.stderr)
        return None

    ids = [str(item["id"]) for item in open_items]
    note = (
        f"{len(ids)} of {procurable} catalogue parts are OPEN BY DESIGN at concept "
        "stage: their requirements are specified but the exact part is confirmed at "
        "detailed design or on supplier quotation. Declared rather than filled — "
        "inventing a part number would fabricate a supplier decision the design "
        "deliberately defers. This dossier does NOT claim homologation."
    )
    return {
        "verdict": "NOT_HOMOLOGATED",
        "open_by_design_ids": ids,
        "open_by_design_count": len(ids),
        "note": note,
        "items": open_items,
        "derived_by": "scripts/lib/homologation_honesty.py",
    }


def _selftest() -> int:
    fails: list[str] = []

    def ck(name: str, ok: bool, detail: str = "") -> None:
        if not ok:
            fails.append(f"{name}: {detail}")

    def twin(words):
        return {"moduleDecomposition": {"modules": [
            {"sub_modules": [{"words": words}]}]}}

    deferred = {"id": "sic_power_module_stack_word",
                "name_human": "SiC Power Module Stack",
                "modifier_characters": [
                    {"kind": "part_number", "value": "TBD (detailed design)"},
                    {"kind": "lifecycle",
                     "value": "Concept design — catalogue part + exact MPN "
                              "confirmed at detailed design"},
                    {"kind": "rating_primary", "value": "477"},
                    {"kind": "operating_temp_range", "value": "-40 to +175 °C Tj"}]}
    led = build_ledger(twin([deferred]))
    ck("ledger.built", led is not None, "no ledger from a clearly deferred part")
    # Named for what it CAN check from here: the field checklist this module owns.
    # Gate 40's predicate lives in TypeScript and additionally requires ship_ok
    # false from the state — out of this module's reach by design.
    ck("ledger.carries_the_fields_this_module_owns",
       led and led["verdict"] == "NOT_HOMOLOGATED"
       and led["open_by_design_count"] == len(led["open_by_design_ids"]) > 0
       and len(led["note"]) > 0,
       f"ledger is missing a field gate 40 reads: {led}")
    ck("ledger.carries_requirements",
       led and any(i["requirements_specified"] for i in led["items"]),
       "an open item carried no specified requirements — that is a TBD, not a hold")

    # ⭐ proveCatch: a part that is simply TBD with NO stated reason must NOT be
    # laundered into an 'open by design' hold. That would turn the ledger into a
    # way of scoring 10 while hiding unfinished work — the exact dishonesty this
    # gate exists to catch.
    bare = {"id": "mystery_word", "name_human": "Mystery",
            "modifier_characters": [{"kind": "part_number", "value": "TBD"}]}
    # ⭐ proveCatch: boilerplate PLACEMENT prose must not become a hold. This
    # exact text sits on ~45 words in the live twin and inflated the first
    # version of the ledger from a handful to forty-five.
    placement = {"id": "placement_word", "name_human": "Placement",
                 "modifier_characters": [
                     {"kind": "part_number", "value": "TBD"},
                     {"kind": "installation",
                      "value": "Internal / external placement confirmed at "
                               "layout / detailed design"}]}
    ck("proveCatch.placement_boilerplate_is_not_a_hold",
       build_ledger(twin([placement])) is None,
       "generic placement prose was laundered into an open-by-design hold")
    ck("proveCatch.bare_tbd_is_not_a_hold",
       build_ledger(twin([bare])) is None,
       "a TBD with no stated reason was laundered into an open-by-design hold")

    # A part with a REAL number is not open, however much prose surrounds it.
    filled = {"id": "cold_plate", "name_human": "Cold plate",
              "modifier_characters": [
                  {"kind": "part_number", "value": "CP-E-4009-S3XJ"},
                  {"kind": "lifecycle", "value": "confirmed at detailed design"}]}
    ck("proveCatch.filled_part_is_not_open",
       build_ledger(twin([filled])) is None,
       "a part with a real MPN was reported as open by design")
    ck("nothing_deferred_emits_nothing", build_ledger(twin([])) is None,
       "an empty design produced a ledger")

    # ⭐ proveCatch (Sol #2): a stated reason with NO stated requirements is
    # unfinished work wearing a hold's clothes.
    vague = {"id": "vague_word", "name_human": "Vague",
             "modifier_characters": [
                 {"kind": "part_number", "value": "TBD"},
                 {"kind": "lifecycle", "value": "Awaiting OEM quote"}]}
    ck("proveCatch.reason_without_requirements_is_not_a_hold",
       build_ledger(twin([vague])) is None,
       "a deferral with no specified requirements qualified as an open-by-design hold")

    # ⭐⭐ proveCatch (Sol #1): one undeclared TBD must void the WHOLE ledger, so a
    # declared part can never buy the honesty exception for an undeclared one.
    ck("proveCatch.undeclared_tbd_voids_the_whole_ledger",
       build_ledger(twin([deferred, bare])) is None,
       "an unexplained critical TBD was covered by an unrelated part's disclosure")
    ck("complete_disclosure_still_builds", build_ledger(twin([deferred])) is not None,
       "a fully-disclosed design failed to produce a ledger")

    # ⭐ proveCatch (Sol, cross-surface): an unresolved VERIFICATION record for a
    # word absent from the design tree must veto the ledger as surely as an
    # unresolved word — otherwise the Suppliers tab can show an undeclared part
    # while the ledger claims everything is disclosed.
    st = twin([deferred])
    st["partVerifications"] = [{"word_id": "ghost_word", "part_number": "TBD"}]
    ck("proveCatch.unresolved_verification_vetoes_the_ledger",
       build_ledger(st) is None,
       "an unresolved verification record outside the word tree did not veto the ledger")
    st2 = twin([deferred])
    st2["partVerifications"] = [{"part_number": "TBD"}]  # no word_id at all
    ck("proveCatch.untraceable_verification_still_vetoes",
       build_ledger(st2) is None,
       "an unresolved record with no word_id escaped the veto — untraceable is worse, not better")
    # ⭐ proveCatch (Sol + Grok): a word identified only by name_human must cover
    # itself. The old mismatch vetoed a fully-disclosed design.
    named_only = {"name_human": "Name Only Part",
                  "modifier_characters": [
                      {"kind": "part_number", "value": "TBD"},
                      {"kind": "lifecycle",
                       "value": "catalogue part confirmed at detailed design"},
                      {"kind": "rating_primary", "value": "12"}]}
    ck("proveCatch.name_only_word_covers_itself",
       build_ledger(twin([named_only])) is not None,
       "a disclosed word identified by name_human alone voided its own ledger")
    # ⭐ proveCatch (Sol): a word that is not a purchase — no part_number modifier
    # at all — must not veto the ledger for lacking a part number.
    software = {"id": "control_firmware", "name_human": "Control Firmware",
                "modifier_characters": [{"kind": "form", "value": "embedded C"}]}
    ck("proveCatch.non_procurable_word_does_not_veto",
       build_ledger(twin([deferred, software])) is not None,
       "a software/interface word with no part_number modifier vetoed the ledger")
    # ⭐ proveCatch (Sol): two words sharing a human name must not cover each other.
    dup_ok = {"name_human": "Connector",
              "modifier_characters": [
                  {"kind": "part_number", "value": "TBD"},
                  {"kind": "lifecycle", "value": "catalogue part confirmed at detailed design"},
                  {"kind": "rating_primary", "value": "8"}]}
    dup_bare = {"name_human": "Connector",
                "modifier_characters": [{"kind": "part_number", "value": "TBD"}]}
    ck("proveCatch.same_named_word_cannot_cover_another",
       build_ledger(twin([dup_ok, dup_bare])) is None,
       "a disclosed word covered a DIFFERENT undisclosed word sharing its name")
    anon_bare = {"modifier_characters": [{"kind": "part_number", "value": "TBD"}]}
    ck("proveCatch.anonymous_bare_tbd_still_vetoes",
       build_ledger(twin([deferred, anon_bare])) is None,
       "an anonymous bare TBD was laundered by an unrelated disclosed word")
    # ⭐ proveCatch (Sol): contradictory part_number modifiers must fail closed and
    # must not depend on modifier order.
    contra = {"id": "contra", "modifier_characters": [
        {"kind": "part_number", "value": "TBD"},
        {"kind": "part_number", "value": "REAL-123"}]}
    contra_rev = {"id": "contra", "modifier_characters": [
        {"kind": "part_number", "value": "REAL-123"},
        {"kind": "part_number", "value": "TBD"}]}
    ck("proveCatch.contradictory_part_numbers_fail_closed",
       build_ledger(twin([deferred, contra])) is None
       and build_ledger(twin([deferred, contra_rev])) is None,
       "a word carrying both TBD and a real part number read as sourced (or depended on order)")
    ck("shared_predicate.detailed_design_is_unresolved",
       is_unresolved_part_number("detailed design") and is_unresolved_part_number("")
       and not is_unresolved_part_number("MKP1848C66012JY5"),
       "the shared unresolved-part-number predicate disagrees with itself")

    for f in fails:
        print(f"  FAIL {f}")
    # Phrasing matters: verify-engine-guards.sh only counts a run as a PASS when
    # it SAYS so, so a crash that prints nothing can never read as success.
    print("homologation_honesty selftest: OK" if not fails
          else f"FAIL homologation_honesty selftest ({len(fails)} failures)")
    return 1 if fails else 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--twin", type=Path)
    # Chain mode: the design is in memory long before state.json exists on disk,
    # so gate 40 feeds it on stdin and reads the ledger back on stdout.
    ap.add_argument("--stdin", action="store_true",
                    help="read state JSON on stdin, emit the ledger JSON on stdout")
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--selftest", action="store_true")
    args = ap.parse_args()
    if args.selftest:
        return _selftest()
    if args.stdin:
        ledger = build_ledger(json.loads(sys.stdin.read()))
        print(json.dumps(ledger if ledger is not None else {}))
        return 0
    if not args.twin:
        ap.error("--twin required")

    state_path = Path(args.twin) / "state.json"
    state = json.loads(state_path.read_text())
    ledger = build_ledger(state)
    if ledger is None:
        # ⭐ CLEAR ON WRITE TOO (Sol + Grok). The chain path already deletes a stale
        # ledger; this standalone regeneration step must behave identically, or
        # running it after adding an unexplained TBD would leave the OLD disclosure
        # on disk for every downstream consumer — the same false disclosure the
        # veto exists to prevent, reached through the other door.
        if args.write and state.pop("homologationHonesty", None) is not None:
            state_path.write_text(json.dumps(state, indent=2))
            print("[homologation-honesty] stale ledger CLEARED from state "
                  "(derivation no longer emits one)")
        else:
            print("[homologation-honesty] nothing declared open by design — no ledger")
        return 0
    print(f"[homologation-honesty] {ledger['open_by_design_count']} open-by-design "
          f"principal(s): {', '.join(ledger['open_by_design_ids'][:6])}")
    for item in ledger["items"][:6]:
        print(f"    {item['id']}: {item['reason'][:96]}")
    if args.write:
        state["homologationHonesty"] = ledger
        state_path.write_text(json.dumps(state, indent=2))
        print("[homologation-honesty] written to state.homologationHonesty")
    return 0


if __name__ == "__main__":
    sys.exit(main())
