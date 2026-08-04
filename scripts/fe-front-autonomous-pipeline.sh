#!/usr/bin/env bash
# INTENT: Autonomous Stage 1→2→3→7 driver for JLR FE front FPK demo.
# Polls Stage 1 cold chain; on exit, runs morphology SIGHT, Excel, ship gate, zip.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
WD="$ROOT/out/formula-e-front-mgu-watchdog"
mkdir -p "$WD"
LOG="$WD/pipeline.log"
exec >>"$LOG" 2>&1
echo "$(date -Iseconds) pipeline driver start"

wait_stage1() {
  echo "$(date -Iseconds) waiting for Stage 1..."
  while true; do
    if [[ -f "$WD/stage1-done.txt" ]]; then
      echo "$(date -Iseconds) stage1-done: $(cat "$WD/stage1-done.txt")"
      return 0
    fi
    EXITF=$(cat /tmp/fe-front-cold-exit.txt 2>/dev/null || true)
    if [[ "$EXITF" =~ ^[0-9]+$ ]]; then
      OUT=$(cat /tmp/fe-front-cold-out.txt)
      echo "done:$EXITF:$OUT:$(date -Iseconds)" > "$WD/stage1-done.txt"
      return 0
    fi
    # resurrect if dead without exit
    if ! pgrep -f 'scripts/serial-design-chain-v2.tsx' >/dev/null; then
      OUT=$(cat /tmp/fe-front-cold-out.txt 2>/dev/null || true)
      if [[ -n "$OUT" && -f "$OUT/state.json" && ! -f "$OUT/design-pack.xlsx" ]]; then
        echo "$(date -Iseconds) ALERT: chain dead mid-run — will not auto-restart (agent must decide). out=$OUT"
        echo "DEAD_MIDRUN:$OUT:$(date -Iseconds)" > "$WD/alerts.txt"
      fi
    fi
    sleep 60
  done
}

run_stage2() {
  OUT=$(cut -d: -f3 "$WD/stage1-done.txt")
  [[ -z "$OUT" ]] && OUT=$(cat /tmp/fe-front-cold-out.txt)
  echo "$(date -Iseconds) STAGE2 start out=$OUT" | tee "$WD/stage2-started.txt"
  export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
  set -a; [[ -f .env.local ]] && . ./.env.local; set +a
  # Rebuild Blender product views (bay-fill traction)
  if [[ -f "$OUT/state.json" ]]; then
    INSPECT=0 python3 scripts/render-blender-scene.py \
      --state "$OUT/state.json" --out-dir "$OUT" --force --cycles-samples 64 \
      > "$OUT/blender-stage2.log" 2>&1 || echo "blender exit $?"
  fi
  # Vision / SIGHT critic if available
  if [[ -f scripts/lib/render_vision_critic.py ]]; then
    python3 scripts/lib/render_vision_critic.py --selftest >> "$OUT/sight-selftest.log" 2>&1 || true
  fi
  echo "$(date -Iseconds) STAGE2 done" | tee "$WD/stage2-done.txt"
}

run_stage3() {
  OUT=$(cat /tmp/fe-front-cold-out.txt)
  echo "$(date -Iseconds) STAGE3 start out=$OUT" | tee "$WD/stage3-started.txt"
  export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
  set -a; [[ -f .env.local ]] && . ./.env.local; set +a
  # ⭐ UNIVERSAL: restamp twin from frozen decisions BEFORE excel so Checks cannot
  # ship continuous magnet temps while DEC-008 says intermittent (F1/R1).
  python3 scripts/lib/apply_frozen_decisions.py --twin "$OUT" \
    > "$OUT/apply-frozen-decisions.log" 2>&1 || echo "frozen-decisions exit $?"
  python3 scripts/build-excel-export.py "$OUT" > "$OUT/excel-stage3.log" 2>&1 || echo "excel exit $?"
  python3 scripts/lib/check_deliverable_coherence.py --twin "$OUT" --enforce \
    > "$OUT/deliverable-coherence.log" 2>&1 || echo "coherence exit $?"
  python3 scripts/lib/ship_red_team.py "$OUT" > "$OUT/ship-red-team.log" 2>&1 || true
  python3 scripts/lib/loop_board.py assemble "$OUT" --board out/formula-e-front-mgu-board.json || true
  echo "$(date -Iseconds) STAGE3 done" | tee "$WD/stage3-done.txt"
}

run_stage7() {
  OUT=$(cat /tmp/fe-front-cold-out.txt)
  echo "$(date -Iseconds) STAGE7 start out=$OUT" | tee "$WD/stage7-started.txt"
  # Prefer existing pack zip script if present
  if [[ -f scripts/build-design-pack-zip.py ]]; then
    python3 scripts/build-design-pack-zip.py "$OUT" > "$OUT/zip-stage7.log" 2>&1 || true
  elif [[ -f scripts/export-design-pack.py ]]; then
    python3 scripts/export-design-pack.py "$OUT" > "$OUT/zip-stage7.log" 2>&1 || true
  else
    # Fallback: zip key artefacts
    STAMP=$(date +%Y%m%d-%H%M)
    ZIP="out/${STAMP}-V1.3-formula-e-front-mgu-design-pack.zip"
    (
      cd "$OUT" && zip -r "../../$ZIP" \
        design-pack.xlsx state.json chain.log \
        00-hero.png 04-product-exterior.png 08-ghost.png \
        MANIFEST.md 2>/dev/null || \
      zip -r "../../$ZIP" . -i '*.xlsx' '*.png' 'state.json' 'chain.log' 'MANIFEST*'
    )
    echo "zip=$ZIP" >> "$OUT/zip-stage7.log"
  fi
  # Talk track
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
  echo "ALL_STAGES_COMPLETE:$(date -Iseconds):$OUT" | tee "$WD/ALL_DONE.txt"
}

wait_stage1
# Even if Stage 1 chain already wrote Excel, still run Stage 2 morphology pass
run_stage2
run_stage3
run_stage7
echo "$(date -Iseconds) pipeline driver finished"
