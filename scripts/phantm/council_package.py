"""PHANTM — council review of the ACTUAL package going to the client.

Reviews the verbatim reply and read-me, not a summary of them. A summary is a
second chance to launder the error you are trying to catch.

Each seat writes as it completes, so a timeout cannot lose the lot.

Run: ~/.venvs/phantm/bin/python council_package.py [seat ...]
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
PACK = os.path.join(OUT, "tony-package-for-review.txt")

COMMON = ("This goes to the client as written. Report: (1) any NUMBER that is "
          "wrong, unsupported by the data given, or inconsistent with another "
          "number in the package; (2) any CLAIM the data does not support; "
          "(3) anything that would damage credibility with a sharp engineer. "
          "Quote the offending text. End with SEND / SEND WITH FIXES / DO NOT "
          "SEND, and if fixes are needed list them as specific edits.")

SEATS = {
    "grok": dict(
        model="x-ai/grok-4.5",
        system=("Adversarial chartered engineer reviewing outbound client "
                "correspondence. Your job is to stop something embarrassing "
                "or wrong from being sent. Do not be balanced."),
        ask=COMMON + " Attack the physics reasoning hardest — especially the "
            "duty>1/3 argument, the 'fringing keeps the effective tooth wider' "
            "explanation, and the claim that no dead zone appears."),
    "kimi": dict(
        model="moonshotai/kimi-k3",
        system=("Numerical auditor. Check every figure in the letter against "
                "the supporting data. Terse, quantitative, show arithmetic."),
        ask=COMMON + " Recompute every ratio, percentage and derived figure "
            "quoted in the reply and read-me from the data in Part 3. Flag "
            "any that does not reproduce."),
    "glm": dict(
        model="z-ai/glm-5.2",
        system=("You check internal consistency and completeness of client "
                "documents. Not arithmetic."),
        ask=COMMON + " Focus on: does the letter contradict itself or the "
            "read-me; does it promise anything we cannot deliver; does it "
            "concede too much or too little; and what will he ask that it "
            "does not answer?"),
    "sol": dict(
        model="openai/gpt-5.6-sol",
        system=("Senior electromagnetic machine designer reading a letter from "
                "a consultant. Judge whether the engineering is right and "
                "whether you would trust the sender after reading it."),
        ask=COMMON + " Then: is the raw-versus-pitch-averaged force explanation "
            "correct and correctly stated? And is the decomposition argument "
            "(teeth exact, return path idealised) sound, or is it special "
            "pleading for a 2D model that cannot do the job?"),
    "deepseek": dict(
        model="deepseek/deepseek-v4-flash",
        system=("Independent checker. Recompute what you can. Do not be "
                "agreeable."),
        ask=COMMON),
}


def main():
    council_v2.FACTS = open(PACK).read()
    want = sys.argv[1:] or list(SEATS)
    t0 = time.time()
    with ThreadPoolExecutor(max_workers=5) as ex:
        futs = {ex.submit(call, s, SEATS[s]): s for s in want}
        for fut in as_completed(futs):
            seat, txt = fut.result()
            open(os.path.join(OUT, f"council-package-{seat}.txt"), "w").write(txt)
            status = "FAILED" if "[FAILED" in txt else f"{len(txt.split())} words"
            print(f"  [{time.time()-t0:5.0f}s] {seat:9s} "
                  f"{SEATS[seat]['model']:26s} {status}", flush=True)
    print(f"\nwrote out/council-package-*.txt ({time.time()-t0:.0f} s)")


if __name__ == "__main__":
    main()
