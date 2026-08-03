#!/usr/bin/env python3
"""Detached geometry — a part floating free of the assembly, found by arithmetic.

INTENT (S1/S8, verify-2 2026-08-03). The flagship hero render of the FE front
kit shows a thin bar hanging in mid-air above the unit and a slab lying under
the plinth, disconnected from everything. Twenty-three drawing gates passed.
The vision critic reported ok=true with no defects — it had run on one image,
and its defect router had been throwing ModuleNotFoundError into a field nobody
read. A five-second human glance rejects the image; the engine shipped it.

⭐ THIS IS ARITHMETIC, NOT JUDGEMENT (Tristan, standing: "all of the checks need
to be written into code and not rely on the LLM to figure things out, because
the LLM is completely unreliable"). A floating part is not an aesthetic opinion.
Every part in `parts-manifest.json` carries `pos_mm` and `dims_mm`, so build the
axis-aligned box for each, inflate by a contact tolerance, and take connected
components. A product is ONE assembly: parts outside the largest component are
touching nothing, and a part touching nothing in a render of an assembled unit
is either a modelling error or a part that should not be in the shot.

No model is called. The answer is the same on every run.

WHAT IT DOES NOT CLAIM. Silence here does not mean the render looks good — it
means nothing is detached. Framing, lighting, material plausibility and whether
the thing resembles the product are different questions with different checks.
A parts manifest that carries no positions abstains loudly rather than passing:
absence of data is not evidence of a connected assembly.

Exit 0 clean · exit 1 report-only · exit 15 when enforcing and parts float.
`DETACHED_GEOMETRY_ENFORCING=off` downgrades to report-only.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import sys
from pathlib import Path

SCHEMA = "forgeos.check.detached_geometry/v1"
EXIT_DETACHED = 15

# Two parts count as connected when their boxes come within this distance. Real
# assemblies have clearance fits, bolt gaps and mesh slop, so a strict
# intersection test would report half a working assembly as detached. 5 mm is
# wide enough for those and far tighter than the ~200 mm of clear air around the
# floating bar this check was written for.
CONTACT_TOLERANCE_MM = 5.0

# Parts that are legitimately separate from the product: the ground plane and
# staging furniture a presentation render stands the unit on. Matched on
# entity_type, never on a per-product name list.
# ⭐ NARROWED (Sol, guards council 2026-08-03). This list used to include
# "plinth", "stage" and "backdrop". A plinth or base can be a REAL assembly
# component — excluding it can hide a detached product, or delete the only
# intended connection between two parts and invent a floater. Only entity types
# that are unambiguously scene furniture stay. This is a taxonomy judgement and
# it belongs in the manifest's entity_type, not in a guess by this module.
_NON_ASSEMBLY_ENTITY_TYPES = {"site", "room", "ground"}


def _aabb(part: dict) -> tuple[float, ...] | None:
    pos = part.get("pos_mm")
    dims = part.get("dims_mm")
    if not (isinstance(pos, (list, tuple)) and len(pos) == 3 and isinstance(dims, dict)):
        return None
    try:
        x, y, z = (float(v) for v in pos)
        # ⭐ NaN AND Infinity ARE NOT POSITIONS (Sol, guards council 2026-08-03).
        # Python's json accepts them by default, and every comparison against a
        # NaN is False — so such a part touches nothing and was reported as a
        # floater. A false detachment is as damaging as a missed one.
        if not all(map(math.isfinite, (x, y, z))):
            return None
        w = float(dims.get("w") or dims.get("dia") or 0.0)
        d = float(dims.get("d") or dims.get("dia") or dims.get("len") or 0.0)
        h = float(dims.get("h") or dims.get("len") or 0.0)
        if not all(map(math.isfinite, (w, d, h))):
            return None
    except (TypeError, ValueError):
        return None
    # ⭐ A DEGENERATE BOX IS NOT GEOMETRY (Sol, guards council 2026-08-03).
    # `{"w": 100}` used to pass this test — d and h defaulted to 0, giving a
    # zero-area sliver that can barely touch anything, so a legitimately placed
    # part was liable to be reported as a floater. Requiring only ONE non-zero
    # extent was too weak: a box needs all three to be a box. Anything less is
    # unusable geometry and is counted as untested, not silently connected or
    # silently orphaned.
    if w <= 0.0 or d <= 0.0 or h <= 0.0:
        return None
    return (x - w / 2, x + w / 2, y - d / 2, y + d / 2, z - h / 2, z + h / 2)


def _touches(a: tuple[float, ...], b: tuple[float, ...], tol: float) -> bool:
    return (a[0] - tol <= b[1] and b[0] - tol <= a[1]
            and a[2] - tol <= b[3] and b[2] - tol <= a[3]
            and a[4] - tol <= b[5] and b[4] - tol <= a[5])


def evaluate(parts: list[dict], tolerance_mm: float = CONTACT_TOLERANCE_MM) -> dict:
    """Pure decision over positioned parts — no filesystem, no model."""
    boxes: list[tuple[str, tuple[float, ...]]] = []
    unpositioned: list[str] = []
    malformed = 0
    partial_dim_names: list[str] = []
    for part in parts:
        # ⭐ A VALID JSON LIST CAN HOLD NON-OBJECTS (Sol). `part.get(...)` raised
        # AttributeError on a string or number, so a schema-malformed manifest
        # produced a traceback and no artefact — from a module whose contract is
        # to abstain loudly on unusable geometry.
        if not isinstance(part, dict):
            malformed += 1
            continue
        if str(part.get("entity_type") or "").lower() in _NON_ASSEMBLY_ENTITY_TYPES:
            continue
        name = str(part.get("tag") or part.get("name") or "?")
        box = _aabb(part)
        if box is None:
            # ⭐ SAY WHICH KIND OF UNUSABLE (Sol, guards council 2026-08-03).
            # Lumping a part that HAS a position but only one stated extent in
            # with parts that have no position at all reported it as "carries no
            # usable position", which is false and hides a fixable manifest bug.
            if isinstance(part.get("pos_mm"), (list, tuple)) \
                    and isinstance(part.get("dims_mm"), dict):
                partial_dim_names.append(name)
            else:
                unpositioned.append(name)
        else:
            boxes.append((name, box))

    if len(boxes) < 2:
        return {
            "schema": SCHEMA, "n_positioned": len(boxes), "n_malformed": malformed,
            "n_unpositioned": len(unpositioned), "abstained": True,
            # ⭐ THE ABSTAIN RETURN MUST CARRY THE SAME FIELDS AS THE MAIN ONE
            # (Sol, guards council 2026-08-03). It dropped n_partial_dims and
            # partial_dim_parts, so a consumer branching on those keys saw them
            # appear and disappear depending on how much geometry was usable —
            # the same shape-of-result inconsistency, one return statement over.
            "n_partial_dims": len(partial_dim_names),
            "partial_dim_parts": partial_dim_names[:20],
            "findings": [], "ok": False, "coverage_complete": False,
            "why_abstained": ("fewer than two positioned parts — nothing to test "
                              "connectivity against; this is NOT a pass"),
        }

    # Union-find over the contact graph.
    parent = list(range(len(boxes)))

    def find(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for i in range(len(boxes)):
        for j in range(i + 1, len(boxes)):
            if _touches(boxes[i][1], boxes[j][1], tolerance_mm):
                ri, rj = find(i), find(j)
                if ri != rj:
                    parent[ri] = rj

    groups: dict[int, list[str]] = {}
    for idx, (name, _) in enumerate(boxes):
        groups.setdefault(find(idx), []).append(name)
    main = max(groups.values(), key=len)
    orphans = sorted(n for members in groups.values() if members is not main
                     for n in members)

    findings: list[dict] = []
    if orphans:
        findings.append({
            "check": "detached_from_assembly", "severity": "high",
            "orphans": orphans,
            "n_components": len(groups),
            "evidence": (f"{len(orphans)} part(s) touch nothing in the assembly at a "
                         f"{tolerance_mm:g} mm contact tolerance — the geometry is "
                         f"{len(groups)} disconnected components, not one product: "
                         f"{', '.join(orphans[:8])}"),
        })
    if unpositioned:
        findings.append({
            "check": "unpositioned_parts", "severity": "medium",
            "parts": unpositioned[:20],
            "evidence": (f"{len(unpositioned)} part(s) carry no usable pos_mm/dims_mm, "
                         f"so their connectivity was not tested — coverage here is "
                         f"{len(boxes)}/{len(boxes) + len(unpositioned)}"),
        })
    # ⭐ THE ARTEFACT MUST NOT DISAGREE WITH THE EXIT CODE (Sol, guards council
    # 2026-08-03). The CLI exited 1 on partial coverage while this result still
    # said ok:true, so any consumer reading detached-geometry.json — or calling
    # evaluate() directly — treated a 2-of-3 manifest as a clean assembly. The
    # exit code was the only place the caveat lived, which is the same
    # green-tick shape one layer in.
    return {
        "schema": SCHEMA, "n_positioned": len(boxes),
        "n_unpositioned": len(unpositioned), "abstained": False,
        "n_components": len(groups), "findings": findings,
        "n_malformed": malformed,
        "n_partial_dims": len(partial_dim_names),
        "partial_dim_parts": partial_dim_names[:20],
        "coverage_complete": not unpositioned and not partial_dim_names
                             and not malformed,
        # `ok` means "checked, and nothing detached" — it cannot be true while
        # part of the assembly was never tested.
        "ok": (not orphans and not unpositioned and not partial_dim_names
               and not malformed),
        "no_orphans_among_tested": not orphans,
    }


def _selftest() -> int:
    failures: list[str] = []

    def ck(name: str, cond: bool, why: str) -> None:
        if not cond:
            failures.append(f"{name}: {why}")

    def part(tag, x, y, z, w=100.0, d=100.0, h=100.0, **kw):
        return {"tag": tag, "pos_mm": [x, y, z],
                "dims_mm": {"w": w, "d": d, "h": h}, **kw}

    # ⭐ proveCatch on the REAL hero defect: a stack of touching parts plus one
    # thin bar hanging in clear air above them, exactly as 00-hero.png shows.
    hero = [part("A", 0, 0, 0), part("B", 0, 0, 90), part("C", 0, 0, 180),
            part("FLOATING-BAR", 0, 0, 900, w=600, d=10, h=6)]
    res = evaluate(hero)
    ck("proveCatch.floating_bar_fires",
       any(f["check"] == "detached_from_assembly" for f in res["findings"]),
       "a bar 700 mm clear of every other part was not reported detached")
    ck("proveCatch.names_the_orphan",
       res["findings"][0]["orphans"] == ["FLOATING-BAR"],
       "the detached part was not named, so nothing could be routed to a fix")
    ck("proveCatch.not_ok", not res["ok"], "a detached part still returned ok")

    # NEGATIVE CONTROL — a normally assembled stack must stay silent, or every
    # render fails and the check gets switched off within a day.
    ck("negative_control.assembled_stack_silent",
       evaluate([part("A", 0, 0, 0), part("B", 0, 0, 90), part("C", 0, 0, 180)])["ok"],
       "three stacked, touching parts were called detached")
    # ⭐ ok must track COVERAGE too, not just orphans — the artefact and the exit
    # code have to tell a consumer the same thing.
    _pc = evaluate([part("A", 0, 0, 0), part("B", 0, 0, 90), {"tag": "NOPOS"}])
    # A part with only one extent stated is unusable geometry, not a floater.
    _degenerate = evaluate([part("A", 0, 0, 0), part("B", 0, 0, 90),
                            {"tag": "FLAT", "pos_mm": [0, 0, 400],
                             "dims_mm": {"w": 100}}])
    ck("partial_dims_are_untested_not_orphaned",
       _degenerate["n_partial_dims"] == 1
       and _degenerate["partial_dim_parts"] == ["FLAT"]
       and _degenerate["n_unpositioned"] == 0
       and not any(f["check"] == "detached_from_assembly"
                   for f in _degenerate["findings"]),
       f"a part with only w stated was treated as real geometry: {_degenerate}")
    _nan = evaluate([part("A", 0, 0, 0), part("B", 0, 0, 90),
                     {"tag": "NAN", "pos_mm": [float("nan"), 0, 0],
                      "dims_mm": {"w": 10, "d": 10, "h": 10}},
                     {"tag": "INF", "pos_mm": [0, 0, 0],
                      "dims_mm": {"w": float("inf"), "d": 10, "h": 10}}])
    ck("non_finite_is_not_geometry",
       not any(f["check"] == "detached_from_assembly" for f in _nan["findings"]),
       f"NaN/Infinity coordinates were reported as detached parts: {_nan}")
    _ab2 = evaluate([{"tag": "X"}, {"tag": "Y"}])
    ck("abstain_return_carries_every_field",
       "n_partial_dims" in _ab2 and "partial_dim_parts" in _ab2,
       "the abstain return dropped fields the main return provides, so a "
       "consumer branching on them sees the shape change")
    _mal = evaluate([part("A", 0, 0, 0), part("B", 0, 0, 90), "not-a-part", 7])
    ck("non_dict_entries_do_not_crash",
       _mal.get("n_malformed") == 2 and _mal["ok"] is False,
       f"a parts list holding non-objects did not abstain cleanly: {_mal}")
    _ab = evaluate([{"tag": "X"}, {"tag": "Y"}])
    ck("abstention_is_not_ok", _ab["ok"] is False,
       "an abstention still reported ok=true in the result a consumer reads")
    ck("partial_coverage_is_not_ok_in_the_artefact",
       _pc["ok"] is False and _pc["coverage_complete"] is False
       and _pc["no_orphans_among_tested"] is True,
       "an untested part left ok=true in the result a consumer reads")

    # Clearance fits must not read as detachment.
    ck("clearance_fit_is_still_contact",
       evaluate([part("A", 0, 0, 0), part("B", 0, 0, 103)])["ok"],
       "a 3 mm clearance gap was treated as a floating part")

    # The ground plane is not part of the assembly and must not glue orphans on.
    ck("ground_plane_excluded",
       not evaluate([part("A", 0, 0, 0), part("B", 0, 0, 900),
                     part("FLOOR", 0, 0, 450, w=5000, d=5000, h=1000,
                          entity_type="site")])["ok"],
       "a large ground plane bridged two disconnected parts into one component")

    # ⭐ ABSENCE OF DATA IS NOT A PASS.
    abstain = evaluate([{"tag": "X"}, {"tag": "Y"}])
    ck("no_positions_abstains_loudly",
       abstain["abstained"] and abstain["n_unpositioned"] == 2,
       "a manifest with no positions quietly reported a connected assembly")
    # …and the abstention must be visible in the RESULT, not only in prose, so a
    # caller can branch on it rather than reading the exit code by luck.
    ck("abstention_is_machine_readable",
       "why_abstained" in abstain and abstain.get("abstained") is True,
       "an abstention carried no machine-readable marker")

    ck("deterministic",
       json.dumps(evaluate(hero), sort_keys=True)
       == json.dumps(evaluate(hero), sort_keys=True),
       "two runs over one input disagreed")

    # ⭐ THE EXIT CODE IS PART OF THE CHECK (Sol, guards council 2026-08-03).
    # "Could not check" exiting 0 is the same green-tick defect this module
    # exists to remove, and no pure-function assertion can see it — the decision
    # lives in main(). Drive the real entrypoint on a twin with no manifest.
    import subprocess, sys as _sys, tempfile as _tf  # noqa: PLC0415
    _empty = Path(_tf.mkdtemp())
    _r = subprocess.run([_sys.executable, str(Path(__file__).resolve()),
                         "--twin", str(_empty)], capture_output=True, text=True)
    ck("cli.no_manifest_does_not_exit_zero", _r.returncode != 0,
       "a twin with no parts-manifest.json exited 0 — a caller reading the exit "
       "status would accept 'no geometry at all' as 'clean assembly'")
    ck("cli.no_manifest_says_so", "ABSTAIN" in _r.stdout.upper(),
       f"the abstention was not stated on stdout: {_r.stdout.strip()[:160]}")

    # ⭐ IF A CLAIM SAYS "VERIFIED BY RUNNING IT", THE RUN BELONGS HERE
    # (MiniMax, guards council 2026-08-03). These two cases were checked in a
    # terminal and asserted in a commit message — which is a claim no reviewer
    # and no future run can confirm. Encoded so they are re-checked forever.
    _bad = Path(_tf.mkdtemp())
    (_bad / "parts-manifest.json").write_text("{not valid json")
    _rb = subprocess.run([_sys.executable, str(Path(__file__).resolve()),
                          "--twin", str(_bad)], capture_output=True, text=True)
    ck("cli.malformed_manifest_abstains_not_crashes",
       _rb.returncode == 1 and "Traceback" not in _rb.stderr,
       f"malformed JSON: rc={_rb.returncode} stderr={_rb.stderr.strip()[-160:]}")
    ck("cli.malformed_manifest_writes_the_artefact",
       (_bad / "detached-geometry.json").is_file(),
       "an abstention left no machine-readable result, so automation cannot tell "
       "a current could-not-check from a stale clean result")

    _partial = Path(_tf.mkdtemp())
    (_partial / "parts-manifest.json").write_text(json.dumps({"parts": [
        {"tag": "A", "pos_mm": [0, 0, 0], "dims_mm": {"w": 100, "d": 100, "h": 100}},
        {"tag": "B", "pos_mm": [0, 0, 90], "dims_mm": {"w": 100, "d": 100, "h": 100}},
        {"tag": "NOPOS"}]}))
    _rp = subprocess.run([_sys.executable, str(Path(__file__).resolve()),
                          "--twin", str(_partial)], capture_output=True, text=True)
    ck("cli.partial_coverage_does_not_exit_zero", _rp.returncode == 1,
       f"2 of 3 parts positioned exited {_rp.returncode} — the detached part can "
       f"be among the ones never tested")
    ck("cli.partial_coverage_states_the_shortfall",
       "2 of 3" in _rp.stdout or "INCOMPLETE" in _rp.stdout,
       f"the coverage shortfall was not stated: {_rp.stdout.strip()[:160]}")

    for line in failures:
        print(f"  - {line}")
    print("detached_geometry selftest:", "FAILED" if failures else "OK")
    return 1 if failures else 0


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--twin")
    ap.add_argument("--tolerance-mm", type=float, default=CONTACT_TOLERANCE_MM)
    ap.add_argument("--enforce", action="store_true")
    ap.add_argument("--selftest", action="store_true")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args(argv)

    if args.selftest:
        return _selftest()
    if not args.twin:
        ap.error("--twin is required unless --selftest")

    twin = Path(args.twin).resolve()
    def _abstain(why: str) -> int:
        """Every abstention writes the SAME artefact shape (Sol, guards council
        2026-08-03). Malformed JSON wrote a result file while a missing manifest
        did not, so automation could not tell a current could-not-check from a
        stale clean result left over from a previous run."""
        (twin / "detached-geometry.json").write_text(json.dumps({
            "schema": SCHEMA, "abstained": True, "findings": [],
            # ⭐ AN ABSTENTION IS NOT ok (Sol, guards council 2026-08-03 —
            # catching me making the very mistake the previous revision claimed
            # to fix). I corrected `ok` on the partial-coverage path and left it
            # True on all three abstention paths, so a consumer reading the
            # artefact still saw a clean bill where nothing had been checked.
            # `ok` means CHECKED AND CLEAN, everywhere, with no exceptions.
            "ok": False,
            "coverage_complete": False,
            "why_abstained": why,
        }, indent=2) + "\n", encoding="utf-8")
        print(f"[detached-geometry] ABSTAINED — {why}; nothing was checked, "
              f"and that is NOT a pass")
        return 1

    manifest = twin / "parts-manifest.json"
    if not manifest.is_file():
        return _abstain("no parts-manifest.json in this twin")
    # ⭐ AN UNREADABLE MANIFEST IS AN ABSTENTION, NOT A CRASH (Sol, guards
    # council 2026-08-03). json.loads() was uncaught, so malformed or truncated
    # JSON produced a traceback, no result file, and nothing machine-readable —
    # the contract promised an abstention and delivered an exception.
    try:
        doc = json.loads(manifest.read_text(encoding="utf-8"))
    except Exception as exc:  # noqa: BLE001
        return _abstain(f"parts-manifest.json is unreadable ({type(exc).__name__})")
    parts = doc.get("parts") if isinstance(doc, dict) else doc
    if not isinstance(parts, list):
        return _abstain("parts-manifest.json carries no parts list")
    result = evaluate(parts or [], args.tolerance_mm)
    (twin / "detached-geometry.json").write_text(
        json.dumps(result, indent=2) + "\n", encoding="utf-8")

    if args.json:
        print(json.dumps(result, indent=2))
    else:
        print(f"[detached-geometry] {result['n_positioned']} positioned part(s) · "
              f"{result.get('n_components', '-')} component(s) · ok={result['ok']}")
        for f in result["findings"]:
            print(f"  [{f['severity']}] {f['check']}: {f['evidence']}")

    # ⭐ AN ABSTENTION IS NOT A PASS, AND THE EXIT CODE HAS TO SAY SO (Sol,
    # guards council 2026-08-03 — a green-tick defect inside the module written
    # to remove green-tick defects). The docstring promised this "abstains
    # loudly", but abstain returned ok=True and therefore exit 0, so a caller
    # reading the exit status accepted a manifest with no usable geometry as a
    # clean assembly. `ok` still means "nothing detached"; the EXIT CODE now
    # distinguishes "checked and clean" from "could not check".
    if result.get("abstained"):
        print("[detached-geometry] ABSTAINED — not a pass: "
              f"{result.get('why_abstained')}")
        return 1
    # ⭐ PARTIAL COVERAGE IS NOT A CLEAN BILL (Sol). Two connected positioned
    # parts plus any number of unpositioned ones exited 0, and the detached item
    # can be among the ones never tested — common during staged generation.
    if not result.get("coverage_complete", True):
        # ⭐ THE HUMAN LINE MUST SAY WHAT THE JSON SAYS (Sol, guards council
        # 2026-08-03). The artefact reported n_malformed correctly while this
        # message counted only unpositioned parts — a fresh artefact-versus-
        # reporting split, which is the same defect family one more time.
        _untested = (result.get("n_unpositioned", 0)
                     + result.get("n_partial_dims", 0)
                     + result.get("n_malformed", 0))
        _total = result.get("n_positioned", 0) + _untested
        _parts = []
        _pd = result.get("n_partial_dims", 0)
        _nopos = result.get("n_unpositioned", 0)
        if _nopos:
            _parts.append(f"{_nopos} carry no position at all")
        if _pd:
            _parts.append(f"{_pd} state a position but not all three extents")
        if result.get("n_malformed"):
            _parts.append(f"{result['n_malformed']} are not objects at all")
        print(f"[detached-geometry] INCOMPLETE — {' and '.join(_parts)}, so "
              f"connectivity was tested on {result['n_positioned']} of {_total}; "
              f"a detached part could be among the untested ones")
        return 1
    if result["ok"]:
        return 0
    enforcing = os.environ.get("DETACHED_GEOMETRY_ENFORCING", "").strip().lower()
    if args.enforce and enforcing not in ("off", "0", "false", "no", "shadow"):
        return EXIT_DETACHED
    return 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
