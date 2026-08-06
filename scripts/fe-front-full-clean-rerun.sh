#!/usr/bin/env bash
# Full clean re-run of FE Front twin surfaces (frozen twin, not cold-chain from brief).
# Never sets ship_ok=true. Logs every stage; continues on non-fatal failures but records them.
#
# Usage:
#   bash scripts/fe-front-full-clean-rerun.sh
#   FE_FRONT_TWIN=out/formula-e-front-mgu-20260729-1432 bash scripts/fe-front-full-clean-rerun.sh
#   SKIP_BLENDER=1 SKIP_EM=1 bash scripts/fe-front-full-clean-rerun.sh   # faster subset
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
set -a
[[ -f .env.local ]] && . ./.env.local
set +a

TWIN_REL="${FE_FRONT_TWIN:-out/formula-e-front-mgu-20260729-1432}"
TWIN="$ROOT/$TWIN_REL"
if [[ ! -f "$TWIN/state.json" ]]; then
  echo "FATAL: no state.json at $TWIN" >&2
  exit 2
fi

RUN_DIR="$TWIN/_full_clean_rerun"
STAMP="$(date +%Y%m%d-%H%M%S)"
LOG="$RUN_DIR/RUN-$STAMP.log"
SUMMARY="$RUN_DIR/summary-$STAMP.json"
mkdir -p "$RUN_DIR"

PY="${ROOT}/.venv/bin/python"
[[ -x "$PY" ]] || PY=python3
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=8192}"

log() { echo "[$(date -Iseconds)] $*" | tee -a "$LOG"; }

# stage_name -> result file line
record() {
  local name="$1" rc="$2" note="${3:-}"
  echo "{\"stage\":\"$name\",\"rc\":$rc,\"note\":$(python3 -c "import json,sys; print(json.dumps(sys.argv[1]))" "$note"),\"at\":\"$(date -Iseconds)\"}" >> "$RUN_DIR/stages-$STAMP.jsonl"
  if [[ "$rc" -eq 0 ]]; then
    log "OK  $name"
  else
    log "FAIL $name rc=$rc $note"
  fi
}

run_stage() {
  local name="$1"
  shift
  log "BEGIN $name: $*"
  local t0=$SECONDS
  set +e
  "$@" >>"$LOG" 2>&1
  local rc=$?
  set -e
  local dt=$((SECONDS - t0))
  record "$name" "$rc" "elapsed_s=$dt"
  return 0  # never abort whole run from one stage
}

log "=== FE FRONT FULL CLEAN RERUN ==="
log "twin=$TWIN"
log "stamp=$STAMP"
log "python=$PY"
: >"$RUN_DIR/stages-$STAMP.jsonl"

# ── 0 Preflight ──────────────────────────────────────────────────────────────
run_stage preflight_state test -f "$TWIN/state.json"
run_stage preflight_fpk_engines "$PY" scripts/lib/fpk_physics_engines.py --selftest
run_stage preflight_fpk_bus_esl "$PY" scripts/lib/fpk_bus_esl.py --selftest

# ── 1 Frozen decisions (must precede Excel) ──────────────────────────────────
if [[ -f scripts/lib/apply_frozen_decisions.py ]]; then
  run_stage apply_frozen_decisions "$PY" scripts/lib/apply_frozen_decisions.py --twin "$TWIN"
fi

# ── 2 Physics engines stamp ──────────────────────────────────────────────────
if [[ -f scripts/fe-front-run-physics-engines.py ]]; then
  run_stage physics_engines "$PY" scripts/fe-front-run-physics-engines.py
fi

# ── 3 Multiphysics R1–R6 (+ dense where enabled) ─────────────────────────────
if [[ "${SKIP_MULTIPHYSICS:-0}" != "1" && -f scripts/motor-stack/multiphysics_capability_runs.py ]]; then
  run_stage multiphysics "$PY" scripts/motor-stack/multiphysics_capability_runs.py --twin "$TWIN_REL"
fi

# ── 4 Electromagnetics Path B DEC-009 (NOT generic angle-screen kit-case) ────
# Generic em_fia_front_kit_case.py angle-screens and is not the dual-bar spine.
# Path B freezes magnets 6×22.5 and writes em_fia_front_kit_case_PATH_B_DEC009.json.
if [[ "${SKIP_EM:-0}" != "1" && -f scripts/motor-stack/run_path_b_dec009.py ]]; then
  # --force if Path A compare git_sha drifted after non-EM commits (records force).
  run_stage em_path_b_dec009 "$PY" scripts/motor-stack/run_path_b_dec009.py --force
elif [[ "${SKIP_EM:-0}" != "1" && -f scripts/motor-stack/em_fia_front_kit_case.py ]]; then
  log "WARN: run_path_b_dec009.py missing — refusing generic kit-case as Path B substitute"
  record em_path_b_dec009 2 "missing_path_b_runner"
fi
if [[ "${SKIP_EM:-0}" != "1" && -f scripts/motor-stack/em_fia_fieldplot_pack.py ]]; then
  run_stage em_fieldplot_pack "$PY" scripts/motor-stack/em_fia_fieldplot_pack.py --twin "$TWIN_REL"
fi

# ── 5 PCB pipeline ───────────────────────────────────────────────────────────
if [[ "${SKIP_PCB:-0}" != "1" && -f scripts/fe-front-run-pcb-pipeline.ts ]]; then
  run_stage pcb_pipeline npx tsx scripts/fe-front-run-pcb-pipeline.ts "$TWIN_REL"
fi

# ── 6 Detailed GA ────────────────────────────────────────────────────────────
if [[ -f scripts/blender-universal/draw_ga_detailed.py ]]; then
  run_stage ga_detailed "$PY" scripts/blender-universal/draw_ga_detailed.py "$TWIN"
elif [[ -f scripts/fe-front-draw-detailed-ga.py ]]; then
  run_stage ga_detailed "$PY" scripts/fe-front-draw-detailed-ga.py "$TWIN"
fi

# ── 7 Drawing set ────────────────────────────────────────────────────────────
if [[ "${SKIP_DRAWINGS:-0}" != "1" && -f scripts/blender-universal/generate_drawing_set.py ]]; then
  unset CAD_ARTIFACTS_ONLY || true
  run_stage drawings "$PY" scripts/blender-universal/generate_drawing_set.py "$TWIN"
fi
if [[ -f scripts/blender-universal/drawing_gates.py ]]; then
  run_stage drawing_gates "$PY" scripts/blender-universal/drawing_gates.py "$TWIN"
fi

# ── 8 Blender race-kit (in-place, moderate samples) ──────────────────────────
if [[ "${SKIP_BLENDER:-0}" != "1" && -f scripts/motor-stack/rerender-fe-front-race-kit.sh ]]; then
  SAMPLES="${BLENDER_SAMPLES:-32}"
  run_stage blender_race_kit bash scripts/motor-stack/rerender-fe-front-race-kit.sh --in-place --samples "$SAMPLES"
elif [[ "${SKIP_BLENDER:-0}" != "1" && -f scripts/render-blender-scene.py ]]; then
  unset CAD_ARTIFACTS_ONLY || true
  export INSPECT=0
  run_stage blender_render "$PY" scripts/render-blender-scene.py \
    --state "$TWIN/state.json" --out-dir "$TWIN" --force --cycles-samples "${BLENDER_SAMPLES:-32}"
fi

# ── 9 Excel rebuild ──────────────────────────────────────────────────────────
if [[ "${SKIP_EXCEL:-0}" != "1" ]]; then
  run_stage excel_export "$PY" scripts/build-excel-export.py "$TWIN"
  if [[ -f scripts/fe-front-excel-quality-stamp.py ]]; then
    run_stage excel_quality_stamp "$PY" scripts/fe-front-excel-quality-stamp.py --twin "$TWIN"
  fi
fi

# ── 10 Coherence + ship red team ─────────────────────────────────────────────
if [[ -f scripts/lib/check_deliverable_coherence.py ]]; then
  run_stage deliverable_coherence "$PY" scripts/lib/check_deliverable_coherence.py --twin "$TWIN" --enforce
fi
if [[ -f scripts/lib/ship_red_team.py ]]; then
  run_stage ship_red_team "$PY" scripts/lib/ship_red_team.py "$TWIN"
fi
if [[ -f scripts/lib/loop_board.py ]]; then
  run_stage loop_board "$PY" scripts/lib/loop_board.py assemble "$TWIN" --board out/formula-e-front-mgu-board.json
fi

# ── 11 Assemble design pack (full, with cover if present) ────────────────────
if [[ "${SKIP_PACK:-0}" != "1" ]]; then
  PACK_STAMP="$(date +%Y%m%d-%H%M)"
  PACK_NAME="${PACK_STAMP}-V1.299-formula-e-front-mgu-design-pack"
  PACK_DIR="$TWIN/$PACK_NAME"
  mkdir -p "$PACK_DIR/renders" "$PACK_DIR/electromagnetics" "$PACK_DIR/multiphysics" "$PACK_DIR/pcb" "$PACK_DIR/drawings"

  # Core text
  for f in MANIFEST.txt README-JACK.txt 00-COVERING-NOTE-FOR-JACK.md quality-scorecard.json tab-scorecard.json dossier.xlsx; do
    [[ -f "$TWIN/$f" ]] && cp -p "$TWIN/$f" "$PACK_DIR/" 2>/dev/null || true
  done
  # Prefer root dossier
  [[ -f "$TWIN/dossier.xlsx" ]] && cp -p "$TWIN/dossier.xlsx" "$PACK_DIR/dossier.xlsx"

  # Cover narrative
  if [[ -d "$TWIN/_cover_doc" ]]; then
    for f in 00-COVER-NARRATIVE.pdf 00-COVER-NARRATIVE.md 00-COVER-NARRATIVE-illustrated.html; do
      [[ -f "$TWIN/_cover_doc/$f" ]] && cp -p "$TWIN/_cover_doc/$f" "$PACK_DIR/"
    done
    # Prefer illustrated html as main html name if present
    if [[ -f "$TWIN/_cover_doc/00-COVER-NARRATIVE-illustrated.html" ]]; then
      cp -p "$TWIN/_cover_doc/00-COVER-NARRATIVE-illustrated.html" "$PACK_DIR/00-COVER-NARRATIVE.html"
    elif [[ -f "$TWIN/_cover_doc/00-COVER-NARRATIVE.html" ]]; then
      cp -p "$TWIN/_cover_doc/00-COVER-NARRATIVE.html" "$PACK_DIR/"
    fi
  fi

  # Renders
  for f in 00-hero.png 04-product-exterior.png 07-product-service.png 08-product-ghost-shell.png 13-product-exploded.png blender-cover.png; do
    [[ -f "$TWIN/$f" ]] && cp -p "$TWIN/$f" "$PACK_DIR/renders/"
    [[ -f "$TWIN/renders/$f" ]] && cp -p "$TWIN/renders/$f" "$PACK_DIR/renders/"
  done
  # From latest prior pack if twin root missing
  PRIOR=$(ls -d "$TWIN"/*-formula-e-front-mgu-design-pack 2>/dev/null | tail -1 || true)
  if [[ -n "${PRIOR:-}" ]]; then
    rsync -a --ignore-existing "$PRIOR/renders/" "$PACK_DIR/renders/" 2>/dev/null || true
    rsync -a --ignore-existing "$PRIOR/electromagnetics/" "$PACK_DIR/electromagnetics/" 2>/dev/null || true
  fi

  # Multiphysics
  if [[ -d "$TWIN/multiphysics" ]]; then
    rsync -a "$TWIN/multiphysics/" "$PACK_DIR/multiphysics/" 2>/dev/null || true
  fi
  # EM honesty / motor stack outputs commonly under twin
  for d in electromagnetics _motor_stack/electromagnetics _show_tristan; do
    if [[ -d "$TWIN/$d" ]]; then
      rsync -a "$TWIN/$d/" "$PACK_DIR/electromagnetics/" 2>/dev/null || true
    fi
  done

  # PCB
  if [[ -d "$TWIN/pcb" ]]; then
    rsync -a "$TWIN/pcb/" "$PACK_DIR/pcb/" 2>/dev/null || true
  fi
  for f in pcb_grade_card.json PROTOTYPE-FAB-PACKAGE-INDEX.md; do
    [[ -f "$TWIN/$f" ]] && cp -p "$TWIN/$f" "$PACK_DIR/pcb/" 2>/dev/null || true
    [[ -f "$TWIN/pcb/$f" ]] && cp -p "$TWIN/pcb/$f" "$PACK_DIR/pcb/" 2>/dev/null || true
  done

  # Drawings
  if [[ -d "$TWIN/drawings" ]]; then
    rsync -a "$TWIN/drawings/" "$PACK_DIR/drawings/" 2>/dev/null || true
  fi

  # MANIFEST refresh
  {
    echo "V1.299 full clean rerun pack ($STAMP)"
    echo "- Cover: 00-COVER-NARRATIVE.pdf / .html / .md"
    echo "- ship_ok=false · not homologated · dual torque bars"
    echo "- Surfaces re-run log: _full_clean_rerun/RUN-$STAMP.log"
    echo "- dossier.xlsx · multiphysics/ · pcb/ · renders/ · electromagnetics/ · drawings/"
  } >"$PACK_DIR/MANIFEST.txt"

  cat >"$PACK_DIR/README-FIRST.txt" <<EOF
Formula E–class front motor-generator unit — concept design pack V1.299
Fractional Forge · full clean re-run $STAMP · ship_ok = false · not homologated

START HERE
  1. 00-COVER-NARRATIVE.pdf
  2. electromagnetics/01-dual-torque-bars.png
  3. renders/00-hero.png
  4. dossier.xlsx → Calculations
  5. pcb/pcb_grade_card.json

Authoritative inventory: MANIFEST.txt
Full re-run log: twin _full_clean_rerun/RUN-$STAMP.log
EOF

  (
    cd "$TWIN"
    zip -r -q "${PACK_NAME}.zip" "$PACK_NAME" -x "*.DS_Store" "*__pycache__*"
  )
  record pack_assemble 0 "pack=$PACK_NAME zip=$(ls -lh "$TWIN/${PACK_NAME}.zip" 2>/dev/null | awk '{print $5}')"
  log "PACK $TWIN/${PACK_NAME}.zip"
fi

# ── Summary ──────────────────────────────────────────────────────────────────
"$PY" - <<PY | tee -a "$LOG"
import json
from pathlib import Path
from collections import Counter
run = Path("$RUN_DIR")
lines = (run / "stages-$STAMP.jsonl").read_text().splitlines()
rows = [json.loads(l) for l in lines if l.strip()]
counts = Counter("ok" if r["rc"] == 0 else "fail" for r in rows)
fails = [r for r in rows if r["rc"] != 0]
summary = {
    "stamp": "$STAMP",
    "twin": "$TWIN_REL",
    "stages": len(rows),
    "ok": counts.get("ok", 0),
    "fail": counts.get("fail", 0),
    "failed_stages": [{"stage": r["stage"], "rc": r["rc"], "note": r.get("note")} for r in fails],
    "all_ok": counts.get("fail", 0) == 0,
}
(run / "summary-$STAMP.json").write_text(json.dumps(summary, indent=2) + "\n")
print(json.dumps(summary, indent=2))
# ship_ok must remain false
import json as J
state = J.loads(Path("$TWIN/state.json").read_text())
print("state.ship_ok =", state.get("ship_ok"))
PY

log "=== FULL CLEAN RERUN COMPLETE ==="
log "summary=$SUMMARY log=$LOG"
# exit 0 if all ok else 1
if grep -q '"all_ok": true' "$RUN_DIR/summary-$STAMP.json" 2>/dev/null; then
  exit 0
fi
exit 1
