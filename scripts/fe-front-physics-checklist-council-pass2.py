#!/usr/bin/env python3
"""Pass-2 council: retry Kimi + fill thin assemblies (TX / fasteners / sensors).

Merges into existing _physics_checklist_council/merged.json and rewrites the
comprehensive checklist markdown.
"""
from __future__ import annotations

import importlib.util
import json
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
SPEC = importlib.util.spec_from_file_location(
    "council", ROOT / "scripts/fe-front-physics-checklist-council.py"
)
C = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(C)

OUT = C.OUT
COUNCIL_DIR = C.COUNCIL_DIR
MODELS = C.MODELS

PASS2_SYSTEM = """You are a principal FE powertrain engineer. Output ONLY a JSON object.
No prose, no markdown, no planning. First character must be {.

Schema:
{
  "rows": [ {
    "path": "transmission/sun_gear/tooth_flank",
    "name": "...",
    "parent": "transmission/sun_gear",
    "assembly": "transmission|fasteners|sensors|lubrication|harness|motor|mcu|cassette|cooling",
    "level": 2,
    "special_manufacture": true,
    "material_grade": "...",
    "elements": "...",
    "density_kg_m3": 7850,
    "manufacturing": "...",
    "electrical": "qty; qty",
    "magnetic": "",
    "thermal": "...",
    "fluid": "...",
    "mechanical": "...",
    "material_physics": "...",
    "must_derive": "...",
    "open_until": "..."
  } ],
  "global_budgets": [{"quantity":"...","seed":"...","why":"..."}],
  "naive_list_misses": ["..."],
  "derive_order": ["1. ...", "2. ..."]
}

FOCUS THIS PASS (be exhaustive, ≥80 rows):
1) transmission — gearbox housing/cover, sun/planet/ring, carrier pins, needle bearings,
   thrust washers, mini-diff (carrier, side gears, pinion/spider, cross-pin), intermediate
   shaft, output shafts L/R, seals, baffles, oil pickup, magnets for speed if any
2) fasteners — M-class bolts for housing/cover/busbar/module/cold-plate, washers,
   threadlocker, helicoils, dowels, spring washers, torque classes
3) sensors — resolver, encoder/tone wheel, NTC winding, NTC coolant in/out, HVIL,
   DC-link voltage sense, phase current sensors×3, PCB temp
4) lubrication — gear oil grade, volume, additives, splash vs jet, drain/fill/breather
5) harness — HV DC, AC pierce, LV signal, shield drain, braid, grommets

Also add anything critical missing from a naive MCU shelf. Physics on every row.
"""


def call_pass2(model: str, api_key: str, focus: str) -> dict:
    user = (
        f"FOCUS={focus}. Emit JSON now. ≥80 rows. First char {{.\n"
        f"ENGINE CONTEXT:\n{json.dumps(C.twin_digest(), indent=2)}\n"
    )
    body = {
        "model": model,
        "temperature": 0.1,
        "max_tokens": 16000,
        "messages": [
            {"role": "system", "content": PASS2_SYSTEM},
            {"role": "user", "content": user},
        ],
    }
    import urllib.request

    req = urllib.request.Request(
        "https://openrouter.ai/api/v1/chat/completions",
        data=json.dumps(body).encode(),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://forgeos.local",
            "X-Title": "ForgeOS FE FPK Checklist Pass2",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=420) as resp:
        data = json.loads(resp.read().decode())
    msg = data["choices"][0]["message"]
    content = msg.get("content")
    if content is None:
        content = msg.get("reasoning") or ""
    parsed = C.salvage_json_object(str(content))
    if parsed is None:
        return {"raw": content, "parse_error": True, "salvage_failed": True}
    return C.normalize_result(parsed)


def main() -> int:
    api_key = C.load_env()
    COUNCIL_DIR.mkdir(parents=True, exist_ok=True)

    # Load pass1 results
    results: dict[str, dict] = {}
    for name in MODELS:
        p = COUNCIL_DIR / f"{name}.json"
        if p.exists():
            results[name] = C.normalize_result(json.loads(p.read_text()))

    pass2: dict[str, dict] = {}

    def run(name: str, model: str) -> tuple[str, dict]:
        focus = (
            "FULL thin assemblies + Kimi must emit JSON only"
            if name == "kimi"
            else "thin assemblies TX/fasteners/sensors/lube/harness"
        )
        print(f"[pass2] calling {name} …", flush=True)
        try:
            obj = call_pass2(model, api_key, focus)
        except Exception as e:
            obj = {"parse_error": True, "error": str(e)}
        return name, obj

    with ThreadPoolExecutor(max_workers=3) as ex:
        futs = [ex.submit(run, n, m) for n, m in MODELS.items()]
        for fut in as_completed(futs):
            name, obj = fut.result()
            pass2[name] = obj
            (COUNCIL_DIR / f"{name}_pass2.json").write_text(
                json.dumps(obj, indent=2) + "\n"
            )
            print(
                f"[pass2] {name}: "
                f"{'FAIL' if obj.get('parse_error') else 'OK'} "
                f"rows={obj.get('row_count') or len(obj.get('rows') or [])}",
                flush=True,
            )

    # Combine pass1 + pass2 rows per model
    combined: dict[str, dict] = {}
    for name in MODELS:
        rows = []
        for src in (results.get(name), pass2.get(name)):
            if not src or src.get("parse_error"):
                continue
            rows.extend(src.get("rows") or [])
        # de-dupe by path within model
        by = {}
        for r in rows:
            if not isinstance(r, dict):
                continue
            path = str(r.get("path") or "").strip().lower()
            if not path:
                continue
            # normalize: ensure assembly prefix
            asm = str(r.get("assembly") or "").strip().lower()
            if asm and not path.startswith(asm + "/") and path != asm:
                if "/" not in path:
                    path = f"{asm}/{path}"
                    r = {**r, "path": path}
            by[path] = {**r, "path": path}
        budgets = []
        misses = []
        order = []
        for src in (results.get(name), pass2.get(name)):
            if not src or src.get("parse_error"):
                continue
            budgets.extend(src.get("global_budgets") or [])
            misses.extend(src.get("naive_list_misses") or [])
            order.extend(src.get("derive_order") or [])
        combined[name] = {
            "model_role": f"{name}_pass1+pass2",
            "rows": list(by.values()),
            "row_count": len(by),
            "global_budgets": budgets,
            "naive_list_misses": misses,
            "derive_order": order,
        }
        (COUNCIL_DIR / f"{name}_combined.json").write_text(
            json.dumps(combined[name], indent=2) + "\n"
        )
        print(f"[pass2] combined {name}: {len(by)} rows", flush=True)

    merged = C.merge_lists(combined)
    merged["gap_vs_engine"] = C.gap_vs_engine(merged)
    (COUNCIL_DIR / "merged.json").write_text(json.dumps(merged, indent=2) + "\n")
    md = C.render_md(merged, combined)
    md_path = OUT / "JLR-FE-FRONT-FPK-COMPREHENSIVE-CHECKLIST.md"
    md_path.write_text(md)
    (COUNCIL_DIR / "COMPREHENSIVE-CHECKLIST.md").write_text(md)

    # short executive index
    from collections import Counter

    c = Counter(r.get("assembly") for r in merged["parts"])
    idx = [
        "# Front FPK checklist — executive index",
        "",
        f"**Unique paths:** {merged['unique_part_paths']}",
        f"**Consensus (≥2 models):** {len(merged['consensus_parts'])}",
        f"**Models:** {', '.join(merged.get('models_ok') or [])}",
        "",
        "## Counts by assembly",
        "",
    ]
    for k, v in c.most_common():
        idx.append(f"- `{k}`: {v}")
    idx.extend(["", "## Derive order", ""])
    for i, p in enumerate(merged.get("derive_order") or [], 1):
        idx.append(f"{i}. {p}")
    idx.extend(["", "## Naive-list misses", ""])
    for m_ in merged.get("naive_list_misses") or []:
        idx.append(f"- {m_}")
    idx.extend(
        [
            "",
            f"Full table: `{md_path.name}`",
            f"Machine JSON: `_physics_checklist_council/merged.json`",
            "",
        ]
    )
    idx_path = OUT / "JLR-FE-FRONT-FPK-CHECKLIST-INDEX.md"
    idx_path.write_text("\n".join(idx))

    print(
        f"[pass2] DONE paths={merged['unique_part_paths']} "
        f"consensus={len(merged['consensus_parts'])} "
        f"by_asm={dict(c)} → {md_path}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
