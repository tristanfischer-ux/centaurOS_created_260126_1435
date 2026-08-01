#!/usr/bin/env python3
"""Pre-commit council review — put the DIFF and its CLAIM to the council before
it lands.

INTENT (Tristan 2026-08-01): "before you commit anything, get the council to
look at your work and make sure that you are committing on a regular basis."

WHY THIS EXISTS. On 2026-08-01 a decision brief asserting "both levers give
142.5 N.m = 1.14x, closes" was reviewed by the council BEFORE it drove any
geometry work, and two seats independently found the arithmetic error: a magnet
flux multiplier had been applied to the RELUCTANCE term, which does not scale
with PM flux. Corrected, the same levers give 0.988x — the decision reversed.
That review cost about $0.13 and saved committing real BoM, mass and packaging
budget to a wrong answer.

THE SEAT DISCIPLINE (scripts/lib/model_routing.py). CritPt tops out at 32%, so
NO seat here validates anything — validation belongs to the solvers, the
selftests and the gate registry. Seats are asked what they are good at:

    CORROBORATE  z-ai/glm-5.2       does the reasoning hold? standing first call
    PROPOSE      openai/gpt-5.6-sol what did this miss? escalation only
    AUDIT        minimax/minimax-m3 is each claim SUPPORTED by the diff itself?

The auditor is never asked physics. It is asked the one question a model with
84% non-hallucination and 4% CritPt is actually good at.

UNIVERSAL: takes any diff and any claim. Nothing here knows about motors,
Formula E, or this repo's domain.

Usage:
    council_precommit_review.py --claim "what this change asserts" [--staged]
    council_precommit_review.py --claim "..." --diff-file <path>
    council_precommit_review.py --selftest
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "scripts" / "lib"))

MAX_DIFF_CHARS = 60_000

ROLE_PROMPTS = {
    "corroborate": """You are reviewing a code change BEFORE it is committed.

Judge the REASONING, not the style. Specifically:
- Does the change do what its claim says it does?
- Is any arithmetic in the claim or the comments WRONG? State the correct value.
- Does a stated invariant/selftest actually test what it says?
- Is anything asserted that the diff does not establish?

Return STRICT JSON only:
{"arithmetic_errors":[{"where":"...","stated":"...","correct":"...","impact":"..."}],
 "reasoning_faults":[{"where":"...","fault":"...","consequence":"..."}],
 "blocking": true/false,
 "one_line_summary":"..."}""",
    "propose": """You are reviewing a code change BEFORE it is committed.

Your job is what it MISSED. Specifically:
- An edge case the change now breaks.
- A caller or archetype this change silently changes behaviour for.
- A cheaper or more general way to achieve the same claim.
- A hidden coupling that makes this bespoke when it claims to be universal.

Return STRICT JSON only:
{"missed":[{"issue":"...","why_it_matters":"...","how_to_test":"..."}],
 "generality_concerns":["..."],
 "blocking": true/false,
 "one_line_summary":"..."}""",
    "audit": """You are a CLAIM AUDITOR for a code change. You are NOT being asked
to do domain physics or engineering, and you must not attempt it.

For EVERY claim made in the commit message / stated claim, decide ONLY:
  SUPPORTED    — the diff itself shows this
  UNSUPPORTED  — asserted, but nothing in the diff establishes it
  OVERSTATED   — partly shown, but the claim is stronger than the evidence
  CONTRADICTED — the diff shows the opposite

Return STRICT JSON only:
{"claims":[{"claim":"...","verdict":"SUPPORTED|UNSUPPORTED|OVERSTATED|CONTRADICTED","why":"..."}],
 "weakest_link":"...",
 "blocking": true/false,
 "one_line_summary":"..."}""",
}


def load_api_key() -> str:
    key = os.environ.get("OPENROUTER_API_KEY", "")
    if key:
        return key
    for c in (REPO_ROOT / ".env.local", Path.home() / ".env",
              Path.home() / "secrets/.env"):
        if c.exists():
            for line in c.read_text().splitlines():
                if line.startswith("OPENROUTER_API_KEY="):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit("OPENROUTER_API_KEY missing")


def get_diff(staged: bool, diff_file: Path | None) -> str:
    if diff_file:
        return diff_file.read_text()
    cmd = ["git", "diff", "--cached"] if staged else ["git", "diff", "HEAD"]
    out = subprocess.run(cmd, cwd=REPO_ROOT, capture_output=True,
                         text=True, check=False).stdout
    if len(out) > MAX_DIFF_CHARS:
        # Truncate in the MIDDLE — the head and tail of a diff carry the file
        # names and the most recent hunks; dropping the tail loses the newest
        # work, which is usually what most needs reviewing.
        half = MAX_DIFF_CHARS // 2
        out = (out[:half] + "\n...[diff truncated in the middle]...\n"
               + out[-half:])
    return out


def review(claim: str, diff: str, seats: dict[str, tuple[str, str]],
           api_key: str) -> dict:
    import concurrent.futures as cf
    import urllib.request

    user = (f"CLAIM MADE BY THIS CHANGE:\n{claim}\n\n"
            f"DIFF:\n```diff\n{diff}\n```")

    def call(seat: str, model: str, role: str) -> dict:
        body = {"model": model, "temperature": 0.1, "max_tokens": 40000,
                "messages": [{"role": "system", "content": ROLE_PROMPTS[role]},
                             {"role": "user", "content": user}]}
        req = urllib.request.Request(
            "https://openrouter.ai/api/v1/chat/completions",
            data=json.dumps(body).encode(),
            headers={"Authorization": f"Bearer {api_key}",
                     "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=600) as resp:
                raw = resp.read().decode().strip()
            payload = json.loads(raw[raw.find("{"):])
            msg = payload["choices"][0]["message"]
            text = (msg.get("content") or msg.get("reasoning") or "").strip()
            objs = _balanced_json(text)
            for o in objs:
                if "blocking" in o or "claims" in o or "missed" in o:
                    return {"seat": seat, "role": role, "ok": True, "review": o}
            return {"seat": seat, "role": role, "ok": False,
                    "finish": payload["choices"][0].get("finish_reason"),
                    "raw": text[:1500]}
        except Exception as exc:  # noqa: BLE001 — one dead seat must not block
            return {"seat": seat, "role": role, "ok": False, "error": str(exc)}

    results: dict[str, dict] = {}
    with cf.ThreadPoolExecutor(max_workers=len(seats)) as pool:
        futs = [pool.submit(call, s, m, r) for s, (m, r) in seats.items()]
        for f in cf.as_completed(futs):
            res = f.result()
            results[res["seat"]] = res
    return results


def _balanced_json(text: str) -> list[dict]:
    """Every balanced {...} that parses, largest first. String-aware."""
    found, depth, start, in_str, esc = [], 0, -1, False, False
    for i, ch in enumerate(text):
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
        elif ch == "{":
            if depth == 0:
                start = i
            depth += 1
        elif ch == "}" and depth > 0:
            depth -= 1
            if depth == 0 and start >= 0:
                try:
                    o = json.loads(text[start:i + 1])
                    if isinstance(o, dict):
                        found.append(o)
                except json.JSONDecodeError:
                    pass
                start = -1
    return sorted(found, key=lambda o: len(json.dumps(o)), reverse=True)


def _selftest() -> int:
    fails = []
    # The extractor must survive narration around the answer.
    got = _balanced_json('I think {not json} and then {"blocking": false}')
    if not any(o.get("blocking") is False for o in got):
        fails.append("extractor did not recover the answer from narration")
    # Every role must have a distinct prompt, and the auditor must NOT be asked
    # to do domain reasoning — that is the whole point of the seat split.
    if len({ROLE_PROMPTS[r] for r in ROLE_PROMPTS}) != 3:
        fails.append("role prompts are not distinct")
    if "must not attempt it" not in ROLE_PROMPTS["audit"]:
        fails.append("auditor prompt does not forbid domain reasoning")
    for r in ("corroborate", "propose"):
        if "must not attempt it" in ROLE_PROMPTS[r]:
            fails.append(f"{r} prompt wrongly forbids reasoning")
    # A middle-truncated diff must keep BOTH ends.
    import types
    long_diff = "HEAD" + "x" * (MAX_DIFF_CHARS * 2) + "TAIL"
    f = Path("/tmp/_council_selftest.diff"); f.write_text(long_diff)
    out = get_diff(False, f)
    if not (out.startswith("HEAD") and out.endswith("TAIL")):
        fails.append("truncation lost an end of the diff")
    f.unlink(missing_ok=True)
    for x in fails:
        print(f"  FAIL {x}")
    print(f"{'FAIL' if fails else 'PASS'} council_precommit_review selftest "
          f"({len(fails)} failures)")
    return 1 if fails else 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--claim")
    ap.add_argument("--staged", action="store_true")
    ap.add_argument("--diff-file", type=Path)
    ap.add_argument("--output", type=Path)
    ap.add_argument("--selftest", action="store_true")
    args = ap.parse_args()
    if args.selftest:
        return _selftest()
    if not args.claim:
        ap.error("--claim required")

    import model_routing as mr
    seats = {
        "glm52": (mr.CORROBORATE.model, "corroborate"),
        "sol": (mr.PROPOSE.model, "propose"),
        "minimax_m3": (mr.AUDIT.model, "audit"),
    }
    diff = get_diff(args.staged, args.diff_file)
    if not diff.strip():
        print("no diff to review")
        return 0
    print(f"reviewing {len(diff)} chars of diff across {len(seats)} seats...")
    results = review(args.claim, diff, seats, load_api_key())

    blocking = []
    for seat, r in sorted(results.items()):
        if not r.get("ok"):
            print(f"  [FAIL] {seat:11s} {r.get('error') or r.get('finish')}")
            continue
        rev = r["review"]
        flag = "BLOCK" if rev.get("blocking") else "ok"
        print(f"  [{flag:5s}] {seat:11s} ({r['role']}) "
              f"{str(rev.get('one_line_summary'))[:120]}")
        for e in rev.get("arithmetic_errors") or []:
            print(f"      ARITHMETIC: {e.get('where')}: stated {e.get('stated')} "
                  f"-> correct {e.get('correct')}")
        for e in (rev.get("reasoning_faults") or [])[:3]:
            print(f"      FAULT: {str(e.get('fault'))[:130]}")
        for e in (rev.get("missed") or [])[:3]:
            print(f"      MISSED: {str(e.get('issue'))[:130]}")
        for c in (rev.get("claims") or []):
            if c.get("verdict") in ("UNSUPPORTED", "CONTRADICTED", "OVERSTATED"):
                print(f"      [{c['verdict']}] {str(c.get('claim'))[:110]}")
        if rev.get("blocking"):
            blocking.append(seat)

    if args.output:
        args.output.write_text(json.dumps(results, indent=2))
    print()
    if blocking:
        print(f"COUNCIL BLOCKS: {', '.join(blocking)} — fix before committing.")
        return 1
    print("COUNCIL CLEAR — no seat blocked. Commit.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
