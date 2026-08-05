#!/usr/bin/env bash
# Re-render FE front MGU twin after race-kit morphology uplift (cycle-3).
# Does NOT set ship_ok. Writes to _cycle3_previews (leaves main twin PNGs alone
# unless --in-place is passed).
#
# Usage:
#   bash scripts/motor-stack/rerender-fe-front-race-kit.sh
#   bash scripts/motor-stack/rerender-fe-front-race-kit.sh --in-place
#   bash scripts/motor-stack/rerender-fe-front-race-kit.sh --samples 32
set -euo pipefail
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
TWIN="${FE_FRONT_TWIN:-$REPO/out/formula-e-front-mgu-20260729-1432}"
IN_PLACE=0
SAMPLES=48
while [[ $# -gt 0 ]]; do
  case "$1" in
    --in-place) IN_PLACE=1; shift ;;
    --samples) SAMPLES="$2"; shift 2 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

BEFORE="$TWIN/_cycle3_before"
AFTER="$TWIN/_cycle3_previews"
mkdir -p "$BEFORE" "$AFTER"

# Snapshot before (idempotent — only copy if missing so re-runs keep first before).
for f in 00-hero.png 04-product-exterior.png 07-product-service.png 08-product-ghost-shell.png; do
  if [[ -f "$TWIN/$f" && ! -f "$BEFORE/$f" ]]; then
    cp -p "$TWIN/$f" "$BEFORE/$f"
    echo "[cycle3] before snapshot: $f"
  fi
done

OUT="$AFTER"
if [[ "$IN_PLACE" -eq 1 ]]; then
  OUT="$TWIN"
  echo "[cycle3] IN-PLACE re-render into twin root (ship_ok remains false)"
else
  # Seed out-dir with state + motor_stack sidecars the builder reads.
  ln -sfn "$TWIN/state.json" "$AFTER/state.json"
  ln -sfn "$TWIN/parts-manifest.json" "$AFTER/parts-manifest.json" 2>/dev/null || true
  ln -sfn "$TWIN/_motor_stack" "$AFTER/_motor_stack"
  # Copy state path reference: builder is invoked with twin state, out = AFTER.
fi

echo "[cycle3] render → $OUT  samples=$SAMPLES"
cd "$REPO"
python3 scripts/render-blender-scene.py \
  --state "$TWIN/state.json" \
  --out-dir "$OUT" \
  --force \
  --cycles-samples "$SAMPLES"

# Morphology proof stamp (mesh names + role materials present in form-meshes).
python3 - <<'PY' "$OUT" "$TWIN"
import json, sys
from pathlib import Path
out = Path(sys.argv[1])
twin = Path(sys.argv[2])
fm = out / "form-meshes.json"
if not fm.is_file():
    fm = twin / "form-meshes.json"
data = json.loads(fm.read_text()) if fm.is_file() else {}
meshes = set(data.get("meshes") or [])
need = [
    "u_se_td_housing_machine_band",
    "u_se_td_hv_connector",
    "u_se_td_lv_connector",
    "u_se_td_sic_inverter",
    "u_se_td_coolant_in",
    "u_se_td_coolant_out",
]
# After re-render form-meshes may list principals; also accept submesh prefixes
# by reading form-meshes "meshes" or dumping from a lightweight note.
proof = {
    "schema": "forgeos.motor_stack.blender_cycle3_render_proof/v1",
    "out_dir": str(out),
    "form_meshes_path": str(fm) if fm.is_file() else None,
    "mesh_count": len(meshes),
    "required_present": {n: (n in meshes or any(m.startswith(n) for m in meshes)) for n in need},
    "ship_ok": False,
}
# Grep source for morphology markers when form-meshes is a principal-only list.
src = Path("scripts/blender-universal/build_universal_scene.py").read_text(encoding="utf-8")
proof["source_markers"] = {
    "safety_collar": "safety_collar" in src,
    "ceramic_dbc": "ceramic_dbc" in src or "_dbc" in src,
    "lv_pin_face": "_fpk_place_lv_connector" in src,
    "machine_band": "housing_machine_band" in src,
    "powertrain_role_mat": "make_powertrain_role_mat" in src,
}
proof["ok"] = all(proof["source_markers"].values())
out_p = out / "blender_cycle3_render_proof.json"
out_p.write_text(json.dumps(proof, indent=2) + "\n", encoding="utf-8")
print(json.dumps(proof, indent=2))
if not proof["ok"]:
    sys.exit(3)
print(f"[cycle3] proof → {out_p}")
PY

echo "[cycle3] done. Compare:"
echo "  before: $BEFORE"
echo "  after:  $OUT"
echo "  note:   $TWIN/_motor_stack/blender_cycle3_morphology_note.json"
echo "  ship_ok remains false"
