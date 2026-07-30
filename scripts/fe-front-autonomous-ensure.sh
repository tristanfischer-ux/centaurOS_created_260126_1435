#!/usr/bin/env bash
# INTENT: Idempotent ensure of watchdog + ontrack + extract. Safe to call anytime
# (agent stop, wake_signal, cron). Never leaves the autonomous loop without timers.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AUTO="${ROOT}/out/formula-e-front-mgu-20260729-1432/_autonomous"
TWIN="${ROOT}/out/formula-e-front-mgu-20260729-1432"
mkdir -p "${AUTO}"
cd "${ROOT}"

alive() {
  local pf="$1"
  [[ -f "$pf" ]] || return 1
  local pid
  pid="$(cat "$pf" 2>/dev/null || true)"
  [[ -n "$pid" ]] || return 1
  kill -0 "$pid" 2>/dev/null
}

if ! alive "${AUTO}/watchdog.pid"; then
  WATCHDOG_INTERVAL_SEC=300 WATCHDOG_STALE_SEC=600 \
    nohup bash "${ROOT}/scripts/fe-front-autonomous-watchdog.sh" \
    >>"${AUTO}/watchdog.stdout" 2>&1 &
  echo $! >"${AUTO}/watchdog.pid"
  echo "[ensure] watchdog pid=$!"
else
  echo "[ensure] watchdog ok $(cat "${AUTO}/watchdog.pid")"
fi

if ! alive "${AUTO}/ontrack.pid"; then
  nohup python3 "${ROOT}/scripts/fe-front-autonomous-ontrack.py" \
    >>"${AUTO}/ontrack.log" 2>&1 &
  echo $! >"${AUTO}/ontrack.pid"
  echo "[ensure] ontrack pid=$!"
else
  echo "[ensure] ontrack ok $(cat "${AUTO}/ontrack.pid")"
fi

SPAWN=(python3 "${ROOT}/scripts/fe-front-spawn-detached.py")

if ! alive "${AUTO}/literature-continuous.pid"; then
  # INTENT: Run until Unpaywall OA exhaustion — not a single --limit 40 batch.
  # DECISION: start_new_session via spawn-detached so IDE shell teardown cannot reap workers.
  pid="$("${SPAWN[@]}" \
    --pid-file "${AUTO}/literature-continuous.pid" \
    --log "${TWIN}/_fpk_literature_continuous.stdout" \
    --cwd "${ROOT}" \
    -- python3 "${ROOT}/scripts/ingest/fpk-literature-continuous.py" \
      --batch 25 --extract-batch 0 --max-idle-batches 4 --max-hours 10 --sleep-sec 20)"
  cp "${AUTO}/literature-continuous.pid" "${AUTO}/fulltext.pid"
  echo "[ensure] literature-continuous pid=${pid}"
else
  echo "[ensure] literature-continuous ok $(cat "${AUTO}/literature-continuous.pid")"
  cp "${AUTO}/literature-continuous.pid" "${AUTO}/fulltext.pid" 2>/dev/null || true
fi

# Prefer extract-loop (single-flight). Treat zombie/stale extract.pid as dead.
if ! alive "${AUTO}/extract-loop.pid"; then
  if alive "${AUTO}/extract.pid"; then
    # Legacy one-shot extract still running — leave it; loop starts when it dies.
    echo "[ensure] extract one-shot ok $(cat "${AUTO}/extract.pid")"
  else
    pid="$("${SPAWN[@]}" \
      --pid-file "${AUTO}/extract-loop.pid" \
      --log "${AUTO}/extract-loop.log" \
      --cwd "${ROOT}" \
      -- python3 "${ROOT}/scripts/ingest/fpk-extract-loop.py" \
        --batch 12 --sleep-sec 15 --max-hours 10 --idle-stop 8)"
    cp "${AUTO}/extract-loop.pid" "${AUTO}/extract.pid"
    echo "[ensure] extract-loop pid=${pid}"
  fi
else
  echo "[ensure] extract-loop ok $(cat "${AUTO}/extract-loop.pid")"
  cp "${AUTO}/extract-loop.pid" "${AUTO}/extract.pid" 2>/dev/null || true
fi

if [[ -f "${AUTO}/overnight.hold" ]]; then
  echo "[ensure] overnight HOLD ($(head -1 "${AUTO}/overnight.hold")) — skip respawn"
elif ! alive "${AUTO}/overnight.pid"; then
  # INTENT: Overnight L→A→F→C FFF executor (literature gate then form work).
  # Overnight holds overnight.lock — a second spawn exits 0 immediately.
  # HARD literature: wait for OA exhaustion before FFF audit (user bar).
  export FPK_OVERNIGHT_HOURS=10 FPK_PHASE_L_HOURS=8 FPK_LITERATURE_HARD=1
  pid="$("${SPAWN[@]}" \
    --pid-file "${AUTO}/overnight.pid" \
    --log "${AUTO}/overnight.log" \
    --cwd "${ROOT}" \
    -- python3 "${ROOT}/scripts/fe-front-overnight-fff-fpk.py")"
  echo "[ensure] overnight pid=${pid} (LITERATURE_HARD=1)"
else
  echo "[ensure] overnight ok $(cat "${AUTO}/overnight.pid")"
fi

# Fail-closed on DB prove (includes writeback + wire + TS/Python consumers).
# Do not advertise "verified" when prove exits non-zero.
set +e
python3 "${ROOT}/scripts/ingest/download-fpk-oa-fulltext.py" --prove \
  >>"${AUTO}/fulltext-prove.log" 2>&1
FULLTEXT_PROVE_RC=$?
# Prove owns writeback (so this-cycle Δ is measured) + wire + consumers + ledger
python3 "${ROOT}/scripts/fe-front-prove-db-knowledge.py" \
  --twin "${TWIN}" \
  >>"${AUTO}/db-knowledge-prove.log" 2>&1
PROVE_RC=$?
set -e

DB_NOTE="fulltext_prove=${FULLTEXT_PROVE_RC} db_prove=${PROVE_RC}"
if [[ "${PROVE_RC}" -ne 0 ]]; then
  echo "[ensure] DB knowledge NOT verified (${DB_NOTE}) — see ${AUTO}/db-knowledge-prove.log"
  python3 "${ROOT}/scripts/fe-front-autonomous-heartbeat.py" \
    --phase L --state DEGRADED --step ensure_db_failed \
    --note "ensure.sh DB bars failed: ${DB_NOTE}" \
    --next "fix writeback/prove bars; re-run ensure" >/dev/null || true
else
  python3 "${ROOT}/scripts/fe-front-autonomous-heartbeat.py" \
    --phase L --state RUNNING --step ensure_timers \
    --note "ensure.sh: watchdog+ontrack+fulltext+extract+db USEFUL (${DB_NOTE})" \
    --next "continue OA fulltext + extract + wire + DB growth" >/dev/null
fi

python3 "${ROOT}/scripts/fe-front-autonomous-ontrack.py" --once | head -20

# Abstract-only extract (papers with no open PDF) — parallel to fulltext extract-loop.
# Uses a different OpenRouter model so both can run without fighting over one seat.
if ! alive "${AUTO}/abstract-extract-loop.pid"; then
  pid="$("${SPAWN[@]}" \
    --pid-file "${AUTO}/abstract-extract-loop.pid" \
    --log "${AUTO}/abstract-extract-loop.log" \
    --cwd "${ROOT}" \
    -- python3 "${ROOT}/scripts/ingest/fpk-abstract-extract-loop.py" \
      --batch 20 --sleep-sec 12 --max-hours 8 --idle-stop 6 \
      --model google/gemini-2.5-flash)"
  echo "[ensure] abstract-extract-loop pid=${pid}"
else
  echo "[ensure] abstract-extract-loop ok $(cat "${AUTO}/abstract-extract-loop.pid")"
fi

# Half-done closure loop: plain-language scoreboard + Sol/GLM/Kimi punch list + WP fixes.
# Does not claim ship_ok. Safe to re-call; single-flight via pid file.
if ! alive "${AUTO}/half-done-closure.pid"; then
  export FPK_CLOSURE_MAX_CYCLES="${FPK_CLOSURE_MAX_CYCLES:-24}"
  export FPK_CLOSURE_SLEEP_SEC="${FPK_CLOSURE_SLEEP_SEC:-120}"
  export FPK_CLOSURE_COUNCIL_EVERY="${FPK_CLOSURE_COUNCIL_EVERY:-1}"
  pid="$("${SPAWN[@]}" \
    --pid-file "${AUTO}/half-done-closure.pid" \
    --log "${AUTO}/half-done-closure.log" \
    --cwd "${ROOT}" \
    -- python3 "${ROOT}/scripts/fe-front-half-done-closure-loop.py")"
  echo "[ensure] half-done-closure loop pid=${pid}"
else
  echo "[ensure] half-done-closure ok $(cat "${AUTO}/half-done-closure.pid")"
fi

echo "[ensure] done $(date -u +%Y-%m-%dT%H:%M:%SZ)"
