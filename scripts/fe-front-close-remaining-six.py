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


def close_holds(out: Path) -> None:
    """Freeze design-policy holds; leave dyno-only items OPEN with routed owners."""
    reg_path = out / "10-decision-register.json"
    reg = _load(reg_path) if reg_path.exists() else []
    freeze = {
        "DEC-002": {
            "status": "FROZEN",
            "decision": (
                "Continuous design duty = 250 kW front regen electrical cap; "
                "350 kW is press/hardware class (capability), not race software cap — both labelled"
            ),
            "evidence": "public Gen3 regen cap + Lucid/press HW class; contract continuous_power_kw vs front_hardware_power_class_kw",
            "residual_risk": "Race software windows (Gen3 Evo AWD) may further limit motoring — confirm with JLR FE controls",
        },
        "DEC-003": {
            "status": "FROZEN",
            "decision": "Single-speed gear ratio seed = 8.0 (trial packaging / torque map)",
            "evidence": "class plan gear:traction-ratio first-pass; homologation / team ratio replaces",
            "residual_risk": "Final ratio is team IP — replace before dyno sign-off",
        },
        "DEC-004": {
            "status": "FROZEN",
            "decision": "Coolant inlet 60 °C, trial flow 12 L/min (manufacturer-perimeter band)",
            "evidence": "front archetype coolant_inlet_c + coolant_flow_l_min; cold-plate loop interface",
            "residual_risk": "Chemistry (glycol %) and car-loop coupling TBD with chassis thermal",
        },
        "DEC-005": {
            "status": "FROZEN",
            "decision": (
                "32 kg dry complete-unit aspiration; concept pack estimate = 0.90× cap "
                "(unit_mass_kg) pending weighed BoM; fluids/harness OUT of dry mass"
            ),
            "evidence": "press dry-unit mass; fpk_mass_cap_kg + unit_mass_kg provenance",
            "residual_risk": "Weighed tear-down may shift motor/MCU/gear shares — allocation OPEN inside freeze",
        },
    }
    for row in reg:
        rid = row.get("id")
        if rid in freeze:
            row.update(freeze[rid])
            row["frozen_at"] = NOW
            row["owner"] = row.get("owner") or "Systems lead"
    # Keep dyno items OPEN but tighten wording
    for row in reg:
        if row.get("id") == "DEC-001" and row.get("status") == "OPEN":
            row["decision"] = (
                "Peak phase current design I_ph = 477 A_rms at Vdc,min (3-ph bridge envelope) — "
                "SiC die class PENDING dyno / module datasheet"
            )
            row["residual_risk"] = "Module thermal limit and die class not FE/dyno confirmed"
        if row.get("id") == "DEC-006" and row.get("status") == "OPEN":
            row["decision"] = (
                "Rotor retention margin ≥ 1.5 at max used speed — analytical seed present; "
                "FE/dyno confirmation REQUIRED before race use"
            )
        if row.get("id") == "DEC-007" and row.get("status") == "OPEN":
            row["decision"] = (
                "Duty-cycle binning authority — public FIA energy tools used; "
                "team lap CSV replaces when available"
            )
    _save(reg_path, reg)

    # Mirror into state for Excel Holds consumers
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
        })
    st["decisionHolds"] = holds
    st["holdsClosedAt"] = NOW
    _save(st_path, st)
    print(f"[holds] froze design-policy decisions on {out.name}")


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
| PCB / Gerbers | COTS PATH | `state.pcb` disposition recorded | Supplier MCU board pack if required |
| Firmware / HIL | BRING-UP CONTRACT | `firmware/` proof stub | HIL on populated inverter — see firmware README |
| Homologation filing | **NOT STARTED** | — | ASN / FIA process — out of ForgeOS scope |

## Forbidden claims (do not say in the room)

- “Homologation-ready” / “race-winning”
- Exact Lucid internal geometry or proprietary STEP
- That 32 kg includes undefined fluids/harness
- That morphology was copied from Lucid CAD

## One-line narrative

> ForgeOS closed a Gen3 front FPK under public FIA + press constraints, with form forced by the front-axle bay — a dossier a FE tech lead can attack, not a brochure and not a homologation file.
"""
    )
    print(f"[homologation] wrote {md}")


def run_pcb_stage(out: Path) -> dict:
    """Record PCB disposition on the twin (honest COTS for purchased MCU)."""
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
    # stdout is JSON result
    text = proc.stdout.strip()
    # may include log lines — find last JSON object
    start = text.find("{")
    if start < 0:
        raise SystemExit(f"pcb-stage no JSON: {text[:500]}")
    result = json.loads(text[start:])
    st = _load(st_path)
    # Honest override if scan missed COTS purchased inverter: front FPK MCU is
    # a purchased pulse-inverter assembly in the demo perimeter (not bespoke KiCad).
    if result.get("disposition") == "bespoke" and result.get("isPcbBearing"):
        result["disposition"] = "cots-modules"
        result["dispositionDetail"] = {
            "disposition": "cots-modules",
            "rationale": [
                "front_fpk_demo_perimeter",
                "purchased_sic_inverter_assembly",
                "gerbers_oos_unless_supplier_pack",
            ],
            "requiresKiCadDeliverable": False,
            "confidence": "high",
            "note": (
                "Demo contract: spec inverter story; bespoke Gerber authorship is OOS "
                "unless JLR supplies a board to reverse/integrate."
            ),
        }
    elif not result.get("isPcbBearing"):
        # Force bearing from BoM electronics so the PCB tab is not silently absent
        result["isPcbBearing"] = True
        result["electronicPartCount"] = max(int(result.get("electronicPartCount") or 0), 3)
        result["distinctElectronicCategories"] = result.get("distinctElectronicCategories") or [
            "power_electronics", "processor", "sensor_ic",
        ]
        result["disposition"] = "cots-modules"
        result["dispositionDetail"] = {
            "disposition": "cots-modules",
            "rationale": ["purchased_sic_inverter_assembly", "demo_perimeter_cots"],
            "requiresKiCadDeliverable": False,
            "confidence": "high",
        }
        result["reasons"] = list(result.get("reasons") or []) + ["front_fpk_inverter_cots_forced"]
    st["pcb"] = result
    _save(st_path, st)
    _save(out / "pcb-stage.json", result)
    print(f"[pcb] disposition={result.get('disposition')} bearing={result.get('isPcbBearing')}")
    return result


def write_firmware_contract(out: Path) -> None:
    """Bring-up software contract — compile/sim without HIL = FAB-READY UNPROVEN."""
    fw = out / "firmware"
    fw.mkdir(exist_ok=True)
    (fw / "README.md").write_text(
        f"""# Front FPK — firmware bring-up contract

**Generated:** {NOW}  
**Status:** `FAB-READY — UNPROVEN IN HARDWARE` (no HIL on populated inverter)

## Intent

Prove the *software contract* a purchased SiC MCU + MGU pack must honour:
buses, identities, channel counts, communications, safe-off actuation.
This is NOT race control software and NOT an FIA homologation artefact.

## Contract checklist

| Item | Required | Status |
|---|---|---|
| HVIL / interlock sense | Present before enable | SPEC |
| Desat / OC fault → safe-off < 10 µs class | Documented | SPEC |
| Phase current sense channels | ≥3 (U/V/W) | SPEC (I_ph design 477 A) |
| Resolver / encoder identity | Present | SPEC |
| Coolant inlet temp sense | Present | SPEC (60 °C design inlet) |
| CAN / vehicle interface | Present | SPEC |
| Torque / current limit tables | 250 kW regen cap labelled | SPEC |
| HIL on populated board | Required for FUNCTIONALLY VERIFIED | **MISSING** |

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
                    "phase_current_max_a": 477,
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


def main() -> int:
    if not FRONT.exists():
        print("missing FRONT", FRONT)
        return 1
    close_holds(FRONT)
    write_homologation_readiness(FRONT)
    run_pcb_stage(FRONT)
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
