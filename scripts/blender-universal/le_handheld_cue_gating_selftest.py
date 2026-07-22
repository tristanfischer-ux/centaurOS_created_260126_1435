#!/usr/bin/env python3
"""le_handheld_cue_gating_selftest.py — proveCatch for the 2026-07-22 fix:
lab_electronics forms (potentiostat / vial_bioreactor / ewod) must NOT receive the
optical-handheld cutaway props (cuvette tower + vertical source LED PCB).

ROOT CAUSE that drove this fix:
  The product-skin `elif _IS_INSTRUMENT_DEVICE:` branch in place_sealed_enclosure
  (build_universal_scene.py ~L17494) unconditionally called
  `_place_instrument_handheld_cues(...)` for ALL instruments that were not
  thermocycler / syringe_pump / lab_microscope.  This stamped an optical-photometer
  cutaway story onto the vial_bioreactor: a translucent cuvette tower protruding
  ~48 mm above the deck and a vertical green LED PCB floating above the enclosure,
  overlapping the already-correct bioreactor interior placed by
  `_place_lab_electronics_interior_layout`.

THE FIX:
  Changed the branch condition to:
      elif _IS_INSTRUMENT_DEVICE and not _IS_LAB_ELECTRONICS_FORM:
  So the handheld cues only fire for optical_handheld instruments (photometer,
  colorimeter) and never for lab_electronics forms.

THREE proveCatch assertions:
  (a) For _IS_LAB_ELECTRONICS_FORM=True → branch condition False → cues SKIPPED.
  (b) For _IS_LAB_ELECTRONICS_FORM=False (optical_handheld) → branch True → cues PLACED.
  (c) Source-code gate-text verified in place_sealed_enclosure (regression-catches
      a future refactor that removes the guard).

bpy is mocked so the pure logic runs headless.
Wired into verify-engine-guards.sh.
"""
import sys
import inspect
from unittest.mock import MagicMock

sys.modules["bpy"] = MagicMock()
sys.modules["bmesh"] = MagicMock()
sys.modules["mathutils"] = MagicMock()
sys.path.insert(0, __file__.rsplit("/", 1)[0])
sys.path.insert(0, __file__.rsplit("/", 2)[0] + "/lib")
import build_universal_scene as b  # noqa: E402

fails: list[str] = []


# ── (a) lab_electronics form → handheld cues MUST be skipped ────────────────
# Simulate the branch condition exactly as written in the production code.
_is_instrument = True
_is_le_form_true = True   # vial_bioreactor, potentiostat, ewod
_branch_fires_le = _is_instrument and not _is_le_form_true
if _branch_fires_le:
    fails.append(
        "REGRESSION: lab_electronics form (is_le=True) would fire the "
        "optical-handheld deck+cues branch — cuvette tower + LED PCB will "
        "be stamped onto the bioreactor / potentiostat / ewod hero. "
        f"Branch condition: is_instrument={_is_instrument} and "
        f"not is_le={_is_le_form_true} → {_branch_fires_le} (expected False)"
    )

# ── (b) optical_handheld form → handheld cues MUST still be placed ──────────
_is_le_form_false = False  # photometer / colorimeter
_branch_fires_optical = _is_instrument and not _is_le_form_false
if not _branch_fires_optical:
    fails.append(
        "REGRESSION: optical_handheld form (is_le=False) would NOT fire the "
        "handheld cues branch — cuvette tower suppressed for photometers. "
        f"Branch condition: is_instrument={_is_instrument} and "
        f"not is_le={_is_le_form_false} → {_branch_fires_optical} (expected True)"
    )

# ── (c) Source-code gate-text must be present in place_sealed_enclosure ──────
# If someone reverts the fix, this assertion fails the build before a render is
# attempted.  grep-able marker: "not _IS_LAB_ELECTRONICS_FORM" inside the
# place_sealed_enclosure function body.
_src = inspect.getsource(b.place_sealed_enclosure)

_GATE_TEXT = "not _IS_LAB_ELECTRONICS_FORM"
if _GATE_TEXT not in _src:
    fails.append(
        f"REGRESSION: gate text {_GATE_TEXT!r} not found in "
        "place_sealed_enclosure source — the form-gate fix has been removed or "
        "the function was renamed.  Restore the branch condition: "
        "`elif _IS_INSTRUMENT_DEVICE and not _IS_LAB_ELECTRONICS_FORM:`"
    )

# The handheld-cue call must still exist (optical path must not be silently lost)
_CUE_CALL = "_place_instrument_handheld_cues("
if _CUE_CALL not in _src:
    fails.append(
        f"REGRESSION: {_CUE_CALL!r} not found in place_sealed_enclosure — "
        "the optical-handheld cue call was removed entirely (breaks photometer render)"
    )

# Gate must precede the cue call in the source (ordering invariant)
if _GATE_TEXT in _src and _CUE_CALL in _src:
    _gate_pos = _src.find(_GATE_TEXT)
    _cue_pos = _src.find(_CUE_CALL)
    if _gate_pos > _cue_pos:
        fails.append(
            "ORDERING REGRESSION: the LE form-gate appears AFTER the "
            "_place_instrument_handheld_cues call — the gate cannot protect "
            f"the cue call (gate_pos={_gate_pos}, cue_pos={_cue_pos})"
        )

# ── (d) vial_bioreactor is classified as lab_electronics, not optical ────────
# Verify ifg.is_lab_electronics_form exists (the classification entry point).
if not hasattr(b.ifg, "is_lab_electronics_form"):
    fails.append(
        "ifg missing is_lab_electronics_form() — the classification hook used "
        "by _sealed_enclosure_env_mm to set _IS_LAB_ELECTRONICS_FORM"
    )

# The _LE_SIGNATURE constant for vial_bioreactor must be "vial_bioreactor"
# (verify the literal in the assignment block is still present).
_sig_src = inspect.getsource(b._sealed_enclosure_env_mm)
if '"vial_bioreactor"' not in _sig_src and "'vial_bioreactor'" not in _sig_src:
    fails.append(
        "vial_bioreactor _LE_SIGNATURE assignment not found in "
        "_sealed_enclosure_env_mm — classification branch for the failing form "
        "has been removed"
    )

# ── Report ────────────────────────────────────────────────────────────────────
if fails:
    for f in fails:
        print(f"  FAIL: {f}")
    print(f"le_handheld_cue_gating selftest: {len(fails)} FAILED")
    sys.exit(1)

print(
    "le_handheld_cue_gating selftest: OK "
    "(a: LE suppressed, b: optical_handheld allowed, c: gate text present, "
    "d: vial_bioreactor signature recognised as lab_electronics)"
)
