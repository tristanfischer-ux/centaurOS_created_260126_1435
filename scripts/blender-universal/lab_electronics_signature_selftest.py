#!/usr/bin/env python3
"""lab_electronics_signature_selftest.py — proveCatch for punchlist B4 (Tristan
2026-07-21): the lab_electronics render family must SPLIT BY FUNCTION. One shared
PCB-first interior (main board + AFE chips + USB + dual BNC + coin cell) used to
cover THREE morphologically-different products (potentiostat / vial_bioreactor /
ewod). Dual BNC coax is an ELECTROCHEMISTRY cue — wrong inside a culture vessel or
a droplet-actuation deck. This selftest drives the pure `_le_interior_partset`
decision (the geometry-free rule the interior builder consumes) with each
_LE_SIGNATURE and asserts each sub-type yields its OWN coherent interior part-set,
distinct from the others — so a potentiostat is not built as a bioreactor is not
built as an ewod device.

bpy is mocked so the pure decision runs head-less. Wired into
verify-engine-guards.sh. Fix at SOURCE = `_le_interior_partset` in
build_universal_scene.py; if it ever collapses two signatures back to one story,
this proveCatch FAILS the build.
"""
import sys
from pathlib import Path
from unittest.mock import MagicMock

sys.modules["bpy"] = MagicMock()
sys.modules["bmesh"] = MagicMock()
sys.modules["mathutils"] = MagicMock()
sys.path.insert(0, __file__.rsplit("/", 1)[0])
sys.path.insert(0, __file__.rsplit("/", 2)[0] + "/lib")
import build_universal_scene as b  # noqa: E402

fails: list[str] = []


def _partset(sig: str) -> tuple[str, ...]:
    return tuple(b._le_interior_partset(sig))


# 1. Each signature yields a NON-EMPTY, coherent interior part-set.
SIGS = ("potentiostat", "vial_bioreactor", "ewod", "generic")
sets = {s: _partset(s) for s in SIGS}
for s, parts in sets.items():
    if not parts:
        fails.append(f"signature {s!r} produced an EMPTY interior part-set")

# 2. The three REAL products must be pairwise-DISTINCT morphologies (the whole B4
#    intent: not one shared shell). Compare as multisets of role tags.
from collections import Counter  # noqa: E402

real = ("potentiostat", "vial_bioreactor", "ewod")
for i in range(len(real)):
    for j in range(i + 1, len(real)):
        a, c = real[i], real[j]
        if Counter(sets[a]) == Counter(sets[c]):
            fails.append(
                f"{a!r} and {c!r} share an IDENTICAL interior part-set "
                f"{sets[a]} — the families are not split"
            )

# 3. FUNCTIONAL coherence per signature (the parts must MATCH the product's physics):
#    - potentiostat: has the BNC electrochemistry interface.
#    - vial_bioreactor: has the OD optical pair + stir/thermal culture guts,
#      and NO BNC coax (there is no electrode cell in a culture vessel).
#    - ewod: has the HV droplet-actuation driver + electrode fan-out,
#      and NO BNC coax (droplets are actuated, not measured on coax).
pot = set(sets["potentiostat"])
bio = set(sets["vial_bioreactor"])
ewo = set(sets["ewod"])

if not ({"bnc_electrode", "bnc_cell"} & pot):
    fails.append("potentiostat interior lost its BNC electrode/cell interface")

if not ({"od_led_source", "od_photodiode_det"} <= bio):
    fails.append("vial_bioreactor interior missing the OD optical source+detector pair")
if not ({"stir_motor", "heater_block"} & bio):
    fails.append("vial_bioreactor interior missing stir/thermal culture guts")
if {"bnc_electrode", "bnc_cell"} & bio:
    fails.append("vial_bioreactor interior WRONGLY carries electrochemistry BNC coax")

if "hv_driver" not in ewo:
    fails.append("ewod interior missing the high-voltage droplet driver")
if not ({"ribbon_connector", "electrode_fanout"} & ewo):
    fails.append("ewod interior missing the electrode grid connector/fan-out")
if {"bnc_electrode", "bnc_cell"} & ewo:
    fails.append("ewod interior WRONGLY carries electrochemistry BNC coax")

# 4. Unknown / blank signature falls back to a coherent generic AFE story (never crash).
if not _partset("") or not _partset("nonsense-xyz"):
    fails.append("unknown/blank signature did not fall back to a generic part-set")

# 5. Bench power instrument (2026-07-27 cell-cycler): cell-bay + C14 + pass-bank,
#    NEVER electrochemistry BNC (cold-v4 clipboard/BNC morphology leak).
bp = set(_partset("bench_power"))
if not ({"channel_terminal_strip", "c14_inlet", "pass_bank_heatsink", "peltier_block"} <= bp):
    fails.append(
        f"bench_power interior missing cell-bay/C14/pass-bank/peltier roles — got {sorted(bp)}"
    )
if {"bnc_electrode", "bnc_cell"} & bp:
    fails.append("bench_power interior WRONGLY carries electrochemistry BNC coax")
if Counter(bp) == Counter(sets["potentiostat"]):
    fails.append("bench_power collapsed to potentiostat morphology")

# 6. Exterior signature (2026-07-28 cold-v17 SIGHT): bench_power must NOT ship a
#    featureless sealed box — HMI fascia + channel bay + C14 + heatsink fins.
#    Pure `_le_exterior_partset` is the SOURCE the geometry builder consumes;
#    empty exterior partset = the blank-chassis disease that floored Renders at 4.
def _ext(sig: str) -> tuple[str, ...]:
    return tuple(b._le_exterior_partset(sig))


bp_ext = set(_ext("bench_power"))
_need_ext = {"face_panel", "face_display", "face_key", "bay_strip", "mains_c14",
             "heatsink_fin"}
if not (_need_ext <= bp_ext):
    fails.append(
        f"bench_power exterior missing HMI/bay/C14/fins roles — got {sorted(bp_ext)}"
    )
if "lead_we" in bp_ext or "bnc_electrode" in bp_ext:
    fails.append("bench_power exterior WRONGLY carries potentiostat banana/BNC cues")
# Keep-list must retain the new exterior prefixes (else 04 hides them again).
for pfx in ("u_se_le_bay", "u_se_le_mains", "u_se_le_fins", "u_se_le_face"):
    if pfx not in b._EXTERIOR_KEEP_PREFIXES:
        fails.append(f"exterior keep-list missing {pfx!r} — 04 would cull bench_power cues")
# Family tokens the vision/drawing gates compare against.
if b._exterior_signature_family("u_se_le_bay_strip") != "channel-bay":
    fails.append("u_se_le_bay_* must map to family channel-bay")
if b._exterior_signature_family("u_se_le_mains_c14") != "mains-inlet":
    fails.append("u_se_le_mains_* must map to family mains-inlet")
if b._exterior_signature_family("u_se_le_fins_heatsink_0") != "pass-bank-heatsink":
    fails.append("u_se_le_fins_* must map to family pass-bank-heatsink")
# Dispatcher source must call the bench_power builder (catch branch deletion).
import inspect as _insp  # noqa: E402
_place_src = _insp.getsource(b.place_sealed_enclosure)
if "_build_bench_power_signature" not in _place_src:
    fails.append(
        "place_sealed_enclosure must call _build_bench_power_signature "
        "(empty elif = featureless chassis regression)"
    )

# 7. Overlapping front panels (2026-07-28 SIGHT): bench_power must call fascia
#    with face_band="left" so HMI and channel bay do not share the same X span.
_bp_src = _insp.getsource(b._build_bench_power_signature)
if 'face_band="left"' not in _bp_src and "face_band='left'" not in _bp_src:
    fails.append(
        "_build_bench_power_signature must pass face_band='left' to the fascia "
        "(full-width fascia + bay = overlapping front panels)"
    )
# Pack-vs-story: lab_electronics must KEEP signature interior (not hide it for
# BoM proxy boxes) — catch the random-boxes regression at source.
_mod_src = Path(__file__).with_name("build_universal_scene.py").read_text(
    encoding="utf-8")
if "anti random-boxes" not in _mod_src:
    fails.append(
        "lab_electronics pack de-dupe must KEEP signature story over BoM proxies "
        "(random-boxes disease)"
    )
if "ledger harness SKIPPED" not in _mod_src:
    fails.append(
        "lab_electronics must skip ledger harness when signature story wins "
        "(fake-wiring disease)"
    )

if fails:
    for f in fails:
        print(f"  ✗ {f}")
    print(f"lab_electronics-signature selftest: {len(fails)} FAILED")
    sys.exit(1)

print(
    "lab_electronics-signature selftest: OK "
    f"(3 sub-types split by function — potentiostat={sets['potentiostat']} "
    f"vial_bioreactor={sets['vial_bioreactor']} ewod={sets['ewod']}; "
    "pairwise-distinct, functionally coherent, no BNC leak into culture/ewod)"
)
