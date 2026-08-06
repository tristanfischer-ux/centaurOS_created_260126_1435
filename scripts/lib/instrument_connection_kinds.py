#!/usr/bin/env python3
"""Universal non-physical edge filter for instrument connection graphs (Anvil).

Manufacturer adversarial finding (any sealed instrument, not only bioreactors):
ledger graphs that put **power into thermal pads / vents / labels**, or
**fluid into debug headers**, are unbuildable. This module drops those edges
by **part-role noun** and **service kind**, never by product class name.

Use after gold-spine ghost prune. Plants with real process piping are unchanged
when ``is_instrument`` is false.
"""
from __future__ import annotations

import re
from typing import Any, Final, Optional

# Parts that must not receive electrical power nets.
_NON_ELECTRICAL_RE: Final[re.Pattern[str]] = re.compile(
    r"thermal\s*interface|tim\s*pad|heatsink\s*pad|gap\s*pad|"
    r"sterile\s*filter|filter\s*vent|air\s*vent|"
    r"safety\s*label|nameplate|label\s*set|"
    r"thermal\s*insulation|foam\s*insulation|"
    r"enclosure\s*shell|chassis\s*base|"
    r"vial\s*holder|culture\s*vessel|media\s*tubing|"
    r"cable\s*strain\s*relief|mounting\s*frame",
    re.I,
)

# Parts that must not carry process fluid / water / media.
_NON_WETTED_RE: Final[re.Pattern[str]] = re.compile(
    r"debug\s*header|usb\s*interface|usb\s*port|mcu\b|microcontroller|"
    r"ferrite|esd\s*protection|polyfuse|galvanic\s*isolat|"
    r"firmware\s*storage|host\s*protocol|power\s*indicator\s*led|"
    r"pcb\s*mounting\s*standoff|standoff|"
    r"thermal\s*interface|safety\s*label|heatsink\s*fan",
    re.I,
)

_POWER_KIND_RE: Final[re.Pattern[str]] = re.compile(r"power|electrical|dc|mains", re.I)
_FLUID_KIND_RE: Final[re.Pattern[str]] = re.compile(
    r"water|fluid|media|liquid|air|gas|pneumatic|hydraulic", re.I
)


def _name(part: dict | str | None) -> str:
    if isinstance(part, dict):
        return str(part.get("name") or part.get("from_part") or part.get("to_part") or "")
    return str(part or "")


def edge_is_nonphysical(
    from_name: str,
    to_name: str,
    kind: str = "",
) -> bool:
    """True when this edge must not appear on an instrument interconnect."""
    k = str(kind or "")
    fn, tn = from_name or "", to_name or ""
    # Power into non-electrical passive / fab / consumable
    if _POWER_KIND_RE.search(k):
        if _NON_ELECTRICAL_RE.search(fn) or _NON_ELECTRICAL_RE.search(tn):
            # Allow power into named electromechanical loads only — already excluded
            # by NON_ELECTRICAL list. TEC/heater/pump/fan are NOT in that list.
            return True
    # Fluid into electronics / debug / dry-only parts
    if _FLUID_KIND_RE.search(k):
        if _NON_WETTED_RE.search(fn) or _NON_WETTED_RE.search(tn):
            return True
    # Safety label or TIM as either end of any net is always noise
    if re.search(r"safety\s*label|thermal\s*interface", fn + " " + tn, re.I):
        if not re.search(r"assembly|mechanical|mount", k, re.I):
            # assembly mechanical to label is still dubious; drop non-assembly
            if not re.search(r"assembly", k, re.I):
                return True
    return False


def prune_nonphysical_instrument_edges(
    equipment: list,
    connections: list,
    *,
    is_instrument: bool = True,
) -> tuple[list, int]:
    """Drop non-physical edges for instruments; no-op for plants.

    @returns (kept_connections, n_dropped)
    """
    if not is_instrument or not connections:
        return list(connections or []), 0
    kept: list = []
    dropped = 0
    for c in connections:
        if not isinstance(c, dict):
            dropped += 1
            continue
        fn = str(c.get("from_part") or c.get("from") or "")
        tn = str(c.get("to_part") or c.get("to") or "")
        kind = str(c.get("kind") or c.get("mechanism") or c.get("service") or c.get("via") or "")
        if edge_is_nonphysical(fn, tn, kind):
            dropped += 1
            continue
        kept.append(c)
    return kept, dropped


if __name__ == "__main__":
    assert edge_is_nonphysical("Ferrite Emc Bead", "Thermal Interface Pad", "power")
    assert edge_is_nonphysical("Media Tubing Set", "Debug Header", "water")
    assert not edge_is_nonphysical("DC-DC Regulation Board", "Peltier Tec Module", "power")
    assert not edge_is_nonphysical("Dosing Peristaltic Pump", "Culture Vessel", "water")
    eq = [{"name": "A"}, {"name": "B"}]
    conns = [
        {"from_part": "Ferrite", "to_part": "Thermal Interface Pad", "kind": "power"},
        {"from_part": "Pump", "to_part": "Culture Vessel", "kind": "water"},
    ]
    # Ferrite/Thermal hits NON_ELECTRICAL on Thermal
    k, n = prune_nonphysical_instrument_edges(eq, conns, is_instrument=True)
    assert n >= 1
    k2, n2 = prune_nonphysical_instrument_edges(eq, conns, is_instrument=False)
    assert n2 == 0 and len(k2) == 2
    print("instrument_connection_kinds selftest OK")
