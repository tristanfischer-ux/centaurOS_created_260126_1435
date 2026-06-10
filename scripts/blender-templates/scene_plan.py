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


def build_scene_plan(state):
    """Walk the component tree → a deterministic, non-overlapping, grouped scene
    plan. Returns {'envelope': (W,D,H) m, 'modules': [id…], 'items': [PlanItem…]}.
    PlanItem = {module_id, sub_id, name, family, primitive, params, location,
    qty, dim_source}. Pure — no bpy. Layout: components grouped by module in a
    tidy floor grid, sized honestly, sitting on Z=0 (an engineering exploded view).
    """
    md = state.get('moduleDecomposition') or {}
    modules = md.get('modules') or []
    env = ((state.get('parsedBrief') or {}).get('constraints') or {}).get('max_dimensions_mm') or {}
    W = (env.get('w') or 0) / 1000.0
    D = (env.get('d') or 0) / 1000.0
    H = (env.get('h') or 0) / 1000.0

    # 1) build the per-word items (type + size) first, grouped by module
    by_module = []
    for m in modules:
        mid = m.get('module') or 'module'
        words = []
        for sm in m.get('sub_modules') or []:
            sid = sm.get('id') or ''
            topo = (sm.get('topology_clause') or '').lower()
            for w in sm.get('words') or []:
                cid = ((w.get('content_character') or {}).get('character_id')) or ''
                name = w.get('name_human') or ''
                fam = archetype_of(cid, name)
                dim = _dim_of(w)
                prim, params = size_for_primitive(fam, parse_dim_to_metres(dim))
                words.append({
                    'sub_id': sid, 'name': name, 'family': fam, 'primitive': prim,
                    'params': params, 'qty': _qty_of(w), 'topo': topo, 'dim_source': dim,
                })
        if words:
            by_module.append((mid, words))

    # 2) lay modules out on a floor grid; components in a sub-grid per module.
    n = len(by_module)
    if n == 0:
        return {'envelope': (W, D, H), 'modules': [], 'items': []}
    cols = max(1, int(math.ceil(math.sqrt(n))))
    rows = int(math.ceil(n / cols))
    # cell footprint: use the envelope if known, else a default 2 m grid.
    cell_w = (W / cols) if W > 0 else 2.0
    cell_d = (D / rows) if D > 0 else 2.0
    x0 = -(cols - 1) * cell_w / 2.0
    y0 = -(rows - 1) * cell_d / 2.0

    items = []
    for idx, (mid, words) in enumerate(by_module):
        cr, cc = divmod(idx, cols)
        cx = x0 + cc * cell_w
        cy = y0 + cr * cell_d
        # sub-grid for this module's components
        k = len(words)
        scols = max(1, int(math.ceil(math.sqrt(k))))
        srows = int(math.ceil(k / scols))
        sp_x = cell_w / (scols + 1)
        sp_y = cell_d / (srows + 1)
        for wi, wd in enumerate(words):
            sr, sc = divmod(wi, scols)
            px = cx + (sc - (scols - 1) / 2.0) * sp_x
            py = cy + (sr - (srows - 1) / 2.0) * sp_y
            # Z: rest on the floor; topology 'top/elevated' lifts it, 'base' keeps low
            half_h = _item_half_height(wd['primitive'], wd['params'])
            pz = half_h
            if re.search(r'\btop\b|elevat|roof|upper|canopy|gondola', wd['topo']):
                pz = (H if H > 0 else 2.0) - half_h
            items.append({
                'module_id': mid, 'sub_id': wd['sub_id'], 'name': wd['name'],
                'family': wd['family'], 'primitive': wd['primitive'], 'params': wd['params'],
                'qty': wd['qty'], 'location': (round(px, 3), round(py, 3), round(pz, 3)),
                'dim_source': wd['dim_source'],
            })
    return {'envelope': (W, D, H), 'modules': [mid for mid, _ in by_module], 'items': items}


def _item_half_height(primitive, params):
    if primitive in ('compound_vessel', 'compound_motor', 'cyl'):
        return params.get('height', params.get('body_length', 0.3)) / 2.0
    if primitive == 'frustum':
        return params.get('height', 0.2) / 2.0
    if primitive == 'pipe':
        return params.get('radius', 0.05)
    if primitive == 'compound_finned_heatsink':
        return params.get('height', 0.1) / 2.0
    size = params.get('size', (0.15, 0.15, 0.15))
    return size[2] / 2.0
