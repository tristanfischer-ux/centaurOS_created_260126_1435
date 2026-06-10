"""forge_scene_checks.py — deterministic Blender scene checks (B1/B3).

ANVIL-UNIVERSAL-LOOP-PLAN.md WS-B/B3: deterministic geometry checks DECIDE;
vision judges only advise. Runs INSIDE Blender (headless) against a scene
composed with the forge_blender_lib B1 primitives (or any scene whose
objects carry the fl_module / fl_assembly / fl_relations / fl_structure_root
custom properties — fl.sync_module_tags() retrofits legacy templates).

Checks (each returns a list of structured findings):
  module_tag_count(expected)                — module tags match decomposition
  scene_bbox_within_envelope(envelope_mm)   — scene fits the design envelope
  no_interpenetration(tolerance_mm)         — unrelated assemblies don't clash
  connectivity()                            — nothing floats: every tagged
                                              object reaches a structure root
  clearance_zones_empty(tolerance_mm)       — declared keep-clear volumes empty
  centre_of_mass_within_support_polygon(..) — CoM over the ground-contact hull

Finding shape: {"check", "status": "pass"|"warn"|"fail", "detail", "objects"}.
Only "fail" findings gate; "warn" renders + flags (gate-severity philosophy).

Chain-stage usage (prints JSON to stdout, exit 2 on any fail):
  blender --background --python <scene.py> ... then in the same session
  import forge_scene_checks as fsc; fsc.run_all_checks(spec)
or standalone on a .blend:
  blender --background scene.blend --python forge_scene_checks.py -- spec.json

KNOWN LIMITS (B1 increment, documented not hidden): interpenetration +
clearance checks use world-space AABBs (rotated parts over-approximate);
clearance zones ignore zone rotation. Tighten to oriented boxes in B3 if
AABB false-positives surface in practice.
"""
import json
import math
import sys

import bpy
import mathutils

CHECKS_API_VERSION = "1.0.0"

# Helper / non-design objects excluded from every check.
_EXCLUDE_PREFIXES = ("fl_ground",)


def _scene_meshes():
    out = []
    for obj in bpy.data.objects:
        if obj.type != "MESH":
            continue
        if any(obj.name.startswith(p) for p in _EXCLUDE_PREFIXES):
            continue
        out.append(obj)
    return out


def _world_aabb(obj):
    xs, ys, zs = [], [], []
    for v in obj.bound_box:
        wv = obj.matrix_world @ mathutils.Vector(v)
        xs.append(wv.x); ys.append(wv.y); zs.append(wv.z)
    return (min(xs), max(xs)), (min(ys), max(ys)), (min(zs), max(zs))


def _aabb_overlap_depth_m(a, b):
    """Minimum-axis overlap depth of two AABBs (metres). > 0 only when the
    boxes genuinely intersect on ALL three axes."""
    depths = []
    for (amin, amax), (bmin, bmax) in zip(a, b):
        d = min(amax, bmax) - max(amin, bmin)
        if d <= 0:
            return 0.0
        depths.append(d)
    return min(depths)


def _group_key(obj):
    """Assembly grouping key — fl_assembly preferred, fl_module fallback for
    legacy scenes, object name as last resort."""
    return str(obj.get("fl_assembly") or obj.get("fl_module") or obj.name)


def _relations():
    """All declared relation edges as (subject_name, rel, target_name)."""
    edges = []
    for obj in bpy.data.objects:
        raw = obj.get("fl_relations")
        if not raw:
            continue
        try:
            rels = json.loads(raw)
        except (ValueError, TypeError):
            continue
        for r in rels:
            tgt = r.get("target")
            if tgt:
                edges.append((obj.name, r.get("rel", "attached_to"), tgt))
    return edges


def _finding(check, status, detail, objects=None):
    return {"check": check, "status": status, "detail": detail,
            "objects": sorted(objects or [])}


# ─── Check 1: module tag count ────────────────────────────────────────────


def module_tag_count(expected):
    """expected: int (distinct module-tag count must equal it) or an
    iterable of module ids (set equality, missing/extra reported)."""
    tags = sorted({str(o.get("fl_module")) for o in _scene_meshes() if o.get("fl_module")})
    if isinstance(expected, int):
        ok = len(tags) == expected
        return [_finding("module_tag_count", "pass" if ok else "fail",
                         f"{len(tags)} distinct module tags (expected {expected}): {tags}")]
    exp = sorted(str(e) for e in expected)
    missing = sorted(set(exp) - set(tags))
    extra = sorted(set(tags) - set(exp))
    if not missing and not extra:
        return [_finding("module_tag_count", "pass",
                         f"all {len(exp)} expected module tags present")]
    return [_finding("module_tag_count", "fail",
                     f"module tag mismatch — missing={missing} extra={extra}",
                     missing + extra)]


# ─── Check 2: scene bbox within envelope ──────────────────────────────────


def scene_bbox_within_envelope(envelope_mm, tol=0.05):
    """envelope_mm: (x, y, z) overall design envelope in mm. Each scene-bbox
    axis must be <= envelope*(1+tol) — over-envelope FAILS. An axis under
    envelope*(1-tol) is a WARN (under-filled scene — suspicious but not
    wrong by itself)."""
    meshes = _scene_meshes()
    if not meshes:
        return [_finding("scene_bbox_within_envelope", "fail", "scene has no mesh objects")]
    xs, ys, zs = [], [], []
    for o in meshes:
        (x0, x1), (y0, y1), (z0, z1) = _world_aabb(o)
        xs += [x0, x1]; ys += [y0, y1]; zs += [z0, z1]
    dims_m = (max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs))
    env_m = tuple(float(e) / 1000.0 for e in envelope_mm)
    findings = []
    for axis, dim, env in zip("XYZ", dims_m, env_m):
        if env <= 0:
            continue
        if dim > env * (1 + tol):
            findings.append(_finding(
                "scene_bbox_within_envelope", "fail",
                f"axis {axis}: scene {dim:.3f} m exceeds envelope {env:.3f} m (+{tol:.0%} tol)"))
        elif dim < env * (1 - tol):
            findings.append(_finding(
                "scene_bbox_within_envelope", "warn",
                f"axis {axis}: scene {dim:.3f} m under-fills envelope {env:.3f} m (-{tol:.0%} tol)"))
    if not findings:
        findings.append(_finding(
            "scene_bbox_within_envelope", "pass",
            f"scene bbox {tuple(round(d, 3) for d in dims_m)} m within envelope "
            f"{tuple(round(e, 3) for e in env_m)} m ±{tol:.0%}"))
    return findings


# ─── Check 3: no interpenetration ─────────────────────────────────────────


def _related_groups():
    """Set of frozenset({group_a, group_b}) adjacent via ANY declared
    relation (contains/supports/attached_to) between member objects."""
    by_name = {o.name: o for o in bpy.data.objects}
    related = set()
    for subj, _rel, tgt in _relations():
        so, to = by_name.get(subj), by_name.get(tgt)
        if so is None or to is None:
            continue
        ga, gb = _group_key(so), _group_key(to)
        if ga != gb:
            related.add(frozenset((ga, gb)))
    return related


def no_interpenetration(tolerance_mm=5.0):
    """Pairwise world-AABB clash test between objects of UNRELATED
    assemblies. Same-assembly overlaps and overlaps between assemblies with
    a declared relation (wing attached_to fuselage, vessel supported by
    skid) are exempt — those intersections are intentional joins. Fails
    when min-axis penetration depth exceeds tolerance_mm."""
    tol_m = float(tolerance_mm) / 1000.0
    meshes = _scene_meshes()
    aabbs = {o.name: _world_aabb(o) for o in meshes}
    related = _related_groups()
    findings = []
    for i in range(len(meshes)):
        for j in range(i + 1, len(meshes)):
            a, b = meshes[i], meshes[j]
            ga, gb = _group_key(a), _group_key(b)
            if ga == gb or frozenset((ga, gb)) in related:
                continue
            depth = _aabb_overlap_depth_m(aabbs[a.name], aabbs[b.name])
            if depth > tol_m:
                findings.append(_finding(
                    "no_interpenetration", "fail",
                    f"{a.name} ({ga}) interpenetrates {b.name} ({gb}) by "
                    f"{depth * 1000:.0f} mm with no declared relation",
                    [a.name, b.name]))
    if not findings:
        findings.append(_finding("no_interpenetration", "pass",
                                 f"no unrelated-assembly clash > {tolerance_mm} mm "
                                 f"({len(meshes)} meshes)"))
    return findings


# ─── Check 4: connectivity (nothing floats) ───────────────────────────────


def connectivity():
    """Every module-tagged mesh object must reach a declared structure root
    (fl_structure_root) by walking declared relations (undirected; the B1
    primitives auto-attach internal parts to their assembly root, so one
    declared relation per assembly is enough). Floating modules fail."""
    meshes = _scene_meshes()
    tagged = [o for o in meshes if o.get("fl_module")]
    roots = [o.name for o in bpy.data.objects if o.get("fl_structure_root")]
    if not roots:
        return [_finding("connectivity", "fail",
                         "no structure root declared (fl.declare_structure_root)")]
    adj = {}
    for subj, _rel, tgt in _relations():
        adj.setdefault(subj, set()).add(tgt)
        adj.setdefault(tgt, set()).add(subj)
    reached = set()
    stack = list(roots)
    while stack:
        n = stack.pop()
        if n in reached:
            continue
        reached.add(n)
        stack.extend(adj.get(n, ()))
    floating = [o.name for o in tagged if o.name not in reached]
    if floating:
        return [_finding("connectivity", "fail",
                         f"{len(floating)} module-tagged object(s) cannot reach a "
                         f"structure root via supports/attached_to/contains relations",
                         floating)]
    return [_finding("connectivity", "pass",
                     f"all {len(tagged)} tagged objects reach a structure root "
                     f"({len(roots)} root(s))")]


# ─── Check 5: clearance zones empty ───────────────────────────────────────


def clearance_zones_empty(tolerance_mm=1.0):
    """Every EMPTY tagged fl_clearance_zone must contain no mesh geometry
    (AABB intrusion deeper than tolerance_mm). The zone's declared owner
    assembly is exempt. Zone rotation is ignored (axis-aligned zones only)."""
    tol_m = float(tolerance_mm) / 1000.0
    zones = [o for o in bpy.data.objects
             if o.type == "EMPTY" and o.get("fl_clearance_zone")]
    if not zones:
        return [_finding("clearance_zones_empty", "pass", "no clearance zones declared")]
    findings = []
    meshes = _scene_meshes()
    for zone in zones:
        size = zone.get("fl_zone_size_m") or [zone.scale.x, zone.scale.y, zone.scale.z]
        cx, cy, cz = zone.matrix_world.translation
        zaabb = ((cx - size[0] / 2, cx + size[0] / 2),
                 (cy - size[1] / 2, cy + size[1] / 2),
                 (cz - size[2] / 2, cz + size[2] / 2))
        owner = str(zone.get("fl_zone_owner") or "")
        intruders = []
        for o in meshes:
            if owner and _group_key(o) == owner:
                continue
            depth = _aabb_overlap_depth_m(zaabb, _world_aabb(o))
            if depth > tol_m:
                intruders.append((o.name, depth))
        if intruders:
            worst = max(d for _, d in intruders)
            findings.append(_finding(
                "clearance_zones_empty", "fail",
                f"zone {zone.name}: {len(intruders)} intruder(s), worst "
                f"{worst * 1000:.0f} mm intrusion", [n for n, _ in intruders]))
        else:
            findings.append(_finding("clearance_zones_empty", "pass",
                                     f"zone {zone.name} is clear"))
    return findings


# ─── Check 6: centre of mass within support polygon ──────────────────────


def _convex_hull_2d(points):
    """Andrew monotone chain. points: list of (x, y). Returns CCW hull."""
    pts = sorted(set(points))
    if len(pts) <= 2:
        return pts

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    lower, upper = [], []
    for p in pts:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    for p in reversed(pts):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    return lower[:-1] + upper[:-1]


def _point_in_polygon(pt, poly):
    if len(poly) < 3:
        return False
    x, y = pt
    inside = False
    j = len(poly) - 1
    for i in range(len(poly)):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def centre_of_mass_within_support_polygon(masses, scope_assemblies=None,
                                          ground_tol_mm=100.0):
    """masses: dict {assembly_or_object_name: mass_kg} from the CALLER (the
    engineering contract knows masses; geometry does not). CoM = mass-
    weighted mean of each named assembly's AABB centre. Support polygon =
    convex hull (XY) of the AABB corners of ground-contact objects (lowest
    z within ground_tol_mm of the scope's minimum z). scope_assemblies
    restricts the test to one island (a composed scene may hold several
    independent structures)."""
    meshes = _scene_meshes()
    if scope_assemblies:
        scope = {str(s) for s in scope_assemblies}
        meshes = [o for o in meshes if _group_key(o) in scope]
    if not meshes:
        return [_finding("centre_of_mass_within_support_polygon", "fail",
                         "no meshes in scope")]
    if not masses:
        return [_finding("centre_of_mass_within_support_polygon", "warn",
                         "no masses supplied — check skipped")]
    # Group AABBs by assembly key (also index object names directly).
    group_boxes = {}
    for o in meshes:
        aabb = _world_aabb(o)
        for key in (_group_key(o), o.name):
            g = group_boxes.setdefault(key, [[1e18, -1e18], [1e18, -1e18], [1e18, -1e18]])
            for ax in range(3):
                g[ax][0] = min(g[ax][0], aabb[ax][0])
                g[ax][1] = max(g[ax][1], aabb[ax][1])
    com = [0.0, 0.0, 0.0]
    total = 0.0
    unknown = []
    for name, kg in masses.items():
        box = group_boxes.get(str(name))
        if box is None:
            unknown.append(str(name))
            continue
        c = [(box[ax][0] + box[ax][1]) / 2 for ax in range(3)]
        for ax in range(3):
            com[ax] += c[ax] * float(kg)
        total += float(kg)
    findings = []
    if unknown:
        findings.append(_finding("centre_of_mass_within_support_polygon", "warn",
                                 f"mass entries with no matching assembly/object: {unknown}",
                                 unknown))
    if total <= 0:
        findings.append(_finding("centre_of_mass_within_support_polygon", "fail",
                                 "total mass resolved to zero"))
        return findings
    com = [c / total for c in com]
    # Ground-contact objects → support polygon.
    zmin = min(_world_aabb(o)[2][0] for o in meshes)
    tol_m = float(ground_tol_mm) / 1000.0
    contact_pts = []
    contact_names = []
    for o in meshes:
        (x0, x1), (y0, y1), (z0, _z1) = _world_aabb(o)
        if z0 <= zmin + tol_m:
            contact_pts += [(x0, y0), (x0, y1), (x1, y0), (x1, y1)]
            contact_names.append(o.name)
    hull = _convex_hull_2d(contact_pts)
    if len(hull) < 3:
        findings.append(_finding("centre_of_mass_within_support_polygon", "fail",
                                 "support polygon degenerate (< 3 hull points)",
                                 contact_names))
        return findings
    inside = _point_in_polygon((com[0], com[1]), hull)
    findings.append(_finding(
        "centre_of_mass_within_support_polygon", "pass" if inside else "fail",
        f"CoM ({com[0]:.3f}, {com[1]:.3f}, {com[2]:.3f}) m is "
        f"{'inside' if inside else 'OUTSIDE'} the support polygon "
        f"({len(hull)}-gon from {len(contact_names)} contact object(s), "
        f"total mass {total:.0f} kg)", contact_names))
    return findings


# ─── Aggregate runner + chain-consumable JSON ─────────────────────────────


def run_all_checks(spec):
    """spec keys (all optional except what the scene claims):
      expected_modules: int | [module_id, ...]
      envelope_mm: [x, y, z]
      envelope_tol: float (default 0.05)
      interpenetration_tolerance_mm: float (default 5)
      clearance_tolerance_mm: float (default 1)
      com: [{"masses": {name: kg}, "scope": [assembly, ...],
             "ground_tol_mm": 100}, ...]
    Returns (findings, ok) — ok is False iff any finding has status "fail"."""
    findings = []
    if spec.get("expected_modules") is not None:
        findings += module_tag_count(spec["expected_modules"])
    if spec.get("envelope_mm"):
        findings += scene_bbox_within_envelope(spec["envelope_mm"],
                                               tol=float(spec.get("envelope_tol", 0.05)))
    findings += no_interpenetration(float(spec.get("interpenetration_tolerance_mm", 5.0)))
    findings += connectivity()
    findings += clearance_zones_empty(float(spec.get("clearance_tolerance_mm", 1.0)))
    for com_spec in spec.get("com", []):
        findings += centre_of_mass_within_support_polygon(
            com_spec.get("masses", {}),
            scope_assemblies=com_spec.get("scope"),
            ground_tol_mm=float(com_spec.get("ground_tol_mm", 100.0)))
    ok = not any(f["status"] == "fail" for f in findings)
    return findings, ok


def report(findings, ok):
    """Chain-consumable JSON envelope."""
    return {
        "checks_api_version": CHECKS_API_VERSION,
        "primitive_api_version": bpy.context.scene.get("fl_primitive_api_version"),
        "ok": ok,
        "counts": {
            "pass": sum(1 for f in findings if f["status"] == "pass"),
            "warn": sum(1 for f in findings if f["status"] == "warn"),
            "fail": sum(1 for f in findings if f["status"] == "fail"),
        },
        "findings": findings,
    }


def main():
    """Standalone entry: blender -b scene.blend -P forge_scene_checks.py -- spec.json
    Prints the JSON report to stdout; exits 2 on any failing check."""
    argv = sys.argv
    args = argv[argv.index("--") + 1:] if "--" in argv else []
    spec = {}
    if args:
        with open(args[0]) as fh:
            spec = json.load(fh)
    findings, ok = run_all_checks(spec)
    print(json.dumps(report(findings, ok), indent=2))
    if not ok:
        sys.exit(2)


if __name__ == "__main__":
    main()
