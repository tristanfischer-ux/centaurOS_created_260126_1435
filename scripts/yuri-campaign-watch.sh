#!/usr/bin/env bash
# INTENT: After OpenFlexure settles, cold-run the full Yuri ladder to the
# verify-then-finish bar (score ≥9, form glance, materials ±15% gold).
# DECISION: Always cold-launch each product (old SCORED dirs must not skip
# re-runs). mkdir lock — macOS has no flock. Chains launched via
# detach-run-loop.py (new session) so agent shell teardown cannot kill them.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
LOCKDIR="$ROOT/out/logs/yuri-campaign.lockdir"
LOG="$ROOT/out/logs/yuri-campaign-watch.log"
mkdir -p "$ROOT/out/logs"

if ! mkdir "$LOCKDIR" 2>/dev/null; then
  echo "[$(date -Iseconds)] campaign already locked ($LOCKDIR pid=$(cat "$LOCKDIR/pid" 2>/dev/null || echo ?))" | tee -a "$LOG"
  exit 0
fi
echo $$ >"$LOCKDIR/pid"
trap 'rm -rf "$LOCKDIR"' EXIT

log() { echo "[$(date -Iseconds)] $*" | tee -a "$LOG"; }

# INTENT: Prefer a settled run (state + scorecard/dossier) over a newer empty
# mkdir left by a GATE-CLOSED / failed detach — otherwise the watch thinks
# OpenFlexure never finished and burns another cold chain.
latest_out() {
  local prefix="$1"
  local d
  local best=""
  while IFS= read -r d; do
    [[ -z "$d" ]] && continue
    if dir_settled "$d"; then
      echo "$d"
      return 0
    fi
    [[ -z "$best" ]] && best="$d"
  done < <(ls -td "$ROOT"/out/${prefix}-2026[0-9]* 2>/dev/null | grep -v SCORED || true)
  echo "${best:-}"
}

# GOTCHA: a broad pgrep on 'serial-design-chain-v2' false-positives on the
# morning-briefing curl whose argv embeds daily-log prose mentioning the chain.
# Match only the real tsx/node invocation of the script path.
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
     || -f "$dir/quality-scorecard.json" ]] || return 1
  return 0
}

check_bar() {
  local dir="$1"
  local form="${2:-}"
  local key="${3:-}"
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
  if [[ -n "$meshes" ]]; then
    log "form-meshes present $meshes"
    if [[ -n "$form" ]]; then
      # form-meshes.json uses key "form" (build_universal_scene); accept form_id alias
      if python3 -c "import json,sys; d=json.load(open(sys.argv[1])); f=(d.get('form_id') or d.get('form') or ''); sys.exit(0 if f==sys.argv[2] else 1)" \
           "$meshes" "$form" >>"$LOG" 2>&1; then
        log "form_id PASS $form"
      else
        log "form_id FAIL want=$form"; ok=1
      fi
    fi
  elif [[ -n "$form" ]]; then
    log "WARN: no form-meshes.json in $dir"; ok=1
  fi
  # Score bar: tab-scorecard must SHIP with floor ≥9 (workbook-recalc-readback)
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
    # INTENT: failed launches leave an empty dated dir (mkdir then GATE CLOSED /
    # detach exit). Without a brief, the old stall detector never fired and the
    # watch hung forever. Escape after ~3 min idle with no live chain.
    if [[ $idle -ge 180 && -n "$dir" && "$dir_epoch" -ge "$since_epoch" ]]; then
      if [[ -f "$dir/0-original-brief.md" && ! -f "$dir/state.json" ]]; then
        log "WARN: $label stalled without state.json — relaunch once"
        return 2
      fi
      local nfiles
      nfiles=$(find "$dir" -maxdepth 1 ! -path "$dir" 2>/dev/null | wc -l | tr -d ' ')
      if [[ "${nfiles:-0}" -eq 0 ]] || { [[ ! -f "$dir/0-original-brief.md" ]] && [[ ! -f "$dir/state.json" ]]; }; then
        log "WARN: $label launch dir empty/failed ($dir) — continue ladder"
        return 2
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

run_one() {
  local brief="$1" board="$2" label="$3" form="$4" key="$5"
  local t0
  t0=$(date +%s)
  launch "$brief" "$board" "$label" || true
  local rc=0
  wait_for_settle "$label" "$t0" || rc=$?
  if [[ $rc -eq 2 ]]; then
    log "relaunching stalled $label"
    t0=$(date +%s)
    launch "$brief" "$board" "$label" || true
    wait_for_settle "$label" "$t0" || true
  fi
  local d
  d="$(latest_out "$label")"
  check_bar "$d" "$form" "$key" || log "$label below bar (continuing to next)"
}

log "===== Yuri campaign watch start ====="

# --- OpenFlexure first ---
# DECISION: if a chain is already mid-flight, ONLY wait for settle — never
# wait_idle→launch (that double-started OF after a manual detach launch).
of_dir="$(latest_out openflexure)"
OF_T0=$(date +%s)
if any_chain_alive; then
  log "chain already running — waiting for OpenFlexure settle (no extra launch)"
  OF_T0=$(( OF_T0 - 120 ))
  wait_for_settle openflexure "$OF_T0" || true
elif dir_settled "$of_dir" && { [[ -f "$of_dir/blender-universal/form-meshes.json" ]] || [[ -f "$of_dir/form-meshes.json" ]]; }; then
  log "OpenFlexure already settled with form-meshes → $of_dir"
else
  OF_T0=$(date +%s)
  launch briefs-loop/yuri_openflexure.md out/openflexure-board.json openflexure || true
  rc=0
  wait_for_settle openflexure "$OF_T0" || rc=$?
  if [[ $rc -eq 2 ]]; then
    log "relaunching stalled openflexure"
    OF_T0=$(date +%s)
    launch briefs-loop/yuri_openflexure.md out/openflexure-board.json openflexure || true
    wait_for_settle openflexure "$OF_T0" || true
  fi
fi
of_latest="$(latest_out openflexure)"
if ! check_bar "$of_latest" lab_microscope lab_microscope; then
  # DECISION: only burn another cold OF run when cost/form still fail.
  # Score-only DRAFT (PCB/Renders/Interconnect) needs SOURCE fixes, not a
  # second full chain that will reproduce the same floor-0 tabs.
  cost_ok=1 form_ok=1
  if [[ -n "$of_latest" && -f "$of_latest/state.json" ]]; then
    python3 "$ROOT/scripts/lib/gold_cost_band.py" "$of_latest/state.json" >/dev/null 2>&1 && cost_ok=0 || cost_ok=1
    if [[ -f "$of_latest/blender-universal/form-meshes.json" ]] || [[ -f "$of_latest/form-meshes.json" ]]; then
      form_ok=0
    fi
  fi
  if [[ $cost_ok -ne 0 || $form_ok -ne 0 ]]; then
    log "OpenFlexure below bar (cost/form) — one cold relaunch"
    OF_T0=$(date +%s)
    launch briefs-loop/yuri_openflexure.md out/openflexure-board.json openflexure || true
    wait_for_settle openflexure "$OF_T0" || true
    check_bar "$(latest_out openflexure)" lab_microscope lab_microscope \
      || log "OpenFlexure still below bar — continuing verify ladder"
  else
    log "OpenFlexure cost+form PASS but score <9 — skip cold relaunch; continuing ladder (score needs SOURCE)"
  fi
fi

# --- Verify ladder then remaining Yuri ---
run_one briefs-loop/yuri_open_colorimeter.md out/colorimeter-board.json colorimeter optical_handheld colorimeter
run_one briefs-loop/yuri_ninjapcr.md out/ninjapcr-board.json ninjapcr thermocycler ninjapcr
run_one briefs-loop/yuri_poseidon.md out/poseidon-board.json poseidon syringe_pump poseidon
run_one briefs-loop/yuri_pioreactor.md out/pioreactor-board.json pioreactor "" benchtop_bioreactor
run_one briefs-loop/yuri_rodeostat.md out/rodeostat-board.json rodeostat "" potentiostat
run_one briefs-loop/yuri_opendrop.md out/opendrop-board.json opendrop "" digital_microfluidics

log "===== Yuri campaign watch COMPLETE ====="
