#!/usr/bin/env bash
#
# OpenFOAM headless smoke test.
# Uses local OpenFOAM commands when available, otherwise the pinned ARM64-capable
# container image installed for macOS development.

set -euo pipefail

OPENFOAM_IMAGE="${OPENFOAM_IMAGE:-microfluidica/openfoam:14}"

fail()
{
  printf 'OPENFOAM_SMOKE_FAIL: %s\n' "$*" >&2
  exit 1
}

print_log_excerpt()
{
  local log_path="$1"
  awk '
    {
      lines[NR % 30] = $0
    }
    END {
      start = NR > 30 ? NR - 29 : 1
      for (line = start; line <= NR; line += 1) {
        print lines[line % 30]
      }
    }
  ' "$log_path" >&2
}

run_cavity()
{
  local case_source=''
  local solver=''
  local case_dir=''
  local latest_time=''

  if [[ -d "${FOAM_TUTORIALS:-}/incompressibleFluid/cavity" ]]; then
    case_source="${FOAM_TUTORIALS}/incompressibleFluid/cavity"
    solver='foamRun'
  elif [[ -d "${FOAM_TUTORIALS:-}/incompressible/icoFoam/cavity/cavity" ]]; then
    case_source="${FOAM_TUTORIALS}/incompressible/icoFoam/cavity/cavity"
    solver='icoFoam'
  else
    fail "cavity tutorial not found under FOAM_TUTORIALS=${FOAM_TUTORIALS:-<unset>}"
  fi

  command -v blockMesh >/dev/null 2>&1 || fail 'blockMesh is unavailable'
  command -v "$solver" >/dev/null 2>&1 || fail "$solver is unavailable"
  command -v foamListTimes >/dev/null 2>&1 || fail 'foamListTimes is unavailable'

  case_dir="$(mktemp -d "${TMPDIR:-/tmp}/forgeos-openfoam-cavity.XXXXXX")"
  trap 'rm -rf "${case_dir:-}"' RETURN
  cp -a "$case_source/." "$case_dir/"

  if ! blockMesh -case "$case_dir" >"$case_dir/blockMesh.log" 2>&1; then
    print_log_excerpt "$case_dir/blockMesh.log"
    fail 'blockMesh failed; final log lines are printed above'
  fi
  if ! "$solver" -case "$case_dir" >"$case_dir/solver.log" 2>&1; then
    print_log_excerpt "$case_dir/solver.log"
    fail "$solver failed; final log lines are printed above"
  fi

  awk '
    /Solving for Ux/ {
      split($0, lhs, "Initial residual = ")
      split(lhs[2], rhs, ",")
      residual = rhs[1] + 0
      count += 1
      if (count == 1) {
        first = residual
      }
      last = residual
    }
    END {
      if (count == 0) {
        print "OPENFOAM_SMOKE_FAIL: solver log contains no Ux residuals" > "/dev/stderr"
        exit 4
      }
      printf "OPENFOAM_FIRST_UX_RESIDUAL=%.12g\n", first
      printf "OPENFOAM_LAST_UX_RESIDUAL=%.12g\n", last
      printf "OPENFOAM_UX_SOLVES=%d\n", count
      if (!(last < first)) {
        print "OPENFOAM_SMOKE_FAIL: Ux residual did not decrease" > "/dev/stderr"
        exit 5
      }
    }
  ' "$case_dir/solver.log"

  latest_time="$(foamListTimes -case "$case_dir" -latestTime)"
  [[ -n "$latest_time" ]] || fail 'solver produced no result time'
  [[ -s "$case_dir/$latest_time/U" ]] ||
    fail "velocity field is missing at result time $latest_time"

  printf 'OPENFOAM_LATEST_TIME=%s\n' "$latest_time"
  printf 'OPENFOAM_U_FIELD=%s\n' "$case_dir/$latest_time/U"
  printf 'OPENFOAM_SMOKE_PASS: cavity mesh, residual drop, and velocity field verified\n'
}

if command -v blockMesh >/dev/null 2>&1 &&
  { command -v foamRun >/dev/null 2>&1 || command -v icoFoam >/dev/null 2>&1; }; then
  printf 'OPENFOAM_RUNTIME=native\n'
  run_cavity
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

{
  declare -f fail print_log_excerpt run_cavity
  printf '\nrun_cavity\n'
} | docker run --rm -i --platform linux/arm64 "$OPENFOAM_IMAGE" bash -s
