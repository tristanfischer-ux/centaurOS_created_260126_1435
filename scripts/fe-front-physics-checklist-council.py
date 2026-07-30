#!/usr/bin/env python3
"""INTENT: Sol + GLM-5.2 + Kimi explode the front FPK into a comprehensive
flat component → physics checklist, then merge.

Uses a FLAT row schema (survives token truncation better than deep trees).
Also salvages prior truncated nested JSON if present.

Usage:
  python3 scripts/fe-front-physics-checklist-council.py
  python3 scripts/fe-front-physics-checklist-council.py --salvage-only
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
OUT = ROOT / "out/formula-e-front-mgu-20260729-1432"
COUNCIL_DIR = OUT / "_physics_checklist_council"
from scripts.lib.council_models import (  # noqa: E402
    COUNCIL_MODELS,
    run_kimi_with_opus5_fallback,
)

MODELS = dict(COUNCIL_MODELS)  # kimi → anthropic/claude-opus-5 on fail

SYSTEM = """You are a principal Formula E / EV powertrain engineer.

Produce the MOST COMPLETE first-principles checklist for a Gen3/Gen3 Evo SPEC
FRONT powertrain kit (unitised IPMSM + SiC MCU + planetary + mini-diff),
bay ~343×259×267 mm, ~32 kg.

Return STRICT JSON only. Prefer FLAT rows (not deep nesting) so nothing truncates:

{
  "model_role": "string",
  "rows": [
    {
      "path": "mcu/sic_stack/half_bridge_u/high_side_die",
      "name": "SiC MOSFET die high-side phase U",
      "parent": "mcu/sic_stack/half_bridge_u",
      "assembly": "mcu|motor|transmission|cassette|harness|cooling|sensors|fasteners|lubrication",
      "level": 1,
      "special_manufacture": true,
      "material_grade": "4H-SiC",
      "elements": "SiC",
      "density_kg_m3": 3210,
      "manufacturing": "epitaxy + module OEM attach",
      "electrical": "Vds_max; Id; Eon/Eoff; Rds_on(Tj)",
      "magnetic": "",
      "thermal": "Tj_max; Rth_jc; loss share W",
      "fluid": "",
      "mechanical": "wirebond / sinter attach stress",
      "material_physics": "k_th; bandgap",
      "must_derive": "switching+conduction loss at I_ph,f_sw,Vdc",
      "open_until": "supplier_datasheet;double_pulse"
    }
  ],
  "global_budgets": [
    {"quantity":"V_dc","seed":"750 V","why":"FE HV bus class seed"},
    {"quantity":"I_ph_rms","seed":"~380 A","why":"from P/(√3·V·pf·η)"}
  ],
  "naive_list_misses": ["laminated bus ESL", "slot liner class", "..."],
  "derive_order": ["1. power+current+voltage budget", "2. inverter loss", "..."]
}

RULES:
- Minimum 120 rows. Cover MCU electronics deeply (every gate channel, MCU, ADC,
  isolator, DC-DC, DC-link cap, bus +/- sheets, cold-plate channels, ports),
  motor (lams, windings to copper+enamel, magnets+retention, bearings, resolver,
  jacket channels, covers), transmission (sun/planet/ring/carrier/diff/seals/oil),
  cassette, harness, fasteners, sensors, coolant.
- Covers on everything.
- Physics fields are semicolon-separated quantity lists (compact).
- Empty string if domain N/A.
- Do NOT invent FIA port XYZ mm. Lucid = FFF training check only.
- Analytical seeds OK; mark open_until for FEA/HIL/supplier.
No markdown outside JSON.
"""


def load_env() -> str:
    key = os.environ.get("OPENROUTER_API_KEY", "")
    if key:
        return key
    for env_path in (
        ROOT / ".env.local",
        ROOT / ".env",
        Path.home() / "secrets" / "openrouter.env",
    ):
        if not env_path.exists():
            continue
        for line in env_path.read_text().splitlines():
            if "OPENROUTER_API_KEY=" in line:
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit("OPENROUTER_API_KEY missing")


def _close_json(chunk: str) -> str:
    """Close unterminated string + balance brackets/braces."""
    in_s = False
    esc = False
    for ch in chunk:
        if in_s:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_s = False
            continue
        if ch == '"':
            in_s = True
    if in_s:
        chunk += '"'
    # Remove trailing incomplete key/value crumbs after last safe structural char
    chunk = re.sub(r",\s*$", "", chunk)
    chunk = re.sub(r":\s*$", ": null", chunk)
    chunk = re.sub(r",\s*\"[^\"]*$", "", chunk)
    opens_b = chunk.count("[") - chunk.count("]")
    opens = chunk.count("{") - chunk.count("}")
    chunk += "]" * max(0, opens_b) + "}" * max(0, opens)
    return chunk


def _extract_complete_objects(text: str) -> list[dict]:
    """Scan text for complete {...} JSON objects (string-aware)."""
    objs: list[dict] = []
    i = 0
    n = len(text)
    while i < n:
        if text[i] != "{":
            i += 1
            continue
        depth = 0
        in_s = False
        esc = False
        start = i
        j = i
        while j < n:
            ch = text[j]
            if in_s:
                if esc:
                    esc = False
                elif ch == "\\":
                    esc = True
                elif ch == '"':
                    in_s = False
            else:
                if ch == '"':
                    in_s = True
                elif ch == "{":
                    depth += 1
                elif ch == "}":
                    depth -= 1
                    if depth == 0:
                        chunk = text[start : j + 1]
                        try:
                            o = json.loads(chunk)
                            if isinstance(o, dict):
                                objs.append(o)
                        except json.JSONDecodeError:
                            pass
                        i = j + 1
                        break
            j += 1
        else:
            # Unclosed from this '{' (truncation) — advance and keep scanning
            # for complete nested objects that did close.
            i = start + 1
            continue
    return objs


def salvage_json_object(text: str) -> dict | None:
    """Parse JSON object; on truncation, extract complete sub-objects / close prefix."""
    if not text:
        return None
    t = text.strip()
    if t.startswith("```"):
        t = t.strip("`")
        if t.startswith("json"):
            t = t[4:].strip()
    start = t.find("{")
    if start < 0:
        return None
    t = t[start:]
    from json import JSONDecoder

    try:
        obj, _ = JSONDecoder().raw_decode(t)
        return obj
    except json.JSONDecodeError:
        pass

    # Prefer cut at last complete top-level-ish end before truncation crumb
    for marker in ('},\n            {', '},\n          {', '},\n        {', "},\n"):
        idx = t.rfind(marker)
        if idx > 1000:
            try:
                return json.loads(_close_json(t[: idx + 1]))
            except json.JSONDecodeError:
                pass

    step = max(200, len(t) // 100)
    for end in range(len(t), max(500, len(t) // 6), -step):
        try:
            return json.loads(_close_json(t[:end]))
        except json.JSONDecodeError:
            continue

    # Last resort: harvest complete objects that look like parts / rows
    harvested = _extract_complete_objects(t)
    partish = [
        o
        for o in harvested
        if o.get("id") and (o.get("physics") or o.get("children") is not None or o.get("name"))
    ]
    rowish = [o for o in harvested if o.get("path") and (o.get("electrical") is not None or o.get("name"))]
    if rowish:
        budgets = [o for o in harvested if "quantity" in o and ("seed" in o or "typical_seed" in o)]
        misses = []
        for o in harvested:
            if isinstance(o.get("naive_list_misses"), list):
                misses.extend(o["naive_list_misses"])
        return {
            "model_role": "salvaged_rows",
            "rows": rowish,
            "global_budgets": budgets,
            "naive_list_misses": misses,
            "salvaged_from_objects": True,
            "row_count": len(rowish),
        }
    if partish:
        # Group under synthetic assemblies by id prefix heuristics
        return {
            "model_role": "salvaged_nested_parts",
            "assemblies": [
                {
                    "id": "salvaged",
                    "name": "Salvaged parts from truncated council JSON",
                    "parts": partish,
                }
            ],
            "salvaged_from_objects": True,
            "leaf_count_estimate": len(partish),
        }
    return None


def nested_to_rows(obj: dict) -> list[dict]:
    """Flatten prior nested assemblies schema into flat rows."""
    rows: list[dict] = []

    def walk(parts: list, path: str, assembly: str, level: int) -> None:
        for p in parts or []:
            if not isinstance(p, dict):
                continue
            pid = str(p.get("id") or "unknown")
            full = f"{path}/{pid}" if path else pid
            mat = p.get("material") or {}
            if not isinstance(mat, dict):
                mat = {}
            phys = p.get("physics") or {}
            if not isinstance(phys, dict):
                phys = {}

            def join_dom(key: str) -> str:
                items = phys.get(key) or phys.get(
                    "manufacturing_process" if key == "manufacturing_process" else key
                ) or []
                if isinstance(items, list):
                    return "; ".join(str(x) for x in items)
                return str(items) if items else ""

            rows.append(
                {
                    "path": full,
                    "name": p.get("name") or pid,
                    "parent": path or None,
                    "assembly": assembly,
                    "level": level,
                    "special_manufacture": bool(p.get("special_manufacture")),
                    "material_grade": mat.get("grade") or "",
                    "elements": mat.get("elements") or "",
                    "density_kg_m3": mat.get("density_kg_m3"),
                    "manufacturing": p.get("manufacturing") or mat.get("notes") or "",
                    "electrical": join_dom("electrical"),
                    "magnetic": join_dom("magnetic"),
                    "thermal": join_dom("thermal"),
                    "fluid": join_dom("fluid"),
                    "mechanical": join_dom("mechanical"),
                    "material_physics": join_dom("material"),
                    "must_derive": "; ".join(
                        str(x) for x in (p.get("must_derive_before_optimise") or [])
                    ),
                    "open_until": "; ".join(str(x) for x in (p.get("open_until") or [])),
                }
            )
            walk(p.get("children") or [], full, assembly, level + 1)

    for asm in obj.get("assemblies") or []:
        if not isinstance(asm, dict):
            continue
        aid = str(asm.get("id") or "unknown")
        walk(asm.get("parts") or [], aid, aid, 1)
    return rows


def normalize_result(obj: dict) -> dict:
    """Ensure result has flat rows (+ preserve budgets/misses)."""
    if obj.get("parse_error") and obj.get("raw"):
        salvaged = salvage_json_object(str(obj["raw"]))
        if salvaged:
            obj = salvaged
        else:
            return obj
    rows = obj.get("rows")
    if not rows and obj.get("assemblies"):
        rows = nested_to_rows(obj)
        obj = {
            **obj,
            "rows": rows,
            "salvaged_from_nested": True,
            "row_count": len(rows),
        }
    if rows:
        obj["row_count"] = len(rows)
        obj.pop("parse_error", None)
        obj.pop("salvage_failed", None)
    return obj


def call_model(model: str, user: str, api_key: str) -> dict:
    body = {
        "model": model,
        "temperature": 0.15,
        "max_tokens": 16000,
        "messages": [
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": user},
        ],
    }
    req = urllib.request.Request(
        "https://openrouter.ai/api/v1/chat/completions",
        data=json.dumps(body).encode(),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://forgeos.local",
            "X-Title": "ForgeOS FE FPK Physics Checklist Council",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=420) as resp:
        data = json.loads(resp.read().decode())
    msg = data["choices"][0]["message"]
    content = msg.get("content")
    if content is None:
        content = msg.get("reasoning") or msg.get("refusal") or json.dumps(msg)
    parsed = salvage_json_object(str(content))
    if parsed is None:
        return {"raw": content, "parse_error": True, "salvage_failed": True}
    return normalize_result(parsed)


def twin_digest() -> dict:
    state_path = OUT / "state.json"
    s = json.loads(state_path.read_text()) if state_path.exists() else {}
    qs = (s.get("orchestratorContract") or {}).get("quantities") or {}
    tree = s.get("fpkPhysicsTree") or {}
    cov = tree.get("coverage") or {}
    part_ids = [p["id"] for p in (tree.get("part_index") or [])]

    def v(k: str):
        raw = qs.get(k)
        if isinstance(raw, dict):
            return raw.get("value")
        return raw

    return {
        "product": "formula_e_front_mgu / JLR FE front FPK",
        "bay_mm": "343×259×267",
        "mass_cap_kg": v("fpk_mass_cap_kg") or 32,
        "seeds_already_in_engine": {
            "v_dc_v": v("dc_bus_voltage_v"),
            "i_ph_design_a": v("phase_current_design_a"),
            "i_ph_rms_a": v("ac_rms_current_a"),
            "p_kw": v("continuous_power_kw"),
            "inv_loss_kw": v("inverter_dissipated_kw"),
            "cu_loss_w": v("mgu_copper_loss_w"),
            "turns_per_phase": v("turns_per_phase"),
            "dc_link_uf": v("dc_link_capacitance_uf"),
            "coolant_lpm": v("coolant_flow_l_min"),
            "n_rpm": v("mgu_base_speed_rpm"),
            "gear_ratio": v("gear_ratio"),
            "gate_drive_channels_required": v("gate_drive_channels_required"),
            "physics_tree_nodes": cov.get("node_count"),
            "physics_tree_leaves": cov.get("leaf_count"),
        },
        "engine_tree_ids": part_ids,
        "honesty": [
            "Analytical seeds only — not FEA/HIL/FIA homologated",
            "Forge PCB implements 0/6 gate channels today",
            "Do NOT invent FIA port XYZ millimetres",
            "Lucid/Atieva = form-follows-function training check only",
        ],
        "ask": (
            "Expand FAR beyond the engine tree. Flat rows, ≥120, recursive depth "
            "encoded in path. Every physics domain that applies."
        ),
    }


def merge_lists(results: dict[str, dict]) -> dict:
    by_path: dict[str, dict] = {}
    misses: list[str] = []
    order: list[str] = []
    budgets: list[dict] = []

    for model, obj in results.items():
        if obj.get("parse_error"):
            continue
        for row in obj.get("rows") or []:
            if not isinstance(row, dict):
                continue
            path = str(row.get("path") or row.get("id") or "").strip().lower()
            if not path:
                continue
            if path not in by_path:
                by_path[path] = {**row, "path": path, "sources": [model]}
            else:
                cur = by_path[path]
                cur["sources"] = sorted(set(cur.get("sources", []) + [model]))
                for k in (
                    "electrical",
                    "magnetic",
                    "thermal",
                    "fluid",
                    "mechanical",
                    "material_physics",
                    "must_derive",
                    "open_until",
                    "manufacturing",
                    "material_grade",
                    "elements",
                ):
                    a = str(cur.get(k) or "").strip()
                    b = str(row.get(k) or "").strip()
                    if b and b not in a:
                        cur[k] = f"{a}; {b}".strip("; ").strip()
                if row.get("density_kg_m3") and not cur.get("density_kg_m3"):
                    cur["density_kg_m3"] = row.get("density_kg_m3")
                if row.get("special_manufacture"):
                    cur["special_manufacture"] = True
        misses.extend(obj.get("naive_list_misses") or obj.get("missing_from_naive_mcu_shelf_list") or [])
        order.extend(obj.get("derive_order") or obj.get("top_priority_derive_order") or [])
        budgets.extend(obj.get("global_budgets") or obj.get("global_physics_budgets") or [])

    def uniq(xs: list) -> list:
        seen = set()
        out = []
        for x in xs:
            k = str(x).strip().lower()
            if not k or k in seen:
                continue
            seen.add(k)
            out.append(x if not isinstance(x, str) else x.strip())
        return out

    parts = sorted(by_path.values(), key=lambda r: r["path"])
    for r in parts:
        # physics item score = non-empty domains
        r["physics_domain_count"] = sum(
            1
            for k in (
                "electrical",
                "magnetic",
                "thermal",
                "fluid",
                "mechanical",
                "material_physics",
            )
            if str(r.get(k) or "").strip()
        )

    return {
        "merged_at": datetime.now(ZoneInfo("Europe/London")).isoformat(timespec="seconds"),
        "models_ok": [m for m, o in results.items() if not o.get("parse_error")],
        "models_failed": [m for m, o in results.items() if o.get("parse_error")],
        "unique_part_paths": len(parts),
        "parts": parts,
        "consensus_parts": [r for r in parts if len(r.get("sources") or []) >= 2],
        "solo_parts": [r for r in parts if len(r.get("sources") or []) == 1],
        "naive_list_misses": uniq([str(x) for x in misses]),
        "derive_order": uniq([str(x) for x in order])[:50],
        "global_budgets": budgets,
    }


def gap_vs_engine(merged: dict) -> dict:
    state_path = OUT / "state.json"
    if not state_path.exists():
        return {}
    s = json.loads(state_path.read_text())
    engine_ids = {
        p["id"].lower()
        for p in ((s.get("fpkPhysicsTree") or {}).get("part_index") or [])
    }
    council_leaf_ids = set()
    for r in merged["parts"]:
        council_leaf_ids.add(r["path"].split("/")[-1].lower())
    missing = sorted(council_leaf_ids - engine_ids)
    return {
        "engine_node_count": len(engine_ids),
        "council_leaf_ids": len(council_leaf_ids),
        "not_in_engine_count": len(missing),
        "not_in_engine_sample": missing[:250],
    }


def render_md(merged: dict, results: dict[str, dict]) -> str:
    lines = [
        "# Front FPK — Comprehensive component + physics checklist (Sol + GLM + Kimi)",
        "",
        f"**Merged:** {merged['merged_at']}",
        f"**Models OK:** {', '.join(merged.get('models_ok') or []) or '—'}  |  "
        f"**Failed:** {', '.join(merged.get('models_failed') or []) or '—'}",
        f"**Unique paths:** {merged['unique_part_paths']}  |  "
        f"**Consensus (≥2):** {len(merged['consensus_parts'])}  |  "
        f"**Solo:** {len(merged['solo_parts'])}",
        "",
        "## Method",
        "",
        "Three models (Sol, GLM-5.2, Kimi) independently listed every FPK part with",
        "first-principles physics domains. Paths union-merged; physics fields concatenated.",
        "Checklist ≠ homologation. Seeds ≠ FEA ≠ FIA.",
        "",
        "## Global physics budgets",
        "",
    ]
    for b in merged.get("global_budgets") or []:
        if isinstance(b, dict):
            q = b.get("quantity") or b.get("q")
            seed = b.get("seed") or b.get("typical_seed")
            why = b.get("why") or ""
            lines.append(f"- **{q}**: `{seed}` — {why}")
    lines.extend(["", "## Derive order (priority)", ""])
    for i, p in enumerate(merged.get("derive_order") or [], 1):
        lines.append(f"{i}. {p}")
    lines.extend(["", "## Naive MCU-shelf list misses", ""])
    for m in merged.get("naive_list_misses") or []:
        lines.append(f"- {m}")

    gaps = merged.get("gap_vs_engine") or {}
    if gaps:
        lines.extend(
            [
                "",
                "## Gap vs engine `fpkPhysicsTree`",
                "",
                f"- Engine nodes: {gaps.get('engine_node_count')}",
                f"- Council leaf ids: {gaps.get('council_leaf_ids')}",
                f"- Council leaves not in engine: **{gaps.get('not_in_engine_count')}**",
                "",
                "<details><summary>Sample missing ids</summary>",
                "",
                "```",
                ", ".join(gaps.get("not_in_engine_sample") or [])[:3000],
                "```",
                "",
                "</details>",
            ]
        )

    lines.extend(
        [
            "",
            "## Full merged checklist",
            "",
            "| Path | Src | Spec | Domains | Material | Must derive | OPEN |",
            "|---|---|---|---:|---|---|---|",
        ]
    )
    for r in merged["parts"]:
        mat = r.get("material_grade") or r.get("elements") or "—"
        lines.append(
            f"| `{r['path']}` | {','.join(r.get('sources') or [])} | "
            f"{'Y' if r.get('special_manufacture') else ''} | "
            f"{r.get('physics_domain_count', 0)} | {mat} | "
            f"{(r.get('must_derive') or '—')[:80]} | "
            f"{(r.get('open_until') or '—')[:60]} |"
        )

    lines.extend(["", "## Physics detail (rich rows)", ""])
    rich = sorted(
        merged["parts"],
        key=lambda r: (-(r.get("physics_domain_count") or 0), r["path"]),
    )
    for r in rich:
        if (r.get("physics_domain_count") or 0) < 2:
            continue
        lines.append(f"### `{r['path']}` — {r.get('name')}")
        if r.get("manufacturing"):
            lines.append(f"- **Manufacturing:** {r['manufacturing']}")
        if r.get("density_kg_m3"):
            lines.append(
                f"- **Density:** {r['density_kg_m3']} kg/m³"
                f" ({r.get('elements') or r.get('material_grade') or ''})"
            )
        for lab, key in (
            ("Electrical", "electrical"),
            ("Magnetic", "magnetic"),
            ("Thermal", "thermal"),
            ("Fluid", "fluid"),
            ("Mechanical", "mechanical"),
            ("Material physics", "material_physics"),
        ):
            val = str(r.get(key) or "").strip()
            if val:
                lines.append(f"- **{lab}:** {val}")
        if r.get("must_derive"):
            lines.append(f"- **Must derive:** {r['must_derive']}")
        if r.get("open_until"):
            lines.append(f"- **OPEN:** {r['open_until']}")
        lines.append("")

    lines.extend(["", "## Per-model status", ""])
    for mid, obj in results.items():
        if obj.get("parse_error"):
            lines.append(f"- `{mid}`: PARSE ERROR")
        else:
            lines.append(
                f"- `{mid}`: rows={obj.get('row_count') or len(obj.get('rows') or [])}"
                f"{' (salvaged nested)' if obj.get('salvaged_from_nested') else ''}"
            )
    lines.append("")
    return "\n".join(lines)


def salvage_existing() -> dict[str, dict]:
    results: dict[str, dict] = {}
    for name in MODELS:
        path = COUNCIL_DIR / f"{name}.json"
        if not path.exists():
            continue
        raw_obj = json.loads(path.read_text())
        results[name] = normalize_result(raw_obj)
        # rewrite cleaned
        path.write_text(json.dumps(results[name], indent=2) + "\n")
        print(
            f"[salvage] {name}: parse_error={results[name].get('parse_error')} "
            f"rows={results[name].get('row_count') or len(results[name].get('rows') or [])}"
        )
    return results


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--salvage-only", action="store_true")
    ap.add_argument("--skip-models", default="", help="comma names to skip")
    args = ap.parse_args()
    COUNCIL_DIR.mkdir(parents=True, exist_ok=True)

    results: dict[str, dict] = {}
    if args.salvage_only:
        results = salvage_existing()
    else:
        # salvage any prior first
        prior = salvage_existing()
        api_key = load_env()
        digest = twin_digest()
        (COUNCIL_DIR / "digest.json").write_text(json.dumps(digest, indent=2) + "\n")
        user = (
            "Emit the flat-row comprehensive FPK checklist now (≥120 rows).\n\n"
            f"CONTEXT:\n{json.dumps(digest, indent=2)}\n"
        )
        skip = {x.strip() for x in args.skip_models.split(",") if x.strip()}

        def run_one(name: str, model: str) -> tuple[str, dict]:
            print(f"[council] calling {name} ({model}) …", flush=True)
            try:
                obj = call_model(model, user, api_key)
            except Exception as e:
                obj = {"parse_error": True, "error": str(e)}
            return name, obj

        def run_kimi_seat() -> tuple[str, dict]:
            def _call(n: str, m: str) -> dict:
                try:
                    return call_model(m, user, api_key)
                except Exception as e:
                    return {"parse_error": True, "error": str(e)}

            seat, _mid, obj = run_kimi_with_opus5_fallback(_call)
            return seat, obj

        with ThreadPoolExecutor(max_workers=3) as ex:
            futs = []
            for n, m in MODELS.items():
                if n in skip:
                    continue
                if n == "kimi":
                    futs.append(ex.submit(run_kimi_seat))
                else:
                    futs.append(ex.submit(run_one, n, m))
            for fut in as_completed(futs):
                name, obj = fut.result()
                results[name] = obj
                (COUNCIL_DIR / f"{name}.json").write_text(
                    json.dumps(obj, indent=2) + "\n"
                )
                print(
                    f"[council] {name}: "
                    f"{'FAIL' if obj.get('parse_error') else 'OK'} "
                    f"rows={obj.get('row_count') or len(obj.get('rows') or [])}",
                    flush=True,
                )
        # keep prior salvage if a model failed this round
        for name, obj in prior.items():
            if name not in results or results[name].get("parse_error"):
                if not obj.get("parse_error") and (obj.get("rows") or obj.get("assemblies")):
                    print(f"[council] keeping prior salvage for {name}", flush=True)
                    results[name] = obj

    merged = merge_lists(results)
    merged["gap_vs_engine"] = gap_vs_engine(merged)
    (COUNCIL_DIR / "merged.json").write_text(json.dumps(merged, indent=2) + "\n")
    md = render_md(merged, results)
    md_path = OUT / "JLR-FE-FRONT-FPK-COMPREHENSIVE-CHECKLIST.md"
    md_path.write_text(md)
    (COUNCIL_DIR / "COMPREHENSIVE-CHECKLIST.md").write_text(md)
    print(
        f"[council] merged paths={merged['unique_part_paths']} "
        f"consensus={len(merged['consensus_parts'])} "
        f"engine_gaps={merged['gap_vs_engine'].get('not_in_engine_count')}\n"
        f"[council] wrote {md_path}"
    )
    return 0 if merged["unique_part_paths"] > 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
