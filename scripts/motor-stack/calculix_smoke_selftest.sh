#!/usr/bin/env bash
#
# CalculiX structural finite-element smoke test.
# Uses a local ccx executable when available, otherwise the native ARM64 image.

set -euo pipefail

CALCULIX_IMAGE="${CALCULIX_IMAGE:-forgeos/calculix:2.21-arm64}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

fail()
{
  printf 'CALCULIX_SMOKE_FAIL: %s\n' "$*" >&2
  exit 1
}

# Colima shares the repository's /Users path; macOS TMPDIR under /var/folders
# is not necessarily visible inside its Linux virtual machine.
work_dir="$(mktemp -d "$SCRIPT_DIR/.calculix-selftest.XXXXXX")"
trap 'rm -rf "$work_dir"' EXIT
job_name='cantilever'

# INTENT: One loaded three-dimensional solid proves that ccx assembled and
# solved a structural model, then wrote both displacement and stress fields.
cat >"$work_dir/$job_name.inp" <<'EOF'
*HEADING
ForgeOS CalculiX cantilever smoke test
*NODE
1, 0., 0., 0.
2, 1000., 0., 0.
3, 1000., 100., 0.
4, 0., 100., 0.
5, 0., 0., 100.
6, 1000., 0., 100.
7, 1000., 100., 100.
8, 0., 100., 100.
*ELEMENT, TYPE=C3D8, ELSET=SOLID
1, 1, 2, 3, 4, 5, 6, 7, 8
*MATERIAL, NAME=STEEL
*ELASTIC
210000., 0.3
*SOLID SECTION, ELSET=SOLID, MATERIAL=STEEL
*NSET, NSET=FIXED
1, 4, 5, 8
*NSET, NSET=TIP
2, 3, 6, 7
*BOUNDARY
FIXED, 1, 3
*STEP
*STATIC
*CLOAD
TIP, 3, -250.
*NODE FILE
U
*EL FILE
S
*NODE PRINT, NSET=TIP
U
*EL PRINT, ELSET=SOLID
S
*END STEP
EOF

if command -v ccx >/dev/null 2>&1; then
  printf 'CALCULIX_RUNTIME=native\n'
  (
    cd "$work_dir"
    ccx -i "$job_name"
  ) >"$work_dir/solver.log" 2>&1 || {
    awk 'NR > 20 { lines[NR % 20] = $0 } NR <= 20 { lines[NR % 20] = $0 } END { start = NR > 20 ? NR - 19 : 1; for (n = start; n <= NR; n++) print lines[n % 20] }' "$work_dir/solver.log" >&2
    fail 'ccx failed; final solver log lines are printed above'
  }
else
  command -v docker >/dev/null 2>&1 ||
    fail 'ccx and Docker are missing. Install Docker/Colima or CalculiX.'
  docker info >/dev/null 2>&1 ||
    fail 'Docker is installed but not running. Start Docker Desktop or run: colima start'
  docker image inspect "$CALCULIX_IMAGE" >/dev/null 2>&1 ||
    fail "CalculiX image is missing. Run: docker build --platform linux/arm64 -f $SCRIPT_DIR/calculix.Dockerfile -t $CALCULIX_IMAGE $SCRIPT_DIR"

  printf 'CALCULIX_RUNTIME=docker\n'
  printf 'CALCULIX_IMAGE=%s\n' "$CALCULIX_IMAGE"
  docker run --rm --platform linux/arm64 \
    -v "$work_dir:/work" \
    -w /work \
    "$CALCULIX_IMAGE" \
    -i "$job_name" >"$work_dir/solver.log" 2>&1 || {
      awk 'NR > 20 { lines[NR % 20] = $0 } NR <= 20 { lines[NR % 20] = $0 } END { start = NR > 20 ? NR - 19 : 1; for (n = start; n <= NR; n++) print lines[n % 20] }' "$work_dir/solver.log" >&2
      fail 'containerized ccx failed; final solver log lines are printed above'
    }
fi

[[ -s "$work_dir/$job_name.dat" ]] ||
  fail 'ccx did not write the requested text results'
[[ -s "$work_dir/$job_name.frd" ]] ||
  fail 'ccx did not write the finite-element result database'
rg -qi 'displacements' "$work_dir/$job_name.dat" ||
  fail 'the text results contain no displacement field'
rg -qi 'stresses' "$work_dir/$job_name.dat" ||
  fail 'the text results contain no stress field'
rg -q 'DISP' "$work_dir/$job_name.frd" ||
  fail 'the result database contains no displacement field'
rg -q 'STRESS' "$work_dir/$job_name.frd" ||
  fail 'the result database contains no stress field'

max_displacement="$(awk '
  /displacements/ { in_displacements = 1; next }
  in_displacements && NF == 4 && $1 ~ /^[0-9]+$/ {
    for (field = 2; field <= 4; field++) {
      value = $field + 0
      if (value < 0) value = -value
      if (value > maximum) maximum = value
    }
  }
  in_displacements && /stresses/ { in_displacements = 0 }
  END { printf "%.9g", maximum }
' "$work_dir/$job_name.dat")"

max_stress="$(awk '
  /stresses/ { in_stresses = 1; next }
  in_stresses && NF >= 7 && $1 ~ /^[0-9]+$/ {
    for (field = 2; field <= 7; field++) {
      value = $field + 0
      if (value < 0) value = -value
      if (value > maximum) maximum = value
    }
  }
  END { printf "%.9g", maximum }
' "$work_dir/$job_name.dat")"

awk -v value="$max_displacement" 'BEGIN { exit !(value > 0) }' ||
  fail 'maximum displacement is not positive'
awk -v value="$max_stress" 'BEGIN { exit !(value > 0) }' ||
  fail 'maximum stress is not positive'

printf 'CALCULIX_MAX_ABS_DISPLACEMENT_MM=%s\n' "$max_displacement"
printf 'CALCULIX_MAX_ABS_STRESS_MPA=%s\n' "$max_stress"
printf 'CALCULIX_RESULT_DATABASE_BYTES=%s\n' "$(wc -c <"$work_dir/$job_name.frd" | tr -d ' ')"
printf 'CALCULIX_SMOKE_PASS: displacement and stress fields verified\n'
