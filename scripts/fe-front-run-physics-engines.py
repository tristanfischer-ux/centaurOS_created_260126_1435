#!/usr/bin/env python3
"""Run CoolProp/fluids/ht against the FPK twin and stamp proof Anvil uses them.

Also re-stamps cold-plate thermal (fpk_bus_esl) so state.fpkColdPlateThermal
carries physics_engines_used=true for all three libraries.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VENV_PY = ROOT / ".venv" / "bin" / "python"
if VENV_PY.exists() and Path(sys.executable).resolve() != VENV_PY.resolve():
    # INTENT: the proof stamp must use the same Python environment as the
    # selftests. Running from system Python silently falls back to handbook
    # constants even while the .venv selftest proves CoolProp/fluids/ht exist.
    os.execv(str(VENV_PY), [str(VENV_PY), __file__, *sys.argv[1:]])
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts" / "lib"))

from fpk_bus_esl import derive_bus_esl, derive_cold_plate_thermal  # noqa: E402
from fpk_physics_engines import derive_coolant_and_channel  # noqa: E402

TWIN = ROOT / "out/formula-e-front-mgu-20260729-1432"
STATE = TWIN / "state.json"


def iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def quantities_from_state(state: dict) -> dict:
    for key in ("orchestratorContract", "engineeringContract"):
        c = state.get(key) or {}
        q = c.get("quantities") if isinstance(c, dict) else None
        if isinstance(q, dict) and q:
            return q
    return {}


def run_coolprop_cli(temp_c: float) -> dict:
    payload = json.dumps({"fluid": "water_glycol_50", "temperature_c": temp_c}).encode()
    proc = subprocess.run(
        [str(VENV_PY), str(ROOT / "scripts/lib/orchestrator/tools/python/coolprop_run.py")],
        input=payload,
        capture_output=True,
        check=False,
    )
    try:
        return json.loads(proc.stdout.decode() or "{}")
    except json.JSONDecodeError:
        return {"error": proc.stderr.decode()[:400], "returncode": proc.returncode}


def main() -> int:
    # Selftests first
    r1 = subprocess.run(
        [str(VENV_PY), str(ROOT / "scripts/lib/fpk_physics_engines.py"), "--selftest"],
        capture_output=True,
        text=True,
    )
    r2 = subprocess.run(
        [str(VENV_PY), str(ROOT / "scripts/lib/fpk_bus_esl.py"), "--selftest"],
        capture_output=True,
        text=True,
    )
    state = json.loads(STATE.read_text(encoding="utf-8"))
    q = quantities_from_state(state)
    tin = 60.0
    raw = q.get("coolant_inlet_c")
    if isinstance(raw, dict):
        try:
            tin = float(raw.get("value") or tin)
        except (TypeError, ValueError):
            pass

    coolprop_cli = run_coolprop_cli(tin)
    bundle = derive_coolant_and_channel(
        q,
        channel_hydraulic_diameter_m=0.003,
        channel_length_m=0.12,
        channel_count=8,
        inlet_c=tin,
    )
    cold = derive_cold_plate_thermal(q)
    esl = derive_bus_esl(q)

    engines = {
        "stamped_at": iso(),
        "schema": "fpk_physics_engines_usage/v1",
        "selftests": {
            "fpk_physics_engines": {
                "ok": r1.returncode == 0,
                "stdout": (r1.stdout or "")[-300:],
            },
            "fpk_bus_esl": {
                "ok": r2.returncode == 0,
                "stdout": (r2.stdout or "")[-300:],
            },
        },
        "mgu_pack_note": (
            "11 analytical MGU/MCU tools already in twin _tools_run; "
            "this stamp proves CoolProp/fluids/ht are also invoked for FPK thermal."
        ),
        "coolprop_cli": {
            "ok": "error" not in coolprop_cli and coolprop_cli.get("liquid_density_kg_m3") is not None,
            "result": coolprop_cli,
        },
        "library_bundle": bundle,
        "cold_plate_engines": cold.get("physics_engines_used"),
        "proveCatch": {
            "coolprop_used": bool(bundle.get("engines_used", {}).get("coolprop")),
            "fluids_used": bool(bundle.get("engines_used", {}).get("fluids")),
            "ht_used": bool(bundle.get("engines_used", {}).get("ht")),
            "all_three": bool(bundle.get("all_libraries_used")),
            "selftests_pass": r1.returncode == 0 and r2.returncode == 0,
        },
    }
    engines["proveCatch"]["ok"] = all(engines["proveCatch"].values())

    # Write CoolProp quantities into contract so front reconcile can consume them
    oc = state.setdefault("orchestratorContract", {})
    oq = oc.setdefault("quantities", {}) if isinstance(oc, dict) else {}
    coolant = bundle["coolant"]
    if coolant.get("engine_used"):
        oq["coolant_density_kg_m3"] = {
            "value": coolant["density_kg_m3"],
            "unit": "kg/m3",
            "basis": "CoolProp INCOMP::MEG[0.50]",
            "provenance": {"source": "tool:coolprop", "tool_id": "coolprop:refrigerant-properties"},
        }
        oq["coolant_cp_j_kgk"] = {
            "value": coolant["cp_j_kgk"],
            "unit": "J/(kg·K)",
            "basis": "CoolProp INCOMP::MEG[0.50]",
            "provenance": {"source": "tool:coolprop", "tool_id": "coolprop:refrigerant-properties"},
        }

    state["fpkPhysicsEngines"] = engines
    state["fpkColdPlateThermal"] = {
        **cold,
        "stamped_at": iso(),
        "source": "scripts/lib/fpk_bus_esl.py+fpk_physics_engines.py",
    }
    state["fpkBusEsl"] = {
        **esl,
        "stamped_at": iso(),
        "source": "scripts/lib/fpk_bus_esl.py",
    }
    STATE.write_text(json.dumps(state, indent=2), encoding="utf-8")

    md = [
        "# JLR FE Front FPK — Physics engines usage\n\n",
        f"Stamped: {engines['stamped_at']}\n\n",
        "## proveCatch\n\n```json\n",
        json.dumps(engines["proveCatch"], indent=2),
        "\n```\n\n",
        "## Engines\n\n",
        f"- CoolProp used: {engines['proveCatch']['coolprop_used']} "
        f"(ρ={coolant.get('density_kg_m3')}, cp={coolant.get('cp_j_kgk')})\n",
        f"- fluids used: {engines['proveCatch']['fluids_used']}\n",
        f"- ht used: {engines['proveCatch']['ht_used']}\n",
        f"- Selftests: physics_engines={r1.returncode==0} bus_esl={r2.returncode==0}\n",
        "\n## Honesty\n\n",
        "- CFD / FEA_em remain OPEN — these are library screening engines, not OpenFOAM/FEMM.\n",
        "- Class plan now includes `coolprop:refrigerant-properties` + `fluids:pipe-sizing` "
        "so the next orchestrator run invokes them in-chain.\n",
    ]
    (TWIN / "JLR-FE-FRONT-FPK-PHYSICS-ENGINES.md").write_text("".join(md), encoding="utf-8")
    print(json.dumps(engines["proveCatch"], indent=2))
    print("wrote", TWIN / "JLR-FE-FRONT-FPK-PHYSICS-ENGINES.md")
    return 0 if engines["proveCatch"]["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
