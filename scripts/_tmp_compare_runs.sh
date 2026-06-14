#!/usr/bin/env bash
# Side-by-side determinism + correctness verification for two RAS runs.
# Usage: bash scripts/_tmp_compare_runs.sh <run1_dir> <run2_dir> <run1_log> <run2_log>
set -u
R1="$1"; R2="$2"; L1="$3"; L2="$4"
PY=.venv/bin/python3
echo "######################## RUN 1 = $R1 | RUN 2 = $R2 ########################"
for pair in "$R1|$L1|RUN1" "$R2|$L2|RUN2"; do
  D="${pair%%|*}"; rest="${pair#*|}"; LG="${rest%%|*}"; TAG="${rest##*|}"
  echo ""
  echo "================= $TAG ($D) ================="
  echo "--- scorecard (used_fallback_planner is the KEY metric) ---"
  $PY scripts/quality-scorecard.py "$D" --log "$LG" 2>/dev/null | grep -E "used_fallback_planner|tools_selected|tools_ran |tools_crashed" || echo "(scorecard failed — run dir missing?)"
done
echo ""
echo "================= SELECTED TOOL IDS (the determinism proof) ================="
$PY - "$R1" "$R2" <<'PYEOF'
import json, sys, os
def tools(d):
    p = os.path.join(d, '4-orchestrator-tools-used.json')
    try:
        j = json.load(open(p))
        return [t['tool_id'] for t in j.get('tools', [])]
    except Exception as e:
        return None
r1, r2 = sys.argv[1], sys.argv[2]
t1, t2 = tools(r1), tools(r2)
if t1 is None or t2 is None:
    print(f"MISSING tools file: run1={'ok' if t1 else 'MISSING'} run2={'ok' if t2 else 'MISSING'}")
    sys.exit(2)
w = max((len(x) for x in t1+t2), default=10) + 2
print(f"{'RUN 1 ('+str(len(t1))+' tools)':<{w}} | RUN 2 ("+str(len(t2))+" tools)")
print("-"*w + "-+-" + "-"*w)
for a, b in zip(t1, t2):
    mark = "" if a == b else "   <-- DIFF"
    print(f"{a:<{w}} | {b}{mark}")
if len(t1) != len(t2):
    print(f"\n!! LENGTH DIFFERS: {len(t1)} vs {len(t2)}")
identical = (t1 == t2)
print("\n=> TOOL LISTS IDENTICAL:", identical)
# RAS-correctness: must contain RAS tools, must NOT contain garbage
garbage = [t for t in t1 if any(g in t.lower() for g in ('airfoil','aero','auv','hydro','bicycle','gear','spacecraft','electrolyser','pem'))]
ras_markers = [t for t in t1 if any(g in t.lower() for g in ('degasser','mbbr','oxygen','drum','microscreen','pump','electrical','ras','biofilter','metabol','transformer','cable'))]
print("=> RUN1 GARBAGE tools (should be EMPTY):", garbage)
print("=> RUN1 RAS-correct markers:", ras_markers)
ok = identical and not garbage and len(ras_markers) >= 4
print("\n############", "PASS" if ok else "FAIL", "(identical + RAS-correct + no garbage) ############")
sys.exit(0 if ok else 1)
PYEOF
echo ""
echo "================= RUN 2 REUSE EVIDENCE (no re-harvest / no fallback) ================="
echo "--- run2 PROPOSAL-CACHE + REUSING lines ---"
grep -E "PROPOSAL-CACHE HIT|REUSING stored candidate|reused=true" "$L2" 2>/dev/null || echo "(none found)"
echo "--- run2 must NOT contain these (re-harvest / fallback) ---"
grep -E "fails current validation|UNIVERSAL_TOOL_PLAN_BOOTSTRAP failed|UNIVERSAL_AUTO_PLAN \(fallback\)|\[LOUD\]" "$L2" 2>/dev/null && echo "!! FOUND BAD LINES ABOVE" || echo "(clean — none of the bad markers present)"
