#!/usr/bin/env python3
"""
quality-scorecard.py <run_dir> [--vs <baseline_run_dir>] [--log <chain.log>]

The standing quality FLOOR. Extracts measurable quality metrics from an engine
run so a regression is impossible to miss. Tristan 2026-06-14: the engine "ratchets
down as easily as up" because no change is checked against the whole — this makes
every change comparable to the last good run on a fixed metric set.

  python quality-scorecard.py out/ras-briefexp                 # print + write scorecard.json
  python quality-scorecard.py out/ras-new --vs out/ras-briefexp # compare; FLAG any metric that dropped

Metrics (all measurable, no eyeball needed — the eyeball is still required for render
QUALITY, but these catch the quantitative regressions that kept slipping through):
  tools_selected, tools_ran, tools_ran_pct, tools_crashed   (tool layer health)
  drawings, equipment_placed                                (density)
  bom_rows, bom_rows_priced, bom_priced_pct                 (BoM richness)
  cost_raw_materials_gbp, cost_installed_gbp, cost_reconcile_ratio
  allowlist_drops                                           (real parts dropped — needs --log)

A change is ONLY acceptable if NO metric regressed (or the regression is explained).
"""
import json, os, sys, glob, re

def load(run, name):
    try:
        with open(os.path.join(run, name)) as f: return json.load(f)
    except Exception: return None

def score(run, log_path=None):
    s = {}
    # ── tool layer ───────────────────────────────────────────────────────────
    used = load(run, '4-orchestrator-tools-used.json') or {}
    results = load(run, '4-orchestrator-tool-results.json')
    res = results if isinstance(results, list) else (results or {}).get('results') or []
    s['tools_selected'] = len((used.get('tools') if isinstance(used, dict) else used) or res or [])
    ran = [t for t in res if isinstance(t, dict) and (t.get('ok') is True or t.get('worked') is True)]
    crashed = [t for t in res if isinstance(t, dict) and t.get('ok') is False]
    s['tools_ran'] = len(ran)
    s['tools_total_run'] = len(res)
    s['tools_ran_pct'] = round(100 * len(ran) / len(res), 1) if res else None
    s['tools_crashed'] = len(crashed)
    # ── density ──────────────────────────────────────────────────────────────
    s['drawings'] = len(glob.glob(os.path.join(run, 'drawings', '*.png')))
    pm = load(run, 'parts-manifest.json') or {}
    parts = pm.get('parts') if isinstance(pm, dict) else pm
    s['equipment_placed'] = len(parts) if isinstance(parts, list) else None
    # ── BoM richness ─────────────────────────────────────────────────────────
    state = load(run, 'state.json') or {}
    rb = state.get('requirementsBom')
    rows = rb if isinstance(rb, list) else []
    s['bom_rows'] = len(rows)
    def row_price(r):
        if not isinstance(r, dict): return 0
        for k in r:
            if ('cost' in k.lower() or 'price' in k.lower() or 'gbp' in k.lower()):
                v = r[k]
                if isinstance(v, (int, float)) and v > 0: return v
        return 0
    priced = [r for r in rows if row_price(r) > 0]
    s['bom_rows_priced'] = len(priced)
    s['bom_priced_pct'] = round(100 * len(priced) / len(rows), 1) if rows else None
    # ── cost ─────────────────────────────────────────────────────────────────
    cost = state.get('costStack') or {}
    rm = cost.get('raw_materials_bom_gbp')
    s['cost_raw_materials_gbp'] = round(rm) if isinstance(rm, (int, float)) else None
    inst = cost.get('installed_asp_gbp')
    s['cost_installed_gbp'] = round(inst) if isinstance(inst, (int, float)) else None
    sum_rows = sum(row_price(r) for r in rows)
    s['cost_reconcile_ratio'] = round(rm / sum_rows, 2) if (isinstance(rm, (int, float)) and sum_rows > 0) else None
    # ── allowlist drops (real parts killed) — needs the chain log ────────────
    if log_path and os.path.exists(log_path):
        txt = open(log_path, errors='ignore').read()
        s['allowlist_drops'] = txt.count('ALLOWLIST_REJECT')
        s['identity_locked_drops'] = txt.count('identity-locked')
        # The on-the-fly selection COLLAPSED to the domain-blind auto-planner
        # (garbage: airfoil/spacecraft/bicycle tools for any class). A raw
        # tools_selected COUNT can't see this — a bigger garbage plan looks like
        # "more coverage". This binary catches it. 1 = bad (do NOT trust the
        # tool list this run).
        s['used_fallback_planner'] = 1 if ('auto-planner fallback' in txt or 'UNIVERSAL_AUTO_PLAN (fallback)' in txt) else 0
    return s

# "higher is better" for all except crashes/drops/reconcile-distance-from-1
LOWER_BETTER = {'tools_crashed', 'allowlist_drops', 'identity_locked_drops', 'used_fallback_planner'}

def main():
    run = os.path.abspath(sys.argv[1])
    log = None; base = None
    if '--log' in sys.argv: log = sys.argv[sys.argv.index('--log') + 1]
    if '--vs' in sys.argv: base = os.path.abspath(sys.argv[sys.argv.index('--vs') + 1])
    if log is None:
        base = 'out-' + os.path.basename(run) + '.log'
        for cand in (os.path.join(os.path.dirname(os.path.dirname(run)), base),  # repo root: run=<repo>/out/<name>
                     os.path.join(os.getcwd(), base),
                     os.path.join(os.path.dirname(run), base)):
            if os.path.exists(cand):
                log = cand
                break
    sc = score(run, log)
    with open(os.path.join(run, 'scorecard.json'), 'w') as f: json.dump(sc, f, indent=2)
    print(f"=== SCORECARD {os.path.basename(run)} ===")
    for k, v in sc.items(): print(f"  {k:26} {v}")
    if base:
        b = score(base, None)
        print(f"\n=== vs baseline {os.path.basename(base)} (REGRESSIONS flagged) ===")
        regressions = 0
        for k, v in sc.items():
            bv = b.get(k)
            if not isinstance(v, (int, float)) or not isinstance(bv, (int, float)): continue
            if k in LOWER_BETTER:
                worse = v > bv
            elif k == 'cost_reconcile_ratio':
                worse = abs(v - 1) > abs(bv - 1) + 0.01
            else:
                worse = v < bv
            flag = '  ⚠️ REGRESSED' if worse else ''
            if worse: regressions += 1
            if v != bv or worse: print(f"  {k:26} {bv} -> {v}{flag}")
        print(f"\n{'❌ ' + str(regressions) + ' METRIC(S) REGRESSED — change NOT acceptable until fixed' if regressions else '✅ no regression'}")
        sys.exit(1 if regressions else 0)

if __name__ == '__main__':
    main()
