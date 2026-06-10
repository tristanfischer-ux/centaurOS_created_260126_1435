"""run_authored_scene_checks.py — B3 verify step, runs INSIDE headless Blender.

Executes an authored blender-scene.py, then runs forge_scene_checks.run_all_checks
against the supplied spec and writes the chain-consumable JSON report.

Modes:
  check  — fl.run_render_pipeline is stubbed to a no-op: geometry is built
           and checked in seconds without rendering (used by the <=4-iteration
           verify-revise loop in scripts/author-blender-scene.tsx).
  render — the scene renders the full pipeline (3 spatial + hero + per-module
           PNGs to $BLENDER_OUT_DIR), then the same checks run on the final
           geometry (run_render_pipeline restores materials/scales, so the
           checked geometry is identical).

Usage:
  blender --background --python run_authored_scene_checks.py -- \
      <scene.py> <spec.json> <report-out.json> <check|render>

Exit: 0 all checks pass; 2 at least one deterministic check failed;
      4 the scene script itself raised.
"""
import json
import sys
import traceback
from pathlib import Path

argv = sys.argv
args = argv[argv.index("--") + 1:] if "--" in argv else []
if len(args) < 4:
    print("usage: ... -- <scene.py> <spec.json> <report.json> <check|render>",
          file=sys.stderr)
    sys.exit(1)
scene_path, spec_path, report_path, mode = (Path(args[0]), Path(args[1]),
                                            Path(args[2]), args[3])

# Lib resolution: scene dir first (author loop copies the lib next to the
# scene so candidates stay standalone), templates dir as fallback.
sys.path.insert(0, str(Path(__file__).parent))
sys.path.insert(0, str(scene_path.parent))
import forge_blender_lib as fl  # noqa: E402
import forge_scene_checks as fsc  # noqa: E402

if mode == "check":
    def _stub_render(out_dir, module_objects, *a, **k):
        print(f"[author-check] run_render_pipeline stubbed "
              f"({len(module_objects)} modules) — check mode, no render")
    fl.run_render_pipeline = _stub_render

src = scene_path.read_text()
try:
    exec(compile(src, str(scene_path), "exec"),
         {"__name__": "__main__", "__file__": str(scene_path)})
except SystemExit:
    pass
except Exception:
    err = traceback.format_exc()
    print(f"[author-check] scene raised:\n{err}", file=sys.stderr)
    report_path.write_text(json.dumps({
        "checks_api_version": fsc.CHECKS_API_VERSION,
        "ok": False, "scene_error": err.splitlines()[-1],
        "counts": {"pass": 0, "warn": 0, "fail": 1},
        "findings": [{"check": "scene_executes", "status": "fail",
                      "detail": err.splitlines()[-1], "objects": [],
                      "traceback": err}],
    }, indent=2))
    sys.exit(4)

spec = json.loads(spec_path.read_text())
findings, ok = fsc.run_all_checks(spec)
rep = fsc.report(findings, ok)
rep["mode"] = mode
report_path.write_text(json.dumps(rep, indent=2))
print(json.dumps(rep, indent=2))
sys.exit(0 if ok else 2)
