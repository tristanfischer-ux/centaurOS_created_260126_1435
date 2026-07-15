#!/usr/bin/env python3
"""Verification spine — the governing proof surface for a ForgeOS dossier.

INTENT: A SHIPS verdict must mean every HARD brief claim is either (a) closed
with provenance (PASS) or (b) explicitly FAIL/UNVERIFIED/OPEN — never a green
banner over a silent omission. Soft gaps may flag; they must not invent PASS.

Axes (the product shape Tristan asked for 2026-07-14):
  1. brief       — every HARD brief constraint: target / achieved / status / source
  2. physics     — closed arithmetic / critic that the design can work
  3. realisation — buildable object matches the maths (BoM / PCB / cost band)
  4. hold        — open holds that block stamp when HARD

FLOW: build-excel-export assembles row dicts from live helpers →
      build_spine() / score_spine() / ships_allowed() → Verification tab +
      compute_verdict ships predicate.

proveCatch (--selftest): silent omission of a HARD metric fails completeness;
a PASS spine with a HARD OPEN hold fails ships_allowed.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, Iterable, List, Optional, Sequence


HARD_STATUSES_OPEN = frozenset({"FAIL", "UNVERIFIED", "OPEN"})
PASS_STATUSES = frozenset({"PASS"})
AXES = ("brief", "physics", "realisation", "hold")


@dataclass(frozen=True)
class VerificationRow:
    axis: str
    claim: str
    target: str
    achieved: str
    status: str
    hardness: str
    provenance: str

    def as_dict(self) -> Dict[str, str]:
        return {
            "axis": self.axis,
            "claim": self.claim,
            "target": self.target,
            "achieved": self.achieved,
            "status": self.status,
            "hardness": self.hardness,
            "provenance": self.provenance,
        }


@dataclass
class VerificationSpine:
    rows: List[VerificationRow] = field(default_factory=list)
    notes: List[str] = field(default_factory=list)

    def hard_rows(self) -> List[VerificationRow]:
        return [r for r in self.rows if r.hardness == "HARD"]

    def hard_open(self) -> List[VerificationRow]:
        return [r for r in self.hard_rows() if r.status in HARD_STATUSES_OPEN]

    def as_dict(self) -> Dict[str, Any]:
        return {
            "schema": "verification-spine/v1",
            "rows": [r.as_dict() for r in self.rows],
            "hard_total": len(self.hard_rows()),
            "hard_open": len(self.hard_open()),
            "score": score_spine(self),
            "ships_allowed": ships_allowed(self),
            "notes": list(self.notes),
        }


def build_spine(rows: Sequence[Dict[str, Any]], notes: Optional[Iterable[str]] = None) -> VerificationSpine:
    """Assemble a spine from row dicts (axis/claim/target/achieved/status/hardness/provenance)."""
    out: List[VerificationRow] = []
    for raw in rows:
        axis = str(raw.get("axis") or "").strip().lower()
        if axis not in AXES:
            raise ValueError(f"verification spine axis must be one of {AXES}, got {axis!r}")
        status = str(raw.get("status") or "UNVERIFIED").strip().upper()
        hardness = str(raw.get("hardness") or "SOFT").strip().upper()
        if hardness not in ("HARD", "SOFT"):
            raise ValueError(f"hardness must be HARD|SOFT, got {hardness!r}")
        out.append(
            VerificationRow(
                axis=axis,
                claim=str(raw.get("claim") or "—"),
                target=str(raw.get("target") if raw.get("target") is not None else "—"),
                achieved=str(raw.get("achieved") if raw.get("achieved") is not None else "—"),
                status=status,
                hardness=hardness,
                provenance=str(raw.get("provenance") or "—"),
            )
        )
    return VerificationSpine(rows=out, notes=list(notes or []))


def score_spine(spine: VerificationSpine) -> float:
    """Governing score: HARD rows only. Any HARD open ⇒ capped below the ≥8 SHIPS floor.

    INTENT: Verification cannot score 9 while a HARD claim is UNVERIFIED/FAIL/OPEN.
    Vacuous (zero HARD rows) scores 7 — "nothing hard to prove" is not a stamp.
    """
    hard = spine.hard_rows()
    if not hard:
        return 7.0
    passed = sum(1 for r in hard if r.status in PASS_STATUSES)
    ratio = 10.0 * passed / len(hard)
    if spine.hard_open():
        return max(0.0, min(4.0, ratio))
    return round(ratio, 1)


def ships_allowed(spine: VerificationSpine) -> bool:
    """SHIPS requires every HARD spine row to be PASS (no silent omissions, no open HARD holds)."""
    hard = spine.hard_rows()
    if not hard:
        return False
    return len(spine.hard_open()) == 0


def brief_completeness_ok(
    brief_hard_keys: Sequence[str],
    spine_brief_claims: Sequence[str],
) -> bool:
    """proveCatch helper: every HARD brief key must appear as a brief-axis claim substring."""
    claims = " | ".join(spine_brief_claims).lower()
    for key in brief_hard_keys:
        token = str(key).lower().replace("_", " ").strip()
        if not token:
            continue
        # Accept either snake_case key or humanised claim containing the head noun.
        head = token.split()[0] if token else ""
        if token not in claims and head not in claims and str(key).lower() not in claims:
            return False
    return True


def _selftest() -> None:
    # Happy path — all HARD PASS → ships + score 10
    ok = build_spine(
        [
            {"axis": "brief", "claim": "usable energy", "target": "3.5", "achieved": "3.5",
             "status": "PASS", "hardness": "HARD", "provenance": "quantities.usable_capacity_kwh"},
            {"axis": "physics", "claim": "Beer–Lambert range closed", "target": "closed",
             "achieved": "closed", "status": "PASS", "hardness": "HARD",
             "provenance": "Calculations!photometry"},
            {"axis": "realisation", "claim": "materials ≤ brief ceiling", "target": "£200",
             "achieved": "£105", "status": "PASS", "hardness": "HARD",
             "provenance": "costStack.raw_materials_bom_gbp"},
        ]
    )
    assert ships_allowed(ok), "all-HARD-PASS must allow SHIPS"
    assert score_spine(ok) == 10.0

    # Silent omission: HARD brief key absent from brief-axis claims → completeness FAIL
    assert not brief_completeness_ok(
        ["usable_energy_mwh", "unit_cost_ceiling"],
        ["materials cost"],
    ), "omitted HARD brief key must fail completeness"
    assert brief_completeness_ok(
        ["usable_energy_mwh", "unit_cost_ceiling"],
        ["usable energy (usable_energy_mwh)", "unit cost ceiling"],
    )

    # Green-over-hold: HARD OPEN hold must block ships and cap score < 8
    held = build_spine(
        [
            {"axis": "brief", "claim": "path length", "target": "10 mm", "achieved": "10 mm",
             "status": "PASS", "hardness": "HARD", "provenance": "contract"},
            {"axis": "hold", "claim": "Needs input — optical AU floor", "target": "closed",
             "achieved": "open", "status": "OPEN", "hardness": "HARD",
             "provenance": "self-repair needs_input"},
        ]
    )
    assert not ships_allowed(held), "HARD OPEN hold must block SHIPS"
    assert score_spine(held) <= 4.0, f"HARD open must cap Verification below 8, got {score_spine(held)}"

    # UNVERIFIED HARD brief row blocks ships
    unver = build_spine(
        [
            {"axis": "brief", "claim": "absorbance range", "target": "2 AU", "achieved": "—",
             "status": "UNVERIFIED", "hardness": "HARD", "provenance": "no matching quantity"},
        ]
    )
    assert not ships_allowed(unver)
    assert score_spine(unver) <= 4.0

    # Vacuous spine (no HARD) does not get a free stamp
    vacuous = build_spine(
        [{"axis": "physics", "claim": "note", "target": "—", "achieved": "—",
          "status": "ADVISORY", "hardness": "SOFT", "provenance": "—"}]
    )
    assert not ships_allowed(vacuous)
    assert score_spine(vacuous) == 7.0

    print("verification_spine selftest: OK (ships predicate + omission + green-over-hold)")


if __name__ == "__main__":
    _selftest()
