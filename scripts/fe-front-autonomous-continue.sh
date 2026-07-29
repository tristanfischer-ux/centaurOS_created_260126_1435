#!/usr/bin/env bash
# INTENT: Keep the JLR FE front FPK campaign moving while the operator is away.
# Polls every 90s; if the cold chain exits (or stalls >25 min with state+excel),
# runs Stage 2 (Blender + form-meshes) → drawings → Excel → ship gate → zip/talk.
# Never claims SHIPS unless ship_ok=true.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
WD="$ROOT/out/formula-e-front-mgu-watchdog"
mkdir -p "$WD"
LOG="$WD/continue.log"
exec >>"$LOG" 2>&1
echo "$(date -Iseconds) autonomous-continue START"

export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
STALL_LIMIT=1500   # 25 min without chain.log growth
POLL=90

recompute_ship() {
  local OUT="$1"
  python3 - <<PY || true
import json, os
out = "$OUT"
ship = False
floor = None
# Prefer tab-scorecard / quality-scorecard / excel ship artefacts
for name in ("tab-scorecard.json", "quality-scorecard.json", "ship-gate.json"):
    p = os.path.join(out, name)
    if not os.path.isfile(p):
        continue
    try:
        d = json.load(open(p))
    except Exception:
        continue
    if "ship_ok" in d:
        ship = bool(d["ship_ok"]); floor = d.get("floor"); break
    if "allPass" in d:
        ship = bool(d.get("allPass")); floor = d.get("floor") or d.get("deterministicFloor")
        break
    tabs = d.get("tabs") or d.get("sections")
    if isinstance(tabs, list) and tabs:
        scores = []
        for t in tabs:
            if isinstance(t, dict) and "score" in t:
                try: scores.append(float(t["score"]))
                except Exception: pass
        if scores:
            floor = min(scores)
            ship = floor >= 8.0
            break
open(os.path.join("$WD", "ship-status.txt"), "w").write(
    f"ship_ok={ship} floor={floor} out={out} at={__import__('datetime').datetime.now().isoformat()}\n"
)
print(f"ship_ok={ship} floor={floor}")
PY
}

run_stage2_to_7() {
  local OUT="$1"
  echo "$(date -Iseconds) STAGE2→7 on $OUT" | tee "$WD/stage2-started.txt"
  set -a; [[ -f .env.local ]] && . ./.env.local; set +a

  if [[ -f "$OUT/state.json" ]]; then
    echo "$(date -Iseconds) blender rebuild (shaded product pass)…"
    unset CAD_ARTIFACTS_ONLY || true
    export INSPECT=0 BLENDER_OUT_DIR="$OUT"
    python3 scripts/render-blender-scene.py \
      --state "$OUT/state.json" --out-dir "$OUT" --force --cycles-samples 48 \
      > "$OUT/blender-stage2-continue.log" 2>&1 || echo "blender exit $?"
    if [[ -f "$OUT/_loop/form-meshes.json" && ! -f "$OUT/form-meshes.json" ]]; then
      cp "$OUT/_loop/form-meshes.json" "$OUT/form-meshes.json"
    fi
  fi

  # Regenerate drawing set (full — not CAD_ARTIFACTS_ONLY)
  if [[ -f scripts/blender-universal/generate_drawing_set.py ]]; then
    echo "$(date -Iseconds) drawings…"
    unset CAD_ARTIFACTS_ONLY || true
    python3 scripts/blender-universal/generate_drawing_set.py "$OUT" \
      > "$OUT/drawings-stage2-continue.log" 2>&1 || echo "drawings exit $?"
  elif [[ -f scripts/generate-drawing-set.py ]]; then
    python3 scripts/generate-drawing-set.py "$OUT" \
      > "$OUT/drawings-stage2-continue.log" 2>&1 || true
  fi

  # Drawing gates
  if [[ -f scripts/blender-universal/drawing_gates.py ]]; then
    python3 scripts/blender-universal/drawing_gates.py "$OUT" \
      > "$OUT/drawing-gates-continue.log" 2>&1 || true
  fi

  echo "$(date -Iseconds) STAGE2 done" | tee "$WD/stage2-done.txt"
  echo "$(date -Iseconds) STAGE3 excel…" | tee "$WD/stage3-started.txt"
  python3 scripts/build-excel-export.py "$OUT" > "$OUT/excel-stage3-continue.log" 2>&1 || echo "excel exit $?"
  python3 scripts/lib/ship_red_team.py "$OUT" > "$OUT/ship-red-team-continue.log" 2>&1 || true
  python3 scripts/lib/loop_board.py assemble "$OUT" --board out/formula-e-front-mgu-board.json || true
  echo "$(date -Iseconds) STAGE3 done" | tee "$WD/stage3-done.txt"
  recompute_ship "$OUT"

  echo "$(date -Iseconds) STAGE7 zip+talk…" | tee "$WD/stage7-started.txt"
  if [[ -f scripts/build-design-pack-zip.py ]]; then
    python3 scripts/build-design-pack-zip.py "$OUT" > "$OUT/zip-stage7-continue.log" 2>&1 || true
  fi
  cat > "$OUT/JLR-FE-FRONT-FPK-TALK-TRACK.md" <<'EOF'
# JLR Formula E Front FPK — Talk Track (60s)

1. **Perimeter:** Spec front powertrain kit only (MGU + SiC inverter + single-speed + diff). Not the car. Not the rear manufacturer MGU.
2. **Form:** Forced by the Spark Gen3 front-axle bay ≈ 343 × 259 × 267 mm / ~32 kg dry (press). Lucid imagery = FFF training check, not CAD paste.
3. **Power:** ≤250 kW front regen electrical; ~350 kW hardware class labelled as press capability, not race software cap.
4. **Honesty:** Holds and assumptions are explicit (coolant band, gear ratio first-pass, mass boundary). No homologation claim.
5. **Attack us:** Mass fluids/harness boundary, 350 vs 250, no public STEP, Gen3 vs Evo traction windows — answers are in Holds & Brief Compliance.
EOF
  cat > "$OUT/JLR-FE-FRONT-FPK-HOSTILE-Q.md" <<'EOF'
# Hostile Q rehearsal (top 10)

1. Is 32 kg dry or wet? → Press dry-unit; fluids/harness boundary in Holds.
2. Why 350 kW if regen is 250? → Hardware class vs race software/regen cap; both labelled.
3. Did you steal Lucid CAD? → No public STEP; morphology from bay packaging + FFF reasons.
4. Where is the rear MGU? → Out of perimeter for this demo.
5. Prove the bay fit. → Envelope GA + stamped principals edge-clamped into bay.
6. Is the gear ratio homologated? → First-pass seed; replace with team ratio.
7. PCB/Gerbers? → Spec inverter story; PCB fab OOS for this demo.
8. Can we race this? → No — engineering dossier for attack, not homologation.
9. Why Formula E in a "universal" engine? → Class is one instance; rails are signal-keyed.
10. What's still DRAFT? → Only ship if ship_ok; otherwise we say DRAFT.
EOF
  echo "$(date -Iseconds) STAGE7 done" | tee "$WD/stage7-done.txt"

  if grep -q 'ship_ok=True\|ship_ok=true' "$WD/ship-status.txt" 2>/dev/null; then
    echo "ALL_STAGES_COMPLETE_SHIP:$(date -Iseconds):$OUT" | tee "$WD/ALL_DONE.txt"
  else
    echo "NEED_MORE_SOURCE_FIXES:$(date -Iseconds):$OUT:$(cat "$WD/ship-status.txt" 2>/dev/null)" \
      | tee "$WD/next-action.txt"
    echo "PARTIAL_COMPLETE_DRAFT:$(date -Iseconds):$OUT" | tee "$WD/ALL_DONE.txt"
  fi
}

LAST_SIZE=0
LAST_GROW=$(date +%s)
STAGE_RAN=0

while true; do
  NOW=$(date +%s)
  OUT=$(cat /tmp/fe-front-cold-out.txt 2>/dev/null || echo "")
  EXITF=$(cat /tmp/fe-front-cold-exit.txt 2>/dev/null || echo "")
  [[ "$EXITF" =~ ^[0-9]+$ ]] || EXITF=""
  CHAIN_PID=$(pgrep -f 'scripts/serial-design-chain-v2.tsx' | head -1 || true)
  SIZE=0
  if [[ -n "$OUT" && -f "$OUT/chain.log" ]]; then
    SIZE=$(wc -c < "$OUT/chain.log" | tr -d ' ')
  fi
  if [[ "$SIZE" != "$LAST_SIZE" ]]; then LAST_SIZE=$SIZE; LAST_GROW=$NOW; fi
  STALL=$(( NOW - LAST_GROW ))
  echo "$(date -Iseconds) continue-poll out=$OUT pid=${CHAIN_PID:-none} exit=${EXITF:-none} stall=${STALL}s stage_ran=$STAGE_RAN" \
    | tee "$WD/heartbeat-continue.txt"

  # Keep nudge + watchdog alive
  if ! pgrep -f 'fe-front-watchdog.sh' >/dev/null; then
    nohup bash /tmp/fe-front-watchdog.sh >/tmp/fe-front-watchdog.out 2>&1 &
    echo "$(date -Iseconds) restarted watchdog"
  fi

  SHOULD_RUN=0
  if [[ -n "$EXITF" && "$STAGE_RAN" -eq 0 ]]; then
    SHOULD_RUN=1
    echo "$(date -Iseconds) trigger: chain exited $EXITF"
  fi
  if [[ -z "$CHAIN_PID" && -z "$EXITF" && -n "$OUT" && -f "$OUT/state.json" && -f "$OUT/dossier.xlsx" && "$STAGE_RAN" -eq 0 && "$STALL" -gt 180 ]]; then
    SHOULD_RUN=1
    echo "0" > /tmp/fe-front-cold-exit.txt
    echo "$(date -Iseconds) trigger: chain dead with excel present — treating as exit 0"
  fi
  if [[ -n "$CHAIN_PID" && "$STALL" -gt "$STALL_LIMIT" && -f "$OUT/dossier.xlsx" && "$STAGE_RAN" -eq 0 ]]; then
    SHOULD_RUN=1
    echo "$(date -Iseconds) trigger: chain stalled ${STALL}s with excel — proceeding Stage2 on current artefacts"
  fi

  if [[ "$SHOULD_RUN" -eq 1 && -n "$OUT" ]]; then
    STAGE_RAN=1
    echo "done:${EXITF:-0}:$OUT:$(date -Iseconds)" > "$WD/stage1-done.txt"
    run_stage2_to_7 "$OUT"
    # If still DRAFT, leave next-action for agent; keep polling for agent fixes
    if grep -q 'NEED_MORE' "$WD/next-action.txt" 2>/dev/null; then
      STAGE_RAN=0   # allow another pass after agent SOURCE fixes land
      sleep 300     # give agent time to edit before re-running blender/excel
      continue
    fi
    break
  fi
  sleep "$POLL"
done

echo "$(date -Iseconds) autonomous-continue FINISHED"
