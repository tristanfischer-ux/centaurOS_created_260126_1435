#!/usr/bin/env python3
"""Universal catalogue identity vs function-class checks (Anvil).

INTENT: a part line must not pin a manufacturer part number whose **function class**
contradicts the role name. Examples that failed manufacturer adversarial review:

  * cooling **fan** MPN on a magnetic **stirrer** line
  * **ADC** IC on a **flow sensor** line
  * bare **LED** package claimed as **OD600** growth sensor

Rules are **noun-keyed**, never product-class tables. Any instrument or plant
BoM can use them.
"""
from __future__ import annotations

import re
from typing import Any, Final, Iterable

# role_pattern → forbidden_identity_pattern (case-insensitive)
_FUNCTION_CLASS_BANS: Final[tuple[tuple[re.Pattern[str], re.Pattern[str], str], ...]] = (
    (
        re.compile(r"\b(?:stirrer|stir\s*drive|mag(?:netic)?\s*stir|agitator)\b", re.I),
        re.compile(
            r"\b(?:fan|blower|cooler\s*fan|axial\s*fan)\b|"
            r"\bf\d{3}[a-z]?-\d+\b|"  # e.g. F280A-24 style fan catalogue codes
            r"\bnidec\b",  # Nidec Copal F-series are fans, not wet-lab stir drives
            re.I,
        ),
        "stir/agitation role must not pin a cooling-fan MPN",
    ),
    (
        re.compile(r"\b(?:flow\s*sensor|flowmeter|flow\s*meter|liquid\s*flow)\b", re.I),
        re.compile(
            r"(?:ads\d{3,}|adc\b|analog[\s-]*to[\s-]*digital|max\d{4}|mcp3\d{3})",
            re.I,
        ),
        "flow-sensor role must not pin an ADC IC as the sensor identity",
    ),
    (
        re.compile(
            r"\b(?:optical\s*density|od600|od\s*sensor|turbidimetr|growth\s*sensor)\b",
            re.I,
        ),
        re.compile(
            r"(?:0603|0805|smd\s*led|indicator\s*led|szyy\d+|led\s*only)",
            re.I,
        ),
        "OD/growth-sensor role must not pin a bare indicator LED package as the full path",
    ),
    (
        re.compile(r"\b(?:temperature\s*probe|rtd|thermistor|thermocouple)\b", re.I),
        re.compile(r"\b(?:fan|pump|valve|relay)\b", re.I),
        "temperature-probe role must not pin unrelated electromechanical MPNs",
    ),
)


def audit_part_identity(
    *,
    name: str,
    part: str = "",
    manufacturer: str = "",
    part_number: str = "",
) -> list[str]:
    """Return human-readable ban hits for one part line (empty = OK)."""
    role = f"{name}"
    identity = f"{manufacturer} {part_number} {part}".strip()
    if not identity or re.search(r"\bTBD\b|made to spec|bespoke|requirement stated", identity, re.I):
        return []  # open lines are not false identities
    hits: list[str] = []
    for role_re, ban_re, msg in _FUNCTION_CLASS_BANS:
        if role_re.search(role) and ban_re.search(identity):
            hits.append(f"{msg}: role={name!r} identity={identity!r}")
    return hits


def audit_parts_iterable(parts: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    """Audit a list of part-like dicts (equipment / verifications / BoM rows)."""
    findings: list[dict[str, Any]] = []
    for p in parts:
        if not isinstance(p, dict):
            continue
        name = str(
            p.get("name")
            or p.get("word_name")
            or p.get("requirement")
            or p.get("item")
            or ""
        )
        hits = audit_part_identity(
            name=name,
            part=str(p.get("part") or ""),
            manufacturer=str(p.get("manufacturer") or ""),
            part_number=str(
                p.get("part_number") or p.get("partNumber") or p.get("mpn") or ""
            ),
        )
        for h in hits:
            findings.append({
                "tag": p.get("tag") or p.get("word_id") or "",
                "name": name,
                "issue": h,
            })
    return findings


if __name__ == "__main__":
    assert audit_part_identity(
        name="Magnetic Stirrer Drive",
        manufacturer="Nidec Copal",
        part_number="F280A-24",
        part="Nidec Copal F280A-24 fan",
    ), "fan-as-stirrer must hit"
    assert not audit_part_identity(
        name="Magnetic Stirrer Drive",
        part="TBD (magnetic stir drive)",
    )
    assert audit_part_identity(
        name="Flow Sensor",
        manufacturer="Texas Instruments",
        part_number="ADS1114IDGSR",
    )
    assert audit_part_identity(
        name="Optical Density Sensor",
        part="Yongyu Photoelectric SZYY0603B",
    )
    assert not audit_part_identity(
        name="Heatsink Fan",
        manufacturer="Sunon",
        part_number="MF40101VX",
        part="axial fan",
    ), "real fan role may pin fan MPN"
    print("catalogue_function_class selftest OK")
