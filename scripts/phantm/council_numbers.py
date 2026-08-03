"""PHANTM — council review of EVERY number the project currently asserts.

Run after the 2026-08-03 finding that the unrolled 2D model understates force
~5x. The question is no longer "are these right" but "WHICH of these survive
the defect" — so each seat sorts every item into SURVIVES / VOID / UNCERTAIN.

Writes each seat's transcript AS IT COMPLETES. The previous run held everything
until all five finished, hit a timeout, and lost the lot — a result you cannot
read is the same as no result.

Run: ~/.venvs/phantm/bin/python council_numbers.py [seat ...]
"""

from __future__ import annotations

import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

import council_v2
from council_v2 import call

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
FACTS_PATH = os.path.join(OUT, "all-asserted-numbers.txt")

COMMON = ("Sort EVERY numbered item into exactly one of: SURVIVES (unaffected "
          "by the model defect in section F), VOID (depends on the defective "
          "model and must not be quoted), or UNCERTAIN (say what would settle "
          "it). Be decisive — a list where everything is UNCERTAIN is no use. "
          "Then answer in one paragraph: what is the single most important "
          "thing to do next?")

SEATS = {
    "grok": dict(
        model="x-ai/grok-4.5",
        system=("Adversarial chartered engineer. Assume the numbers are wrong "
                "until shown otherwise. Do not be balanced or encouraging."),
        ask=COMMON + " Attack hardest on anything in sections A-D that a reader "
            "would ASSUME survives because it looks like pure arithmetic, but "
            "which actually depends on the finite-element model somewhere "
            "upstream."),
    "kimi": dict(
        model="moonshotai/kimi-k3",
        system=("Numerical auditor. Recompute independently from the stated "
                "inputs. Terse and quantitative; show your arithmetic."),
        ask=COMMON + " Recompute every arithmetic item in A, B, C and D and "
            "flag anything that does not reproduce."),
    "glm": dict(
        model="z-ai/glm-5.2",
        system=("You check internal consistency and what is missing. Not "
                "arithmetic."),
        ask=COMMON + " Then: which conclusions already communicated to the "
            "client must be retracted or qualified, and which can stand as "
            "they are?"),
    "sol": dict(
        model="openai/gpt-5.6-sol",
        system=("Senior electromagnetic machine designer. Judge whether the "
                "physics reasoning holds, independent of whose model is right."),
        ask=COMMON + " Then judge section F specifically: is the diagnosis of "
            "the model defect correct; is the 1.65x versus 4.4x gap-sensitivity "
            "disagreement resolvable from first principles; and which of the "
            "two models is more likely right about it?"),
    "deepseek": dict(
        model="deepseek/deepseek-v4-flash",
        system=("Independent checker. Recompute what you can. Do not be "
                "agreeable — a confirmation is worthless if you would have "
                "given it either way."),
        ask=COMMON),
}


def main():
    council_v2.FACTS = open(FACTS_PATH).read()
    want = sys.argv[1:] or list(SEATS)
    t0 = time.time()
    with ThreadPoolExecutor(max_workers=5) as ex:
        futs = {ex.submit(call, s, SEATS[s]): s for s in want}
        for fut in as_completed(futs):
            seat, txt = fut.result()
            p = os.path.join(OUT, f"council-numbers-{seat}.txt")
            open(p, "w").write(txt)
            status = "FAILED" if "[FAILED" in txt else f"{len(txt.split())} words"
            print(f"  [{time.time()-t0:5.0f}s] {seat:9s} "
                  f"{SEATS[seat]['model']:26s} {status}", flush=True)
    print(f"\nwrote out/council-numbers-*.txt ({time.time()-t0:.0f} s)")


if __name__ == "__main__":
    main()
