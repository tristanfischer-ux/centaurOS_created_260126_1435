#!/usr/bin/env python3
"""enrich-component-engineering.py <run_dir>

Writes the deterministic component-engineering data — per-part connectivity + governance
+ per-component physics + holistic system balances — into state.componentEngineering,
using the SHARED component_engineering module (the SAME code the run dashboard renders).
So the dossier carries exactly what the dashboard shows: ONE source of truth (#138).

Idempotent, deterministic, no LLM. The chain calls this after the BoM + Blender artifacts
exist (requirementsBom in state, route/parts/connection manifests in the run dir).
"""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from component_engineering import build_connectivity, system_balances

run = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else '.')


def _load(n, d=None):
    try:
        with open(os.path.join(run, n)) as f:
            return json.load(f)
    except Exception:
        return d


state = _load('state.json', {}) or {}
req_bom = state.get('requirementsBom') or []
tools = (_load('4-orchestrator-tools-used.json', {}) or {}).get('tools') or []
quantities = (_load('0.5-engineering-contract.json', {}) or {}).get('quantities') or {}

parts, edges = build_connectivity(run, req_bom, tools)
balances = system_balances(quantities)


compact = []
for p in parts:
    compact.append({
        'name': p['name'], 'tag': p.get('tag'), 'module': p.get('module'),
        'function': p.get('function'), 'governing_tool': p.get('governing_tool'),
        'spec': p.get('spec'), 'checks': p.get('checks'), 'missing': p.get('missing'),
        'orphan': p.get('orphan'),
        'incoming': [{'from': e['from'], 'service': e['service'], 'size': e['size'], 'length_m': e['length_m']} for e in p.get('incoming', [])],
        'outgoing': [{'to': e['to'], 'service': e['service'], 'size': e['size'], 'length_m': e['length_m']} for e in p.get('outgoing', [])],
    })

orphans = [p['name'] for p in parts if p.get('orphan')]
ungoverned = [p['name'] for p in parts if not (p.get('checks') or {}).get('governed')]
missing = [{'part': p['name'], 'missing': p['missing']} for p in parts if p.get('missing')]

state['componentEngineering'] = {
    'parts': compact,
    'balances': [{'resource': n, 'items': [{'key': k, 'value': v, 'unit': u} for k, v, u in it], 'closure': note}
                 for n, it, note in balances],
    'summary': {
        'part_count': len(parts), 'connection_count': len(edges),
        'orphan_count': len(orphans), 'orphans': orphans,
        'ungoverned_count': len(ungoverned), 'ungoverned': ungoverned,
        'missing_connections': missing,
    },
}
with open(os.path.join(run, 'state.json'), 'w') as f:
    json.dump(state, f)
print(f"[enrich] componentEngineering: {len(parts)} parts · {len(edges)} connections · "
      f"{len(orphans)} orphans · {len(ungoverned)} ungoverned · {len(balances)} balances")
