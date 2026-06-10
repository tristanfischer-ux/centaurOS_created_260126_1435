"""
scripts/blender-templates/compile_scene_from_state.py

PHASE 5 — universal scene compiler RUNNER (the thin bpy layer over scene_plan.py).

Turns a state.json into Blender geometry deterministically — the right primitive
for each component TYPE, at its REAL dimension — for ANY archetype, with no
per-class template. Run inside Blender:

  /Applications/Blender.app/Contents/MacOS/Blender --background --python \
    compile_scene_from_state.py -- <state.json> <out_dir>

Produces the standard Forge engineering set (hero + per-module pages) via
forge_blender_lib.run_render_pipeline. Pure geometry logic lives in scene_plan.py
(unit-tested without Blender); this file only instantiates the plan + renders.
"""
import bpy  # noqa: F401  (Blender runtime)
import sys
import os
import json
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
import forge_blender_lib as fl
from scene_plan import build_scene_plan


def _args():
    argv = sys.argv
    if '--' in argv:
        argv = argv[argv.index('--') + 1:]
    else:
        argv = []
    state_path = argv[0] if len(argv) > 0 else None
    out_dir = argv[1] if len(argv) > 1 else str(HERE / 'out-universal')
    if not state_path or not os.path.exists(state_path):
        raise SystemExit('usage: compile_scene_from_state.py -- <state.json> <out_dir>')
    return state_path, out_dir


def _instantiate(item, mat, module_objects):
    """Create one Blender object from a plan item. Returns nothing; appends to
    module_objects[module_id] via the fl helpers. Wrapped in try/except by caller."""
    name = (item['name'] or item['family'])[:48]
    loc = item['location']
    mid = item['module_id']
    prim = item['primitive']
    p = item['params']
    if prim == 'compound_vessel':
        fl.add_compound_vessel(name, loc, p['radius'], p['height'], mat, module=mid, module_objects=module_objects)
    elif prim == 'compound_motor':
        fl.add_compound_motor(name, loc, p['body_radius'], p['body_length'], mat, module=mid, module_objects=module_objects)
    elif prim == 'compound_finned_heatsink':
        fl.add_compound_finned_heatsink(name, loc, p['width'], p['depth'], p['height'], mat, module=mid, module_objects=module_objects)
    elif prim == 'frustum':
        fl.add_frustum(name, loc, p['radius_bottom'], p['radius_top'], p['height'], mat, module=mid, module_objects=module_objects)
    elif prim == 'pipe':
        r = p['radius']
        ln = p['length']
        pts = [(loc[0], loc[1], loc[2]), (loc[0], loc[1], loc[2] + ln)]
        fl.add_pipe(name, pts, r, mat, module=mid, module_objects=module_objects)
    elif prim == 'cyl':
        fl.add_cyl(name, loc, p['radius'], p['height'], mat, module=mid, module_objects=module_objects)
    else:  # box
        fl.add_box(name, loc, p['size'], mat, module=mid, module_objects=module_objects)


def main():
    state_path, out_dir = _args()
    state = json.load(open(state_path))
    plan = build_scene_plan(state)
    os.makedirs(out_dir, exist_ok=True)

    fl.init_scene()
    fl.make_default_palette()  # registers base materials / palette
    fl.make_world_white()

    # Pre-create the module_objects dict with every module id (the fl helpers index
    # module_objects[module] directly — no setdefault — so the keys must pre-exist).
    module_objects = fl.make_module_dict(plan['modules'])
    mats = {}
    created = 0
    for item in plan['items']:
        mid = item['module_id']
        if mid not in mats:
            mats[mid] = fl.module_accent_mat(mid)
        try:
            _instantiate(item, mats[mid], module_objects)
            created += 1
        except Exception as e:  # one bad item must never kill the render
            print('[compile_scene] skipped %s (%s): %s' % (item.get('name'), item.get('primitive'), e))

    print('[compile_scene] %d/%d objects in %d modules; envelope=%s'
          % (created, len(plan['items']), len(module_objects), plan['envelope']))

    fl.add_lights()
    # structure_module_id: none of our modules is guaranteed an "enclosure" — pass the
    # first module so the pipeline's translucent-shell treatment has a target; it is
    # harmless if that module isn't a true shell.
    structure_id = plan['modules'][0] if plan['modules'] else None
    fl.run_render_pipeline(out_dir, module_objects, structure_module_id=structure_id)
    print('[compile_scene] render complete →', out_dir)


if __name__ == '__main__':
    main()
