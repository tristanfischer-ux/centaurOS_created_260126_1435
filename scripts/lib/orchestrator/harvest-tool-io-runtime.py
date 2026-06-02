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
    mid = re.search(r"tool_id:\s*'([^']+)'", src)
    if mscript and mid:
        file_to_id.setdefault(mscript.group(1), mid.group(1))

# ── 2. per-tool I/O ──
RESERVED = {'worked'}
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
    try:
        p = subprocess.run([PYTHON, f], input='{}', capture_output=True, text=True, timeout=40, cwd=PY_DIR)
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
