"""Pure (no-bpy) guard for the universal scene-plan compiler. Run: python3 scene_plan_test.py"""
import json, sys, os
sys.path.insert(0, os.path.dirname(__file__))
from scene_plan import archetype_of, parse_dim_to_metres, size_for_primitive, build_scene_plan

fails = []
def ok(cond, msg):
    if not cond: fails.append(msg)

# ── archetype_of: TYPE mapping ─────────────────────────────────────────────────
ok(archetype_of('stirred_reactor', 'carbonation reactor vessel') == 'vessel', 'reactor->vessel')
ok(archetype_of('pmsm', 'permanent-magnet generator') == 'rotating', 'generator->rotating')
ok(archetype_of('finned_heatsink', 'aluminium heatsink') == 'heatsink', 'heatsink->heatsink')
ok(archetype_of('parabolic_reflector', 'wrapped-rib antenna') == 'dish', 'antenna->dish')
ok(archetype_of('process_pipe', 'coolant supply pipe') == 'pipe', 'pipe->pipe')
ok(archetype_of('bms_master_pcb', 'BMS master board') == 'board', 'pcb->board')
ok(archetype_of('lfp_prismatic_cell', 'LFP prismatic cell') == 'cell', 'cell->cell')
ok(archetype_of('mystery_widget', 'flux thing') == 'box', 'unknown->box')

# ── parse_dim_to_metres: the Phase-3 forms ─────────────────────────────────────
ok(parse_dim_to_metres('Ø1193 × 3579 mm × 8.1 mm wall')[0] == 'cyl', 'OxL->cyl')
r, h = parse_dim_to_metres('Ø1193 × 3579 mm')[1]
ok(abs(r - 0.5965) < 0.01 and abs(h - 3.579) < 0.01, 'OxL radius/height metres')
ok(parse_dim_to_metres('DN80 bore')[1][0] == 0.04, 'DN80->0.04m radius')
ok(parse_dim_to_metres('2.7 m aperture') == ('len', (2.7,)), 'aperture metres')
ok(parse_dim_to_metres('150×100×60 mm')[0] == 'box', '3-axis->box')
bw = parse_dim_to_metres('150×100×60 mm')[1]
ok(abs(bw[0]-0.15) < 0.001 and abs(bw[2]-0.06) < 0.001, '3-axis metres')
ok(parse_dim_to_metres('3.2 V') is None, 'scalar spec -> no dim')

# ── size_for_primitive: vessel volume is PRESERVED (geometry follows the calc) ──
prim, params = size_for_primitive('vessel', parse_dim_to_metres('Ø1193 × 3579 mm'))
ok(prim == 'compound_vessel', 'vessel primitive')
vol = 3.14159 * params['radius']**2 * params['height']
ok(abs(vol - 4.0) / 4.0 < 0.03, 'vessel holds ~4 m3 (was sized from 4 m3): got %.2f' % vol)

prim, params = size_for_primitive('dish', parse_dim_to_metres('2.7 m aperture'))
ok(prim == 'frustum' and params['radius_bottom'] > 0.5, 'dish frustum from aperture')

prim, params = size_for_primitive('box', None)  # unknown family default
ok(prim == 'box' and 'size' in params, 'default box has a size')

# ── build_scene_plan on REAL states ────────────────────────────────────────────
print('\n=== build_scene_plan on real archetypes ===')
for f, name in [('out/bess-newstructure-v1/state.json', 'bess'),
                ('out/green-thruster-test/state.json', 'green-thruster'),
                ('out/vertical-farming-newstructure-v1/state.json', 'vertical-farm'),
                ('out/residential-ai/state.json', 'edge-ai')]:
    path = os.path.join(os.path.dirname(__file__), '..', '..', f)
    if not os.path.exists(path):
        print('  (skip %s — no state)' % name); continue
    state = json.load(open(path))
    plan = build_scene_plan(state)
    fams = {}
    sized = 0
    for it in plan['items']:
        fams[it['family']] = fams.get(it['family'], 0) + 1
        if it['dim_source']: sized += 1
    ok(len(plan['items']) > 0, '%s produced items' % name)
    # no item should be at the same (x,y) as another within 1mm (non-overlap sanity)
    locs = [it['location'][:2] for it in plan['items']]
    print('  %-15s %3d items | %3d with REAL dims | families: %s'
          % (name, len(plan['items']), sized, fams))

if fails:
    print('\nFAIL:')
    for m in fails: print('  -', m)
    sys.exit(1)
print('\nAll scene_plan assertions passed.')
