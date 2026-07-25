"""PHANTM — the winding-topology answer to Tony's foil-collision discovery
(Tony 25 Jul: a single continuous tape cannot wind the hex lattice — 'there
are always points where there is already a face in place'. He proposes mixed
single/double walls + known-geometry software correction. TBD?)

Tony's CAD experiment found a THEOREM. The hex-lattice walls form a graph in
which every interior junction is 3-way (odd degree). An Euler trail — one
tape, each wall exactly once — exists only with ≤2 odd junctions. Any patch
beyond a single hexagon has many more. So single-tape/single-thickness fails
NECESSARILY, not from lack of cleverness.

The constructive fix is the route-inspection ('Chinese postman') solution:
allow some walls DOUBLE. Doubling every wall of ONE of the three orientation
classes makes every junction even (each junction meets exactly one wall of
each orientation) → an Euler circuit exists → ONE tape winds the whole
lattice, doubled walls traversed twice, singles once. Minimum doubled
fraction = 1/3 of walls — and the commercial row-strip (corrugated) process
lands on the SAME 1/3-double topology with trivially simple paths.

This script verifies the graph claims computationally on real lattice
patches and prices the geometry consequences.

Run: ~/.venvs/phantm/bin/python foil_topology.py → out/foil-topology.json
"""
import json
import math
import os


def hex_patch_graph(rings):
    """Wall graph of a hexagonal patch (centre cell + `rings` rings around).
    Axial coords; returns vertices (corner points) and edges (walls)."""
    cells = [(q, r) for q in range(-rings, rings + 1)
             for r in range(-rings, rings + 1) if abs(q + r) <= rings]
    # pointy-ish axial→cartesian for cell centres; corners at 6 offsets
    edges, verts = set(), set()
    for q, r in cells:
        # flat-top axial layout: corners at 60k° share exactly with neighbours
        cx, cy = q * 1.5, (r + q / 2) * math.sqrt(3)
        corners = [(round(cx + math.cos(math.radians(60 * k)), 6),
                    round(cy + math.sin(math.radians(60 * k)), 6))
                   for k in range(6)]
        for k in range(6):
            a, b = corners[k], corners[(k + 1) % 6]
            verts.add(a)
            verts.add(b)
            edges.add(tuple(sorted((a, b))))
    return verts, edges


def analyse(rings):
    verts, edges = hex_patch_graph(rings)
    deg = {v: 0 for v in verts}
    for a, b in edges:
        deg[a] += 1
        deg[b] += 1
    odd = sum(1 for d in deg.values() if d % 2)
    # orientation class of each wall (3 classes by angle)
    def ori(e):
        (x1, y1), (x2, y2) = e
        ang = math.degrees(math.atan2(y2 - y1, x2 - x1)) % 180
        return round(ang / 60) % 3
    per_class = {}
    for e in edges:
        per_class[ori(e)] = per_class.get(ori(e), 0) + 1
    # doubling class 0: interior junctions (degree 3, one wall of each
    # orientation) all become even; only BOUNDARY junctions can stay odd —
    # those are fixed by doubling a few extra boundary walls (route-inspection
    # / 'Chinese postman'), minus one pair usable as the tape's start/end.
    deg2 = dict(deg)
    for e in edges:
        if ori(e) == 0:
            a, b = e
            deg2[a] += 1
            deg2[b] += 1
    interior = [v for v in verts if deg[v] == 3]
    interior_even = all(deg2[v] % 2 == 0 for v in interior)
    odd_after = sum(1 for d in deg2.values() if d % 2)
    return dict(cells=1 + 3 * rings * (rings + 1), walls=len(edges),
                junctions=len(verts), odd_junctions=odd,
                euler_single_thickness=odd <= 2,
                per_orientation=sorted(per_class.values()),
                interior_even_after_orientation_doubling=interior_even,
                boundary_odd_after_doubling=odd_after,
                extra_boundary_walls_min=max(0, (odd_after - 2) // 2))


def main():
    rows = [analyse(r) for r in (1, 2, 3)]
    for row in rows:
        print(f"  {row['cells']} cells: {row['walls']} walls, "
              f"{row['odd_junctions']}/{row['junctions']} junctions odd → "
              f"one-tape single-thickness: {row['euler_single_thickness']}; "
              f"after orientation-doubling: interior all even = "
              f"{row['interior_even_after_orientation_doubling']}, "
              f"{row['boundary_odd_after_doubling']} boundary junctions odd "
              f"(≥{row['extra_boundary_walls_min']} extra boundary walls)")
    assert all(not r["euler_single_thickness"] for r in rows), \
        "theorem check: multi-cell patches must be non-Eulerian"
    assert all(r["interior_even_after_orientation_doubling"] for r in rows), \
        "constructive fix check: doubling one orientation evens every interior junction"

    t = 0.075  # candidate tape thickness, mm (Tony: 75–100 µm)
    geom = {
        "tape_mm": t,
        "skin_depths_at_57p5": round(t * 1000 /
                                     (math.sqrt(3.0e-8 / (math.pi * 57.5e9 * 4e-7 * math.pi)) * 1e6)),
        "doubled_wall_mm": 2 * t,
        "doubled_fraction": "1/3 of walls (one orientation class; the row-strip "
                            "process gives the same fraction)",
        "pitch_anisotropy": f"pitch across doubled walls grows by t = {t*1000:.0f} µm "
                            f"≈ {100*t/3.25:.1f}% — a PERIODIC lattice-vector change "
                            "(two lattice constants), not per-cell scatter; fc "
                            "unchanged (interior held, §12 proof)",
    }
    out = {"patches": rows, "geometry": geom,
           "verdict": "Tony's collision is an Euler-parity theorem, not a "
                      "process defect. Fixes, in order of practicality: "
                      "(1) ROW STRIPS (commercial corrugated topology): many "
                      "short strips, node walls double — trivial paths, "
                      "exactly 1/3 of walls double, no boundary complication; "
                      "(2) ONE tape with one orientation class doubled evens "
                      "every INTERIOR junction — a finite tile then needs a "
                      "handful of extra boundary walls doubled (route-"
                      "inspection), tape ends at the last odd pair; both give "
                      "an exactly PERIODIC lattice — Tony's software-"
                      "correction idea reduces to two known lattice "
                      "constants, no per-cell table."}
    path = os.path.join(os.path.dirname(__file__), "out", "foil-topology.json")
    json.dump(out, open(path, "w"), indent=1)
    print(f"wrote {path}")


if __name__ == "__main__":
    main()
