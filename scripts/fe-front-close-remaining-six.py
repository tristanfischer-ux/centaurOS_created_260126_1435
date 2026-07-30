#!/usr/bin/env python3
"""INTENT: Close the six residual JLR FE front FPK demo gaps on the live twin.

1) Morphology receipt (form-meshes) after Blender rebuild (external)
2) PCB stage record + firmware bring-up contract (honest COTS path)
3) Decision register freezes for holds that public evidence can lock
4) Rear process twin: copies root PNGs → renders/ + pack note
5) Homologation readiness matrix (explicitly NOT homologated)
6) SOURCE commit is git (external) — this script stamps artefacts only.
"""
from __future__ import annotations

import json
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FRONT = ROOT / "out/formula-e-front-mgu-20260729-1432"
REAR = ROOT / "out/formula-e-rear-mgu-20260729-0846"
NOW = datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def _load(p: Path) -> dict:
    return json.loads(p.read_text())


def _save(p: Path, data: object) -> None:
    p.write_text(json.dumps(data, indent=2) + "\n")


# INTENT (2026-07-29 JLR HoT): race-critical gaps stay OPEN by design until
# real dyno / HIL / supplier packs land. Never freeze these into a SHIPS greenwash.
RACE_CRITICAL_OPEN_IDS = (
    "DEC-001",  # SiC die + phase-current dyno
    "DEC-006",  # rotor retention dyno / FE
    "DEC-007",  # lap CSV authority
    "DEC-008",  # HIL on populated board
    "DEC-009",  # supplier Gerbers / ICD (Forge Gerbers ≠ supplier)
    "DEC-010",  # motor + inverter dyno correlation
)


def stamp_pcb_homologation_honesty(pcb: dict) -> dict:
    """INTENT: Forge draft Gerbers ≠ supplier release; HIL absent until proven.

    GOTCHA: pcb-stage / pipeline rewrite `state.pcb` and must call this AFTER
    every write, or Excel can greenwash fab-ready from pipeline.ok alone.
    """
    if not isinstance(pcb, dict):
        pcb = {}
    pcb["supplierGerbers"] = False
    pcb["hilPresent"] = False
    pcb["forgeDraftOnly"] = True
    pcb["homologationStatus"] = "NOT_HOMOLOGATED"
    pcb["honestyNote"] = (
        "pipeline.ok means Forge-authored draft Gerbers exist for review — "
        "NOT supplier-controlled Gerbers, NOT HIL-proven, NOT FIA electronics "
        "homologation. DEC-008/009 remain OPEN by design."
    )
    return pcb


def close_holds(out: Path) -> None:
    """Freeze design-policy holds; keep homologation/dyno/HIL/supplier gaps OPEN."""
    reg_path = out / "10-decision-register.json"
    reg = _load(reg_path) if reg_path.exists() else []
    by_id = {row.get("id"): row for row in reg if isinstance(row, dict)}

    freeze = {
        "DEC-002": {
            "status": "FROZEN",
            "decision": (
                "Continuous design duty = 250 kW front regen electrical cap; "
                "350 kW is press/hardware class (capability), not race software cap — both labelled"
            ),
            "evidence": "public Gen3 regen cap + Lucid/press HW class; contract continuous_power_kw vs front_hardware_power_class_kw",
            "residual_risk": "Race software windows (Gen3 Evo AWD) may further limit motoring — confirm with JLR FE controls",
            "owner": "Systems lead",
        },
        "DEC-003": {
            "status": "FROZEN",
            "decision": "Single-speed gear ratio seed = 8.0 (trial packaging / torque map)",
            "evidence": "class plan gear:traction-ratio first-pass; homologation / team ratio replaces",
            "residual_risk": "Final ratio is team IP — replace before dyno sign-off",
            "owner": "Systems lead",
        },
        "DEC-004": {
            "status": "FROZEN",
            "decision": "Coolant inlet 60 °C, trial flow 12 L/min (manufacturer-perimeter band)",
            "evidence": "front archetype coolant_inlet_c + coolant_flow_l_min; cold-plate loop interface",
            "residual_risk": "Chemistry (glycol %) and car-loop coupling TBD with chassis thermal",
            "owner": "Systems lead",
        },
        "DEC-005": {
            "status": "FROZEN",
            "decision": (
                "32 kg dry complete-unit aspiration; concept unit_mass = Σ mass seeds "
                "(motor+inverter+gear/diff+housing) pending CAD/weighed BoM; fluids/harness OUT of dry mass"
            ),
            "evidence": "press dry-unit mass; fpk_mass_cap_kg + mass_*_kg seeds → unit_mass_kg",
            "residual_risk": "Weighed tear-down may shift motor/MCU/gear shares — allocation OPEN inside freeze",
            "owner": "Systems lead",
        },
    }

    # OPEN-by-design race holds — always force OPEN (never allow accidental FROZEN).
    open_by_design = {
        "DEC-001": {
            "status": "OPEN",
            "decision": (
                "SiC die class + thermal limit PENDING module datasheet + dyno — "
                "I_ph_ideal=477 A / I_ph_design=535 A (+12% margin) are analytical ceilings only"
            ),
            "evidence": "phase_current_max_a / phase_current_design_a; DEC-001 OPEN by design until dyno",
            "residual_risk": "No die Rds_on / switching-loss / junction-temp proof — NOT race-releasable",
            "owner": "Power electronics lead",
            "open_by_design": True,
            "blocks_homologation": True,
        },
        "DEC-006": {
            "status": "OPEN",
            "decision": (
                "Rotor retention margin ≥ 1.5 at max used speed — analytical seed only; "
                "FE + overspeed dyno REQUIRED before race use"
            ),
            "evidence": "motor:rotor-centrifugal-stress tool seed; no burst/dyno report in pack",
            "residual_risk": "Overspeed / burst containment unproven — OPEN by design",
            "owner": "Motor design lead",
            "open_by_design": True,
            "blocks_homologation": True,
        },
        "DEC-007": {
            "status": "OPEN",
            "decision": (
                "Duty-cycle / E_net authority — public FIA energy tools used as placeholders; "
                "team lap CSV replaces before any homologation energy claim"
            ),
            "evidence": "FIA tools executed; outputs not season-stamped",
            "residual_risk": "No team-authoritative lap — OPEN by design",
            "owner": "Race engineering",
            "open_by_design": True,
            "blocks_homologation": True,
        },
        "DEC-008": {
            "status": "OPEN",
            "decision": (
                "HIL on populated inverter revision — MISSING. Firmware bring-up contract is "
                "FAB-READY — UNPROVEN IN HARDWARE; Excel must not say FUNCTIONALLY VERIFIED"
            ),
            "evidence": "firmware/bring-up-contract.json hil_present=false",
            "residual_risk": "No HIL = no functional verification — OPEN by design until bench pass",
            "owner": "Controls / HIL lead",
            "open_by_design": True,
            "blocks_homologation": True,
        },
        "DEC-009": {
            "status": "OPEN",
            "decision": (
                "Supplier Gerbers / pinout ICD — MISSING. Forge-authored KiCad/Gerber drafts "
                "(gate-drive + control) are reviewable engineering drafts ONLY — not a supplier "
                "release pack and not FIA electronics homologation evidence"
            ),
            "evidence": "state.pcb.pipeline may be ok for Forge draft; supplierGerbers=false",
            "residual_risk": "Cannot fabricate race boards from supplier-controlled data — OPEN by design",
            "owner": "Electronics / supplier quality",
            "open_by_design": True,
            "blocks_homologation": True,
        },
        "DEC-010": {
            "status": "OPEN",
            "decision": (
                "Motor + inverter dyno correlation (efficiency / thermal / torque maps) — MISSING. "
                "Analytical IPMSM + SiC-loss points are seeds, not dyno-correlated maps"
            ),
            "evidence": "no dyno CSV / efficiency map artefact in pack",
            "residual_risk": "Performance claims uncorrelated to hardware — OPEN by design",
            "owner": "Dyno / validation lead",
            "open_by_design": True,
            "blocks_homologation": True,
        },
    }

    for rid, payload in freeze.items():
        row = by_id.get(rid)
        if row is None:
            row = {"id": rid}
            reg.append(row)
            by_id[rid] = row
        row.update(payload)
        row["frozen_at"] = NOW
        row["owner"] = row.get("owner") or "Systems lead"

    for rid, payload in open_by_design.items():
        row = by_id.get(rid)
        if row is None:
            row = {"id": rid}
            reg.append(row)
            by_id[rid] = row
        row.update(payload)
        row["status"] = "OPEN"  # hard force — never FROZEN
        row["opened_at"] = row.get("opened_at") or NOW
        row["owner"] = payload.get("owner") or row.get("owner") or "Systems lead"

    # Stable id order
    order = [f"DEC-{i:03d}" for i in range(1, 11)]
    reg.sort(key=lambda r: (order.index(r["id"]) if r.get("id") in order else 99, str(r.get("id"))))

    _save(reg_path, reg)

    st_path = out / "state.json"
    st = _load(st_path)
    st["decisionRegister"] = reg
    holds = []
    for row in reg:
        holds.append({
            "id": row.get("id"),
            "status": row.get("status"),
            "title": row.get("decision"),
            "evidence": row.get("evidence"),
            "residual_risk": row.get("residual_risk"),
            "owner": row.get("owner"),
            "open_by_design": bool(row.get("open_by_design")),
            "blocks_homologation": bool(row.get("blocks_homologation")),
        })
    st["decisionHolds"] = holds
    open_race = [h for h in holds if h.get("status") == "OPEN" and h.get("blocks_homologation")]
    st["homologationHonesty"] = {
        "verdict": "NOT_HOMOLOGATED",
        "fia_race_ready": False,
        "open_by_design_count": len(open_race),
        "open_by_design_ids": [h["id"] for h in open_race],
        "hil_present": False,
        "supplier_gerbers_present": False,
        "dyno_correlation_present": False,
        "lucid_cad_paste": False,
        "lucid_role": "FFF_TRAINING_CHECK_ONLY",
        "note": (
            "Morphology is bay-forced race cassette language; Lucid/Atieva public photos "
            "are a TRAINING CHECK only — never OEM STEP/mesh paste. HIL, supplier Gerbers, "
            "and dyno holes remain OPEN by design."
        ),
        "stamped_at": NOW,
    }
    # PCB honesty — Forge pipeline ≠ supplier release (re-stamped again after pipeline)
    st["pcb"] = stamp_pcb_homologation_honesty(
        st.get("pcb") if isinstance(st.get("pcb"), dict) else {}
    )
    st["holdsClosedAt"] = NOW  # design-policy freezes only; race OPENs remain
    _save(st_path, st)
    print(
        f"[holds] froze design-policy; race-critical OPEN-by-design="
        f"{[h['id'] for h in open_race]} on {out.name}"
    )


def write_homologation_readiness(out: Path) -> None:
    """Honest readiness matrix — NEVER claims FIA homologation."""
    md = out / "JLR-FE-FRONT-FPK-HOMOLOGATION-READINESS.md"
    md.write_text(
        f"""# Homologation readiness — Front FPK (HONEST)

**Generated:** {NOW}  
**Product:** Gen3 / Gen3 Evo **spec** front powertrain kit (`formula_e_front_mgu`)  
**Verdict:** **NOT HOMOLOGATED.** This is an engineering attack pack, not an FIA / ASN filing.

## What this document is

A checklist of what a FE tech lead would still need before any homologation path.
It exists so the dossier cannot be misread as race-ready.

## Readiness matrix

| Area | Status | Evidence in pack | Gap to close with JLR / FIA |
|---|---|---|---|
| Perimeter / identity | READY TO ATTACK | Brief + Holds — front FPK only | Confirm Gen3 vs Evo traction windows for *this* season |
| Bay packaging envelope | DESIGN-FROZEN | 343×259×267 mm from press bay class | Confirm car-side hard points / wishbone clearances |
| Dry mass aspiration | DESIGN-FROZEN | ≤32 kg dry complete-unit (press) | Weighed BoM; fluids/harness boundary sign-off |
| Regen electrical cap | DESIGN-FROZEN | ≤250 kW front regen (public Gen3) | Software/map confirmation |
| Hardware power class | LABELLED | ~350 kW press capability ≠ race cap | Clarify electrical vs mechanical in supplier docs |
| Gear ratio | SEED FROZEN | ratio 8.0 trial | Replace with team homologated ratio |
| Coolant interface | SEED FROZEN | 60 °C / 12 L/min trial | Car-loop chemistry + coupling |
| Phase current / SiC die | OPEN | I_ph formula + envelope tools | Module datasheet + thermal dyno |
| Rotor retention | OPEN | Analytical stress tool seed | Dyno / FE retention proof |
| Duty cycle / E_net | OPEN authority | FIA energy tools in Calculations | Team lap CSV authority |
| PCB / Forge draft Gerbers | DRAFT ONLY | `pcb-boards/*` Forge KiCad path | **Supplier Gerbers / ICD (DEC-009) — OPEN by design** |
| Firmware / HIL | BRING-UP CONTRACT | `firmware/` — hil_present=false | **HIL on populated board (DEC-008) — OPEN by design** |
| Motor / inverter dyno | ANALYTICAL SEED | IPMSM + SiC-loss tools | **Dyno correlation (DEC-010) + SiC die (DEC-001) + rotor (DEC-006) — OPEN** |
| Homologation filing | **NOT STARTED** | `homologationHonesty.verdict=NOT_HOMOLOGATED` | ASN / FIA process — out of ForgeOS scope |

## OPEN by design (must stay open until real evidence)

| ID | Gap | Why it stays OPEN |
|---|---|---|
| DEC-001 | SiC die + thermal dyno | No module datasheet / junction proof |
| DEC-006 | Rotor retention FE/dyno | Analytical seed ≠ burst proof |
| DEC-007 | Lap CSV / E_net authority | Public FIA tools are placeholders |
| DEC-008 | HIL | No populated-board HIL → not FUNCTIONALLY VERIFIED |
| DEC-009 | Supplier Gerbers | Forge draft Gerbers ≠ supplier release pack |
| DEC-010 | Dyno maps | No efficiency/thermal/torque correlation |

## Forbidden claims (do not say in the room)

- “Homologation-ready” / “FIA race ready” / “race-winning”
- Exact Lucid/Atieva internal geometry or proprietary STEP / mesh paste
- That Forge Gerbers are supplier Gerbers
- That HIL or dyno is done
- That 32 kg includes undefined fluids/harness
- That morphology was copied from Lucid CAD (Lucid photos = **FFF training check only**)

## Morphology honesty

> Form is forced by the front-axle bay + traction use-physics (transverse MGU, unitised inverter, gear/diff, cold plates, HV/coolant faces). Public Lucid/Atieva sealed-FPK imagery is a **training check** for race-hardened cassette language — never a silhouette or CAD paste.

## One-line narrative

> ForgeOS closed a Gen3 front FPK under public FIA + press constraints, with form forced by the front-axle bay — a dossier a FE tech lead can attack. It is **NOT homologated**: HIL, supplier Gerbers, and dyno holes remain OPEN by design.
"""
    )
    print(f"[homologation] wrote {md}")


def run_pcb_stage(out: Path) -> dict:
    """Record PCB disposition — JLR HoT requires bespoke control/gate-drive path.

    INTENT (2026-07-29 red-team): COTS hand-wave + Gerbers-OOS is REJECT for a
    Tier-1 review. Force bespoke authorship for TBD control/gate-drive boards and
    attempt the in-chain pipeline (atopile → KiCad → route → Gerbers). SiC power
    module may remain a purchased die/module *inside* that pack — the control
    electronics are not exempt from reviewable artefacts.
    """
    st_path = out / "state.json"
    cmd = [
        "npx", "tsx",
        str(ROOT / "src/lib/pdf-engine-v2/lib/pcb/pcb-stage.ts"),
        str(st_path),
    ]
    env = {**dict(**{k: v for k, v in __import__("os").environ.items()}),
           "PATH": f"/opt/homebrew/opt/node@22/bin:/opt/homebrew/bin:{__import__('os').environ.get('PATH','')}"}
    proc = subprocess.run(cmd, cwd=str(ROOT), capture_output=True, text=True, env=env)
    if proc.returncode != 0:
        print("[pcb] stderr:", proc.stderr[-2000:])
        raise SystemExit(f"pcb-stage failed: {proc.returncode}")
    text = proc.stdout.strip()
    start = text.find("{")
    if start < 0:
        raise SystemExit(f"pcb-stage no JSON: {text[:500]}")
    result = json.loads(text[start:])
    st = _load(st_path)

    result["isPcbBearing"] = True
    result["electronicPartCount"] = max(int(result.get("electronicPartCount") or 0), 4)
    result["distinctElectronicCategories"] = result.get("distinctElectronicCategories") or [
        "power_electronics", "processor", "sensor_ic", "gate_driver",
    ]
    # Force bespoke so Excel PCB tab + pipeline are in scope (not N/A walk-through).
    result["disposition"] = "bespoke"
    result["dispositionDetail"] = {
        "disposition": "bespoke",
        "rationale": [
            "jlr_hot_requires_reviewable_boards",
            "gate_driver_and_control_tbd_mpn",
            "bespoke_kiCad_deliverable_required",
        ],
        "requiresKiCadDeliverable": True,
        "confidence": "high",
        "note": (
            "SiC power stage may be a purchased module; gate-drive + control PCBs "
            "require schematic/Gerber/pinout artefacts for HoT review. HIL still "
            "required before FUNCTIONALLY VERIFIED. Forge drafts ≠ supplier Gerbers."
        ),
    }
    result["canAuthor"] = True
    result["canRoute"] = True
    result["canVerifyAndExport"] = True
    result["reasons"] = list(result.get("reasons") or []) + ["front_fpk_bespoke_forced_for_hot"]
    # Stamp BEFORE save so even a mid-pipeline crash keeps honesty flags.
    result = stamp_pcb_homologation_honesty(result)
    st["pcb"] = result
    _save(st_path, st)
    _save(out / "pcb-stage.json", result)

    # Full multi-board pipeline (atopile → KiCad → route → Gerbers) — non-fatal.
    try:
        pipe_cmd = [
            "npx", "tsx",
            str(ROOT / "scripts/fe-front-run-pcb-pipeline.ts"),
            str(out),
        ]
        pipe_proc = subprocess.run(
            pipe_cmd, cwd=str(ROOT), capture_output=True, text=True, env={**env, "PCB_STAGE": "1"},
            timeout=900,
        )
        print("[pcb] pipeline stdout:", (pipe_proc.stdout or "")[-800:])
        if pipe_proc.returncode != 0:
            print("[pcb] pipeline stderr:", (pipe_proc.stderr or "")[-1200:])
        st = _load(st_path)
        result = stamp_pcb_homologation_honesty(st.get("pcb") or result)
        st["pcb"] = result
        _save(st_path, st)
    except Exception as exc:  # noqa: BLE001
        result["pipeline"] = {"ok": False, "error": str(exc)[:800]}
        result = stamp_pcb_homologation_honesty(result)
        st["pcb"] = result
        _save(st_path, st)
        print(f"[pcb] pipeline exception (recorded): {exc}")

    # Final honesty stamp — pipeline writers must never leave supplierGerbers=true.
    st = _load(st_path)
    result = stamp_pcb_homologation_honesty(st.get("pcb") or result)
    st["pcb"] = result
    _save(st_path, st)

    _write_pcb_hot_pack(out, result)
    print(f"[pcb] disposition={result.get('disposition')} bearing={result.get('isPcbBearing')} "
          f"pipeline_ok={(result.get('pipeline') or {}).get('ok')} "
          f"supplierGerbers={result.get('supplierGerbers')} hilPresent={result.get('hilPresent')}")
    return result


def _write_pcb_hot_pack(out: Path, pcb: dict) -> None:
    """ICD / power-tree / pinout stubs a HoT can attack — never empty Gerber-OOS."""
    pcb_dir = out / "pcb"
    pcb_dir.mkdir(exist_ok=True)
    (pcb_dir / "README.md").write_text(
        f"""# Front FPK — PCB pack (JLR HoT)

**Disposition:** `{pcb.get('disposition')}` (bespoke control/gate-drive required)  
**Pipeline ok:** `{(pcb.get('pipeline') or {}).get('ok')}`  
**Gerbers:** see `gerbers/` if pipeline exported; else ENGINEERING DRAFT

## Power tree (where power comes from / goes)

```
RESS HV DC (600–900 V)
  → HVIL / contactor / precharge (vehicle)
  → HV DC connector on FPK
  → DC link + SiC power stage (purchased module class — DEC-001 OPEN)
  → 3-phase AC (I_ph_design with margin)
  → MGU stator
  → shaft → gear → diff → halfshafts

LV 12 V / logic (vehicle) → control PCB → gate-drive PCB → SiC gates
Coolant EGW → cold plates (MCU + MGU) → return
```

## Boards in scope

| Board | Role | Status |
|---|---|---|
| Gate driver board | Isolated gate drive + desat | BESPOKE required (MPN TBD) |
| OEM inverter control board | MCU / sensing / CAN | BESPOKE required until supplier ICD |
| DC link capacitor bank | Energy buffer | COTS MPN where pinned |
| Phase current sensors | U/V/W | LEM-class COTS |

## Honesty (OPEN by design until evidence)

- `supplierGerbers=false` — Forge KiCad/Gerber drafts are **not** a supplier release pack (DEC-009 OPEN).
- `hilPresent=false` — no populated-board HIL (DEC-008 OPEN); never claim FUNCTIONALLY VERIFIED.
- `pipeline.ok` only means a reviewable Forge draft path ran — not FIA electronics homologation.
- Pipeline failure must not be silent-PASS: Excel PCB tab floors accordingly.
"""
    )
    (pcb_dir / "power-tree.json").write_text(
        json.dumps(
            {
                "product_class": "formula_e_front_mgu",
                "dc_in": {"from": "RESS", "v_min": 600, "v_max": 900, "node": "hv_dc_connector"},
                "power_stage": {"node": "sic_traction_inverter", "die_class": "DEC-001 OPEN"},
                "ac_out": {"to": "mgu_stator", "phases": 3, "i_ph_design_key": "phase_current_design_a"},
                "mechanical_out": ["reduction_gear_stage", "open_bevel_differential", "front_halfshafts"],
                "lv": {"from": "vehicle_12v", "to": ["oem_inverter_control_board", "gate_driver_board"]},
                "coolant": {"from": "coolant_loop", "to": "front_mgu_mcu_cold_plates"},
            },
            indent=2,
        )
    )


def write_firmware_contract(out: Path) -> None:
    """Bring-up software contract — compile/sim without HIL = FAB-READY UNPROVEN."""
    st = _load(out / "state.json") if (out / "state.json").exists() else {}
    q = ((st.get("orchestratorContract") or {}).get("quantities") or {})
    i_ph_max = q.get("phase_current_max_a")
    i_ph_design = q.get("phase_current_design_a")
    try:
        i_ph_max_n = float(i_ph_max) if i_ph_max is not None else 477.0
    except (TypeError, ValueError):
        i_ph_max_n = 477.0
    try:
        i_ph_design_n = float(i_ph_design) if i_ph_design is not None else round(i_ph_max_n * 1.12, 1)
    except (TypeError, ValueError):
        i_ph_design_n = round(i_ph_max_n * 1.12, 1)

    fw = out / "firmware"
    fw.mkdir(exist_ok=True)
    (fw / "README.md").write_text(
        f"""# Front FPK — firmware bring-up contract

**Generated:** {NOW}  
**Status:** `FAB-READY — UNPROVEN IN HARDWARE` (no HIL on populated inverter)  
**Homologation:** NOT HOMOLOGATED — DEC-008 (HIL) OPEN by design

## Intent

Prove the *software contract* a purchased SiC MCU + MGU pack must honour:
buses, identities, channel counts, communications, safe-off actuation.
This is NOT race control software and NOT an FIA homologation artefact.

## Contract checklist

| Item | Required | Status |
|---|---|---|
| HVIL / interlock sense | Present before enable | SPEC |
| Desat / OC fault → safe-off < 10 µs class | Documented | SPEC |
| Phase current sense channels | ≥3 (U/V/W) | SPEC (I_ph_ideal={i_ph_max_n:g} A / I_ph_design={i_ph_design_n:g} A) |
| Resolver / encoder identity | Present | SPEC |
| Coolant inlet temp sense | Present | SPEC (60 °C design inlet) |
| CAN / vehicle interface | Present | SPEC |
| Torque / current limit tables | 250 kW regen cap labelled | SPEC |
| HIL on populated board | Required for FUNCTIONALLY VERIFIED | **MISSING — OPEN by design (DEC-008)** |

## Doctrine (ForgeOS)

Excel may say `FUNCTIONALLY VERIFIED` only when current-revision firmware proof
passes on the populated PCB (HIL). Compile/sim without HIL remains
`FAB-READY — UNPROVEN IN HARDWARE`.

## Prototype reference

See repo `prototypes/pcb-firmware-proof/` for the Tier-0 native bring-up pattern
(NinjaPCR worked example). Wire a FE-specific proof after supplier pinout lands.
"""
    )
    (fw / "bring-up-contract.json").write_text(
        json.dumps(
            {
                "product_class": "formula_e_front_mgu",
                "generated_at": NOW,
                "verdict": "FAB-READY_UNPROVEN_IN_HARDWARE",
                "hil_required_for_functionally_verified": True,
                "hil_present": False,
                "open_by_design": ["DEC-008"],
                "channels": {
                    "phase_current": 3,
                    "resolver": 1,
                    "coolant_temp": 1,
                    "hvil": 1,
                },
                "safe_off": {"desat_oc": True, "target_us_class": 10},
                "limits": {
                    "front_regen_electrical_cap_kw": 250,
                    "hardware_power_class_kw": 350,
                    "phase_current_max_a": i_ph_max_n,
                    "phase_current_design_a": i_ph_design_n,
                },
            },
            indent=2,
        )
        + "\n"
    )
    print(f"[firmware] wrote {fw}")


def rebuild_rear_renders(rear: Path) -> None:
    """A5: ensure renders/ is populated from root product PNGs + refresh pack note."""
    renders = rear / "renders"
    renders.mkdir(exist_ok=True)
    names = [
        "00-hero.png",
        "04-product-exterior.png",
        "05-product-left.png",
        "06-product-right.png",
        "07-product-service.png",
        "08-product-ghost-shell.png",
        "09-product-ghost-shell-side.png",
        "10-product-ghost-shell-back.png",
        "11-product-ghost-shell-top.png",
        "12-product-ghost-shell-front.png",
        "blender-cover.png",
    ]
    n = 0
    for name in names:
        src = rear / name
        if not src.exists() and name == "blender-cover.png":
            src = rear / "04-product-exterior.png"
        if src.exists():
            shutil.copy2(src, renders / name)
            n += 1
    note = rear / "REAR-PROCESS-ARTEFACT.md"
    note.write_text(
        f"""# Rear MGU — process artefact (not the JLR demo zip)

**Updated:** {NOW}  
**Twin:** `{rear.name}`

## Status

- Excel / design-pack exist as process outputs (see `*formula-e-rear-mgu-design-pack*`).
- Product PNGs copied into `renders/` ({n} files) for pack coherence (Phase A5).
- PCB disposition on this twin: see `state.pcb` (COTS / purchased parent).
- **Demo zip for JLR Head of Tech remains the FRONT FPK pack only.**

## Morphology note

Rear = open cradle / transverse manufacturer cassette (process). Front = bay-fill
unitised FPK. Do not confuse silhouettes in the room.
"""
    )
    print(f"[rear] renders copied n={n}; note written")


def re_stamp_honesty_only(out: Path) -> None:
    """Re-apply OPEN-by-design holds + PCB honesty without re-running PCB pipeline."""
    close_holds(out)
    write_homologation_readiness(out)
    st_path = out / "state.json"
    st = _load(st_path)
    st["pcb"] = stamp_pcb_homologation_honesty(
        st.get("pcb") if isinstance(st.get("pcb"), dict) else {}
    )
    _save(st_path, st)
    write_firmware_contract(out)
    print(
        f"[honesty] supplierGerbers={st['pcb'].get('supplierGerbers')} "
        f"hilPresent={st['pcb'].get('hilPresent')} "
        f"forgeDraftOnly={st['pcb'].get('forgeDraftOnly')} "
        f"open_by_design={st.get('homologationHonesty', {}).get('open_by_design_ids')}"
    )


def main() -> int:
    if not FRONT.exists():
        print("missing FRONT", FRONT)
        return 1
    honesty_only = "--honesty-only" in sys.argv
    if honesty_only:
        re_stamp_honesty_only(FRONT)
        print("[done] honesty re-stamp complete — run Excel rebuild next")
        return 0
    close_holds(FRONT)
    write_homologation_readiness(FRONT)
    run_pcb_stage(FRONT)
    # Belt-and-braces: holds + PCB honesty after any pipeline mutation.
    close_holds(FRONT)
    write_firmware_contract(FRONT)
    if REAR.exists():
        rebuild_rear_renders(REAR)
        # also stamp a short homologation honesty note on rear
        (REAR / "REAR-NOT-THE-DEMO.md").write_text(
            f"Updated {NOW}: rear is process-only. Send FRONT V1.5+ pack to JLR.\n"
        )
    print("[done] artefact close-out complete — run Blender + Excel rebuild next")
    return 0


if __name__ == "__main__":
    sys.exit(main())
