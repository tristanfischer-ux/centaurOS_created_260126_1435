#!/usr/bin/env python3
"""
deterministic-checks.py — the INSTANT, off-budget arithmetic verifier for a
ForgeOS run.

    .venv/bin/python scripts/deterministic-checks.py out/ras-inc3

Reads the run's state.json + parts-ledger.json + connection-schedule.json, runs
EVERY check in deterministic_checks_lib (pure arithmetic, no LLM, no network),
prints a table

    check | actual | expected | delta | PASS/FAIL

grouped by family, then "N pass / M fail (+K n/a)", and exits 0 iff every
applicable check passes. Running it takes SECONDS — it replaces the 45-minute
LLM physics-critic chain for the deterministic-arithmetic class of defects, and
unlike the LLM it cannot hallucinate (every number is derived from the run's own
authoritative data: contract quantity / BoM / distributor price / geometry).

EXIT CODES
    0  every applicable check passed
    1  at least one check FAILED
    2  bad usage / no state.json

British spelling.
"""

from __future__ import annotations

import os
import sys
import time

# import the shared library (same directory)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import deterministic_checks_lib as dcl  # noqa: E402


# ----------------------------------------------------------------------------
# terminal formatting (ANSI; degrades to plain text when not a TTY)
# ----------------------------------------------------------------------------
def _supports_colour() -> bool:
    return sys.stdout.isatty() and os.environ.get("NO_COLOR") is None


_C = _supports_colour()
GREEN = "\033[32m" if _C else ""
RED = "\033[31m" if _C else ""
DIM = "\033[2m" if _C else ""
BOLD = "\033[1m" if _C else ""
RST = "\033[0m" if _C else ""


def _fmt_num(v) -> str:
    if v is None:
        return "—"
    av = abs(v)
    if av != 0 and (av >= 1e7 or av < 1e-3):
        return f"{v:.3g}"
    if av >= 1000:
        return f"{v:,.0f}"
    if av >= 1:
        return f"{v:,.3g}"
    return f"{v:.4g}"


def _status_cell(status: str) -> str:
    if status == dcl.PASS:
        return f"{GREEN}PASS{RST}"
    if status == dcl.FAIL:
        return f"{RED}{BOLD}FAIL{RST}"
    return f"{DIM}N/A {RST}"


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: deterministic-checks.py <run-dir>", file=sys.stderr)
        return 2
    run_dir = os.path.normpath(sys.argv[1])
    if not os.path.isdir(run_dir):
        print(f"run dir not found: {run_dir}", file=sys.stderr)
        return 2

    t0 = time.perf_counter()
    state = dcl._load_json(os.path.join(run_dir, "state.json"))
    if not state:
        print(f"no readable state.json in {run_dir}", file=sys.stderr)
        return 2
    checks = dcl.run_all_checks(run_dir, state)
    elapsed = time.perf_counter() - t0

    run_name = os.path.basename(run_dir)
    pclass = (state.get("orchestratorContract") or {}).get("product_class", "—")
    print(f"\n{BOLD}Deterministic check suite — {run_name}{RST}  "
          f"{DIM}(class: {pclass}){RST}")
    print(f"{DIM}pure arithmetic · no LLM · no network · "
          f"derived from contract / BoM / distributor price{RST}\n")

    if not checks:
        print("  (no applicable checks — run data absent)")
        return 0

    # column widths
    name_w = min(60, max(len(c.name) for c in checks))
    num_w = 14
    hdr = (f"  {'CHECK':<{name_w}}  {'ACTUAL':>{num_w}}  {'EXPECTED':>{num_w}}  "
           f"{'Δ':>{num_w}}  STATUS")
    print(f"{BOLD}{hdr}{RST}")
    print(f"  {DIM}{'-' * (name_w + 3 * (num_w + 2) + 8)}{RST}")

    order = ["CONSISTENCY", "ADEQUACY", "BALANCE", "COST", "CONNECTIVITY"]
    n_fail_total = 0
    for cat in order:
        cat_checks = [c for c in checks if c.category == cat]
        if not cat_checks:
            continue
        cf = sum(1 for c in cat_checks if c.status == dcl.FAIL)
        n_fail_total += cf
        print(f"\n  {BOLD}{cat}{RST}  {DIM}({len(cat_checks)} checks, "
              f"{cf} fail){RST}")
        for c in cat_checks:
            rel = {"ge": ">=", "le": "<=", "tally": "==0", "eq": "=="}.get(c.relation, "==")
            name = c.name if len(c.name) <= name_w else c.name[: name_w - 1] + "…"
            line = (f"  {name:<{name_w}}  {_fmt_num(c.actual):>{num_w}}  "
                    f"{rel} {_fmt_num(c.expected):>{num_w - 3}}  "
                    f"{_fmt_num(c.delta):>{num_w}}  {_status_cell(c.status)}")
            print(line)
            if c.status == dcl.FAIL:
                print(f"    {RED}↳ {c.detail}{RST}")

    n_pass, n_fail, n_na = dcl.summarise(checks)
    print(f"\n  {BOLD}{n_pass} pass / {n_fail} fail{RST}"
          f"  {DIM}(+{n_na} n/a, {len(checks)} total){RST}")
    print(f"  {DIM}runtime: {elapsed * 1000:.0f} ms{RST}\n")

    if n_fail:
        print(f"  {RED}{BOLD}FAILURES:{RST}")
        for c in checks:
            if c.status == dcl.FAIL:
                print(f"  {RED}· [{c.category}] {c.name}{RST}")
                print(f"      {c.detail}")
        print()
    return 1 if n_fail else 0


if __name__ == "__main__":
    sys.exit(main())
