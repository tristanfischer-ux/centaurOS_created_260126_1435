#!/usr/bin/env bash
# verify-floor.sh — ONE command to check whether Claude's claims are true.
# Read-only. Prints git state + the LATEST FULL-RUN quality scorecard + key ledger facts.
#
# RULE OF DONE: a section is "done" ONLY when it reads >=8 on a FULL chain run here.
# An isolated frozen-state re-render does NOT count (it overstates — see mempalace
# drawer forgeos_gotchas d66c890e). Don't trust the chat; run this.
set -uo pipefail
cd "$(dirname "$0")/.."

echo "═══ GIT ═══"
echo "HEAD=$(git rev-parse --short HEAD)  origin/main=$(git rev-parse --short origin/main)  ahead/behind(origin..HEAD)=$(git rev-list --left-right --count origin/main...HEAD 2>/dev/null || echo '?')  dirty=$(git status --porcelain | wc -l | tr -d ' ')"

python3 - <<'PY'
import json, glob, os, datetime
scored=[d for d in glob.glob('out/ras-*') if os.path.isdir(d) and os.path.exists(d+'/quality-scorecard.json')]
if not scored:
    print("\nNo scored run found (out/ras-*/quality-scorecard.json)."); raise SystemExit
scored.sort(key=lambda d: os.path.getmtime(d+'/quality-scorecard.json'), reverse=True)
d=scored[0]
mt=datetime.datetime.fromtimestamp(os.path.getmtime(d+'/quality-scorecard.json'))
print(f"\n═══ LATEST SCORED RUN: {d}  ({mt:%Y-%m-%d %H:%M}) ═══")
sc=json.load(open(d+'/quality-scorecard.json'))
print(f"floor={sc.get('floor')}/10  mean={sc.get('mean')}/10  allPass={sc.get('allPass')}")
secs=sc.get('sections') if isinstance(sc.get('sections'),list) else []
seen={}
for s in secs:
    seen.setdefault(s.get('section') or s.get('name'),[]).append(s.get('score'))
for n,vs in seen.items():
    for v in vs:
        flag='OK ' if (isinstance(v,(int,float)) and v>=8) else '<8 '
        print(f"  {flag} {n}: {v}{'   [DUPLICATE KEY — scorer bug]' if len(vs)>1 else ''}")
lp=d+'/parts-ledger.json'
if os.path.exists(lp):
    L=json.load(open(lp)); cbd=L.get('coverage_by_drawing',{})
    pid=cbd.get('pid',{}) or {}; bfd=cbd.get('block-flow-diagram',{}) or {}
    print(f"\n═══ LEDGER ═══  equip={L.get('n_equipment')}  total=£{L.get('grand_total_gbp')}")
    print(f"  P&ID parts {pid.get('pct')}%  BFD {bfd.get('pct')}%  not_found={len(L.get('not_found',[]))}  orphans={len(L.get('orphan_equipment',[]))}  conns_off_pid={L.get('n_connections_off_pid')}")
PY
echo
echo "(plan + per-item status: RAS-FLOOR8-TRACKER.md  ·  a row is VERIFIED only with a run dir + SHA)"
