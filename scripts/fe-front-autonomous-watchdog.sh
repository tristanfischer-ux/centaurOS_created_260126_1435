#!/usr/bin/env bash
# INTENT: Real OS timer (not LLM) — every 600s check FPK autonomous heartbeat.
# If stale (>12 min), write wake_signal + RESUME hint so the agent continues.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AUTO="${ROOT}/out/formula-e-front-mgu-20260729-1432/_autonomous"
HB="${AUTO}/heartbeat.json"
LOG="${AUTO}/watchdog.log"
WAKE="${AUTO}/wake_signal"
STATUS="${AUTO}/STATUS.md"
# Council-aligned (2026-07-29): check every 5 min; wake if heartbeat > 10 min.
INTERVAL="${WATCHDOG_INTERVAL_SEC:-300}"
STALE_SEC="${WATCHDOG_STALE_SEC:-600}"

mkdir -p "${AUTO}"
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] watchdog start interval=${INTERVAL}s stale=${STALE_SEC}s pid=$$" | tee -a "${LOG}"
echo $$ > "${AUTO}/watchdog.pid"

while true; do
  sleep "${INTERVAL}"
  NOW=$(date +%s)
  TS_UTC=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  if [[ ! -f "${HB}" ]]; then
    echo "[${TS_UTC}] WAKE: missing heartbeat" | tee -a "${LOG}"
    printf '%s\n' "{\"reason\":\"missing_heartbeat\",\"at\":\"${TS_UTC}\"}" > "${WAKE}"
    {
      echo ""
      echo "## WATCHDOG_WAKE ${TS_UTC}"
      echo "- Missing heartbeat.json — resume Phase 0.5 / next incomplete step"
    } >> "${STATUS}"
    continue
  fi
  # updated_at unix or ISO
  UPDATED=$(python3 - <<'PY' "${HB}"
import json,sys,time
from datetime import datetime,timezone
p=sys.argv[1]
d=json.load(open(p))
u=d.get("updated_at_unix") or d.get("updated_at")
if isinstance(u,(int,float)):
    print(int(u)); raise SystemExit
if isinstance(u,str) and u:
    try:
        # ISO
        if u.endswith("Z"):
            dt=datetime.fromisoformat(u.replace("Z","+00:00"))
        else:
            dt=datetime.fromisoformat(u)
        print(int(dt.timestamp())); raise SystemExit
    except Exception:
        pass
print(0)
PY
)
  AGE=$(( NOW - UPDATED ))
  PHASE=$(python3 -c "import json; print(json.load(open('${HB}')).get('phase','?'))" 2>/dev/null || echo "?")
  STATE=$(python3 -c "import json; print(json.load(open('${HB}')).get('state','?'))" 2>/dev/null || echo "?")
  echo "[${TS_UTC}] ok age=${AGE}s phase=${PHASE} state=${STATE}" | tee -a "${LOG}"
  if [[ "${STATE}" == "COMPLETE" || "${STATE}" == "BLOCKED_NEEDING_HUMAN" ]]; then
    echo "[${TS_UTC}] terminal state=${STATE} — watchdog continues monitoring only" | tee -a "${LOG}"
    continue
  fi
  if (( AGE > STALE_SEC )); then
    echo "[${TS_UTC}] WAKE: stale heartbeat age=${AGE}s > ${STALE_SEC}s" | tee -a "${LOG}"
    printf '%s\n' "{\"reason\":\"stale_heartbeat\",\"age_s\":${AGE},\"phase\":\"${PHASE}\",\"at\":\"${TS_UTC}\"}" > "${WAKE}"
    {
      echo ""
      echo "## WATCHDOG_WAKE ${TS_UTC}"
      echo "- Stale heartbeat age=${AGE}s phase=${PHASE} state=${STATE}"
      echo "- Action: continue next incomplete step; if stuck call Sol/GLM/Kimi|Opus5 unstick"
      echo "- Resume hint: see ${AUTO}/next_step.txt"
      echo "- Also ran fe-front-autonomous-ensure.sh to keep timers/extract alive"
    } >> "${STATUS}"
    echo "RESUME phase=${PHASE} at=${TS_UTC} age=${AGE}" >> "${AUTO}/resume_queue.log"
    # Keep the autonomous stack alive even if the agent session died
    bash "${ROOT}/scripts/fe-front-autonomous-ensure.sh" >>"${LOG}" 2>&1 || true
  fi
done
