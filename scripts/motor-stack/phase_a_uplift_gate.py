#!/usr/bin/env python3
"""Phase A uplift gate — machine-check progress against council-amended plan.

Exit 0 only if W0 truth + Jack spine artefacts are present and coherent.
Does not mint ship_ok. Safe to run in CI / workflow after each wave.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
DEFAULT_TWIN = REPO / "out" / "formula-e-front-mgu-20260729-1432"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--twin", type=Path, default=DEFAULT_TWIN)
    args = ap.parse_args()
    twin = args.twin.resolve()
    fails: list[str] = []

    def ck(name: str, ok: bool, detail: str = "") -> None:
        if not ok:
            fails.append(f"{name}: {detail}")

    # W0 twin stamps
    q = json.loads((twin / "state.json").read_text())["orchestratorContract"]["quantities"]
    mean = float(q["last_sign_consistent_kit_case_fe_mean_nm"]["value"])
    arch = float(q["architecture_duty_shaft_torque_nm"]["value"])
    bind = float(q["binding_duty_shaft_torque_nm"]["value"])
    ck("fe_mean_path_b", abs(mean - 122.099939) < 0.01, str(mean))
    ck("arch_duty", abs(arch - 104.098914) < 0.01, str(arch))
    ck("bind_duty", abs(bind - 125.214912) < 0.01, str(bind))
    ck("ship_ok_false", json.loads((twin / "state.json").read_text()).get("ship_ok") is False)
    ck(
        "product_basis",
        q["mgu_fe_shaft_torque_nm"]["basis"] == "option_screen_product_not_kit_case_fe",
    )

    # bar-b freshness
    barb = twin / "bar-b-register-freshness.json"
    ck("barb_report", barb.is_file())
    if barb.is_file():
        br = json.loads(barb.read_text())
        ck("barb_ok", br.get("ok") is True, str(br.get("stale_count")))
        la = br.get("live_artefacts") or {}
        ck("barb_em_source", la.get("em_source") == "PATH_B_DEC009", str(la.get("em_source")))
        ck("barb_mean", abs(float(la.get("mean_tq") or 0) - 122.099939) < 0.01)

    # jack pack spine
    jack = twin / "_motor_stack" / "jack_em_pack"
    for name in (
        "00-verdict-one-pager.png",
        "00b-open-by-design.png",
        "00c-how-to-read-pack.png",
        "01-dual-torque-bars.png",
        "06-thermal-duty-storyboard.png",
        "07-pcb-honesty-sheet.png",
        "08-system-block-diagram.png",
        "09-inverter-mass-budget.png",
        "11-coolant-loop-one-pager.png",
        "12-torque-ripple-load-sheet.png",
        "13-kit-assembly-envelopes-lite.png",
        "14-busbar-esl-budget.png",
        "15-iron-loss-corner-table.png",
        "16-bearing-reaction-oom.png",
        "17-rotor-fos-screening-card.png",
        "18-nvh-modal-open-register.png",
        "19-gear-oil-status.png",
        "20-gear-ratio-writeback-blocked.png",
        "FE-FRONT-PATH-B-EM-HONESTY-PACK.pdf",
    ):
        ck(f"jack_{name}", (jack / name).is_file(), str(jack / name))

    # Phase C analytical screens + partner asks
    ms = twin / "_motor_stack"
    required_phase_c_sources = [
        ms / "em_fia_front_kit_case_PATH_B_DEC009.json",
        ms / "analytical_fia_cooling_network_screen.json",
        ms / "dc_link_capacitor_concept_screen.json",
        ms / "inverter_packaging_fia_front_kit_case.json",
    ]
    for src in required_phase_c_sources:
        ck(f"phase_c_src_{src.name}", src.is_file(), str(src))
    for name in (
        "coolant_loop_one_pager.json",
        "torque_ripple_load_sheet.json",
        "kit_assembly_envelopes_lite.json",
        "dc_link_capacitor_concept_screen.json",
    ):
        p = ms / name
        ck(f"screen_{name}", p.is_file(), str(p))
        if p.is_file():
            d = json.loads(p.read_text())
            ck(f"screen_{name}_ship_ok_false", d.get("ship_ok") is False)
    # Staleness: Phase C outputs must not be older than their sources
    try:
        newest_src = max(s.stat().st_mtime for s in required_phase_c_sources if s.is_file())
        for out_name in (
            "coolant_loop_one_pager.json",
            "torque_ripple_load_sheet.json",
            "kit_assembly_envelopes_lite.json",
            "jack_em_pack/13-kit-assembly-envelopes-lite.png",
        ):
            op = ms / out_name
            if op.is_file():
                ck(
                    f"fresh_{out_name}",
                    op.stat().st_mtime + 2.0 >= newest_src,
                    f"mtime {op.stat().st_mtime} < src {newest_src}",
                )
    except OSError as exc:
        ck("phase_c_mtime", False, str(exc))
    asks = twin / "JLR-FE-FRONT-FPK-PARTNER-ASKS-DRAFT-2026-08-04.md"
    ck("partner_asks_draft", asks.is_file())
    env = ms / "kit_assembly_envelopes_lite.json"
    if env.is_file():
        ed = json.loads(env.read_text())
        ck("envelopes_visual_only", ed.get("visualOnly") is True)
        parts = ed.get("parts") or []
        ck("envelopes_have_cap_high", any(p.get("id") == "dc_link_cap_region_high" for p in parts))
        ck(
            "envelopes_all_visual_only",
            all(p.get("visualOnly") is True for p in parts if isinstance(p, dict)),
        )
        hi = next((p for p in parts if p.get("id") == "dc_link_cap_region_high"), {})
        ck(
            "cap_high_fit_indeterminate_flag",
            hi.get("fit_indeterminate_without_supplier_dims") is True,
        )
    rip = ms / "torque_ripple_load_sheet.json"
    if rip.is_file():
        rd = json.loads(rip.read_text())
        sf = rd.get("source_flags") or {}
        tr = sf.get("torque_reliable")
        ck("ripple_echoes_torque_reliable_false", tr is False or tr == 0 or tr == "false")
        ck(
            "ripple_status_not_validated",
            rd.get("status") in ("INPUT_NOT_VALIDATED", "ORDER_OF_MAGNITUDE_EXCITATION"),
        )
        ck("ripple_has_consumer_guard", isinstance(rd.get("consumer_guard"), dict))
    coolj = ms / "coolant_loop_one_pager.json"
    if coolj.is_file():
        cd = json.loads(coolj.read_text())
        ck("coolant_status_partial", "PARTIAL" in str(cd.get("status") or "").upper() or cd.get("status") == "PARTIAL_ANALYTICAL_SCREEN")
        ck("coolant_topology_named", bool((cd.get("branches") or {}).get("topology_assumption")))
        ck(
            "coolant_topology_assumed",
            "ASSUMED" in str((cd.get("branches") or {}).get("topology_assumption") or "").upper()
            or (cd.get("branches") or {}).get("topology_status") == "ASSUMED_NOT_PROVEN",
        )

    # Phase D analytical honesty screens
    for name, expect_status in (
        ("busbar_esl_budget_screen.json", "PARTIAL_ANALYTICAL_SCREEN"),
        ("iron_loss_corner_table.json", "SCREENING_ESTIMATE_CORNERS"),
        ("bearing_reaction_oom_screen.json", "ORDER_OF_MAGNITUDE_ONLY"),
        ("rotor_fos_screening_card.json", "SCREENING_ONLY"),
        ("nvh_modal_open_register.json", "EXPLICITLY_OPEN"),
        ("gear_oil_status_one_pager.json", None),
        ("gear_ratio_writeback_status.json", "BLOCKED_ARCHITECTURE_HOLD"),
    ):
        p = ms / name
        ck(f"phase_d_{name}", p.is_file(), str(p))
        if p.is_file():
            d = json.loads(p.read_text())
            ck(f"phase_d_{name}_ship_ok_false", d.get("ship_ok") is False)
            if expect_status is not None:
                ck(f"phase_d_{name}_status", d.get("status") == expect_status, str(d.get("status")))
    nvh = ms / "nvh_modal_open_register.json"
    if nvh.is_file():
        nd = json.loads(nvh.read_text())
        reg = nd.get("register") or []
        ck("nvh_all_open", all(r.get("status") == "OPEN" for r in reg if isinstance(r, dict)))
        ck("nvh_no_fake_hz", "modal_frequencies_hz" in (nd.get("explicitly_not_claimed") or []))
    gr = ms / "gear_ratio_writeback_status.json"
    if gr.is_file():
        gd = json.loads(gr.read_text())
        ck("gear_writeback_invalidated", (gd.get("writeback") or {}).get("invalidated") is True)
    fos = ms / "rotor_fos_screening_card.json"
    if fos.is_file():
        fd = json.loads(fos.read_text())
        ck("fos_release_not_closed", (fd.get("honesty") or {}).get("release_fos_closed") is False)

    # tracker addendum
    tr = (REPO / "docs/plans/JLR-FE-FRONT-FPK-BAR-A-BAR-B-CLOSEOUT-TRACKER-2026-07-31.md").read_text()
    ck("tracker_addendum", "ADDENDUM 2026-08-04" in tr and "122.100" in tr)

    # coherence
    r = subprocess.run(
        [
            sys.executable,
            str(REPO / "scripts/lib/check_deliverable_coherence.py"),
            "--twin",
            str(twin),
            "--enforce",
        ],
        capture_output=True,
        text=True,
        cwd=str(REPO),
    )
    ck("coherence", r.returncode == 0, (r.stdout or r.stderr)[-200:])

    if fails:
        print("phase_a_uplift_gate FAIL:")
        for f in fails:
            print(" ", f)
        return 1
    print("phase_a_uplift_gate: OK")
    print(
        json.dumps(
            {
                "mean": mean,
                "arch": arch,
                "bind": bind,
                "mean_over_arch": mean / arch,
                "mean_over_bind": mean / bind,
                "ship_ok": False,
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
