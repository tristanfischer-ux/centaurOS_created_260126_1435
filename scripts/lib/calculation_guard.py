#!/usr/bin/env python3
"""CALCULATION GUARD — before you compute it by hand, find the tool that owns it.

INTENT (Tristan 2026-08-02): "can you make a rule so that every time you want to
do a calculation you need to check if there is a tool or software package
available to do it deterministically?"

WHY A RULE AND NOT A HABIT. In one session, every one of these was hand-derived
while the tool sat installed and unused:

  hand-typed                          the tool that owned it            cost
  ----------------------------------  --------------------------------  --------
  iron loss rescaled by B^2 and mass  motor_loss_point.py               gave 302 W
                                                                        not 441, and
                                                                        4225 W of
                                                                        magnet eddy
                                                                        the twin had
                                                                        as ZERO
  B_tooth = B_gap / 0.54              an FE probe                       measured 1.799 T
  flux_pole = 2*B_pk*r_gap*L/p and    pyleecan comp_Ntsp()              settled the
  lam = kw1*N*flux_pole                                                 2x parallel-path
                                                                        question in 3 lines
  nearly wrote a demag check          em_fia_demag_screen.py            already existed
  nearly wrote an angle sweep         em_fia_mtpa_screen.py             already existed

The capability-lookup stage already reports that 41 solvers and 270 tools exist.
It did not stop any of the above, because knowing the shelf is full does not stop
you reaching for a calculator mid-thought. This guard answers the narrower,
actionable question: *for THIS calculation, what already does it?*

HOW IT WORKS — deterministic, no model. Indexes every solver and orchestrator
tool by its module docstring and function names, then scores an intent against
them. Exits 47 when a strong match exists, so a caller that wires it in cannot
proceed without either using the tool or overriding deliberately.

UNIVERSAL: indexes whatever is in the repo. Nothing here knows about motors.

Usage:
    calculation_guard.py --intent "iron loss from flux density"
    calculation_guard.py --intent "..." --enforce      # exit 47 on a strong match
    calculation_guard.py --selftest
"""

from __future__ import annotations

import argparse
import ast
import re
from dataclasses import dataclass
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]

SEARCH_ROOTS = (
    "scripts/motor-stack", "scripts/lib", "scripts/lib/orchestrator/tools/python",
    "scripts/blender-universal", "scripts/ingest",
)

# Words that carry no discriminating power in an engineering repo.
STOP = frozenset("""
a an the and or of for from with to in on at by is are be it this that use used
using compute computes computed calculate calculates calculation value values
run runs script python def return not none true false self twin state json
""".split())

STRONG_MATCH_SCORE = 3.0


@dataclass
class ToolEntry:
    path: str
    summary: str
    terms: set


def _terms(text: str) -> set:
    return {w for w in re.findall(r"[a-z_]{3,}", (text or "").lower())
            if w not in STOP}


def index_tools(repo: Path = REPO_ROOT) -> list[ToolEntry]:
    """Index by DOCSTRING and function names — what a tool says it does."""
    seen: set[str] = set()
    out: list[ToolEntry] = []
    for root in SEARCH_ROOTS:
        base = repo / root
        if not base.is_dir():
            continue
        for path in sorted(base.glob("*.py")):
            rel = str(path.relative_to(repo))
            if rel in seen or path.name.startswith("_"):
                continue
            if path.name == "calculation_guard.py":
                continue          # never rank itself
            seen.add(rel)
            try:
                src = path.read_text(errors="ignore")
                tree = ast.parse(src)
            except (OSError, SyntaxError):
                continue
            doc = ast.get_docstring(tree) or ""
            funcs = " ".join(
                n.name for n in ast.walk(tree)
                if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))
                and not n.name.startswith("_"))
            summary = (doc.strip().splitlines() or [""])[0][:150]
            out.append(ToolEntry(rel, summary,
                                 _terms(doc) | _terms(funcs) | _terms(path.stem)))
    return out


def find(intent: str, tools: list[ToolEntry], *, top: int = 5) -> list[dict]:
    """Score an intent against the index. Deterministic, order-stable.

    ⭐ WEIGHT BY SPECIFICITY, NOT COUNT (fixed on first run). Scoring by the
    NUMBER of shared terms let a tool matching several GENERIC words ('flux',
    'mass', 'density') outrank the one matching the two that actually identify
    the calculation. `motor_loss_point` — the tool this guard exists to have
    surfaced — scored 2.8 on 'iron'+'loss' and lost. Inverse document frequency
    fixes it: a term appearing in 3 of 300 tools discriminates; one appearing in
    150 does not.
    """
    want = _terms(intent)
    if not want:
        return []
    import math as _m
    n = max(1, len(tools))
    df = {w: sum(1 for t in tools if w in t.terms) for w in want}
    scored = []
    for t in tools:
        hit = want & t.terms
        if not hit:
            continue
        score = sum((1.0 + len(w) / 10.0) * _m.log(1.0 + n / max(1, df[w]))
                    for w in hit)
        scored.append({"path": t.path, "score": round(score, 2),
                       "matched": sorted(hit)[:8], "summary": t.summary})
    scored.sort(key=lambda r: (-r["score"], r["path"]))
    return scored[:top]


def evaluate(intent: str, hits: list[dict]) -> dict:
    strong = [h for h in hits if h["score"] >= STRONG_MATCH_SCORE]
    return {
        "schema": "forgeos.calculation_guard/v1",
        "intent": intent, "hits": hits, "strong": strong,
        "ok": not strong,
        "verdict": (
            f"USE THE TOOL: {strong[0]['path']} — do not hand-derive this"
            if strong else
            "no strong match; hand-derivation may be justified — say so explicitly"
            if hits else
            "nothing in the repo matches; check the corpus and package list before writing new code"),
    }


def _selftest() -> int:
    fails: list[str] = []

    def ck(n: str, c: bool, d: str = "") -> None:
        if not c:
            fails.append(f"{n}: {d}")

    tools = index_tools()
    ck("index.finds_tools", len(tools) >= 50, f"only {len(tools)} indexed")

    # ── proveCatch: EVERY calculation I hand-derived today must be caught ────
    # Each of these was typed into a one-liner while the named tool sat unused.
    cases = (
        ("iron loss from flux density and lamination mass",
         "motor_loss_point"),
        ("magnet demagnetisation margin at temperature",
         "demag"),
        ("torque versus current angle and rotor position map",
         "mtpa"),
        ("excitation tracking harmonics of a rotor position sweep",
         "excitation"),
        ("magnet flux focusing ratio and airgap flux",
         "flux_focusing"),
    )
    for intent, expect in cases:
        hits = find(intent, tools)
        got = [h["path"] for h in hits]
        ck(f"proveCatch.{expect}",
           any(expect in p for p in got),
           f"'{intent}' did not surface {expect}; got {got[:3]}")
        ck(f"proveCatch.{expect}_is_strong",
           bool(evaluate(intent, hits)["strong"]),
           f"'{intent}' matched but not strongly enough to block")

    # ── A genuinely novel intent must NOT produce a false block, or the guard
    #    becomes noise that gets ignored.
    # A genuinely novel intent must NOT produce a false block, or the guard
    # becomes noise that gets ignored. NOTE: "orbital eccentricity" was the
    # first negative case tried and it CORRECTLY matched orbit_propagator_j2 —
    # the repo really does have orbital tools. A negative test must name
    # something the repo genuinely lacks.
    # Finding a genuinely uncovered intent is HARD — 457 tools across many
    # domains. "orbital eccentricity" matched orbit_propagator_j2 correctly;
    # "sourdough fermentation" matched biosteam_run correctly. Both were bad
    # negative cases, not false positives. That the repo covers so much is
    # exactly why hand-deriving is almost never justified here.
    novel_intent = "chess endgame tablebase probing"
    novel = find(novel_intent, tools)
    ck("novel.no_false_block", not evaluate(novel_intent, novel)["strong"],
       f"a novel intent falsely matched: {[h['path'] for h in novel[:2]]}")

    # ── Determinism: the same intent must give the same answer.
    a = [h["path"] for h in find("iron loss from flux density", tools)]
    b = [h["path"] for h in find("iron loss from flux density", tools)]
    ck("determinism.stable_order", a == b, "ranking is not order-stable")

    for f in fails:
        print(f"  FAIL {f}")
    print(f"{'FAIL' if fails else 'PASS'} calculation_guard selftest "
          f"({len(fails)} failures)")
    return 1 if fails else 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--intent")
    ap.add_argument("--top", type=int, default=5)
    ap.add_argument("--enforce", action="store_true",
                    help="exit 47 when a tool already owns this calculation")
    ap.add_argument("--selftest", action="store_true")
    args = ap.parse_args()
    if args.selftest:
        return _selftest()
    if not args.intent:
        ap.error("--intent required unless --selftest")

    hits = find(args.intent, index_tools(), top=args.top)
    res = evaluate(args.intent, hits)
    print(f"  intent: {args.intent}")
    for h in hits:
        mark = "STRONG" if h["score"] >= STRONG_MATCH_SCORE else "weak  "
        print(f"   [{mark}] {h['score']:5.2f}  {h['path']}")
        if h["summary"]:
            print(f"            {h['summary'][:110]}")
    print(f"  {res['verdict']}")
    return 47 if (res["strong"] and args.enforce) else 0


if __name__ == "__main__":
    raise SystemExit(main())
