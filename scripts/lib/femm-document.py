#!/usr/bin/env python3
"""FEMM 4.2 document header — parse and rewrite without touching geometry.

INTENT: Tony Hooley's 13 September 2026 Windows run of Ser0020 showed that a
millimetre copy with winding current hangs at MinAngle 30/33 and finishes at
MinAngle 15, while the same millimetre copy with all currents zero does not
hang. Anvil had told him that tightening min-angle was the wrong knob and that
the micrometre→millimetre restamp was what let current finish. That claim is
false as a general rule: on his engine the hang is current + mesh angle, not
units. This module is the source rule so the next walk changes MinAngle first
and never overlays a restamped-units table on a native-units table.

DECISION: header-only rewrite. Geometry, materials, and node coordinates stay
byte-identical. A unit restamp is a sibling measurement and is out of scope.

FLOW: caller reads a .fem → parse_header / set_min_angle / set_circuit_amps
→ writes a dated copy into the Hooley Drive folder.
→ See: Drive folder 1NT3gyqGVevCPBKFUDCnasJQesb8bplfB
"""

from __future__ import annotations

import argparse
import re
import sys
from typing import Mapping


_HEADER_LINE = re.compile(r"^\[(?P<key>[^\]]+)\]\s*=\s*(?P<value>.*)\s*$")
_CIRCUIT_NAME = re.compile(r"<CircuitName>\s*=\s*\"(?P<name>[^\"]+)\"")
_CIRCUIT_AMPS = re.compile(r"<TotalAmps_re>\s*=\s*(?P<amps>[-+0-9.eE]+)")


def parse_header(text: str) -> dict[str, str]:
    """Read the leading [Key] = value lines of a FEMM document.

    @description Stops at the first non-header line. Keys are the bracket names.
    @param text Full .fem file text.
    @returns Mapping of header key to raw value string.
    """
    header: dict[str, str] = {}
    for line in text.splitlines():
        match = _HEADER_LINE.match(line)
        if match is None:
            if header:
                break
            continue
        header[match.group("key")] = match.group("value").strip()
    return header


def parse_circuit_amps(text: str) -> dict[str, float]:
    """Read each named circuit's real current.

    @description Walks CircuitName / TotalAmps_re pairs in document order.
    @param text Full .fem file text.
    @returns Mapping of circuit name to real amperes.
    """
    amps: dict[str, float] = {}
    current_name: str | None = None
    for line in text.splitlines():
        name_match = _CIRCUIT_NAME.search(line)
        if name_match is not None:
            current_name = name_match.group("name")
            continue
        amps_match = _CIRCUIT_AMPS.search(line)
        if amps_match is not None and current_name is not None:
            amps[current_name] = float(amps_match.group("amps"))
            current_name = None
    return amps


def current_on_hang_is_mesh_not_units(
    *,
    i0_finished: bool,
    current_on_finished: bool,
    length_units: str,
) -> bool:
    """True when a current-on hang cannot be blamed on the length unit.

    INTENT: proveCatch for the 13 September Windows fact. If the millimetre
    (or any-unit) file finishes with all currents zero and hangs once a
    winding carries current, the unit restamp is not the cause.

    @param i0_finished Whether the same document finished with all currents zero.
    @param current_on_finished Whether the same document finished with current.
    @param length_units FEMM LengthUnits value (unused in the decision; named
           so a caller cannot silently drop the unit from the evidence).
    @returns True when the hang is current-on, not units.
    """
    del length_units
    return bool(i0_finished) and not bool(current_on_finished)


def set_min_angle(text: str, degrees: float) -> str:
    """Rewrite [MinAngle] only.

    @description Leaves every other byte of the document unchanged except the
                 MinAngle value and the newline style of that one line.
    @param text Full .fem file text.
    @param degrees New minimum angle in degrees. Must be > 0 and < 35.
    @returns Document text with the new MinAngle.
    @throws ValueError if degrees is out of range or MinAngle is missing.
    """
    if degrees <= 0 or degrees >= 35:
        raise ValueError(f"MinAngle {degrees} is outside FEMM's useful range")
    if "[MinAngle]" not in text:
        raise ValueError("FEMM document has no [MinAngle] line")
    replacement = f"[MinAngle]    =  {degrees:g}"
    updated, count = re.subn(
        r"^\[MinAngle\]\s*=\s*.*$",
        replacement,
        text,
        count=1,
        flags=re.MULTILINE,
    )
    if count != 1:
        raise ValueError("FEMM document MinAngle line did not rewrite once")
    return updated


def set_circuit_amps(text: str, amps_by_name: Mapping[str, float]) -> str:
    """Rewrite named circuit real currents. Other circuits are untouched.

    @param text Full .fem file text.
    @param amps_by_name Circuit name → real amperes.
    @returns Document text with those circuits updated.
    @throws ValueError if a named circuit is missing.
    """
    updated = text
    for name, amps in amps_by_name.items():
        pattern = (
            rf"(<CircuitName>\s*=\s*\"{re.escape(name)}\"\s*\n"
            rf"\s*<TotalAmps_re>\s*=\s*)([-+0-9.eE]+)"
        )
        updated, count = re.subn(
            pattern,
            rf"\g<1>{amps:.6f}",
            updated,
            count=1,
        )
        if count != 1:
            raise ValueError(f"circuit {name!r} not found or not unique")
    return updated


def _selftest() -> int:
    fixture = (
        "[Format]      =  4.0\n"
        "[Precision]   =  1e-008\n"
        "[MinAngle]    =  25\n"
        "[Depth]       =  1.2\n"
        "[LengthUnits] =  millimeters\n"
        "[CircuitProps]  = 3\n"
        "  <BeginCircuit>\n"
        "    <CircuitName> = \"COIL#1\"\n"
        "    <TotalAmps_re> = 0.120000\n"
        "    <TotalAmps_im> = 0\n"
        "  <EndCircuit>\n"
        "  <BeginCircuit>\n"
        "    <CircuitName> = \"COIL#2\"\n"
        "    <TotalAmps_re> = 0.000000\n"
        "    <TotalAmps_im> = 0\n"
        "  <EndCircuit>\n"
        "GEOMETRY-MUST-NOT-MOVE 1234\n"
    )

    header = parse_header(fixture)
    amps = parse_circuit_amps(fixture)
    if header["MinAngle"] != "25" or header["LengthUnits"] != "millimeters":
        print("femm-document SELFTEST FAIL: parse_header")
        return 1
    if amps != {"COIL#1": 0.12, "COIL#2": 0.0}:
        print(f"femm-document SELFTEST FAIL: parse_circuit_amps {amps}")
        return 1

    # proveCatch: Tony's Windows fact — I=0 finishes, current-on hangs, units mm.
    if not current_on_hang_is_mesh_not_units(
        i0_finished=True,
        current_on_finished=False,
        length_units="millimeters",
    ):
        print("femm-document SELFTEST FAIL: current-on hang must not be blamed on units")
        return 1
    if current_on_hang_is_mesh_not_units(
        i0_finished=True,
        current_on_finished=True,
        length_units="millimeters",
    ):
        print("femm-document SELFTEST FAIL: a finished current-on solve is not a hang")
        return 1

    rewritten = set_min_angle(fixture, 15)
    new_header = parse_header(rewritten)
    new_amps = parse_circuit_amps(rewritten)
    if new_header["MinAngle"] != "15":
        print(f"femm-document SELFTEST FAIL: MinAngle became {new_header['MinAngle']}")
        return 1
    if new_header["LengthUnits"] != "millimeters" or new_header["Depth"] != "1.2":
        print("femm-document SELFTEST FAIL: units or depth changed")
        return 1
    if new_amps != amps:
        print("femm-document SELFTEST FAIL: currents changed when only MinAngle should")
        return 1
    if "GEOMETRY-MUST-NOT-MOVE 1234" not in rewritten:
        print("femm-document SELFTEST FAIL: geometry line lost")
        return 1
    if rewritten.count("GEOMETRY-MUST-NOT-MOVE 1234") != 1:
        print("femm-document SELFTEST FAIL: geometry line duplicated")
        return 1

    try:
        set_min_angle(fixture, 40)
        print("femm-document SELFTEST FAIL: out-of-range MinAngle accepted")
        return 1
    except ValueError:
        pass

    print("femm-document selftest OK (parse / mesh-not-units / MinAngle-only rewrite)")
    return 0


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="FEMM 4.2 header rewrite")
    parser.add_argument("--selftest", action="store_true")
    parser.add_argument("--in", dest="in_path", default="")
    parser.add_argument("--out", dest="out_path", default="")
    parser.add_argument("--min-angle", dest="min_angle", type=float, default=None)
    args = parser.parse_args(argv)
    if args.selftest:
        return _selftest()
    if not args.in_path or not args.out_path or args.min_angle is None:
        print("usage: femm-document.py --selftest | --in FILE --out FILE --min-angle DEG", file=sys.stderr)
        return 2
    source = open(args.in_path, "r", encoding="latin-1").read()
    updated = set_min_angle(source, args.min_angle)
    with open(args.out_path, "w", encoding="latin-1", newline="\n") as handle:
        handle.write(updated)
    print(f"[femm-document] MinAngle {parse_header(source)['MinAngle']} → {args.min_angle:g}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
