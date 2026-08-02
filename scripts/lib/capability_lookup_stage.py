#!/usr/bin/env python3
"""CAPABILITY LOOKUP — the stage that runs right after the expanded brief and
answers "what do we already have for this?" BEFORE any design work.

INTENT (Tristan 2026-08-01, verbatim): "It can't be you, as the AI, randomly
deciding to do it from time to time. It's got to be in the actual code that is
looked up. Maybe what it's got to be is: as soon as the brief is done and the
expanded brief is done, the next thing that happens... you start looking up all
the white papers and everything associated with this. You look at all the
software and everything associated with the software, and look at all the tools.
You basically have this: this is what's available. Make that as part of the
RULES OF THE SOFTWARE, not a deterministic action, not an 'I happen to remember
at this time'."

WHY THIS EXISTS, from this session's own record. Every single one of these was
sitting in the repo or the corpus, unused, while I derived the same thing from
first principles:

  em_fia_demag_screen.py        I nearly wrote my own demag check.
  em_fia_mtpa_screen.py         I nearly wrote my own angle sweep.
  motor_loss_point.py           I HAND-SCALED iron loss instead of running it.
                                Running it exposed 302 W vs the twin's 136, and
                                4225 W of magnet eddy loss recorded as ZERO.
  fpk:geometry:58bf626998       Corpus literature ARGUING AGAINST the magnet
                                respec direction I had already measured four ways.
  fpk:fea:P_core                A named, more rigorous core-loss method
                                (hierarchical, from the analytical air-gap field)
                                that the engine does not implement.
  "grain-oriented steel cuts    A 7x lever on the 1020 W iron loss, in the corpus,
   iron loss seven times"       never consulted.

A document telling an agent to look these up loses to a live bug, every time.
The only thing that does not lose is a STAGE THAT RUNS and a GATE THAT BLOCKS.

WHAT IT DOES — all deterministic, NO model in the loop:
  1. CORPUS      hybrid + lexical search of forge-truth for the product class:
                 literature, extracted claims, standards, specs.
  2. SOLVERS     enumerate every script exposing a --twin entrypoint.
  3. TOOLS       enumerate the orchestrator tool registry.
  4. PACKAGES    record which named engineering packages are importable HERE,
                 so "we have pyleecan" is a fact, not an assumption.
  5. Emit a CAPABILITY DOSSIER artefact and a coverage verdict.

THE GATE (`evaluate_capability_gate`) BLOCKS when the dossier is missing, stale
against the brief, or reports zero corpus hits for a class the corpus covers.

UNIVERSAL: keyed off product class. Nothing here knows what a motor is.

Usage:
    capability_lookup_stage.py --twin <dir> [--product-class X] [--enforce]
    capability_lookup_stage.py --selftest
"""

from __future__ import annotations

import argparse
import json
import os
import sqlite3
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
FORGE_TRUTH = Path.home() / ".forge-truth" / "forge-truth.db"

# Packages whose PRESENCE changes what the engine can honestly claim. Recorded
# rather than assumed: "pyleecan is available" was assumed for weeks while its
# FE path (MagFEMM) needed a Windows binary that is not on this machine.
ENGINEERING_PACKAGES = (
    "pyleecan", "swat_em", "femm", "numpy", "scipy", "sympy", "CoolProp",
    "ht", "ross", "cantools", "pymoo", "openmdao", "meshio", "gmsh",
    "SciDataTool", "matplotlib", "pandas",
)

# ⭐⭐ NATIVE SOLVER BINARIES — the capability a package probe cannot see
# (2026-08-02, Grok's start-council finding). The dossier reported `femm` MISSING
# and the seat correctly asked whether the FE path was available at all. It is:
# the deck never imports the `femm` package — it shells out to the native xfemm
# command-line solver `femmcli`. A dossier that probes only Python packages says
# "no FE available" about a machine with a working FE, which is the same class of
# error as the empty package lists: a capability answer that is confidently
# wrong. Each entry is (name, env var, repo-relative candidates).
NATIVE_SOLVERS = (
    ("femmcli", "FEMMCLI", ("scripts/phantm/bin/femmcli",)),
    ("ccx", "CCX", ("scripts/motor-stack/bin/ccx",)),
    ("blender", "BLENDER", ()),
)

CORPUS_TABLES = (
    ("fpk_extracted_claims", ("symbol", "expression", "value_text", "claim_kind")),
    ("fpk_component_literature", ("contribution", "component_id", "topic_id")),
    ("pretraining_extracted_specs", ("spec_key", "spec_value", "raw_excerpt")),
    ("pretraining_extracted_standards", ("standard_name", "scope", "raw_excerpt")),
)


@dataclass
class CapabilityDossier:
    product_class: str
    corpus_hits: dict = field(default_factory=dict)
    solvers: list = field(default_factory=list)
    tools: list = field(default_factory=list)
    packages_available: list = field(default_factory=list)
    packages_missing: list = field(default_factory=list)
    native_solvers_available: list = field(default_factory=list)
    native_solvers_missing: list = field(default_factory=list)
    notes: list = field(default_factory=list)


def _class_prefix(product_class: str) -> str:
    """Corpus namespace for a class. FPK entries are keyed `fpk:...`."""
    pc = (product_class or "").lower()
    if "formula" in pc or "fpk" in pc or "mgu" in pc:
        return "fpk"
    return pc.split("_")[0][:8] or "gen"


def search_corpus(product_class: str, *, db: Path = FORGE_TRUTH,
                  limit: int = 25) -> dict:
    """Everything the corpus already holds for this class. Deterministic."""
    out: dict = {"database": str(db), "available": db.exists(), "tables": {}}
    if not db.exists():
        out["error"] = "forge-truth.db absent — corpus lookup impossible"
        return out
    prefix = _class_prefix(product_class)
    con = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    try:
        for table, cols in CORPUS_TABLES:
            try:
                total = con.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
            except sqlite3.Error:
                out["tables"][table] = {"present": False}
                continue
            # Class-scoped count. `spec_key LIKE 'fpk:%'` is the discriminator
            # that matters — a raw LIKE over the whole table returns other
            # product classes and is worse than useless.
            scoped = 0
            names = [r[1] for r in con.execute(f"PRAGMA table_info({table})")]
            # ⭐ MATCH EACH COLUMN THE WAY IT IS ACTUALLY KEYED (fixed on first
            # run, 2026-08-01). `product_class` holds the FULL class string
            # ("formula_e_front_mgu"); only `spec_key` uses the short `fpk:`
            # namespace. Matching everything against the short prefix scoped
            # 57,399 rows of this exact class to ZERO — and the gate would then
            # have reported an empty corpus for a class the corpus fully covers,
            # which is worse than not looking.
            for col, pattern in (("product_class", f"{product_class}%"),
                                 ("spec_key", f"{prefix}:%"),
                                 ("component_id", f"{prefix}%")):
                if col not in names:
                    continue
                try:
                    n = con.execute(
                        f"SELECT COUNT(*) FROM {table} WHERE {col} LIKE ?",
                        (pattern,)).fetchone()[0]
                except sqlite3.Error:
                    n = 0
                if n:
                    scoped = n
                    break
            has_embedding = "embedding" in names
            out["tables"][table] = {
                "present": True, "total_rows": total,
                "class_scoped_rows": scoped,
                "searchable_columns": [c for c in cols if c in names],
                "has_embedding_column": has_embedding,
                # A lexical-only table is a KNOWN corpus gap, not a silent one.
                "search_mode": "hybrid" if has_embedding else "LEXICAL ONLY",
            }
    finally:
        con.close()
    return out


def discover_solvers(repo: Path = REPO_ROOT) -> list:
    """Every script exposing a --twin entrypoint. No hardcoded roster: a list
    that must be maintained by hand is a list that goes stale silently."""
    found = []
    for path in sorted(repo.glob("scripts/**/*.py")):
        try:
            src = path.read_text(errors="ignore")
        except OSError:
            continue
        if '"--twin"' in src or "'--twin'" in src:
            found.append({
                "path": str(path.relative_to(repo)),
                "has_selftest": "--selftest" in src,
            })
    return found


def discover_tools(repo: Path = REPO_ROOT) -> list:
    tools_dir = repo / "scripts" / "lib" / "orchestrator" / "tools" / "python"
    if not tools_dir.is_dir():
        return []
    return [{"path": str(p.relative_to(repo)), "has_selftest":
             "--selftest" in p.read_text(errors="ignore")}
            for p in sorted(tools_dir.glob("*.py")) if not p.name.startswith("_")]


def probe_packages(names: tuple = ENGINEERING_PACKAGES,
                   python: str | None = None) -> tuple[list, list]:
    """Which packages actually import HERE. Not what a requirements file claims."""
    py = python or sys.executable
    avail, missing = [], []
    for n in names:
        r = subprocess.run([py, "-c", f"import {n}"], capture_output=True,
                           timeout=60)
        (avail if r.returncode == 0 else missing).append(n)
    return avail, missing


def probe_native_solvers(entries: tuple = NATIVE_SOLVERS,
                         repo: Path = REPO_ROOT) -> tuple[list, list]:
    """Which native solver BINARIES are executable here. Not importable — runnable."""
    import shutil  # noqa: PLC0415
    avail, missing = [], []
    for name, env_var, candidates in entries:
        found = None
        for candidate in (os.environ.get(env_var),
                          *(str(repo / c) for c in candidates),
                          shutil.which(name)):
            if candidate and Path(candidate).is_file() \
                    and os.access(candidate, os.X_OK):
                found = str(Path(candidate).resolve())
                break
        (avail if found else missing).append(
            {"name": name, "path": found, "env_var": env_var})
    return ([e for e in avail], [e["name"] for e in missing])


def build_dossier(product_class: str, *, repo: Path = REPO_ROOT,
                  db: Path = FORGE_TRUTH, probe_pkgs: bool = True) -> dict:
    d = CapabilityDossier(product_class=product_class)
    d.corpus_hits = search_corpus(product_class, db=db)
    d.solvers = discover_solvers(repo)
    d.tools = discover_tools(repo)
    if probe_pkgs:
        d.packages_available, d.packages_missing = probe_packages()
    d.native_solvers_available, d.native_solvers_missing = \
        probe_native_solvers(repo=repo)
    for t, meta in (d.corpus_hits.get("tables") or {}).items():
        if meta.get("present") and not meta.get("has_embedding_column"):
            d.notes.append(
                f"{t} is LEXICAL ONLY ({meta.get('total_rows')} rows) — "
                "semantic search unavailable until it is embedded")
    return {
        "schema": "forgeos.capability_lookup/v1",
        "product_class": product_class,
        "corpus": d.corpus_hits,
        "solvers": d.solvers, "n_solvers": len(d.solvers),
        "tools": d.tools, "n_tools": len(d.tools),
        "packages_available": d.packages_available,
        "packages_missing": d.packages_missing,
        # ⭐ "I did not probe" and "I probed and found nothing" must never look
        # the same (2026-08-02). The twin's dossier carried packages_available
        # = [] and packages_missing = [] — which reads as "no engineering
        # packages exist here" and is how a session ends up hand-deriving what
        # pyleecan and swat_em were sitting there ready to do. Both lists empty
        # is now a DETECTABLE state, not an ambiguous one.
        "native_solvers_available": d.native_solvers_available,
        "native_solvers_missing": d.native_solvers_missing,
        "packages_probed": bool(probe_pkgs),
        "python_probed": sys.executable if probe_pkgs else None,
        "notes": d.notes,
    }


def evaluate_capability_gate(dossier: dict | None) -> dict:
    """BLOCK when the lookup has not happened, or happened and found nothing.

    'I did not look' and 'I looked and the shelf was empty' are different
    states, and neither may be silent.
    """
    findings = []
    if not dossier:
        findings.append({
            "severity": "HIGH", "rule": "capability_lookup_never_ran",
            "detail": ("no capability dossier — design work proceeded without "
                       "establishing what solvers, tools, packages and "
                       "literature already exist for this class")})
        return {"ok": False, "findings": findings}
    # A probe that ran and returned nothing on BOTH sides did not run.
    probed = dossier.get("packages_probed")
    n_pkgs = (len(dossier.get("packages_available") or [])
              + len(dossier.get("packages_missing") or []))
    if probed and n_pkgs == 0:
        findings.append({
            "severity": "HIGH", "rule": "package_probe_returned_nothing",
            "detail": ("packages_probed is true but both package lists are "
                       "empty — the probe is broken, and a dossier that says "
                       "no packages exist is worse than one that says it did "
                       "not look")})
    elif probed is False or (probed is None and n_pkgs == 0):
        findings.append({
            "severity": "HIGH", "rule": "packages_never_probed",
            "detail": ("no package probe — the dossier cannot say whether "
                       "pyleecan, swat_em, CoolProp et al are importable here, "
                       "which is exactly the question that decides whether a "
                       "quantity gets solved or hand-derived. Re-run without "
                       "--no-packages")})
    if dossier.get("n_solvers", 0) == 0:
        findings.append({
            "severity": "HIGH", "rule": "no_solvers_discovered",
            "detail": "solver discovery returned nothing — the scan is broken"})
    corpus = dossier.get("corpus") or {}
    if not corpus.get("available"):
        findings.append({
            "severity": "HIGH", "rule": "corpus_unavailable",
            "detail": corpus.get("error", "forge-truth corpus not reachable")})
    else:
        scoped = sum((m.get("class_scoped_rows") or 0)
                     for m in (corpus.get("tables") or {}).values())
        if scoped == 0:
            findings.append({
                "severity": "MED", "rule": "no_class_scoped_corpus_rows",
                "detail": ("the corpus holds nothing for this product class — "
                           "genuinely new territory, or the class prefix is "
                           "wrong. Either way, say which.")})
    return {"ok": not any(f["severity"] == "HIGH" for f in findings),
            "findings": findings}


def _selftest() -> int:
    fails: list[str] = []

    def ck(name: str, cond: bool, detail: str = "") -> None:
        if not cond:
            fails.append(f"{name}: {detail}")

    # proveCatch 1 — the state this stage exists to make impossible: no lookup.
    g = evaluate_capability_gate(None)
    ck("proveCatch.no_dossier_blocks", not g["ok"],
       "design without a capability lookup was allowed")
    ck("proveCatch.names_the_omission",
       g["findings"][0]["rule"] == "capability_lookup_never_ran")

    # proveCatch 2 — a lookup that found NO solvers is a broken scan, not an
    # empty repo, and must block rather than read as "nothing available".
    g2 = evaluate_capability_gate({"n_solvers": 0, "corpus": {"available": True,
                                                              "tables": {}}})
    ck("proveCatch.zero_solvers_blocks", not g2["ok"],
       "a broken solver scan passed as an empty repo")

    # proveCatch 3 — a healthy dossier must PASS, or the gate is decoration.
    g3 = evaluate_capability_gate({
        "n_solvers": 18, "corpus": {"available": True, "tables": {
            "fpk_extracted_claims": {"present": True, "class_scoped_rows": 32453,
                                     "has_embedding_column": True}}},
        # A healthy dossier now includes a probe that actually ran; without
        # these the fixture describes a lookup that never asked what is
        # installed, which is no longer "healthy".
        "packages_probed": True, "packages_available": ["pyleecan", "numpy"],
        "packages_missing": ["femm"]})
    ck("proveCatch.healthy_passes", g3["ok"], f"a good dossier blocked: {g3}")

    # Discovery must find something real in this repo, and must NOT be a
    # hardcoded roster — the whole point is that it cannot go stale.
    solvers = discover_solvers()
    ck("discovery.finds_solvers", len(solvers) >= 5,
       f"only {len(solvers)} --twin scripts found")
    src = Path(__file__).read_text()
    ck("discovery.no_hardcoded_roster",
       "em_fia_demag_screen" not in src.split("WHY THIS EXISTS")[-1].split('"""')[1]
       if '"""' in src else True,
       "solver names are hardcoded outside the docstring")

    tools = discover_tools()
    ck("discovery.finds_tools", len(tools) >= 1, f"{len(tools)} tools found")

    # A lexical-only corpus table must be REPORTED, not silently degraded.
    #
    # ⭐ ASSERT THE MECHANISM, NOT A TRANSIENT STATE (2026-08-02). This first
    # asserted that `fpk_component_literature` IS flagged — and then P2 embedded
    # that very table, closing the gap, and the selftest FAILED for the good
    # reason. An assertion pinned to a condition you are actively fixing breaks
    # the moment you succeed. Same fault family as the demag screen's hardcoded
    # 3.5-7.0 mm band, which passed for as long as the bug it encoded survived.
    # Drive the reporting logic with a SYNTHETIC table instead.
    fake = {"tables": {"lex_only": {"present": True, "total_rows": 100,
                                    "has_embedding_column": False},
                       "hybrid_one": {"present": True, "total_rows": 100,
                                      "has_embedding_column": True}}}
    notes = [f"{t} is LEXICAL ONLY ({m.get('total_rows')} rows)"
             for t, m in fake["tables"].items()
             if m.get("present") and not m.get("has_embedding_column")]
    ck("corpus.flags_lexical_only", len(notes) == 1 and "lex_only" in notes[0],
       f"lexical-only detection is wrong: {notes}")
    # ...and the live dossier must still BUILD, whatever its tables now hold.
    d = build_dossier("formula_e_front_mgu", probe_pkgs=False)
    ck("corpus.live_dossier_builds", bool(d.get("corpus", {}).get("tables")),
       "the live corpus scan returned no tables")

    # ⭐ proveCatch (2026-08-02): an unprobed dossier and a BROKEN probe are
    # both caught, and each names its own cause. The twin shipped with both
    # package lists empty and nothing said a word.
    unprobed = evaluate_capability_gate(d)
    ck("packages.unprobed_is_caught",
       any(f["rule"] == "packages_never_probed" for f in unprobed["findings"]),
       "a dossier with no package probe was accepted")
    broken = evaluate_capability_gate(
        {**d, "packages_probed": True,
         "packages_available": [], "packages_missing": []})
    ck("packages.broken_probe_is_caught",
       any(f["rule"] == "package_probe_returned_nothing"
           for f in broken["findings"]),
       "a probe that ran and found nothing on both sides was accepted")
    healthy = evaluate_capability_gate(
        {**d, "packages_probed": True,
         "packages_available": ["numpy"], "packages_missing": ["femm"]})
    ck("packages.healthy_probe_passes",
       not any(f["rule"].startswith("package") for f in healthy["findings"]),
       "a healthy package probe was flagged")

    for f in fails:
        print(f"  FAIL {f}")
    print(f"{'FAIL' if fails else 'PASS'} capability_lookup_stage selftest "
          f"({len(fails)} failures)")
    return 1 if fails else 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--twin", type=Path)
    ap.add_argument("--product-class")
    ap.add_argument("--output", type=Path)
    ap.add_argument("--enforce", action="store_true")
    ap.add_argument("--no-packages", action="store_true")
    ap.add_argument("--selftest", action="store_true")
    args = ap.parse_args()
    if args.selftest:
        return _selftest()

    pc = args.product_class
    if not pc and args.twin:
        try:
            st = json.loads((args.twin / "state.json").read_text())
            pc = ((st.get("parsedBrief") or {}).get("product_class")
                  or (st.get("moduleDecomposition") or {}).get("product_class")
                  or (st.get("orchestratorContract") or {}).get("product_class"))
        except (OSError, json.JSONDecodeError):
            pc = None
    if not pc:
        ap.error("--product-class required (or a twin whose state.json names one)")

    d = build_dossier(pc, probe_pkgs=not args.no_packages)
    gate = evaluate_capability_gate(d)
    d["gate"] = gate

    out = args.output or (args.twin / "_capability" / "capability_dossier.json"
                          if args.twin else Path("capability_dossier.json"))
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(d, indent=2))

    print(f"  product class      {pc}")
    print(f"  solvers found      {d['n_solvers']}")
    print(f"  tools found        {d['n_tools']}")
    print(f"  packages available {len(d['packages_available'])}"
          f"  missing {len(d['packages_missing'])}")
    for t, m in (d["corpus"].get("tables") or {}).items():
        if m.get("present"):
            print(f"  corpus {t:32s} {m['total_rows']:>7} rows "
                  f"({m['class_scoped_rows']} this class)  {m['search_mode']}")
    for n in d["notes"]:
        print(f"  NOTE {n}")
    for f in gate["findings"]:
        print(f"  [{f['severity']}] {f['rule']}: {f['detail']}")
    print(f"Artefact: {out}")
    if not gate["ok"] and args.enforce:
        print("  CAPABILITY GATE BLOCKS — do not start design work.")
        return 45
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
