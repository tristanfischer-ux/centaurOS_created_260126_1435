#!/usr/bin/env bash
# INTENT (2026-07-17): Tristan — before any NEW product, revisit every Yuri
# product we already started that is not yet floor ≥9 / gold cost / form PASS.
# DECISION: sequential cold re-runs only (one chain). OpenDrop last — it was
# interrupted mid-first-run so the unfinished set still owns the Blender slot.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
# GOTCHA: do NOT source yuri-campaign-watch.sh — it has no main guard and would
# re-run the full ladder. Helpers are duplicated below.
LOCKDIR="$ROOT/out/logs/yuri-revisit.lockdir"
LOG="$ROOT/out/logs/yuri-revisit-watch.log"
mkdir -p "$ROOT/out/logs"

if ! mkdir "$LOCKDIR" 2>/dev/null; then
  # stdout only — callers redirect to $LOG; tee-a+$redirect doubled every line.
  echo "[$(date -Iseconds)] revisit already locked ($LOCKDIR pid=$(cat "$LOCKDIR/pid" 2>/dev/null || echo ?))"
  exit 0
fi
echo $$ >"$LOCKDIR/pid"
trap 'rm -rf "$LOCKDIR"' EXIT

# GOTCHA: do NOT tee -a "$LOG" here — campaign launchers already redirect
# stdout/stderr to $LOG (nohup >>LOG). tee+redirect wrote every line twice.
log() { echo "[$(date -Iseconds)] $*"; }

latest_out() {
  local prefix="$1" d best=""
  while IFS= read -r d; do
    [[ -z "$d" ]] && continue
    if dir_settled "$d"; then echo "$d"; return 0; fi
    [[ -z "$best" ]] && best="$d"
  done < <(ls -td "$ROOT"/out/${prefix}-2026[0-9]* 2>/dev/null | grep -v SCORED || true)
  echo "${best:-}"
}

any_chain_alive() {
  pgrep -f 'tsx.*scripts/serial-design-chain-v2\.tsx' >/dev/null 2>&1 \
    || pgrep -f 'node.*scripts/serial-design-chain-v2\.tsx' >/dev/null 2>&1
}

dir_settled() {
  local dir="$1"
  [[ -n "$dir" && -d "$dir" ]] || return 1
  [[ -f "$dir/state.json" ]] || return 1
  [[ -f "$dir/tab-scorecard.json" \
     || -f "$dir/dossier.xlsx" \
     || -f "$dir/chain-v2.pdf" \
     || -f "$dir/excel-export.xlsx" \
     || -f "$dir/quality-scorecard.json" ]] && return 0
  if [[ -f "$dir/chain.log" ]] && grep -qE 'run exit: [1-9]|DONE|self-audit ENFORCING' "$dir/chain.log" 2>/dev/null; then
    return 0
  fi
  return 1
}

check_bar() {
  local dir="$1" form="${2:-}" key="${3:-}"
  [[ -z "$dir" || ! -d "$dir" ]] && { log "FAIL: no out dir"; return 1; }
  local ok=0
  if [[ -n "$key" && -f "$dir/state.json" ]]; then
    if python3 "$ROOT/scripts/lib/gold_cost_band.py" "$dir/state.json" >>"$LOG" 2>&1; then
      log "cost PASS $dir key=$key"
    else
      log "cost FAIL $dir key=$key"; ok=1
    fi
  fi
  local exterior=""
  for cand in "$dir/04-product-exterior.png" \
              "$dir/blender-universal/04-product-exterior.png" \
              "$dir/blender-universal/renders/04-product-exterior.png"; do
    [[ -f "$cand" ]] && exterior="$cand" && break
  done
  if [[ -n "$form" && -n "$exterior" ]]; then
    if python3 "$ROOT/scripts/lib/form_render_glance.py" \
         "$exterior" --form "$form" >>"$LOG" 2>&1; then
      log "glance PASS $dir form=$form"
    else
      log "glance FAIL $dir form=$form"; ok=1
    fi
  elif [[ -n "$form" ]]; then
    log "WARN: no exterior PNG for glance $dir"; ok=1
  fi
  local meshes=""
  for cand in "$dir/form-meshes.json" "$dir/blender-universal/form-meshes.json"; do
    [[ -f "$cand" ]] && meshes="$cand" && break
  done
  if [[ -n "$meshes" && -n "$form" ]]; then
    if python3 -c "import json,sys; d=json.load(open(sys.argv[1])); f=(d.get('form_id') or d.get('form') or ''); sys.exit(0 if f==sys.argv[2] else 1)" \
         "$meshes" "$form" >>"$LOG" 2>&1; then
      log "form_id PASS $form"
    else
      log "form_id FAIL want=$form"; ok=1
    fi
  elif [[ -n "$form" ]]; then
    log "WARN: no form-meshes.json in $dir"; ok=1
  fi
  local sc=""
  for cand in "$dir/tab-scorecard.json" "$dir/quality-scorecard.json"; do
    [[ -f "$cand" ]] && sc="$cand" && break
  done
  if [[ -n "$sc" ]]; then
    if python3 - "$sc" <<'PY'
import json, sys
s = json.load(open(sys.argv[1]))
v = s.get("verdict") or {}
if isinstance(v, dict):
    ships = bool(v.get("ships"))
    floor = v.get("floor")
else:
    ships = bool(s.get("allPass") or s.get("ships"))
    floor = s.get("floor") or s.get("deterministicFloor")
sm = s.get("summary") or {}
min_score = sm.get("min_score")
if min_score is None and isinstance(s.get("tabs"), dict):
    vals = []
    for t in s["tabs"].values():
        if isinstance(t, dict) and isinstance(t.get("score"), (int, float)):
            vals.append(t["score"])
        elif isinstance(t, (int, float)):
            vals.append(t)
    min_score = min(vals) if vals else None
ok = ships and (floor is None or float(floor) >= 9) and (min_score is None or float(min_score) >= 9)
print(f"ships={ships} floor={floor} min_tab={min_score}")
sys.exit(0 if ok else 1)
PY
    then
      log "score PASS $dir"
    else
      log "score FAIL $dir (need ships + floor≥9)"; ok=1
    fi
  else
    log "WARN: no scorecard in $dir"; ok=1
  fi
  return $ok
}

wait_idle() {
  local n=0
  while any_chain_alive; do
    n=$((n + 1))
    if (( n % 2 == 0 )); then log "waiting for chain idle…"; fi
    sleep 30
  done
}

wait_for_settle() {
  local label="$1"
  local since_epoch="$2"
  log "waiting for $label to SETTLE (dir mtime ≥ $since_epoch)…"
  local idle=0
  while true; do
    local dir
    dir="$(latest_out "$label")"
    local dir_epoch=0
    if [[ -n "$dir" ]]; then
      dir_epoch=$(stat -f %m "$dir" 2>/dev/null || echo 0)
    fi
    if [[ -n "$dir" && "$dir_epoch" -ge "$since_epoch" ]] && dir_settled "$dir"; then
      if any_chain_alive; then
        log "$label artefacts present but chain still running — wait"
        sleep 45
        continue
      fi
      log "$label SETTLED → $dir"
      echo "$dir"
      return 0
    fi
    if any_chain_alive; then
      idle=0
      sleep 60
      continue
    fi
    idle=$((idle + 60))
    # GOTCHA (2026-07-17 pioreactor): launch failed after board GATE CLOSED →
    # mkdir'd empty stamp dir OR latest_out still points at an OLD run whose
    # mtime < since_epoch. Without this branch the watch spun for hours.
    if [[ $idle -ge 180 ]]; then
      if [[ -z "$dir" || "$dir_epoch" -lt "$since_epoch" ]]; then
        log "WARN: $label launch never produced a new out/ dir (latest mtime < launch) — relaunch"
        return 2
      fi
      if [[ -f "$dir/0-original-brief.md" && ! -f "$dir/state.json" ]]; then
        log "WARN: $label stalled without state.json — relaunch once"
        return 2
      fi
      local nfiles
      nfiles=$(find "$dir" -maxdepth 1 ! -path "$dir" 2>/dev/null | wc -l | tr -d ' ')
      if [[ "${nfiles:-0}" -eq 0 ]] || { [[ ! -f "$dir/0-original-brief.md" ]] && [[ ! -f "$dir/state.json" ]]; }; then
        log "WARN: $label launch dir empty/failed ($dir) — continue"
        return 2
      fi
      if [[ -f "$dir/state.json" ]] && dir_settled "$dir"; then
        log "$label SETTLED (idle) → $dir"
        echo "$dir"
        return 0
      fi
    fi
    sleep 60
  done
}

launch() {
  local brief="$1" board="$2" label="$3"
  wait_idle
  log "LAUNCH $label (detached session)"
  local pid
  pid="$(python3 "$ROOT/scripts/detach-run-loop.py" "$brief" "$board" "$label")"
  log "detached pid=$pid"
  sleep 25
  if ! any_chain_alive; then
    log "ERROR: $label failed to stay up — see out/logs/${label}-campaign.log"
    return 1
  fi
  return 0
}

# Returns 0 if a recent settled out/ is at full bar (skip cold burn).
# GOTCHA: empty stamp dirs ahead of a floor≥9 run must not force a re-burn.
# DECISION: only scan the 8 newest settled dirs — walking every historic
# ninjapcr-20260715-* flooded the log and delayed LAUNCH by minutes.
already_at_bar() {
  local label="$1" form="$2" key="$3" d n=0 ships floor
  while IFS= read -r d; do
    [[ -z "$d" ]] && continue
    # GOTCHA: *-KILLED* / SCORED dirs waste minutes on gold/glance and never bar.
    [[ "$d" == *KILLED* || "$d" == *SCORED* || "$d" == *FAILED* ]] && continue
    dir_settled "$d" || continue
    n=$((n + 1))
    # Cheap pre-filter: only call check_bar (gold/glance/log) when scorecard
    # already claims ships + floor≥9.
    ships=""; floor=""
    eval "$(python3 - "$d" <<'PY'
import json, sys
from pathlib import Path
d = Path(sys.argv[1])
for name in ("tab-scorecard.json", "quality-scorecard.json"):
    p = d / name
    if not p.is_file():
        continue
    s = json.loads(p.read_text())
    v = s.get("verdict") or {}
    ships = bool(v.get("ships")) if isinstance(v, dict) else bool(s.get("ships"))
    floor = v.get("floor") if isinstance(v, dict) else s.get("floor")
    print(f"ships={str(ships)}")
    print(f"floor={floor if floor is not None else ''}")
    break
else:
    print("ships=False")
    print("floor=")
PY
)"
    if [[ "$ships" == "True" ]] && [[ -n "$floor" ]] \
       && python3 -c "import sys; sys.exit(0 if float(sys.argv[1])>=9 else 1)" "$floor"; then
      if check_bar "$d" "$form" "$key"; then
        log "$label at bar via $d"
        return 0
      fi
    fi
    (( n >= 8 )) && break
  done < <(ls -td "$ROOT"/out/${label}-2026[0-9]* 2>/dev/null | grep -vE 'SCORED|KILLED|FAILED' || true)
  return 1
}

run_revisit() {
  local brief="$1" board="$2" label="$3" form="$4" key="$5"
  log "===== REVISIT $label ====="
  if already_at_bar "$label" "$form" "$key"; then
    log "$label already at bar — skip"
    return 0
  fi
  local t0 rc=0
  t0=$(date +%s)
  launch "$brief" "$board" "$label" || true
  wait_for_settle "$label" "$t0" || rc=$?
  if [[ $rc -eq 2 ]]; then
    log "relaunching stalled $label"
    t0=$(date +%s)
    launch "$brief" "$board" "$label" || true
    wait_for_settle "$label" "$t0" || true
  fi
  local d
  d="$(latest_out "$label")"
  if check_bar "$d" "$form" "$key"; then
    log "$label AT BAR ✓"
  else
    log "$label still below bar — continue revisit queue (SOURCE next pass)"
  fi
}

log "===== Yuri REVISIT watch start (unfinished → ≥9 before new work) ====="

# Order: cost/form SOURCE already landed for 01–04; score still open everywhere.
run_revisit briefs-loop/yuri_open_colorimeter.md out/colorimeter-board.json colorimeter optical_handheld colorimeter
run_revisit briefs-loop/yuri_ninjapcr.md out/ninjapcr-board.json ninjapcr thermocycler ninjapcr
run_revisit briefs-loop/yuri_poseidon.md out/poseidon-board.json poseidon syringe_pump poseidon
run_revisit briefs-loop/yuri_openflexure.md out/openflexure-board.json openflexure lab_microscope lab_microscope
run_revisit briefs-loop/yuri_pioreactor.md out/pioreactor-board.json pioreactor "" benchtop_bioreactor
run_revisit briefs-loop/yuri_rodeostat.md out/rodeostat-board.json rodeostat "" potentiostat
run_revisit briefs-loop/yuri_opendrop.md out/opendrop-board.json opendrop "" digital_microfluidics

# INTENT: after interconnect + class-standards SOURCE landed mid-queue, burn a
# second cold pass on anything still below score bar (cost/form may already PASS).
log "===== SCORE SECOND PASS (interconnect + standards SOURCE) ====="
run_revisit briefs-loop/yuri_open_colorimeter.md out/colorimeter-board.json colorimeter optical_handheld colorimeter
run_revisit briefs-loop/yuri_ninjapcr.md out/ninjapcr-board.json ninjapcr thermocycler ninjapcr
run_revisit briefs-loop/yuri_poseidon.md out/poseidon-board.json poseidon syringe_pump poseidon
run_revisit briefs-loop/yuri_openflexure.md out/openflexure-board.json openflexure lab_microscope lab_microscope
run_revisit briefs-loop/yuri_pioreactor.md out/pioreactor-board.json pioreactor "" benchtop_bioreactor
run_revisit briefs-loop/yuri_rodeostat.md out/rodeostat-board.json rodeostat "" potentiostat
run_revisit briefs-loop/yuri_opendrop.md out/opendrop-board.json opendrop "" digital_microfluidics

log "===== Yuri REVISIT queue complete ====="
