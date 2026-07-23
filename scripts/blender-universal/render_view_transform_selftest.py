#!/usr/bin/env python3
"""render_view_transform_selftest.py — proveCatch: product renders MUST prefer AgX,
never default to the Standard view transform.

WHY (the bug that bit TWICE, 2026-07-23): Blender's "Standard" view transform applies
NO highlight roll-off, so a light-grey polymer body + a bright studio background bloom to
near-white and the render ships as a pale wash (the black-on-black demo render's overcorrection).
AgX compresses highlights and restores contrast + silhouette on the SAME body. A sub-agent
"fixed" the wash by FLIPPING the preference tuple to ("Standard", "Filmic", "AgX") — i.e.
preferring Standard — which reintroduced the wash. Twice. This guard makes that regression
impossible to land: every view-transform fallback tuple in forge_blender_lib.py that mentions
both AgX and Standard MUST list AgX BEFORE Standard (AgX preferred; Standard is the last-resort
fallback for an old Blender that lacks AgX).

Source-level (bpy is not importable outside Blender), wired into verify-engine-guards.sh.
Drawer: forgeos_gotchas_c9888be968b4a186 (AgX not Standard).
"""
import re
import sys
from pathlib import Path

LIB = Path(__file__).resolve().parent.parent / "blender-templates" / "forge_blender_lib.py"

# a view-transform fallback tuple: a parenthesised run of the known transform string literals,
# e.g.  ("AgX", "Filmic", "Standard")  — capture the ordered list of names inside.
_TUPLE_RE = re.compile(r'\(\s*((?:"(?:AgX|Filmic|Standard)"\s*,?\s*){2,})\)')
_NAME_RE = re.compile(r'"(AgX|Filmic|Standard)"')


def find_view_transform_tuples(source: str):
    """Return the ordered [name,...] of every transform-fallback tuple in the source."""
    return [_NAME_RE.findall(m.group(1)) for m in _TUPLE_RE.finditer(source)]


def check_agx_before_standard(source: str):
    """Return a list of failure strings (empty == PASS). A tuple mentioning BOTH AgX and
    Standard must list AgX first — otherwise a render prefers the wash-prone Standard."""
    failures = []
    tuples = find_view_transform_tuples(source)
    seen_agx_tuple = False
    for names in tuples:
        if "AgX" in names and "Standard" in names:
            seen_agx_tuple = True
            if names.index("AgX") > names.index("Standard"):
                failures.append(
                    f"view-transform fallback tuple prefers Standard over AgX: {names} "
                    "→ light bodies bloom to a pale wash. Put 'AgX' FIRST."
                )
    if not seen_agx_tuple:
        # the guard is only meaningful if the tuples it protects still exist
        failures.append(
            "no view-transform fallback tuple containing both AgX and Standard found in "
            f"{LIB.name} — the colour-management path moved; re-point this guard."
        )
    return failures


def main() -> int:
    source = LIB.read_text(encoding="utf-8")

    # 1) the real check against the live source
    failures = check_agx_before_standard(source)

    # 2) proveCatch — the check MUST fire on a flipped tuple (the exact regression)
    flipped = 'for transform in ("Standard", "Filmic", "AgX"):\n    scene.view_settings.view_transform = transform'
    if not check_agx_before_standard(flipped):
        print("render_view_transform selftest: FAIL — proveCatch did not fire on a flipped "
              '("Standard", ..., "AgX") tuple; the guard is asleep.')
        return 1
    # proveCatch negative — a correct tuple must be silent
    correct = 'for _vt in ("AgX", "Filmic", "Standard"):\n    scene.view_settings.view_transform = _vt'
    if check_agx_before_standard(correct):
        print("render_view_transform selftest: FAIL — proveCatch false-fired on a correct "
              "AgX-first tuple.")
        return 1

    if failures:
        print("render_view_transform selftest: FAIL")
        for f in failures:
            print("   ✗ " + f)
        return 1

    n = len([t for t in find_view_transform_tuples(source) if "AgX" in t and "Standard" in t])
    print(f"render_view_transform selftest: OK ({n} AgX-first fallback tuple(s) verified; "
          "proveCatch fires on the flipped-to-Standard regression)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
