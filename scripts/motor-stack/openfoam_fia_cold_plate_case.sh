#!/usr/bin/env bash
#
# Run the FIA-bound cold-plate rectangular-duct OpenFOAM case.
# Uses native OpenFOAM when available, otherwise microfluidica/openfoam:14
# via Docker/Colima (linux/arm64).
#
# Usage:
#   openfoam_fia_cold_plate_case.sh <case_dir>
#
# GOTCHA: <case_dir> must live under the repository (/Users/...) so Colima's
# virtiofs mount can see it. Do not place cases under macOS TMPDIR (/var/folders).

set -euo pipefail

OPENFOAM_IMAGE="${OPENFOAM_IMAGE:-microfluidica/openfoam:14}"

fail()
{
  printf 'OPENFOAM_FIA_COLD_PLATE_FAIL: %s\n' "$*" >&2
  exit 1
}

print_log_excerpt()
{
  local log_path="$1"
  awk '
    {
      lines[NR % 40] = $0
    }
    END {
      start = NR > 40 ? NR - 39 : 1
      for (line = start; line <= NR; line += 1) {
        print lines[line % 40]
      }
    }
  ' "$log_path" >&2
}

[[ $# -eq 1 ]] || fail "usage: $0 <case_dir>"
case_dir="$(cd "$1" && pwd)"
[[ -d "$case_dir/system" ]] || fail "case missing system/: $case_dir"
[[ -f "$case_dir/system/blockMeshDict" ]] || fail "case missing blockMeshDict"
[[ -f "$case_dir/0/U" ]] || fail "case missing 0/U"
[[ -f "$case_dir/0/p" ]] || fail "case missing 0/p"

run_case()
{
  # INTENT: Mesh, then steady laminar incompressibleFluid solve. Velocity
  # field + inlet kinematic pressure are the screening observables.
  command -v blockMesh >/dev/null 2>&1 || fail 'blockMesh is unavailable'
  command -v foamRun >/dev/null 2>&1 || fail 'foamRun is unavailable'
  command -v foamListTimes >/dev/null 2>&1 || fail 'foamListTimes is unavailable'

  if ! blockMesh -case "$case_dir" >"$case_dir/blockMesh.log" 2>&1; then
    print_log_excerpt "$case_dir/blockMesh.log"
    fail 'blockMesh failed; final log lines are printed above'
  fi
  if ! foamRun -case "$case_dir" >"$case_dir/solver.log" 2>&1; then
    print_log_excerpt "$case_dir/solver.log"
    fail 'foamRun failed; final log lines are printed above'
  fi

  latest_time="$(foamListTimes -case "$case_dir" -latestTime)"
  [[ -n "$latest_time" ]] || fail 'solver produced no result time'
  [[ -s "$case_dir/$latest_time/U" ]] ||
    fail "velocity field is missing at result time $latest_time"
  [[ -s "$case_dir/$latest_time/p" ]] ||
    fail "pressure field is missing at result time $latest_time"

  printf 'OPENFOAM_LATEST_TIME=%s\n' "$latest_time"
  printf 'OPENFOAM_U_FIELD=%s\n' "$case_dir/$latest_time/U"
  if grep -q 'SIMPLE solution converged' "$case_dir/solver.log"; then
    printf 'OPENFOAM_CONVERGED=1\n'
  else
    printf 'OPENFOAM_CONVERGED=0\n'
  fi
  printf 'OPENFOAM_FIA_COLD_PLATE_PASS: mesh, solve, U and p fields verified\n'
}

if command -v blockMesh >/dev/null 2>&1 && command -v foamRun >/dev/null 2>&1; then
  printf 'OPENFOAM_RUNTIME=native\n'
  run_case
  exit 0
fi

command -v docker >/dev/null 2>&1 ||
  fail 'OpenFOAM and Docker are missing. Install Docker/Colima, then pull microfluidica/openfoam:14.'

docker info >/dev/null 2>&1 ||
  fail 'Docker is installed but not running. Start Docker Desktop or run: colima start'

docker image inspect "$OPENFOAM_IMAGE" >/dev/null 2>&1 ||
  fail "OpenFOAM image is missing. Run: docker pull --platform linux/arm64 $OPENFOAM_IMAGE"

printf 'OPENFOAM_RUNTIME=docker\n'
printf 'OPENFOAM_IMAGE=%s\n' "$OPENFOAM_IMAGE"

# Mount the case directory (must be under /Users for Colima).
docker run --rm --platform linux/arm64 \
  -v "$case_dir:/work" \
  -w /work \
  "$OPENFOAM_IMAGE" \
  bash -lc '
    set -euo pipefail
    blockMesh >blockMesh.log 2>&1 || { tail -40 blockMesh.log >&2; exit 1; }
    foamRun >solver.log 2>&1 || { tail -40 solver.log >&2; exit 1; }
    latest_time="$(foamListTimes -latestTime)"
    test -n "$latest_time"
    test -s "$latest_time/U"
    test -s "$latest_time/p"
    printf "OPENFOAM_LATEST_TIME=%s\n" "$latest_time"
    printf "OPENFOAM_U_FIELD=/work/%s/U\n" "$latest_time"
    if grep -q "SIMPLE solution converged" solver.log; then
      printf "OPENFOAM_CONVERGED=1\n"
    else
      printf "OPENFOAM_CONVERGED=0\n"
    fi
    printf "OPENFOAM_FIA_COLD_PLATE_PASS: mesh, solve, U and p fields verified\n"
  '
