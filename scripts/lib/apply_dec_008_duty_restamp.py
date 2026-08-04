#!/usr/bin/env python3
"""Apply DEC-008 (A-DUTY intermittent freeze) to a live twin — restamp, don't invent.

⭐ F1 fix (2026-08-03 full verification). DEC-008 was recorded in
10-decision-register.json as FROZEN_UNDER_ASSUMPTION but the twin still carried
continuous_power_kw basis=continuous and magnet temps from 100% duty screening
(159 °C). Customer surfaces and physics_plausibility therefore contradicted the
named decision.

This restamp:
  1. Re-derives the 24% vignette thermal grid (magnet_margin_sensitivity) — pure
     arithmetic on twin quantities, no new physics model.
  2. Writes the ADOPTED case (vignette × mid iron-loss corner) into
     mgu_magnet_temp_c / mgu_winding_temp_c with DEC-008 provenance.
  3. Relabels continuous_power_kw basis from continuous → intermittent_peak so
     the duty-basis contradiction detector stops firing on a frozen decision
     (the key name stays for lineage; basis carries the DEC).
  4. Updates cooling-screen JSON magnet/winding fields to the adopted temps
     while preserving continuous-path numbers under continuous_reference_*.
  5. Writes _motor_stack/dec_008_duty_restamp.json audit artefact.
  6. Does NOT mint ship_ok, does NOT close Bar B, does NOT apply DEC-009
     geometry (that is a separate restamp).

Usage:
  apply_dec_008_duty_restamp.py --twin <dir>
  apply_dec_008_duty_restamp.py --selftest
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping, Optional

_LIB = Path(__file__).resolve().parent
if str(_LIB) not in sys.path:
    sys.path.insert(0, str(_LIB))

from magnet_margin_sensitivity import evaluate as evaluate_magnet_margin  # noqa: E402

SCHEMA = "forgeos.fpk.dec_008_duty_restamp/v1"
OUTPUT = "_motor_stack/dec_008_duty_restamp.json"


def _iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _qty_map(state: dict) -> dict:
    oc = state.get("orchestratorContract")
    if isinstance(oc, Mapping):
        q = oc.get("quantities")
        if isinstance(q, dict):
            return q
    return {}


def _adopted_vignette_mid(grid: Mapping[str, Any]) -> dict[str, Any]:
    """Pick vignette duty × mid iron-loss corner — the DEC-008 adopted screen."""
    rows = grid.get("rows") or []
    for r in rows:
        if not isinstance(r, Mapping):
            continue
        duty = str(r.get("duty") or "")
        corner = str(r.get("iron_loss_corner") or "")
        if duty.startswith("vignette") and corner.startswith("mid"):
            return dict(r)
    raise RuntimeError("magnet_margin grid missing vignette×mid row — cannot restamp DEC-008")


# ⭐⭐ ONE PLACE THAT BLANKS THE WINDING, BECAUSE THERE WERE FIVE PLACES THAT WROTE IT
# (Sol, finish councils 2026-08-03 — found across three consecutive reviews, each
# after I had claimed the previous one was the source fix).
#
# `mgu_winding_temp_c` and every cooling-screen winding field were being set to the
# MAGNET temperature. They cannot be equal: copper loss is dissipated IN the winding
# across a non-zero magnet-to-winding resistance, so the winding sits above the
# magnet. A reader checking insulation-class margin (class H, 180 °C) against the
# magnet number is reading the wrong part of the machine.
#
# The write paths were: the DEC-008 quantity, `_patch_screen()`, the thermal-screen
# follow-up loop, the network-screen follow-up block, and DEC-009's own quantity
# loop. Fixing them one at a time did not work — DEC-009 masked DEC-008 on this
# twin, so a DEC-008-only twin still shipped the fabricated value while the live
# check looked clean. Hence ONE helper, called after every block that touches a
# screen, rather than five parallel edits.
#
# It also clears the pass flags DERIVED from the blanked number. Removing a value
# and leaving `winding_below_screen_limit: True` standing creates a green tick with
# nothing behind it — the exact defect family this work exists to remove,
# manufactured by the repair. An unknown margin is not a pass.
# ⭐ MATCHED BY SHAPE, NOT BY A FIXED LIST (Sol, guards council 2026-08-03). The
# first version named three keys, so a new screen schema could introduce
# `peak_winding_temp_c` and silently republish the fabricated value while every
# selftest passed — the guard would not have known the key existed. Any key that
# names the winding AND carries a temperature is blanked.
_WINDING_TOKEN = "winding"
# ⭐ "_c" ALONE IS TOO LOOSE (Sol, guards council 2026-08-03): winding_current_c
# and similar fields match it while carrying no temperature at all, so the
# blanking rule was simultaneously overbroad and — for anything not ending in
# _c — incomplete. An explicit temperature word is required.
_TEMPERATURE_TOKENS = ("temp", "celsius", "theta", "kelvin")
# RESIDUAL LIMIT, stated rather than papered over (Sol, guards council
# 2026-08-03): shape matching cannot recognise a temperature field whose name
# uses none of these words — `t_winding_max` would evade it. This is a heuristic
# over free-form keys, not a schema. The durable fix is a typed screen result
# where a temperature declares itself; until then this catches the naming
# conventions in use and the selftest pins the ones that matter.
_WINDING_DERIVED_FLAGS = (
    "winding_below_screen_limit",
    "winding_within_limit",
    "all_temperatures_below_screen_limits",
    "temperature_screen_ok",
)
# Keys that RECORD history rather than assert a current value must survive.
_PRESERVE_TOKENS = ("continuous_reference", "pre_dec", "why_absent", "why_unknown",
                    "_proxy", "superseded")


def _is_winding_temperature_key(key: str) -> bool:
    low = key.lower()
    if _WINDING_TOKEN not in low:
        return False
    if any(tok in low for tok in _PRESERVE_TOKENS):
        return False
    return any(tok in low for tok in _TEMPERATURE_TOKENS)


def _blank_winding(scr: dict) -> None:
    """Leave every winding temperature and its derived flags honestly unknown."""
    for key in [k for k in list(scr) if _is_winding_temperature_key(k)]:
        if key in scr:
            scr[key] = None
            scr[f"{key}_why_absent"] = (
                "not derived at the DEC-008 intermittent duty; it is NOT equal to "
                "the magnet temperature and must not be proxied from it — copper "
                "loss is dissipated in the winding across a non-zero slot resistance")
    for flag in _WINDING_DERIVED_FLAGS:
        if flag in scr:
            scr[flag] = None
            scr[f"{flag}_why_unknown"] = (
                "the winding temperature it was derived from is not available at "
                "this duty — an unknown margin is not a pass")


def apply_dec_008(twin_dir: Path) -> dict[str, Any]:
    twin_dir = twin_dir.resolve()
    # ⭐ Twin writes need an OPEN stage (Terminal 2026-08-04 twin_write_guard).
    from twin_write_guard import assert_stage_open  # noqa: PLC0415
    assert_stage_open(twin_dir, "apply_dec_008_duty_restamp")
    state_path = twin_dir / "state.json"
    state = json.loads(state_path.read_text(encoding="utf-8"))
    q = _qty_map(state)
    if not q:
        raise RuntimeError(f"no orchestratorContract.quantities in {state_path}")

    grid = evaluate_magnet_margin(state)
    if grid is None:
        raise RuntimeError("magnet_margin_sensitivity.evaluate returned None — missing losses/flow")
    adopted = _adopted_vignette_mid(grid)
    magnet_c = float(adopted["magnet_c"])
    machine_w = float(adopted["machine_loss_w"])
    margin_k = float(adopted["margin_k"])
    limit = float(grid["magnet_limit_c"])

    before = {
        "continuous_power_kw": json.loads(json.dumps(q.get("continuous_power_kw"))),
        "mgu_magnet_temp_c": json.loads(json.dumps(q.get("mgu_magnet_temp_c"))),
        "mgu_winding_temp_c": json.loads(json.dumps(q.get("mgu_winding_temp_c"))),
    }

    # ── 1. continuous_power_kw: intermittent peak under DEC-008 ─────────────
    cp = q.get("continuous_power_kw")
    if not isinstance(cp, dict):
        cp = {"value": 250, "unit": "kW", "family": "power"}
    else:
        cp = dict(cp)
    cp["basis"] = "intermittent_peak"
    cp["source"] = "decision:DEC-008"
    cp["source_detail"] = (
        "DEC-008 A-DUTY RE-FROZEN 2026-08-03: 250 kW is an INTERMITTENT peak "
        "(regen-only front unit), not a continuous rating. Design duty = twin "
        "vignette duty_regen_time_s / (regen+motoring). Reversible if team lap "
        "CSV shows materially higher duty."
    )
    cp["condition"] = "intermittent peak under DEC-008; not continuous"
    q["continuous_power_kw"] = cp

    # Keep a lineage breadcrumb of the rejected continuous reading.
    q["continuous_power_kw_superseded_continuous_screen"] = {
        "value": before["continuous_power_kw"].get("value")
        if isinstance(before["continuous_power_kw"], dict)
        else 250,
        "unit": "kW",
        "basis": "superseded_continuous_screen",
        "source": "decision:DEC-008",
        "source_detail": (
            "Pre-DEC-008 continuous reading retained for audit only — not the "
            "design duty. Do not use for thermal or architecture screens."
        ),
    }

    # ── 2. Magnet / winding temps — adopted vignette × mid iron ─────────────
    prev_mag = before["mgu_magnet_temp_c"] if isinstance(before["mgu_magnet_temp_c"], dict) else {}
    prev_win = before["mgu_winding_temp_c"] if isinstance(before["mgu_winding_temp_c"], dict) else {}

    def _temp_qty(prev: dict, value: float, kind: str) -> dict:
        out = dict(prev) if prev else {"unit": "°C", "family": "temperature", "scope": "module"}
        out["value"] = value
        out["unit"] = out.get("unit") or "°C"
        out["family"] = "temperature"
        out["basis"] = "screen_dec_008_intermittent"
        out["condition"] = (
            "DEC-008 intermittent duty (vignette 24 s regen / 100 s), mid iron-loss "
            "corner, 60 °C coolant inlet — cycle-average screening, not continuous"
        )
        out["provenance"] = {
            "source": "tool:magnet_margin_sensitivity+decision:DEC-008",
            "tool_id": "magnet_margin_sensitivity",
            "detail": (
                f"Adopted vignette×mid row: magnet_c={value}, machine_loss_w={machine_w}, "
                f"margin_k={margin_k} vs limit {limit}. Continuous-path screen was "
                f"{prev.get('value')} °C and is retained under continuous_reference."
            ),
            "caveat": (
                "SCREEN under frozen DEC-008 assumption. Reverses if lap logs raise duty. "
                "Iron loss remains a two-sided screening estimate (3.9–8.5 kW range)."
            ),
            # ⭐ WRITE THE LINEAGE ONCE (Sol, guards council 2026-08-03). A
            # second invocation — normal after a partial application or a retry
            # — recorded the ALREADY-RESTAMPED value as the continuous
            # reference, destroying the 159.35 C evidence the restamp exists to
            # preserve. Idempotent now: first write wins.
            "continuous_reference_c": (
                prev.get("provenance", {}).get("continuous_reference_c")
                if isinstance(prev.get("provenance"), dict)
                and prev["provenance"].get("continuous_reference_c") is not None
                else prev.get("value")),
            "dec_008_adopted_duty": adopted.get("duty"),
            "dec_008_iron_corner": adopted.get("iron_loss_corner"),
        }
        # Clear breach caveats that described continuous duty.
        if "caveat" in out and isinstance(out.get("caveat"), str) and "BREACH" in out["caveat"].upper():
            del out["caveat"]
        return out

    q["mgu_magnet_temp_c"] = _temp_qty(prev_mag, magnet_c, "magnet")

    # ⭐⭐ DO NOT PUBLISH THE MAGNET NUMBER AS THE WINDING TEMPERATURE (Sol,
    # finish council 2026-08-03). This line used to read
    # `_temp_qty(prev_win, magnet_c, "winding")  # grid uses same path proxy`,
    # so `mgu_winding_temp_c` and `mgu_magnet_temp_c` both shipped as exactly
    # 99.4 °C. They cannot be equal: 2,180 W of copper loss is dissipated IN the
    # winding, and the twin's own screen carries a 0.05 K/W magnet-to-winding
    # resistance, so the winding must sit ABOVE the magnet.
    #
    # A DETECTOR IS NOT CONTAINMENT. `physics_plausibility` now flags the
    # equality HIGH, but the Excel builder, the thermal consumers and the
    # release surface do not run it — they read this quantity. Anyone checking
    # insulation-class margin (class H, 180 °C) against 99.4 °C is reading the
    # magnet. So the fabricated value is REMOVED rather than annotated: an
    # absent number forces a consumer to handle the gap, a wrong number does
    # not. The magnet-path figure is kept under its own honest name, and the
    # pre-restamp winding value is preserved so nothing is lost.
    # ⭐ THE SAME IDEMPOTENCY BUG, ONE FIELD OVER (Sol, guards council
    # 2026-08-03). I fixed the lineage for the magnet and left the winding
    # reading prev_win["value"] — which is already None after the first run, so
    # a second restamp overwrote the retained pre-restamp winding temperature
    # with nothing. First write wins here too.
    _prev_val = None
    if isinstance(prev_win, dict):
        _prev_val = (prev_win.get("continuous_reference_c")
                     if prev_win.get("continuous_reference_c") is not None
                     else prev_win.get("value"))
    q["mgu_winding_temp_c"] = {
        **({k: v for k, v in prev_win.items() if k not in ("value", "basis")}
           if isinstance(prev_win, dict) else {"unit": "°C", "family": "temperature"}),
        "value": None,
        "basis": "unresolved_after_dec_008",
        "condition": (
            "DEC-008 restamped the magnet path only. The winding temperature at the "
            "intermittent duty has NOT been derived: it is not equal to the magnet "
            "temperature, because copper loss is dissipated in the winding across a "
            "non-zero magnet-to-winding resistance. Deliberately absent rather than "
            "proxied — insulation-class margin must not be read from the magnet."),
        "magnet_path_proxy_c": magnet_c,
        "continuous_reference_c": _prev_val,
        "provenance": {
            "source": "decision:DEC-008",
            "caveat": ("OPEN: needs the two-source LPTN re-run at the DEC-008 duty, "
                       "or a measured winding temperature from the dyno map."),
        },
    }

    # ── 3. Patch cooling-screen JSONs (preserve continuous under *_reference) ─
    stack = twin_dir / "_motor_stack"
    stack.mkdir(parents=True, exist_ok=True)
    cooling_updates: dict[str, Any] = {}

    def _patch_screen(name: str, magnet_key: str, winding_key: str) -> None:
        path = stack / name
        if not path.is_file():
            return
        data = json.loads(path.read_text(encoding="utf-8"))
        scr = data.get("screening_results")
        if not isinstance(scr, dict):
            scr = {}
            data["screening_results"] = scr
        # Preserve continuous path once.
        for src_key, dst_key in (
            (magnet_key, f"continuous_reference_{magnet_key}"),
            (winding_key, f"continuous_reference_{winding_key}"),
        ):
            if src_key in scr and dst_key not in scr:
                scr[dst_key] = scr[src_key]
        scr[magnet_key] = magnet_c
        # ⭐⭐ THE THIRD WRITE PATH (Sol, finish council 2026-08-03, after two
        # earlier passes had each claimed this was fixed). Blanking the winding
        # QUANTITY above and the DEC-009 screen loop still left this one writing
        # the magnet value into the screen's winding field — so a twin with
        # DEC-008 frozen and DEC-009 not applied would republish the fabricated
        # equality and recreate the insulation-margin hazard the fix describes.
        # Same rule as everywhere else: the winding sits above the magnet by the
        # copper loss across the slot resistance, so it is left ABSENT rather
        # than proxied.
        _blank_winding(scr)
        # Limit flags under adopted duty
        if "magnet_below_screen_limit" in scr:
            scr["magnet_below_screen_limit"] = magnet_c <= limit
        if "temperature_screen_ok" in scr:
            scr["temperature_screen_ok"] = magnet_c <= limit
        if "all_temperatures_below_screen_limits" in scr:
            scr["all_temperatures_below_screen_limits"] = magnet_c <= limit
        if "coupled_screen_ok" in scr and magnet_c <= limit:
            # Do not force True if other coupled criteria failed; only clear
            # temperature-driven failure when temps are the sole issue.
            pass
        data["dec_008_restamp"] = {
            "applied_at": _iso(),
            "adopted_magnet_c": magnet_c,
            "continuous_reference_retained": True,
            "decision": "DEC-008",
        }
        _atomic_write(path, json.dumps(data, indent=2) + "\n")
        cooling_updates[name] = {
            "magnet_c": magnet_c,
            "continuous_reference": scr.get(f"continuous_reference_{magnet_key}"),
        }

    _patch_screen(
        "analytical_fia_cooling_thermal_screen.json",
        "maximum_magnet_temperature_c",
        "maximum_winding_temperature_c",
    )
    # thermal screen also uses calculated_* keys
    tpath = stack / "analytical_fia_cooling_thermal_screen.json"
    if tpath.is_file():
        data = json.loads(tpath.read_text(encoding="utf-8"))
        scr = data.get("screening_results") or {}
        for k in (
            "calculated_magnet_temperature_c",
            "calculated_winding_temperature_c",
            "maximum_magnet_temperature_c",
            "maximum_winding_temperature_c",
        ):
            if "winding" in k:
                continue  # never proxied from the magnet — see _blank_winding
            if k in scr or k.startswith("calculated"):
                if f"continuous_reference_{k}" not in scr and k in scr:
                    scr[f"continuous_reference_{k}"] = scr[k]
                scr[k] = magnet_c
        scr["magnet_below_screen_limit"] = magnet_c <= limit
        # The aggregate flag cannot be computed while the winding is unknown, so
        # _blank_winding sets it to None below. Writing it here first and blanking
        # after is deliberate: it keeps the magnet-side logic readable and makes
        # the "unknown wins over green" rule the LAST word.
        scr["all_temperatures_below_screen_limits"] = magnet_c <= limit and float(
            scr.get("maximum_module_temperature_c") or 0
        ) < 200
        _blank_winding(scr)
        data["screening_results"] = scr
        _atomic_write(tpath, json.dumps(data, indent=2) + "\n")

    _patch_screen(
        "analytical_fia_cooling_network_screen.json",
        "maximum_magnet_temperature_c",
        "maximum_winding_temperature_c",
    )
    npath = stack / "analytical_fia_cooling_network_screen.json"
    if npath.is_file():
        data = json.loads(npath.read_text(encoding="utf-8"))
        scr = data.get("screening_results") or {}
        scr["maximum_magnet_temperature_c"] = magnet_c
        scr["temperature_screen_ok"] = magnet_c <= limit
        _blank_winding(scr)
        data["screening_results"] = scr
        data["dec_008_restamp"] = {
            "applied_at": _iso(),
            "adopted_magnet_c": magnet_c,
            "decision": "DEC-008",
        }
        _atomic_write(npath, json.dumps(data, indent=2) + "\n")

    # Persist magnet margin grid (authoritative arithmetic for this restamp)
    _atomic_write(
        stack / "magnet_margin_sensitivity.json",
        json.dumps(grid, indent=2) + "\n",
    )

    # ── 4. Write state.json ─────────────────────────────────────────────────
    if not isinstance(state.get("orchestratorContract"), dict):
        state["orchestratorContract"] = {}
    state["orchestratorContract"]["quantities"] = q
    state["dec_008_duty_restamp"] = {
        "applied_at": _iso(),
        "schema": SCHEMA,
        "adopted_magnet_c": magnet_c,
        "adopted_machine_loss_w": machine_w,
        "margin_k": margin_k,
        "continuous_reference_magnet_c": prev_mag.get("value"),
        "ship_ok_untouched": True,
    }
    # Never mint ship_ok
    if state.get("ship_ok") is True:
        raise RuntimeError("refusing to restamp: ship_ok is true")
    _atomic_write(state_path, json.dumps(state, indent=2) + "\n")

    report = {
        "schema": SCHEMA,
        "applied_at": _iso(),
        "twin": str(twin_dir),
        "decision": "DEC-008",
        "adopted": adopted,
        "magnet_c": magnet_c,
        "machine_loss_w": machine_w,
        "margin_k": margin_k,
        "limit_c": limit,
        "before": before,
        "after": {
            "continuous_power_kw_basis": q["continuous_power_kw"].get("basis"),
            "mgu_magnet_temp_c": q["mgu_magnet_temp_c"].get("value"),
            "mgu_winding_temp_c": q["mgu_winding_temp_c"].get("value"),
        },
        "cooling_updates": cooling_updates,
        "ship_ok": state.get("ship_ok"),
        "note": (
            "DEC-009 geometry (24k rpm / 130 mm) is NOT applied here — separate restamp. "
            "ship_ok remains false. Bar B holds untouched."
        ),
    }
    _atomic_write(twin_dir / OUTPUT, json.dumps(report, indent=2) + "\n")
    return report


def _atomic_write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    tmp.write_text(text, encoding="utf-8")
    os.replace(tmp, path)


def _selftest() -> int:
    # Selftests write scratch twins with no discipline stage.
    import os as _os
    _os.environ.setdefault("TWIN_WRITE_GUARD", "off")
    _os.environ.setdefault("TWIN_WRITE_GUARD_REASON", "selftest")
    fails: list[str] = []

    def ck(name: str, ok: bool, detail: str = "") -> None:
        if not ok:
            fails.append(f"{name}: {detail}")

    with tempfile.TemporaryDirectory(prefix="dec008-") as raw:
        twin = Path(raw)
        (twin / "_motor_stack").mkdir()
        state = {
            "ship_ok": False,
            "orchestratorContract": {
                "quantities": {
                    "continuous_power_kw": {
                        "value": 250, "basis": "continuous", "source": "brief",
                    },
                    "duty_regen_time_s": {"value": 24},
                    "duty_motoring_time_s": {"value": 76},
                    "mgu_iron_loss_w": {"value": 6035.1},
                    "mgu_copper_loss_w": {"value": 2180.49},
                    "magnet_temp_limit_c": {"value": 150},
                    "coolant_inlet_c": {"value": 60},
                    "coolant_flow_l_min": {"value": 12},
                    "coolant_cp_j_kgk": {"value": 3503},
                    "coolant_density_kg_m3": {"value": 1040.49},
                    "inverter_dissipated_kw": {"value": 4.318},
                    "mgu_magnet_temp_c": {
                        "value": 159.35, "basis": "screen",
                        "condition": "continuous design duty",
                        "caveat": "BREACHES the 150 C limit",
                    },
                    "mgu_winding_temp_c": {"value": 159.35, "basis": "screen"},
                }
            },
        }
        (twin / "state.json").write_text(json.dumps(state, indent=2) + "\n")
        (twin / "_motor_stack" / "analytical_fia_cooling_thermal_screen.json").write_text(
            json.dumps({
                "screening_results": {
                    "maximum_magnet_temperature_c": 159.35,
                    "maximum_winding_temperature_c": 159.35,
                    "calculated_magnet_temperature_c": 159.35,
                    "magnet_below_screen_limit": False,
                }
            }) + "\n"
        )
        (twin / "_motor_stack" / "analytical_fia_cooling_network_screen.json").write_text(
            json.dumps({
                "screening_results": {
                    "maximum_magnet_temperature_c": 159.235,
                    "maximum_winding_temperature_c": 159.235,
                    "temperature_screen_ok": False,
                }
            }) + "\n"
        )

        rep = apply_dec_008(twin)
        st2 = json.loads((twin / "state.json").read_text())
        q2 = st2["orchestratorContract"]["quantities"]

        ck("magnet_near_83_8", abs(float(q2["mgu_magnet_temp_c"]["value"]) - 83.8) < 0.5,
           str(q2["mgu_magnet_temp_c"]["value"]))
        ck("basis_intermittent", q2["continuous_power_kw"]["basis"] == "intermittent_peak",
           str(q2["continuous_power_kw"].get("basis")))
        ck("ship_ok_false", st2.get("ship_ok") is False, str(st2.get("ship_ok")))
        ck("continuous_ref_kept",
           "continuous_power_kw_superseded_continuous_screen" in q2, "missing lineage")
        th = json.loads((twin / "_motor_stack" / "analytical_fia_cooling_thermal_screen.json").read_text())
        ck("thermal_screen_adopted",
           abs(float(th["screening_results"]["maximum_magnet_temperature_c"]) - 83.8) < 0.5,
           str(th["screening_results"]["maximum_magnet_temperature_c"]))
        ck("thermal_continuous_ref",
           th["screening_results"].get("continuous_reference_maximum_magnet_temperature_c") == 159.35,
           str(th["screening_results"].get("continuous_reference_maximum_magnet_temperature_c")))
        ck("report_written", (twin / OUTPUT).is_file(), "no audit json")
        ck("report_magnet", abs(float(rep["magnet_c"]) - 83.8) < 0.5, str(rep.get("magnet_c")))

        # ⭐⭐ THE DEC-008-ONLY CASE (MiniMax, finish council 2026-08-03: the
        # verification existed only in a terminal, not as an artefact). This is
        # the state DEC-009 was MASKING — apply DEC-008 and nothing else, then
        # assert that NO winding temperature and NO flag derived from one
        # survives anywhere. Three consecutive "fixed at source" claims were
        # wrong because the live twin had both restamps applied and the second
        # one hid the first one's re-write. This fixture cannot be fooled that
        # way: it never runs DEC-009.
        _bad_vals, _bad_flags = [], []
        for _p in (twin / "_motor_stack").glob("*cooling*.json"):
            _scr = json.loads(_p.read_text()).get("screening_results") or {}
            for _k, _v in _scr.items():
                if _k.endswith(("_why_absent", "_why_unknown")) or "continuous_reference" in _k:
                    continue
                if "winding" in _k and _v is not None:
                    _bad_vals.append(f"{_p.name}::{_k}={_v}")
                if _k in _WINDING_DERIVED_FLAGS and _v is not None:
                    _bad_flags.append(f"{_p.name}::{_k}={_v}")
        ck("dec008_only.no_fabricated_winding_value", not _bad_vals,
           f"a winding temperature survived DEC-008 alone: {_bad_vals}")
        ck("dec008_only.no_orphaned_pass_flag", not _bad_flags,
           f"a pass flag outlived the number behind it: {_bad_flags}")
        ck("dec008_only.quantity_absent", q2["mgu_winding_temp_c"]["value"] is None,
           f"mgu_winding_temp_c={q2['mgu_winding_temp_c'].get('value')} — the magnet "
           f"temperature must not be published as the winding temperature")
        # …and the magnet figure must still be REACHABLE, not destroyed.
        ck("dec008_only.magnet_proxy_retained",
           q2["mgu_winding_temp_c"].get("magnet_path_proxy_c") is not None,
           "blanking the winding also lost the magnet-path figure")

        # ⭐ IDEMPOTENT LINEAGE (Sol, guards council 2026-08-03). Re-running a
        # restamp is normal — after a partial application, or a retry. The first
        # version recorded the ALREADY-RESTAMPED value as the continuous
        # reference on the second run, destroying the pre-restamp evidence the
        # restamp exists to preserve. Verified here rather than claimed.
        _first_ref = (q2["mgu_magnet_temp_c"].get("provenance") or {}).get(
            "continuous_reference_c")
        apply_dec_008(twin)
        _st3 = json.loads((twin / "state.json").read_text())
        _second_ref = ((_st3["orchestratorContract"]["quantities"]
                        ["mgu_magnet_temp_c"].get("provenance") or {})
                       .get("continuous_reference_c"))
        ck("idempotent.continuous_reference_survives_rerun",
           _first_ref is not None and _first_ref == _second_ref,
           f"re-running the restamp changed the retained continuous reference "
           f"from {_first_ref} to {_second_ref} — the pre-restamp evidence is lost")
        ck("idempotent.winding_lineage_survives_rerun",
           (_st3["orchestratorContract"]["quantities"]["mgu_winding_temp_c"]
            .get("continuous_reference_c")) is not None,
           "a second restamp overwrote the retained pre-restamp winding value "
           "with the already-blanked None")
        ck("blanking.matcher_needs_a_temperature_word",
           _is_winding_temperature_key("maximum_winding_temperature_c")
           and _is_winding_temperature_key("peak_winding_temp_c")
           and not _is_winding_temperature_key("winding_current_c")
           and not _is_winding_temperature_key("winding_copper_loss_w")
           and not _is_winding_temperature_key(
               "continuous_reference_maximum_winding_temperature_c"),
           "the winding-temperature matcher is overbroad or incomplete")
        ck("idempotent.winding_stays_absent_on_rerun",
           (_st3["orchestratorContract"]["quantities"]
            ["mgu_winding_temp_c"].get("value")) is None,
           "a second restamp reintroduced a winding temperature")

        # ⭐ proveCatch: refuse ship_ok true
        st2["ship_ok"] = True
        (twin / "state.json").write_text(json.dumps(st2, indent=2) + "\n")
        try:
            apply_dec_008(twin)
            ck("refuse_ship_ok_true", False, "restamp allowed ship_ok true")
        except RuntimeError as e:
            ck("refuse_ship_ok_true", "ship_ok" in str(e).lower(), str(e))

    if fails:
        print("apply_dec_008_duty_restamp selftest FAIL:")
        for f in fails:
            print(" ", f)
        return 1
    print("apply_dec_008_duty_restamp selftest: OK")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--twin", type=Path)
    ap.add_argument("--selftest", action="store_true")
    args = ap.parse_args()
    if args.selftest:
        return _selftest()
    if not args.twin:
        ap.error("--twin required")
    rep = apply_dec_008(args.twin)
    print(json.dumps({
        "ok": True,
        "magnet_c": rep["magnet_c"],
        "margin_k": rep["margin_k"],
        "basis": rep["after"]["continuous_power_kw_basis"],
        "ship_ok": rep["ship_ok"],
        "report": str(Path(args.twin) / OUTPUT),
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
