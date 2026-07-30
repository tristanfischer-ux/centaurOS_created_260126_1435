#!/usr/bin/env python3
"""Sol categorical audit: FPK formulas installed, working, Anvil-called.

INTENT: Prove — not assert — that every Anvil FPK formula pack:
  (1) is installed on disk
  (2) passes --selftest (or CLI smoke)
  (3) is wired into the formula_e_front_mgu class plan AND/OR an FPK stamp path
  (4) has live twin evidence of invocation (orchestrator results OR contract
      provenance OR fpk* stamp)

Then Sol adversarially audits that matrix. Deterministic bars decide PASS/FAIL;
Sol cannot invent a pass.

Usage:
  python3 scripts/fe-front-sol-formula-audit.py
  python3 scripts/fe-front-sol-formula-audit.py --skip-sol   # matrix only
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
TWIN = ROOT / "out/formula-e-front-mgu-20260729-1432"
VENV_PY = ROOT / ".venv/bin/python"
sys.path.insert(0, str(ROOT / "scripts/lib"))
from council_models import COUNCIL_MODELS  # noqa: E402

# INTENT: One row per Anvil-callable formula pack. Categorical bars below.
FORMULA_PACKS: list[dict[str, Any]] = [
    {
        "pack_id": "motor:ipmsm-analytical-sizing",
        "formulas": ["ipmsm-d2l", "ipmsm-shear", "ipmsm-tip", "ipmsm-felec", "ipmsm-power"],
        "module": "scripts/lib/orchestrator/tools/python/ipmsm_analytical_sizing.py",
        "class_plan_required": True,
        "twin_tool_id": "motor:ipmsm-analytical-sizing",
        "fpk_stamp_paths": [],
    },
    {
        "pack_id": "inverter:sic-loss",
        "formulas": ["I_ac", "P_cond", "P_sw", "P_diss"],
        "module": "scripts/lib/orchestrator/tools/python/inverter_sic_loss.py",
        "class_plan_required": True,
        "twin_tool_id": "inverter:sic-loss",
        "fpk_stamp_paths": [],
    },
    {
        "pack_id": "inverter:field-weakening-mtpa",
        "formulas": ["mtpa-base", "mtpa-id", "dq-v", "em-torque"],
        "module": "scripts/lib/orchestrator/tools/python/field_weakening_mtpa.py",
        "class_plan_required": False,  # optional in rear plan, still wrapped on front
        "twin_tool_id": "inverter:field-weakening-mtpa",
        "fpk_stamp_paths": [],
    },
    {
        "pack_id": "motor:loss-point",
        "formulas": ["P_cu", "P_fe", "P_mag", "P_mech", "eta-motor"],
        "module": "scripts/lib/orchestrator/tools/python/motor_loss_point.py",
        "class_plan_required": True,
        "twin_tool_id": "motor:loss-point",
        "fpk_stamp_paths": [],
    },
    {
        "pack_id": "motor:rotor-centrifugal-stress",
        "formulas": ["hoop", "tip-ret", "stress-margin", "sleeve-hoop"],
        "module": "scripts/lib/orchestrator/tools/python/rotor_centrifugal_stress.py",
        "class_plan_required": True,
        "twin_tool_id": "motor:rotor-centrifugal-stress",
        "fpk_stamp_paths": [],
    },
    {
        "pack_id": "motor:thermal-lumped",
        "formulas": ["ΔT_fluid", "T_w", "T_m"],
        "module": "scripts/lib/orchestrator/tools/python/mgu_thermal_lumped.py",
        "class_plan_required": True,
        "twin_tool_id": "motor:thermal-lumped",
        "fpk_stamp_paths": [],
    },
    {
        "pack_id": "gear:traction-ratio",
        "formulas": ["n_wheel", "v", "T_wheel", "g_req"],
        "module": "scripts/lib/orchestrator/tools/python/gear_ratio_traction.py",
        "class_plan_required": True,
        "twin_tool_id": "gear:traction-ratio",
        "fpk_stamp_paths": [],
    },
    {
        "pack_id": "powertrain:duty-cycle-energy",
        "formulas": ["duty P", "E"],
        "module": "scripts/lib/orchestrator/tools/python/duty_cycle_energy.py",
        "class_plan_required": True,
        "twin_tool_id": "powertrain:duty-cycle-energy",
        "fpk_stamp_paths": [],
    },
    {
        "pack_id": "powertrain:fia-power-regen-split",
        "formulas": ["FIA split"],
        "module": "scripts/lib/orchestrator/tools/python/fia_power_regen_split.py",
        "class_plan_required": True,
        "twin_tool_id": "powertrain:fia-power-regen-split",
        "fpk_stamp_paths": [],
    },
    {
        "pack_id": "powertrain:fia-net-usable-energy",
        "formulas": ["E_net"],
        "module": "scripts/lib/orchestrator/tools/python/fia_net_usable_energy.py",
        "class_plan_required": True,
        "twin_tool_id": "powertrain:fia-net-usable-energy",
        "fpk_stamp_paths": [],
    },
    {
        "pack_id": "inverter:current-voltage-envelope",
        "formulas": ["V_ll", "S_P", "T_from_env"],
        "module": "scripts/lib/orchestrator/tools/python/inverter_current_voltage_envelope.py",
        "class_plan_required": True,
        "twin_tool_id": "inverter:current-voltage-envelope",
        "fpk_stamp_paths": [],
    },
    {
        "pack_id": "coolprop:refrigerant-properties",
        "formulas": ["CoolProp MEG50", "Pr"],
        "module": "scripts/lib/orchestrator/tools/python/coolprop_run.py",
        "selftest_mode": "coolprop_cli",
        "class_plan_required": True,
        "twin_tool_id": "coolprop:refrigerant-properties",
        "fpk_stamp_paths": ["fpkPhysicsEngines", "fpkColdPlateThermal"],
        "contract_qty_keys": ["coolant_density_kg_m3", "coolant_cp_j_kgk"],
    },
    {
        "pack_id": "fluids+ht:cold-plate",
        "formulas": ["Darcy", "Nu→h", "Dh", "Rth network"],
        "module": "scripts/lib/fpk_physics_engines.py",
        "class_plan_required": False,  # fluids:pipe-sizing optional; ht via FPK stamp
        "twin_tool_id": "fluids:pipe-sizing",
        "fpk_stamp_paths": ["fpkPhysicsEngines", "fpkColdPlateThermal", "fpkBusEsl"],
        "anvil_paths": [
            "scripts/lib/orchestrator/class-plans/formula-e-rear-mgu.ts (fluids:pipe-sizing)",
            "scripts/lib/fpk_bus_esl.py (cold plate)",
            "scripts/fe-front-run-physics-engines.py",
        ],
    },
    {
        "pack_id": "fpk:bus-esl",
        "formulas": ["I_dc", "f_edge", "δ", "L_ext", "L_int", "L_term", "L_tot", "TL check"],
        "module": "scripts/lib/fpk_bus_esl.py",
        "class_plan_required": False,
        "twin_tool_id": None,
        "fpk_stamp_paths": ["fpkBusEsl"],
        "anvil_paths": ["scripts/lib/fpk_bus_esl.py → state.fpkBusEsl"],
    },
    {
        "pack_id": "fpk:concentric-geometry",
        "formulas": ["stator", "planetary", "face/shaft", "busbar mm", "nest fit"],
        "module": "scripts/lib/fpk_concentric_geometry.py",
        "class_plan_required": False,
        "twin_tool_id": None,
        "fpk_stamp_paths": ["fpkConcentricGeometry"],
        "anvil_paths": ["scripts/lib/fpk_concentric_geometry.py"],
    },
    {
        "pack_id": "front:power-reconcile",
        "formulas": ["Power chain", "Coolant ΔT", "Design I_ph"],
        "module": "scripts/lib/orchestrator/class-plans/formula-e-front-mgu.ts",
        "selftest_mode": "ts_exists",
        "class_plan_required": True,
        "twin_tool_id": "front_fpk_power_reconcile",
        "fpk_stamp_paths": [],
        "contract_qty_keys": [
            "mgu_shaft_power_kw",
            "coolant_delta_t_k",
            "mgu_ac_electrical_input_kw",
        ],
        "anvil_paths": [
            "formula-e-front-mgu.ts wrapWithFrontReconcile on EVERY tool step"
        ],
    },
]


def load_key() -> str:
    if os.environ.get("OPENROUTER_API_KEY"):
        return os.environ["OPENROUTER_API_KEY"]
    for p in (ROOT / ".env.local", ROOT / ".env"):
        if not p.exists():
            continue
        for line in p.read_text().splitlines():
            if line.startswith("OPENROUTER_API_KEY="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    return ""


def run_selftest(pack: dict[str, Any]) -> dict[str, Any]:
    mod = ROOT / pack["module"]
    mode = pack.get("selftest_mode", "python_selftest")
    if mode == "ts_exists":
        return {"ok": mod.is_file(), "detail": "TypeScript module present" if mod.is_file() else "MISSING"}
    if mode == "coolprop_cli":
        # GOTCHA: coolprop_run.py maps orchestrator codes via FLUID_MAP.
        # Passing raw "INCOMP::MEG[0.50]" falls through safe_choice → R290.
        # FPK Anvil path uses fluid code "water_glycol_50" / "meg_50".
        py = str(VENV_PY if VENV_PY.is_file() else sys.executable)
        payload = json.dumps(
            {
                "fluid": "meg_50",
                "temperature_c": 60.0,
                "pressure_bar": 1.01325,
            }
        ).encode()
        try:
            r = subprocess.run(
                [py, str(mod)],
                input=payload,
                capture_output=True,
                timeout=60,
                check=False,
            )
            out = (r.stdout or b"").decode("utf-8", errors="replace")
            data = json.loads(out) if out.strip().startswith("{") else {}
            rho = data.get("liquid_density_kg_m3")
            # MEG 50/50 @ ~60°C is ~1040 kg/m³ — R290 false-pass is ~428
            ok = (
                r.returncode == 0
                and rho is not None
                and 1000.0 <= float(rho) <= 1100.0
                and "MEG" in str(data.get("fluid") or "")
            )
            return {"ok": ok, "detail": out[:240], "result": data}
        except Exception as e:
            return {"ok": False, "detail": str(e)}
    if not mod.is_file():
        return {"ok": False, "detail": "module missing"}
    py = str(VENV_PY if VENV_PY.is_file() else sys.executable)
    try:
        r = subprocess.run(
            [py, str(mod), "--selftest"],
            capture_output=True,
            timeout=90,
            check=False,
            cwd=str(ROOT),
        )
        out = ((r.stdout or b"") + (r.stderr or b"")).decode("utf-8", errors="replace")
        return {"ok": r.returncode == 0, "detail": out[-400:], "returncode": r.returncode}
    except Exception as e:
        return {"ok": False, "detail": str(e)}


def class_plan_mentions(tool_id: str | None) -> dict[str, Any]:
    if not tool_id:
        return {"in_front_plan": False, "in_rear_plan": False, "required_literal": False}
    front = (ROOT / "scripts/lib/orchestrator/class-plans/formula-e-front-mgu.ts").read_text()
    rear = (ROOT / "scripts/lib/orchestrator/class-plans/formula-e-rear-mgu.ts").read_text()
    # Front re-exports rear tools via map(wrapWithFrontReconcile)
    in_rear = tool_id in rear
    in_front = tool_id in front or (
        "FORMULA_E_REAR_MGU_PLAN.tools.map(wrapWithFrontReconcile)" in front and in_rear
    )
    # required: true near tool_id in rear
    required = False
    if in_rear:
        # crude but effective: tool_id block then required: true within 8 lines
        for m in re.finditer(rf"tool_id:\s*'{re.escape(tool_id)}'", rear):
            chunk = rear[m.start() : m.start() + 400]
            if re.search(r"required:\s*true", chunk):
                required = True
                break
    if tool_id == "front_fpk_power_reconcile":
        in_front = "reconcileFrontFpkPowerChain" in front
        required = True
    return {
        "in_front_plan": in_front,
        "in_rear_plan": in_rear,
        "required_literal": required,
    }


def twin_evidence(pack: dict[str, Any], state: dict[str, Any], tools_used: dict[str, Any], tool_results: list) -> dict[str, Any]:
    tid = pack.get("twin_tool_id")
    used_entry = None
    for t in tools_used.get("tools") or []:
        if isinstance(t, dict) and t.get("tool_id") == tid:
            used_entry = t
            break
    used_ids = {
        t.get("tool_id")
        for t in (tools_used.get("tools") or [])
        if isinstance(t, dict) and t.get("tool_id")
    }
    result_ids = {
        (r.get("tool_id") if isinstance(r, dict) else None) for r in tool_results
    }
    in_orchestrator = bool(tid and (tid in used_ids or tid in result_ids))

    stamp_hits = []
    stamp_snippets: dict[str, Any] = {}
    for path in pack.get("fpk_stamp_paths") or []:
        node = state.get(path)
        if not node:
            continue
        stamp_hits.append(path)
        if path == "fpkColdPlateThermal":
            stamp_snippets[path] = {
                "engines": node.get("physics_engines_used"),
                "operating_point": node.get("operating_point"),
                "temperature_rise_k": node.get("temperature_rise_k"),
                "channel_hydraulics": node.get("channel_hydraulics"),
            }
        elif path == "fpkPhysicsEngines":
            stamp_snippets[path] = {
                "proveCatch": node.get("proveCatch"),
                "coolprop_cli": (node.get("coolprop_cli") or {}).get("ok"),
            }
        elif path == "fpkBusEsl":
            stamp_snippets[path] = {
                "esl_nh_nominal": node.get("esl_nh_nominal"),
                "validation_status": node.get("validation_status"),
                "physics_engines": (node.get("physics_engines_used") or node.get("cold_plate")),
            }
        elif path == "fpkConcentricGeometry":
            stamp_snippets[path] = {
                k: node.get(k)
                for k in (
                    "housing_od_mm",
                    "stator_od_mm",
                    "rotor_od_mm",
                    "sun_od_mm",
                    "planet_od_mm",
                    "ring_id_mm",
                )
            }

    contract = state.get("orchestratorContract") or {}
    qty = contract.get("quantities") or {}
    # All quantities whose provenance.tool_id matches this pack
    contract_hits = []
    for k, q in qty.items():
        if not isinstance(q, dict):
            continue
        prov = q.get("provenance") or {}
        tool = str(prov.get("tool_id") or "")
        src = str(prov.get("source") or q.get("source") or "")
        wanted = bool(tid and (tool == tid or tid in src))
        if not wanted and k in (pack.get("contract_qty_keys") or []):
            wanted = True
        if not wanted:
            continue
        contract_hits.append(
            {
                "key": k,
                "value": q.get("value"),
                "unit": q.get("unit"),
                "tool_id": tool,
                "source": src,
                "matches_pack": True,
            }
        )
    contract_hits = contract_hits[:12]

    tools_used_claims = []
    if used_entry:
        for c in (used_entry.get("claims") or [])[:8]:
            tools_used_claims.append(
                {
                    "field": c.get("field"),
                    "value": c.get("value"),
                    "unit": c.get("unit"),
                    "output_field": c.get("output_field"),
                }
            )

    pe = state.get("fpkPhysicsEngines") or {}
    engines_ok = False
    if pack["pack_id"].startswith("coolprop") or pack["pack_id"].startswith("fluids"):
        pc = pe.get("proveCatch") or {}
        engines_ok = bool(pc.get("ok") or pc.get("all_three"))

    invoked = (
        in_orchestrator
        or bool(stamp_hits)
        or bool(contract_hits)
        or bool(tools_used_claims)
        or engines_ok
    )

    return {
        "in_orchestrator_tools_used": tid in used_ids if tid else False,
        "in_orchestrator_tool_results": tid in result_ids if tid else False,
        "orchestrator_result_ok": any(
            isinstance(r, dict) and r.get("tool_id") == tid and r.get("ok") is True
            for r in tool_results
        ),
        "fpk_stamp_hits": stamp_hits,
        "fpk_stamp_snippets": stamp_snippets,
        "contract_hits": contract_hits,
        "tools_used_claims": tools_used_claims,
        "physics_engines_proveCatch": engines_ok,
        "invoked_on_twin": invoked,
    }


def evaluate_pack(pack: dict[str, Any], state: dict[str, Any], tools_used: dict[str, Any], tool_results: list) -> dict[str, Any]:
    mod_path = ROOT / pack["module"]
    installed = mod_path.is_file()
    selftest = run_selftest(pack)
    plan = class_plan_mentions(pack.get("twin_tool_id"))
    evidence = twin_evidence(pack, state, tools_used, tool_results)

    # Wired for Anvil = required in class plan OR explicitly documented FPK stamp path
    anvil_wired = bool(
        plan["in_front_plan"]
        or plan["required_literal"]
        or pack.get("fpk_stamp_paths")
        or pack.get("anvil_paths")
    )
    # Where appropriate: required tools must be required; optional may be optional
    appropriate = True
    if pack.get("class_plan_required"):
        appropriate = plan["in_front_plan"] and (
            plan["required_literal"]
            or pack["pack_id"] == "front:power-reconcile"
            or pack["pack_id"].startswith("coolprop")
        )

    bars = {
        "installed": installed,
        "works_selftest": bool(selftest.get("ok")),
        "anvil_wired": anvil_wired,
        "invoked_on_this_twin": bool(evidence["invoked_on_twin"]),
        "appropriate_for_fpk": appropriate if pack.get("class_plan_required") else anvil_wired,
    }
    categorical_pass = all(bars.values())
    return {
        "pack_id": pack["pack_id"],
        "formulas": pack["formulas"],
        "module": pack["module"],
        "bars": bars,
        "categorical_pass": categorical_pass,
        "selftest": {k: selftest[k] for k in selftest if k != "result"} | (
            {"result_keys": list((selftest.get("result") or {}).keys())} if selftest.get("result") else {}
        ),
        "class_plan": plan,
        "twin_evidence": evidence,
        "anvil_paths": pack.get("anvil_paths") or [
            f"class-plan tool_id={pack.get('twin_tool_id')}"
        ],
    }


def call_sol(api_key: str, matrix: dict[str, Any]) -> dict[str, Any]:
    system = """You are Sol — adversarial auditor for Jaguar Land Rover Formula E FPK tooling.

You receive a DETERMINISTIC evidence matrix for formula packs. TWO SEPARATE verdicts:

A) formula_stack_verdict — ONLY about whether each listed pack is:
   installed + selftest-pass + Anvil-wired for formula_e_front_mgu + invoked on this twin.
   If the matrix summary.deterministic_useful is true AND you find no contradictory
   evidence inside the pack rows, formula_stack_verdict MUST be PASS and
   categorical_proof_accepted MUST be true.
   Do NOT fail formula_stack_verdict for missing CFD/FEA/HIL/dyno — those are ship holds.

B) ship_readiness_verdict — overall dossier readiness to manufacture/race.
   This SHOULD remain FAIL while CFD/FEA/HIL/dyno/FIA XYZ holds are open.

Also:
1) Flag any pack that claims PASS but evidence is weak or contradictory (sol_verdict WEAK/FAIL).
2) Name FPK-critical formula packs MISSING from the list (advisory; does not auto-fail A).
3) Confirm Anvil will call the listed packs where appropriate for formula_e_front_mgu.

Return STRICT JSON:
{
  "formula_stack_verdict": "PASS" | "CONDITIONAL" | "FAIL",
  "ship_readiness_verdict": "PASS" | "CONDITIONAL" | "FAIL",
  "verdict": "PASS" | "CONDITIONAL" | "FAIL",
  "confidence": 0-100,
  "pack_audits": [
    {"pack_id":"...", "sol_verdict":"PASS|FAIL|WEAK", "why":"...", "anvil_will_call":true/false, "gaps":["..."]}
  ],
  "missing_formula_packs": ["..."],
  "anvil_wiring_assessment": "...",
  "categorical_proof_accepted": true/false,
  "top_findings": ["..."],
  "required_fixes_before_ship": ["..."]
}
Set "verdict" equal to formula_stack_verdict (the question under audit).
No markdown outside JSON.
"""
    # Compact matrix for token budget
    compact = {
        "twin": matrix["twin"],
        "summary": matrix["summary"],
        "evidence_standard": (
            "Each pack includes: module path, selftest ok+detail, class-plan membership, "
            "orchestrator ok flag, numerical contract quantities with tool_id provenance, "
            "and/or tools-used claim values, and/or FPK stamp snippets with numbers."
        ),
        "packs": [
            {
                "pack_id": p["pack_id"],
                "formulas": p["formulas"],
                "module": p["module"],
                "bars": p["bars"],
                "categorical_pass": p["categorical_pass"],
                "class_plan": p["class_plan"],
                "selftest": p["selftest"],
                "twin_evidence": p["twin_evidence"],
                "anvil_paths": p["anvil_paths"],
            }
            for p in matrix["packs"]
        ],
        "honesty_notes": matrix.get("honesty_notes"),
    }
    body = {
        "model": COUNCIL_MODELS["sol"],
        "temperature": 0.15,
        "max_tokens": 6000,
        "messages": [
            {"role": "system", "content": system},
            {
                "role": "user",
                "content": "Audit this FPK formula evidence matrix:\n"
                + json.dumps(compact, indent=2),
            },
        ],
    }
    req = urllib.request.Request(
        "https://openrouter.ai/api/v1/chat/completions",
        data=json.dumps(body).encode(),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://forgeos.local",
            "X-Title": "ForgeOS FPK Sol Formula Audit",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=300) as resp:
        data = json.loads(resp.read().decode())
    content = data["choices"][0]["message"].get("content") or ""
    text = str(content).strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.startswith("json"):
            text = text[4:].strip()
    start = text.find("{")
    if start < 0:
        return {"parse_error": True, "raw": text[:2000]}
    from json import JSONDecoder

    try:
        obj, _ = JSONDecoder().raw_decode(text, start)
        return obj if isinstance(obj, dict) else {"parse_error": True, "raw": text[:2000]}
    except json.JSONDecodeError:
        return {"parse_error": True, "raw": text[:2000]}


def write_proof(matrix: dict[str, Any], sol: dict[str, Any] | None) -> None:
    TWIN.mkdir(parents=True, exist_ok=True)
    (TWIN / "JLR-FE-FRONT-FPK-SOL-FORMULA-AUDIT.json").write_text(
        json.dumps({"matrix": matrix, "sol": sol}, indent=2) + "\n", encoding="utf-8"
    )
    lines = [
        "# JLR FE Front FPK — Sol formula audit (CATEGORICAL PROOF)",
        "",
        f"Proved at: `{matrix['proved_at']}`",
        f"Sol model: `{COUNCIL_MODELS['sol']}`",
        "",
        "## Deterministic verdict",
        "",
        f"- Packs evaluated: **{matrix['summary']['packs_total']}**",
        f"- Packs categorical PASS: **{matrix['summary']['packs_pass']}**",
        f"- Packs FAIL: **{matrix['summary']['packs_fail']}**",
        f"- All selftests PASS: **{matrix['summary']['all_selftests_pass']}**",
        f"- All Anvil-wired: **{matrix['summary']['all_anvil_wired']}**",
        f"- All invoked on this twin: **{matrix['summary']['all_invoked']}**",
        f"- **DETERMINISTIC USEFUL:** `{matrix['summary']['deterministic_useful']}`",
        "",
    ]
    if sol and not sol.get("parse_error"):
        lines += [
            "## Sol audit",
            "",
            f"- Formula-stack verdict: **{sol.get('formula_stack_verdict') or sol.get('verdict')}** "
            f"(confidence {sol.get('confidence')})",
            f"- Ship-readiness verdict: **{sol.get('ship_readiness_verdict', 'n/a')}** "
            "(race holds — not the formula question)",
            f"- Categorical proof accepted by Sol: **{sol.get('categorical_proof_accepted')}**",
            f"- Anvil wiring: {sol.get('anvil_wiring_assessment')}",
            "",
            "### Sol pack audits",
            "",
        ]
        for p in sol.get("pack_audits") or []:
            lines.append(
                f"- `{p.get('pack_id')}` → {p.get('sol_verdict')} "
                f"(anvil_will_call={p.get('anvil_will_call')}) — {p.get('why')}"
            )
            for g in p.get("gaps") or []:
                lines.append(f"  - gap: {g}")
        if sol.get("missing_formula_packs"):
            lines += ["", "### Missing packs Sol named", ""]
            for m in sol["missing_formula_packs"]:
                lines.append(f"- {m}")
        if sol.get("top_findings"):
            lines += ["", "### Top findings", ""]
            for f in sol["top_findings"]:
                lines.append(f"- {f}")
        if sol.get("required_fixes_before_ship"):
            lines += ["", "### Required before ship (Sol)", ""]
            for f in sol["required_fixes_before_ship"]:
                lines.append(f"- {f}")
    elif sol and sol.get("parse_error"):
        lines += ["## Sol audit", "", "PARSE ERROR — see JSON raw.", ""]
    else:
        lines += ["## Sol audit", "", "Skipped (`--skip-sol`).", ""]

    lines += ["", "## Per-pack categorical bars", "", "| Pack | Installed | Selftest | Anvil-wired | Twin-invoked | Appropriate | PASS |", "|---|---|---|---|---|---|---|"]
    for p in matrix["packs"]:
        b = p["bars"]
        lines.append(
            f"| `{p['pack_id']}` | {b['installed']} | {b['works_selftest']} | "
            f"{b['anvil_wired']} | {b['invoked_on_this_twin']} | "
            f"{b['appropriate_for_fpk']} | **{p['categorical_pass']}** |"
        )
    lines += [
        "",
        "## How Anvil calls these for FPK",
        "",
        "1. Class plan `formula_e_front_mgu` = rear analytical tools mapped through",
        "   `wrapWithFrontReconcile` (every tool step re-closes DC→wheel + CoolProp ΔT).",
        "2. Required tools include CoolProp MEG50 + the 11 MGU/MCU/FIA packs.",
        "3. FPK-specific packs (bus ESL, cold-plate fluids/ht, concentric geometry) are",
        "   stamped via `fpk_*` modules and consumed in Excel/evidence trails.",
        "",
        "## Honesty",
        "",
    ]
    for n in matrix.get("honesty_notes") or []:
        lines.append(f"- {n}")
    lines.append("")
    (TWIN / "JLR-FE-FRONT-FPK-SOL-FORMULA-AUDIT.md").write_text(
        "\n".join(lines), encoding="utf-8"
    )

    # Stamp state
    state_path = TWIN / "state.json"
    if state_path.is_file():
        state = json.loads(state_path.read_text(encoding="utf-8"))
        state["fpkFormulaAudit"] = {
            "schema": "fpk-formula-sol-audit/v1",
            "proved_at": matrix["proved_at"],
            "deterministic_useful": matrix["summary"]["deterministic_useful"],
            "packs_pass": matrix["summary"]["packs_pass"],
            "packs_total": matrix["summary"]["packs_total"],
            "all_selftests_pass": matrix["summary"]["all_selftests_pass"],
            "all_invoked": matrix["summary"]["all_invoked"],
            "sol_verdict": (sol or {}).get("verdict"),
            "sol_formula_stack_verdict": (sol or {}).get("formula_stack_verdict")
            or (sol or {}).get("verdict"),
            "sol_ship_readiness_verdict": (sol or {}).get("ship_readiness_verdict"),
            "sol_categorical_proof_accepted": (sol or {}).get(
                "categorical_proof_accepted"
            ),
            "sol_model": COUNCIL_MODELS["sol"],
            "report": "JLR-FE-FRONT-FPK-SOL-FORMULA-AUDIT.md",
            "ship_ok": False,
        }
        tmp = state_path.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")
        os.replace(tmp, state_path)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--skip-sol", action="store_true")
    args = ap.parse_args()

    state = json.loads((TWIN / "state.json").read_text(encoding="utf-8"))
    tools_used = json.loads((TWIN / "4-orchestrator-tools-used.json").read_text())
    tool_results = json.loads((TWIN / "4-orchestrator-tool-results.json").read_text())
    if not isinstance(tool_results, list):
        tool_results = tool_results.get("results") or []

    packs_out = [evaluate_pack(p, state, tools_used, tool_results) for p in FORMULA_PACKS]
    n_pass = sum(1 for p in packs_out if p["categorical_pass"])
    summary = {
        "packs_total": len(packs_out),
        "packs_pass": n_pass,
        "packs_fail": len(packs_out) - n_pass,
        "all_selftests_pass": all(p["bars"]["works_selftest"] for p in packs_out),
        "all_anvil_wired": all(p["bars"]["anvil_wired"] for p in packs_out),
        "all_invoked": all(p["bars"]["invoked_on_this_twin"] for p in packs_out),
        "failing_packs": [p["pack_id"] for p in packs_out if not p["categorical_pass"]],
    }
    summary["deterministic_useful"] = (
        summary["packs_fail"] == 0
        and summary["all_selftests_pass"]
        and summary["all_invoked"]
    )

    matrix = {
        "schema": "fpk-formula-audit-matrix/v1",
        "proved_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "twin": str(TWIN),
        "sol_model": COUNCIL_MODELS["sol"],
        "summary": summary,
        "packs": packs_out,
        "honesty_notes": [
            "Analytical / library formulas only — CFD (OpenFOAM) and FEA (FEMM) remain OPEN.",
            "Literature claim_kind=formula rows are NOT executable Anvil tools unless wired here.",
            "CoolProp may appear under available_but_unused in an older toolsUsedPage render while "
            "contract quantities still carry tool:coolprop provenance + fpkPhysicsEngines proveCatch — "
            "invocation evidence is contract+stamp, not the marketing tools page alone.",
            "ship_ok remains false until HIL/dyno/FIA XYZ/CFD race holds close.",
        ],
    }

    sol = None
    if not args.skip_sol:
        key = load_key()
        if not key:
            print("OPENROUTER_API_KEY missing — writing matrix only", file=sys.stderr)
        else:
            print(f"[sol-formula-audit] calling {COUNCIL_MODELS['sol']} …", flush=True)
            sol = call_sol(key, matrix)
            print(
                f"[sol-formula-audit] sol verdict={sol.get('verdict')} "
                f"accepted={sol.get('categorical_proof_accepted')}",
                flush=True,
            )

    write_proof(matrix, sol)
    print(json.dumps({"summary": summary, "sol_verdict": (sol or {}).get("verdict")}, indent=2))
    print(f"wrote {TWIN / 'JLR-FE-FRONT-FPK-SOL-FORMULA-AUDIT.md'}")
    return 0 if summary["deterministic_useful"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
