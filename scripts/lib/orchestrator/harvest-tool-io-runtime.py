#!/usr/bin/env python3
"""Runtime tool-I/O harvester — produces a COMPLETE tool-io manifest for the auto-planner.

WHY (2026-06-02, the auto-tool-picker keystone): composeToolGraph() picks tools + run order
from the brief by backward-chaining on each tool's input_keys/output_keys. But the existing
manifest is scraped from the 35 hand-written class-plans (harvest-tool-io.ts) and covers only
~30% of tools — most have EMPTY keys, so the planner is blind to them and cannot wire a graph
for an unseen concept. The tools, however, ALREADY declare their I/O implicitly: outputs = the
keys they return, inputs = their payload.get("...") calls. This harvests that ground truth by
running + parsing each tool, giving the planner a complete, accurate, drift-free manifest.

  outputs = keys the tool RETURNS that it did not merely echo from its inputs (its genuine
            production), observed by running the tool with {} defaults via the repo .venv
            python (which has pandapower/qutip/coolprop/... so lib-backed tools run too);
  inputs  = the payload.get("KEY"...) keys parsed from the tool source.

tool_id <-> .py mapping is parsed from the TS wrappers (tools/*.ts: PYTHON_SCRIPT basename +
tool_id). Tools that need a non-empty input (error/empty on {}) fall back to source-parsing the
returned-dict literal keys, and are listed so they can be checked.

Usage: python3 scripts/lib/orchestrator/harvest-tool-io-runtime.py [--out=path.json]
"""
import json, subprocess, re, os, glob, sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
PY_DIR = os.path.join(HERE, 'tools', 'python')
WRAP_DIR = os.path.join(HERE, 'tools')
VENV = os.path.join(REPO, '.venv', 'bin', 'python3')
PYTHON = VENV if os.path.exists(VENV) else 'python3'
OUT = next((a.split('=', 1)[1] for a in sys.argv[1:] if a.startswith('--out=')), '/tmp/tool-io-complete.json')

# ── 1. wrapper map: .py basename -> tool_id (from tools/*.ts) ──
file_to_id = {}
for wf in glob.glob(os.path.join(WRAP_DIR, '*.ts')):
    src = open(wf).read()
    mscript = re.search(r"'python',\s*'([a-z0-9_]+\.py)'", src)
    # Wrappers declare their id three ways: `tool_id: '...'` literal (older
    # gen), `const TOOL_ID = '...'` (newer gen, provenance uses the const), or
    # a bare `id: '...'` on the Tool object. Try in that order.
    mid = (re.search(r"tool_id:\s*'([^']+)'", src)
           or re.search(r"TOOL_ID\s*=\s*'([^']+)'", src)
           or re.search(r"\bid:\s*'([^']+)'", src))
    if mscript and mid:
        file_to_id.setdefault(mscript.group(1), mid.group(1))

# ── 2. per-tool I/O ──
RESERVED = {'worked', 'error', 'notes'}

# Minimal VALID seed payloads for tools that error on `{}` (so they run live
# instead of falling back to source-parse, whose regex over-collects nested
# dict-literal keys — e.g. coolprop's fluid table). Field names verified
# against each wrapper's payload.get() calls (E0 backfill, 2026-06-10).
SEED_PAYLOADS = {
    'coolprop_run.py': {'fluid': 'r290'},
    'regulatory_certification_cost.py': {'product_class': 'bess', 'region': 'UK'},
    'tsiolkovsky_delta_v.py': {'propellant_mass_kg': 50},
    'supply_chain_risk.py': {'bom_parts': [{'part_id': 'p1', 'manufacturer': 'X', 'manufacturer_country': 'CN', 'unit_cost_gbp': 10, 'quantity': 2}]},
    'transport_logistics.py': {'product_dimensions_mm': {'l': 1000, 'w': 800, 'h': 600}, 'product_mass_kg': 100},
    # e-fuel / CO₂ process-plant tools (added with the rest of E0, 2026-06-10):
    'absorption_column_htu_ntu.py': {'gas_flow_kg_h': 10000, 'gas_density_kg_m3': 1.2, 'liquid_flow_kg_h': 30000, 'liquid_density_kg_m3': 1000},
    'bagging_throughput_sizing.py': {'product_mass_rate_t_day': 100},
    'crystalliser_evaporator_sizing.py': {'solute_mass_rate_kg_h': 500, 'feed_solute_concentration_g_l': 200},
    'dryer_thermal_sizing.py': {'wet_solids_kg_h': 1000},
    'electrical_cable_sizing.py': {'load_kw': 100, 'voltage_v': 400},
    'electrical_transformer_sizing.py': {'plant_load_kw': 500},
    'fired_heater_sizing.py': {'mass_flow_kg_h': 1000, 't_in_k': 400, 't_out_k': 700},
    'flare_thermal_oxidiser.py': {'purge_flow_kg_h': 100},
    'flash_separation_sizing.py': {'vapour_flow_kg_h': 1000, 'liquid_hc_flow_kg_h': 2000, 'p_bar': 10, 't_k': 320},
    'gas_compressor_sizing.py': {'mass_flow_kg_h': 1000, 'p_in_bar': 1, 'p_out_bar': 10, 'mol_weight': 28},
    'reaction_feasibility_gibbs.py': {'species': [{'name': 'CO2', 'coeff': -1, 'phase': 'g'}, {'name': 'H2', 'coeff': -1, 'phase': 'g'}, {'name': 'CO', 'coeff': 1, 'phase': 'g'}, {'name': 'H2O', 'coeff': 1, 'phase': 'g'}]},
    'reaction_stoichiometry_balance.py': {'species': [{'name': 'CO2', 'coeff': -1}, {'name': 'H2', 'coeff': -1}, {'name': 'CO', 'coeff': 1}, {'name': 'H2O', 'coeff': 1}], 'basis': {'species': 'CO2', 'rate': 100, 'unit': 't/day', 'is_mass': True}},
    'reactor_cstr_pfr_sizing.py': {'volumetric_flow_m3_h': 10, 'residence_time_h': 2},
    'steam_generator_sizing.py': {'exotherm_duty_kw': 1000},
    'storage_tank_liquid_fuel.py': {'daily_production_m3': 50},
}
def source_return_keys(src):
    # fallback: keys in the returned dict literal  (   "key":  /  'key':  )
    body = src
    m = re.search(r'\breturn\s*\{', src)
    if m:
        body = src[m.end():]
    return sorted(set(re.findall(r'["\']([a-z][a-z0-9_]+)["\']\s*:', body)))

manifest = {}
ran, fellback, unmapped = 0, [], []
for f in sorted(glob.glob(os.path.join(PY_DIR, '*.py'))):
    base = os.path.basename(f)
    if base == '_worked.py':
        continue
    tid = file_to_id.get(base)
    if not tid:
        unmapped.append(base); continue
    src = open(f).read()
    inputs = sorted(set(re.findall(r'payload\.get\(\s*["\']([a-z0-9_]+)["\']', src)))
    outputs, source = [], 'run'
    seed = json.dumps(SEED_PAYLOADS.get(base, {}))
    try:
        p = subprocess.run([PYTHON, f], input=seed, capture_output=True, text=True, timeout=40, cwd=PY_DIR)
        d = json.loads(p.stdout)
        if isinstance(d, dict) and 'error' not in d:
            outputs = sorted(k for k in d.keys() if not k.startswith('_') and k not in RESERVED)
            ran += 1
        else:
            raise ValueError(d.get('error', 'no dict'))
    except Exception:
        outputs = [k for k in source_return_keys(src) if not k.startswith('_') and k not in RESERVED]
        source = 'source-parse'
        fellback.append(base)
    # genuine production = returned keys that are not merely echoed inputs
    produced = sorted(k for k in outputs if k not in set(inputs))
    manifest[tid] = {
        'input_keys': inputs,
        'output_keys': produced,
        'py_file': base,
        'io_source': source,
    }

with open(OUT, 'w') as fh:
    json.dump(dict(sorted(manifest.items())), fh, indent=2)

ids = list(manifest)
with_out = [i for i in ids if manifest[i]['output_keys']]
with_in = [i for i in ids if manifest[i]['input_keys']]
empty = [i for i in ids if not manifest[i]['output_keys'] and not manifest[i]['input_keys']]
print(f"[harvest-runtime] python: {PYTHON}{'  (.venv present)' if PYTHON==VENV else '  (.venv MISSING — system python; lib tools fell back to source-parse)'}")
print(f"[harvest-runtime] {len(ids)} tools mapped · ran live: {ran} · source-parse fallback: {len(fellback)}")
print(f"[harvest-runtime] with output_keys: {len(with_out)}/{len(ids)} ({100*len(with_out)//max(len(ids),1)}%) · with input_keys: {len(with_in)}/{len(ids)}")
print(f"[harvest-runtime] still EMPTY (no I/O): {len(empty)}{': '+', '.join(empty) if empty else ''}")
if fellback: print(f"[harvest-runtime] source-parse fallback (verify with a real input): {', '.join(sorted(fellback))}")
if unmapped: print(f"[harvest-runtime] .py with no wrapper tool_id ({len(unmapped)}): {', '.join(unmapped[:20])}")
print(f"[harvest-runtime] -> {OUT}")
