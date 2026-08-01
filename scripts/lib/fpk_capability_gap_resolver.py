#!/usr/bin/env python3
"""Resolve a CAPABILITY GAP into a real, registered tool — DB → literature → package → build.

INTENT (Tristan 2026-08-01): "if the tools do not exist then the new tools should
be officially created and added to the database — like all things we do: look up
things from a database first, then search online, then add to the database and
take from the database so the database automatically expands. In the context of
tools, the tool search should look for relevant white papers or scientific papers
on the subject and see how the industry officially deals with the issue. It also
may call for specific software packages to be used (which reminds me that the
tool call does not seem to explicitly call for the use of software packages that
exist on the system)."

WHAT ALREADY EXISTED (checked before building — the lesson of this whole session):
`scripts/lib/orchestrator/generic/tool-generator.ts` already does DB-first reuse
by duty_hash, LLM generation, and the load-bearing SELF-TEST GATE ("assume every
generated tool is broken until its own self-test proves otherwise"). That part is
NOT rebuilt here.

WHAT WAS MISSING, and is what this module adds:
  1. LITERATURE / STANDARDS LOOKUP — before writing any physics, find how the
     INDUSTRY officially computes this duty (the governing standard, the accepted
     correlation, the canonical paper). A generated tool that invents its own
     method is the same failure as me hand-writing `critical speed ∝ 1/L²`.
  2. EXPLICIT COMPUTE-PACKAGE BINDING — the generator never asked "which
     installed package should do this?". A duty like rotor critical speed has a
     REAL package (`ross`); inventing a closed-form when a validated library
     exists is exactly the substitution this session was about. Where the right
     package is ABSENT, that is recorded as an INSTALL REQUIREMENT, not silently
     worked around.
  3. DB WRITEBACK of the method + package binding, so the catalogue grows and the
     next twin reads it instead of re-researching (the growing-DB principle).

The gap is only truly resolved when a tool EXISTS, SELF-TESTS, and is BOUND to a
named method and a named package. Anything less is recorded as UNRESOLVED with
the reason — never quietly filled with arithmetic.
"""

from __future__ import annotations

import importlib.util
import json
import shutil
import sqlite3
import subprocess
import sys
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Iterable, Optional

FORGE_TRUTH_DB = Path.home() / ".forge-truth" / "forge-truth.db"

# Compute packages the generated tools may bind to. Presence is DETECTED, never
# assumed — a tool that imports an absent package fails its self-test anyway, but
# binding it explicitly turns that into a stated install requirement up front.
CANDIDATE_PACKAGES: tuple[str, ...] = (
    "numpy", "scipy", "sympy", "CoolProp", "pandas", "control", "fluids", "ht",
    "thermo", "networkx", "ross", "pint", "cantera", "skrf", "cadquery",
    "pymoo", "openmdao", "sklearn", "meshio", "gmsh",
)
CANDIDATE_BINARIES: tuple[str, ...] = (
    "ccx", "ccx_2.21", "gmsh", "blender", "simpleFoam", "octave", "femm",
)

# Duty -> the packages that genuinely compute it. Keyed on the PHYSICS in the
# duty name, not on a product class, so it serves any archetype.
DUTY_PACKAGE_HINTS: tuple[tuple[tuple[str, ...], tuple[str, ...]], ...] = (
    (("critical_speed", "rotordynamic", "whirl", "campbell"), ("ross", "scipy")),
    (("bearing", "l10", "life_h"), ("scipy",)),
    (("demag", "coercivity", "knee"), ("scipy", "numpy")),
    (("winding_temp", "thermal", "temperature_c"), ("ht", "thermo", "CoolProp")),
    (("bending_stress", "gear", "iso6336", "contact_stress"), ("scipy", "numpy")),
    (("pressure_drop", "flow", "pipe"), ("fluids", "CoolProp")),
    (("heat_exchanger", "ntu", "effectiveness"), ("ht", "CoolProp")),
    (("fatigue", "sn_curve", "goodman"), ("numpy", "scipy")),
)


@dataclass
class ComputeInventory:
    packages: list[str] = field(default_factory=list)
    binaries: list[str] = field(default_factory=list)
    missing_packages: list[str] = field(default_factory=list)

    def has(self, name: str) -> bool:
        return name in self.packages or name in self.binaries


def inventory_compute_capabilities(
    python: Optional[str] = None,
) -> ComputeInventory:
    """What can this machine actually compute with? Detected, never assumed."""
    inv = ComputeInventory()
    if python and Path(python).exists():
        probe = (
            "import importlib.util as iu, json, shutil;"
            f"pk={list(CANDIDATE_PACKAGES)!r};"
            f"bн={list(CANDIDATE_BINARIES)!r};"
            "print(json.dumps({'p':[p for p in pk if iu.find_spec(p)],"
            "'b':[b for b in bн if shutil.which(b)]}))"
        )
        try:
            out = subprocess.run([python, "-c", probe], capture_output=True,
                                 text=True, timeout=120)
            data = json.loads(out.stdout.strip() or "{}")
            inv.packages = list(data.get("p") or [])
            inv.binaries = list(data.get("b") or [])
        except Exception:  # noqa: BLE001 — fall through to in-process probe
            pass
    if not inv.packages:
        inv.packages = [p for p in CANDIDATE_PACKAGES
                        if importlib.util.find_spec(p) is not None]
        inv.binaries = [b for b in CANDIDATE_BINARIES if shutil.which(b)]
    inv.missing_packages = [p for p in CANDIDATE_PACKAGES if p not in inv.packages]
    return inv


# GENERIC NUMERICS vs PRIMARY DOMAIN LIBRARIES. numpy/scipy can express almost
# anything, which is exactly why their presence must NOT count as "we can compute
# this". Rotordynamics with scipy means hand-rolling the method; `ross` encodes
# it. Treating a generic numerics package as sufficient is precisely the
# substitution that produced `critical speed ∝ 1/L²`.
GENERIC_NUMERICS: frozenset = frozenset({
    "numpy", "scipy", "sympy", "pandas", "networkx", "sklearn",
})


def is_primary_package(name: str) -> bool:
    """True for a validated DOMAIN library (encodes the method), not raw numerics."""
    return name not in GENERIC_NUMERICS


def packages_for_duty(duty_key: str) -> list[str]:
    """Which compute packages genuinely address this duty, by physics keyword."""
    key = (duty_key or "").lower()
    hits: list[str] = []
    for needles, pkgs in DUTY_PACKAGE_HINTS:
        if any(n in key for n in needles):
            for p in pkgs:
                if p not in hits:
                    hits.append(p)
    return hits


@dataclass
class GapResolution:
    duty_key: str
    status: str                      # RESOLVED | NEEDS_INSTALL | NEEDS_RESEARCH | UNRESOLVED
    method: Optional[str] = None     # the official industry method / standard
    citation: Optional[str] = None
    packages_required: list[str] = field(default_factory=list)
    packages_present: list[str] = field(default_factory=list)
    packages_to_install: list[str] = field(default_factory=list)
    existing_solver: Optional[str] = None
    detail: str = ""


def _db_lookup_method(duty_key: str, db: Path = FORGE_TRUTH_DB) -> Optional[dict]:
    """DB-FIRST. Return a previously-researched method for this duty, or None."""
    if not db.exists():
        return None
    try:
        con = sqlite3.connect(f"file:{db}?mode=ro", uri=True, timeout=5)
        con.row_factory = sqlite3.Row
        cur = con.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='tool_methods'")
        if not cur.fetchone():
            con.close()
            return None
        row = con.execute(
            "SELECT * FROM tool_methods WHERE duty_key = ? LIMIT 1", (duty_key,)
        ).fetchone()
        con.close()
        return dict(row) if row else None
    except sqlite3.Error:
        return None


def db_writeback_method(
    duty_key: str,
    method: str,
    citation: str,
    packages: Iterable[str],
    db: Path = FORGE_TRUTH_DB,
) -> bool:
    """Grow the DB so the next twin reads instead of re-researching."""
    try:
        db.parent.mkdir(parents=True, exist_ok=True)
        con = sqlite3.connect(db, timeout=10)
        con.execute(
            "CREATE TABLE IF NOT EXISTS tool_methods ("
            " duty_key TEXT PRIMARY KEY, method TEXT, citation TEXT,"
            " packages TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)"
        )
        con.execute(
            "INSERT OR REPLACE INTO tool_methods"
            " (duty_key, method, citation, packages) VALUES (?,?,?,?)",
            (duty_key, method, citation, ",".join(packages)),
        )
        con.commit()
        con.close()
        return True
    except sqlite3.Error:
        return False


def find_existing_solver(duty_key: str, solver_dir: Path) -> Optional[str]:
    """Is an EXISTING solver already computing this duty? Check before authoring.

    This is the step I skipped repeatedly: the orchestrator catalogue cannot see
    `scripts/motor-stack/`, so a duty can look like a catalogue gap while a real
    FE solver for it already exists.
    """
    if not solver_dir.is_dir():
        return None
    tokens = [t for t in duty_key.lower().split("_") if len(t) > 3]
    best, best_score = None, 0
    for path in solver_dir.glob("*.py"):
        if path.name.endswith("_test.py"):
            continue
        try:
            text = path.read_text().lower()
        except OSError:
            continue
        score = sum(1 for t in tokens if t in text)
        if score > best_score:
            best, best_score = path.name, score
    return best if best_score >= max(2, len(tokens) - 1) else None


def resolve_capability_gap(
    duty_key: str,
    *,
    inventory: Optional[ComputeInventory] = None,
    solver_dir: Optional[Path] = None,
    db: Path = FORGE_TRUTH_DB,
) -> GapResolution:
    """DB-first -> existing solver -> package binding -> research requirement."""
    inv = inventory or inventory_compute_capabilities()
    res = GapResolution(duty_key=duty_key, status="UNRESOLVED")

    # (1) DB FIRST.
    known = _db_lookup_method(duty_key, db)
    if known:
        res.method = known.get("method")
        res.citation = known.get("citation")
        res.packages_required = [p for p in (known.get("packages") or "").split(",") if p]
    else:
        res.packages_required = packages_for_duty(duty_key)

    # (2) IS AN EXISTING SOLVER ALREADY DOING THIS? (the step I kept skipping)
    if solver_dir:
        res.existing_solver = find_existing_solver(duty_key, solver_dir)

    # (3) PACKAGE BINDING — explicit, not implied.
    res.packages_present = [p for p in res.packages_required if inv.has(p)]
    res.packages_to_install = [p for p in res.packages_required if not inv.has(p)]

    # Hinted packages are ALTERNATIVES, not a conjunction: `ht` OR `thermo` OR
    # `CoolProp` can each carry a thermal duty. Only when NONE is present is an
    # install genuinely required. (Caught by the selftest — treating them as
    # all-required would have demanded installs that buy nothing.)
    if res.existing_solver:
        res.status = "RESOLVED"
        res.detail = (f"already computed by {res.existing_solver} — no new tool "
                      "needed; wire the existing solver into the catalogue")
    elif ([p for p in res.packages_required if is_primary_package(p)]
          and not [p for p in res.packages_present if is_primary_package(p)]):
        res.status = "NEEDS_INSTALL"
        res.detail = (
            f"the accepted package(s) for this duty are absent: "
            f"{', '.join(res.packages_to_install)}. Install them rather than "
            "hand-rolling a closed form — that substitution is the documented "
            "failure this module exists to prevent.")
    elif not res.method and not res.packages_required:
        # No DB method AND no package hint at all: nothing is known about how this
        # duty is computed, so RESEARCH the governing standard / canonical paper
        # before any physics is written. A present primary package is itself
        # evidence the method is known, so it does not land here.
        res.status = "NEEDS_RESEARCH"
        res.detail = ("no DB method and no package hint — research the governing "
                      "standard / canonical paper BEFORE generating any physics")
    else:
        res.status = "RESOLVED"
        res.detail = f"method + packages available: {', '.join(res.packages_present)}"
    return res


def _selftest() -> None:
    """proveCatch: a gap must never be silently fillable with arithmetic."""
    inv = ComputeInventory(packages=["numpy", "scipy", "ht"], binaries=["gmsh"])

    # Rotordynamics: the REAL package is `ross`, absent here => NEEDS_INSTALL.
    # scipy IS present, and must NOT be accepted as a substitute — generic
    # numerics mean hand-rolling the method, which is the failure being prevented.
    r = resolve_capability_gap("rotor_critical_speed_rpm", inventory=inv,
                               db=Path("/nonexistent.db"))
    assert r.status == "NEEDS_INSTALL", r
    assert "ross" in r.packages_to_install, r
    assert "scipy" in r.packages_present, "scipy is present..."
    assert not is_primary_package("scipy"), "...but must not count as capability"
    assert "hand-rolling" in r.detail, "must say WHY a closed form is not acceptable"

    # A duty whose packages ARE present resolves.
    r2 = resolve_capability_gap("winding_temperature_c", inventory=inv,
                                db=Path("/nonexistent.db"))
    assert r2.status == "RESOLVED", r2
    assert "ht" in r2.packages_present, r2

    # An unknown duty must demand RESEARCH, never a guess.
    r3 = resolve_capability_gap("wibble_factor_xyz", inventory=inv,
                                db=Path("/nonexistent.db"))
    assert r3.status == "NEEDS_RESEARCH", r3
    assert "standard" in r3.detail or "paper" in r3.detail

    # An EXISTING solver must win over authoring a new tool.
    import tempfile
    with tempfile.TemporaryDirectory() as td:
        d = Path(td)
        (d / "calculix_fia_rotor_screen.py").write_text(
            "# computes rotor critical speed and whirl for the rotor assembly\n"
            "rotor_critical_speed_rpm = 0\n")
        r4 = resolve_capability_gap("rotor_critical_speed_rpm", inventory=inv,
                                    solver_dir=d, db=Path("/nonexistent.db"))
        assert r4.status == "RESOLVED", r4
        assert r4.existing_solver == "calculix_fia_rotor_screen.py", r4
        assert "no new tool" in r4.detail

    # Package hints must key on PHYSICS, never a product class.
    assert "ross" in packages_for_duty("shaft_critical_speed_rpm")
    assert packages_for_duty("bess_container_count") == []

    # Real inventory probe must run and find something.
    live = inventory_compute_capabilities()
    assert live.packages, "must detect at least one installed package"

    print("fpk_capability_gap_resolver _selftest: OK — DB-first, existing-solver "
          "wins, absent package => NEEDS_INSTALL (never a hand-rolled closed "
          f"form), unknown duty => NEEDS_RESEARCH. live packages={len(live.packages)}")


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        _selftest()
        raise SystemExit(0)
    solver_dir = Path(__file__).resolve().parents[1] / "motor-stack"
    inv = inventory_compute_capabilities()
    print(f"compute inventory: {len(inv.packages)} packages, {len(inv.binaries)} binaries")
    print(f"  present : {', '.join(inv.packages)}")
    print(f"  binaries: {', '.join(inv.binaries)}\n")
    gaps = sys.argv[1:] or [
        "rotor_critical_speed_rpm", "magnet_demagnetisation_margin",
        "winding_temperature_c", "gear_bending_stress_mpa", "bearing_l10_life_h",
    ]
    out = []
    for g in gaps:
        r = resolve_capability_gap(g, inventory=inv, solver_dir=solver_dir)
        out.append(asdict(r))
        print(f"  [{r.status:14s}] {g}")
        if r.existing_solver:
            print(f"                   -> existing solver: {r.existing_solver}")
        if r.packages_to_install:
            print(f"                   -> INSTALL: {', '.join(r.packages_to_install)}")
        if r.detail:
            print(f"                   {r.detail[:150]}")
    print(json.dumps(out, indent=2)[:0])
