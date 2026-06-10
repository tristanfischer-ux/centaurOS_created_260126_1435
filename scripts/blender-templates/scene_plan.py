"""
scripts/blender-templates/scene_plan.py

PHASE 5 — UNIVERSAL component-archetype geometry compiler (the pure core).

This is the universal answer to "realistic Blender for ANY archetype, driven by
the Part-1 engineering": instead of a hand-coded ~300-line template per class (30
exist today; a novel archetype falls to a cube-grid), it maps each component
word's TYPE (content_character.character_id) to the right parametric primitive and
SIZES it from the component's REAL dimensions (the Phase-3 sizing output: Ø×L
tanks, pipe bores, reflector apertures, finned heatsinks). Deterministic, no LLM,
zero per-class code — works on archetype #1 or #1000.

It produces a GROUPED ENGINEERING-EXPLODED layout: every component is the correct
SHAPE at the correct SIZE, grouped + colour-coded by module. That is honest and
universal (it can never overlap and never lies about a size); the hand-coded
templates remain the optional bespoke "assembled-realism" polish for hero classes.

This module is PURE (no bpy) so it is unit-testable without Blender. The thin
companion compile_scene_from_state.py turns a plan into Blender objects + renders.
British spelling throughout.
"""

import re
import math

# ── component TYPE → archetype family (first match wins; order matters) ─────────
# Each family maps to a forge_blender_lib primitive in PRIMITIVE_OF below.
ARCHETYPE_PATTERNS = [
    ('vessel',   r'tank|vessel|reactor|column|drum|separator|absorber|stripper|scrubber|digester|fermenter|crystallis|crystalliz|autoclave|boiler|\bcopv\b|clarifier|settler|flash_drum|knockout|contactor_column|propellant'),
    ('rotating', r'\bmotor\b|generator|alternator|\bpump\b|compressor|turbine|\bfan\b|blower|impeller|genset|centrifuge|\bspindle\b|gearbox|actuator_rotary'),
    ('heatsink', r'heat[_\s-]?sink|heatsink|radiator|cold[_\s-]?plate|finned|dry[_\s-]?cooler|heat[_\s-]?exchanger|\bhx\b|condenser|reboiler|chiller|intercooler|economiser|economizer'),
    ('dish',     r'antenna|reflector|\bdish\b|aperture|radome|feed[_\s-]?horn|parabol|sar_'),
    ('pipe',     r'\bpipe\b|piping|\bline\b|manifold|\bheader\b|\bduct\b|conduit|\bhose\b|tubing|bus[_\s-]?bar|busbar|cable[_\s-]?run'),
    ('board',    r'\bpcb\b|\bpcba\b|\bboard\b|controller|\bbms\b|inverter|converter|\bvfd\b|\bdrive\b|\bpsu\b|rectifier|gateway|\bhmi\b|\bplc\b|\brelay\b|breaker|contactor|sensor|transducer|monitor|\becu\b|\bigbt\b|semiconductor'),
    ('panel',    r'\bpanel\b|solar|\bpv\b|photovolta|membrane|\bscreen\b|\bdoor\b|partition|radiat.*panel|\barray\b|cladding'),
    ('beam',     r'\bboom\b|\bmast\b|\bstrut\b|\btube\b|\bbeam\b|\brail\b|truss|\bspar\b|\bframe\b|chassis|bracket|\brib\b|stringer|longeron|skid|gantry'),
    ('cyl',      r'bottle|canister|accumulator|receiver|cylinder|capsule|cartridge|\bfilter\b|silencer|muffler|\breel\b|spool|roller'),
    ('cell',     r'\bcell\b|battery[_\s-]?module|prismatic|jelly[_\s-]?roll|electrode|supercap'),
]

# archetype family → forge_blender_lib primitive name used by compile_scene_from_state.py
PRIMITIVE_OF = {
    'vessel':   'compound_vessel',
    'rotating': 'compound_motor',
    'heatsink': 'compound_finned_heatsink',
    'dish':     'frustum',
    'pipe':     'pipe',
    'board':    'box',
    'panel':    'box',
    'beam':     'box',
    'cyl':      'cyl',
    'cell':     'box',
    'box':      'box',
}

# default sizes (metres) when a component carries no parsed dimension, by family.
DEFAULT_SIZE = {
    'vessel':   ('cyl', (0.4, 1.0)),
    'rotating': ('cyl', (0.18, 0.4)),
    'heatsink': ('box', (0.2, 0.2, 0.12)),
    'dish':     ('dia', (0.5,)),
    'pipe':     ('dia', (0.04,)),
    'board':    ('box', (0.2, 0.15, 0.02)),
    'panel':    ('box', (0.6, 0.4, 0.02)),
    'beam':     ('len', (1.0,)),
    'cyl':      ('cyl', (0.12, 0.3)),
    'cell':     ('box', (0.07, 0.17, 0.2)),
    'box':      ('box', (0.15, 0.15, 0.15)),
}


def archetype_of(character_id, name_human):
    """Map a component word to its archetype family (the geometry TYPE)."""
    hay = '{} {}'.format(character_id or '', name_human or '').lower()
    for fam, pat in ARCHETYPE_PATTERNS:
        if re.search(pat, hay):
            return fam
    return 'box'


def _scale_for(low):
    """mm by default (engineering dims are overwhelmingly mm); explicit metres win."""
    if 'mm' in low:
        return 0.001
    if 'cm' in low:
        return 0.01
    if re.search(r'(^|\s|\d)\s*m\b', low):
        return 1.0
    return 0.001


def parse_dim_to_metres(dim_str):
    """Parse a dimension display string into a shape + sizes in METRES.

    Returns one of:
      ('box', (w, d, h)) | ('cyl', (radius, height)) | ('dia', (radius,))
      ('len', (length,)) | None
    Handles the Phase-3 forms (Ø D × L, Ø D, DN bore, N×M×P, N×M, "<n> m/mm").
    """
    if not dim_str:
        return None
    low = str(dim_str).strip().lower()

    # Ø D × L → cylinder (diameter, length)
    m = re.search(r'ø\s*(\d+(?:\.\d+)?)\s*[×x]\s*(\d+(?:\.\d+)?)', low)
    if m:
        s = _scale_for(low)
        return ('cyl', (float(m.group(1)) * s / 2.0, float(m.group(2)) * s))
    # DN bore → pipe radius (always mm)
    m = re.search(r'\bdn\s?(\d+(?:\.\d+)?)', low)
    if m:
        return ('dia', (float(m.group(1)) * 0.001 / 2.0,))
    # Ø D → single diameter
    m = re.search(r'ø\s*(\d+(?:\.\d+)?)', low)
    if m:
        s = _scale_for(low)
        return ('dia', (float(m.group(1)) * s / 2.0,))
    # W × D × H → box (3 axes)
    m = re.search(r'(\d+(?:\.\d+)?)\s*[×x]\s*(\d+(?:\.\d+)?)\s*[×x]\s*(\d+(?:\.\d+)?)', low)
    if m:
        s = _scale_for(low)
        return ('box', (float(m.group(1)) * s, float(m.group(2)) * s, float(m.group(3)) * s))
    # N × M → plate (2 axes; thickness ~30% of short side)
    m = re.search(r'(\d+(?:\.\d+)?)\s*[×x]\s*(\d+(?:\.\d+)?)', low)
    if m:
        s = _scale_for(low)
        a, b = float(m.group(1)) * s, float(m.group(2)) * s
        return ('box', (a, b, min(a, b) * 0.3))
    # single length "<n> m/mm/cm" (aperture, deployed length, tower section…)
    m = re.search(r'(\d+(?:\.\d+)?)\s*(mm|cm|m)\b', low)
    if m:
        return ('len', (float(m.group(1)) * {'mm': 0.001, 'cm': 0.01, 'm': 1.0}[m.group(2)],))
    return None


def _clamp(v, lo, hi):
    return max(lo, min(hi, v))


def size_for_primitive(family, parsed):
    """Resolve the forge_blender_lib primitive params for a family + parsed dim.

    Returns (primitive_name, params_dict). params are in METRES and clamped to a
    sane range so a mis-parsed dimension can never blow up the scene.
    """
    prim = PRIMITIVE_OF.get(family, 'box')
    shape = parsed if parsed else DEFAULT_SIZE[family]
    kind = shape[0]
    d = shape[1]

    def dims_box():
        if kind == 'box':
            return tuple(_clamp(x, 0.01, 8.0) for x in d)
        if kind == 'cyl':
            r, h = d
            return (_clamp(2 * r, 0.01, 8.0), _clamp(2 * r, 0.01, 8.0), _clamp(h, 0.01, 8.0))
        if kind == 'dia':
            r = d[0]
            return (_clamp(2 * r, 0.01, 8.0),) * 3
        if kind == 'len':
            ln = d[0]
            return (_clamp(ln, 0.01, 8.0), _clamp(ln * 0.12, 0.01, 8.0), _clamp(ln * 0.12, 0.01, 8.0))
        return (0.15, 0.15, 0.15)

    def dims_cyl():
        if kind == 'cyl':
            return (_clamp(d[0], 0.01, 4.0), _clamp(d[1], 0.01, 8.0))
        if kind == 'dia':
            return (_clamp(d[0], 0.01, 4.0), _clamp(d[0] * 2.5, 0.02, 8.0))
        if kind == 'box':
            return (_clamp(min(d[0], d[1]) / 2.0, 0.01, 4.0), _clamp(d[2], 0.02, 8.0))
        if kind == 'len':
            return (_clamp(d[0] / 4.0, 0.01, 4.0), _clamp(d[0], 0.02, 8.0))
        return (0.12, 0.3)

    if prim == 'compound_vessel':
        r, h = dims_cyl()
        return ('compound_vessel', {'radius': r, 'height': h})
    if prim == 'compound_motor':
        r, h = dims_cyl()
        return ('compound_motor', {'body_radius': r, 'body_length': h})
    if prim == 'compound_finned_heatsink':
        w, dp, h = dims_box()
        return ('compound_finned_heatsink', {'width': w, 'depth': dp, 'height': h})
    if prim == 'frustum':
        # parabolic-ish dish: wide base, narrow apex
        r = dims_cyl()[0]
        return ('frustum', {'radius_bottom': r, 'radius_top': max(0.02, r * 0.18), 'height': max(0.05, r * 0.35)})
    if prim == 'pipe':
        r = _clamp(dims_cyl()[0], 0.01, 0.4)
        return ('pipe', {'radius': r, 'length': _clamp(r * 18, 0.2, 4.0)})
    if prim == 'cyl':
        r, h = dims_cyl()
        return ('cyl', {'radius': r, 'height': h})
    # box / board / panel / beam / cell
    w, dp, h = dims_box()
    if family == 'board':
        h = min(h, 0.04)  # boards are flat
    if family == 'panel':
        h = min(h, 0.05)
    return ('box', {'size': (w, dp, h)})


def _qty_of(word):
    for mc in word.get('modifier_characters') or []:
        if mc.get('kind') == 'quantity':
            digits = re.sub(r'[^\d]', '', str(mc.get('value', '')))
            if digits:
                return max(1, int(digits))
    return 1


def _dim_of(word):
    """Port of pickGeometryDim: prefer plural 'dimensions', else a GEOMETRIC
    singular 'dimension' (Phase-3 output); reject scalar specs mis-filed as dims."""
    spec_unit = re.compile(r'^(k?v|m?v|k?a|m?a|awg|mm²|mm2|[µu]h|m?h|nh|k?ω|k?ohm|ohm|kn|kva|k?w|k?wh|wh|ah|k?hz|[mg]hz|°c|bar|m?pa|n·?m|nm|rpm|%|db|lux|s|ms)$')
    geom = re.compile(r'ø|\bdn\s?\d|\d\s*[×x]\s*\d|\bmm\b|\bcm\b|\bkm\b|(^|\s)\d+(\.\d+)?\s*m\b|\bm\s+(aperture|deployed|stowed|diameter|length|wide|long|tall|span|height)', re.I)
    plural = None
    singular = None
    for mc in word.get('modifier_characters') or []:
        kind = mc.get('kind')
        if kind not in ('dimension', 'dimensions'):
            continue
        value = str(mc.get('value') or '')
        unit = str(mc.get('unit') or '')
        if kind == 'dimensions':
            if plural is None:
                plural = (value + ' ' + unit).strip()
            continue
        if spec_unit.match(unit.strip().lower()):
            continue
        if geom.search((value + ' ' + unit).lower()) and singular is None:
            singular = (value + ' ' + unit).strip()
    return plural or singular


# ── enclosure / structural shell detection ─────────────────────────────────────
ENCLOSURE_RE = re.compile(
    r'enclosure|chassis|\bcontainer\b|\bshell\b|cabinet|housing|chamber|\bskid\b|'
    r'fuselage|\bhull\b|casing|cubicle|rack[_\s-]?frame|primary[_\s-]?structure|'
    r'airframe|spaceframe|\btote\b|frame_structure|\bbay\b|module_frame', re.I)
STRUCTURE_MODULE_RE = re.compile(r'structure|containment|chassis|enclosure|airframe|\bframe\b', re.I)


def _item_bbox(it):
    """Axis-aligned bounding box (w, d, h) in metres for a plan item."""
    prim, p = it['primitive'], it['params']
    if prim in ('compound_vessel', 'cyl'):
        r = p.get('radius', 0.1)
        return (2 * r, 2 * r, p.get('height', 0.3))
    if prim == 'compound_motor':
        r = p['body_radius']
        return (2 * r, 2 * r, p['body_length'])
    if prim == 'compound_finned_heatsink':
        return (p['width'], p['depth'], p['height'])
    if prim == 'frustum':
        r = p['radius_bottom']
        return (2 * r, 2 * r, p['height'])
    if prim == 'pipe':
        r = p['radius']
        return (2 * r, 2 * r, p['length'])
    s = p.get('size', (0.15, 0.15, 0.15))
    return (s[0], s[1], s[2])


def _bbox_vol(it):
    w, d, h = _item_bbox(it)
    return w * d * h


def estimate_envelope(items):
    """No brief envelope → bound the product from its own components: total packed
    volume → a cube, never smaller than the largest single component."""
    vol = 0.0
    maxdim = 0.3
    for it in items:
        w, d, h = _item_bbox(it)
        vol += w * d * h * min(it.get('qty', 1), 12)
        maxdim = max(maxdim, w, d, h)
    side = (vol * 6.0) ** (1.0 / 3.0) if vol > 0 else 1.0
    side = max(0.6, min(side, 8.0), maxdim * 1.25)
    return (side, side, side)


def topo_region(topo, W, D, H):
    """Map a sub-module topology_clause → a target centre + spread INSIDE the
    envelope (origin-centred in XY, floor at z=0). THIS is what turns a parts list
    into an assembly: 'forms the base' sits low, 'mounted on top' sits high,
    'central' in the core, front/rear/side at the corresponding faces."""
    t = (topo or '').lower()
    cx, cy, cz = 0.0, 0.0, H * 0.5
    sx, sy, sz = W * 0.74, D * 0.74, H * 0.66
    if re.search(r'base|bottom|floor|foundation|lower|plinth|\bskid\b|sump|underside|ground', t):
        cz, sz = H * 0.17, H * 0.30
    elif re.search(r'\btop\b|roof|upper|\blid\b|canopy|gondola|crown|overhead|\bmast\b', t):
        cz, sz = H * 0.83, H * 0.30
    elif re.search(r'central|centre|center|middle|\bcore\b|heart|primary', t):
        cz, sz = H * 0.5, H * 0.42
    if re.search(r'front|forward|\bbow\b|\bnose\b|intake', t):
        cy, sy = -D * 0.31, D * 0.32
    elif re.search(r'\brear\b|\bback\b|\baft\b|stern|exhaust|\boutlet\b', t):
        cy, sy = D * 0.31, D * 0.32
    if re.search(r'\bleft\b|\bport\b', t):
        cx, sx = -W * 0.31, W * 0.32
    elif re.search(r'right|starboard', t):
        cx, sx = W * 0.31, W * 0.32
    if re.search(r'\bside\b|perimeter|\bwall\b|external|exterior|\bskin\b|outboard|flank', t):
        sx, sy = W * 0.92, D * 0.92
    return (cx, cy, cz), (sx, sy, sz)


def _pack_region(grp, center, spread, env, placed):
    """Lay a region's components into a tidy 3-D grid centred on the region target,
    largest-first, clamped to stay inside the envelope. No overlap within a region."""
    W, D, H = env
    cx, cy, cz = center
    sx, sy, sz = spread
    grp.sort(key=lambda it: -max(_item_bbox(it)))
    cell = max([max(_item_bbox(it)) for it in grp] + [0.05]) * 1.22
    cols = max(1, int(sx // cell))
    rows = max(1, int(sy // cell))
    per_layer = cols * rows
    for i, it in enumerate(grp):
        layer, rem = divmod(i, per_layer)
        r, c = divmod(rem, cols)
        w, d, h = _item_bbox(it)
        px = cx + (c - (cols - 1) / 2.0) * cell
        py = cy + (r - (rows - 1) / 2.0) * cell
        pz = max(h / 2.0, cz - sz / 2.0 + h / 2.0 + layer * cell)
        px = max(-W / 2 + w / 2, min(W / 2 - w / 2, px))
        py = max(-D / 2 + d / 2, min(D / 2 - d / 2, py))
        pz = max(h / 2.0, min(H - h / 2.0, pz))
        it['location'] = (round(px, 3), round(py, 3), round(pz, 3))
        placed.append(it)


def build_scene_plan(state):
    """Walk the component tree → a deterministic ASSEMBLED scene plan: a structural
    shell at the product envelope, with the internals positioned INSIDE it by each
    sub-module's topology_clause (base / top / central / front / side) and packed
    without overlap. Returns {'envelope':(W,D,H), 'modules':[…],
    'structure_module': id|None, 'items':[PlanItem…]}. PlanItem = {module_id,
    sub_id, name, family, primitive, params, location, qty, dim_source}. Pure (no bpy).
    """
    md = state.get('moduleDecomposition') or {}
    modules = md.get('modules') or []
    env = ((state.get('parsedBrief') or {}).get('constraints') or {}).get('max_dimensions_mm') or {}
    W = (env.get('w') or 0) / 1000.0
    D = (env.get('d') or 0) / 1000.0
    H = (env.get('h') or 0) / 1000.0

    # 1) per-word items (type + size), remembering module + topology
    items = []
    module_order = []
    for m in modules:
        mid = m.get('module') or 'module'
        had = False
        for sm in m.get('sub_modules') or []:
            sid = sm.get('id') or ''
            topo = (sm.get('topology_clause') or '').lower()
            for w in sm.get('words') or []:
                cid = ((w.get('content_character') or {}).get('character_id')) or ''
                name = w.get('name_human') or ''
                fam = archetype_of(cid, name)
                dim = _dim_of(w)
                prim, params = size_for_primitive(fam, parse_dim_to_metres(dim))
                items.append({
                    'module_id': mid, 'sub_id': sid, 'name': name, 'family': fam,
                    'primitive': prim, 'params': params, 'qty': _qty_of(w),
                    'topo': topo, 'dim_source': dim, 'location': (0.0, 0.0, 0.0),
                })
                had = True
        if had:
            module_order.append(mid)

    if not items:
        return {'envelope': (W, D, H), 'modules': [], 'structure_module': None, 'items': []}

    # 2) envelope: brief value, else bound it from the components
    if not (W > 0 and D > 0 and H > 0):
        W, D, H = estimate_envelope(items)

    # 3) structural SHELL — the largest enclosure-like component becomes the product
    #    body at envelope size (run_render_pipeline ghosts the structure module so it
    #    reads as a translucent shell the internals sit inside). Else a structure module.
    enclosure = None
    for it in items:
        if ENCLOSURE_RE.search('{} {}'.format(it['name'] or '', it['family'])):
            if enclosure is None or _bbox_vol(it) > _bbox_vol(enclosure):
                enclosure = it
    structure_module = enclosure['module_id'] if enclosure else None
    if structure_module is None:
        for mid in module_order:
            if STRUCTURE_MODULE_RE.search(mid):
                structure_module = mid
                break

    placed = []
    internals = items
    if enclosure is not None:
        enclosure['primitive'] = 'box'
        enclosure['params'] = {'size': (W * 0.98, D * 0.98, H * 0.98)}
        enclosure['location'] = (0.0, 0.0, round(H * 0.5, 3))
        enclosure['is_shell'] = True  # compile renders this translucent so internals show
        placed.append(enclosure)
        internals = [it for it in items if it is not enclosure]

    # 4) assemble: group internals by topology region, pack each region inside the shell
    groups = {}
    for it in internals:
        (cx, cy, cz), (sx, sy, sz) = topo_region(it['topo'], W, D, H)
        key = (round(cx, 2), round(cy, 2), round(cz, 2), round(sx, 2), round(sy, 2), round(sz, 2))
        groups.setdefault(key, ([], (cx, cy, cz), (sx, sy, sz)))[0].append(it)
    for _key, (grp, center, spread) in groups.items():
        _pack_region(grp, center, spread, (W, D, H), placed)

    return {'envelope': (W, D, H), 'modules': module_order,
            'structure_module': structure_module, 'items': placed}
