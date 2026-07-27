# Report restructure plan — v6 (proposed 25 Jul, awaiting Tristan's go)

## The purpose, stated (Tristan 25 Jul)
"Taking the concept design and hardening assumptions with facts and testing,
then moving to choices on how to manufacture it, and then who can manufacture
it." The report is a **de-risking funnel**: concept → proof → choice →
manufacture → maker.

## Diagnosis of v5.2 (why it reads worse than its content)
1. **Ordered by chronology of work, not by argument.** Tony's feedback rounds
   sit at §0 before the reader knows the design; the cell arrived as §9 with
   PCB and firmware nested inside it; the optimisation campaign (§10) lands
   AFTER the cell it modifies; suppliers appear twice (§9.6 cells, §13
   actuator); sub-numbers like 9.5b/9.5c/10.1b are visible accretion scars.
2. **No executive layer.** A reader (Tony skimming, a DIANA/UKDI reviewer)
   cannot answer "what is proven, what is open, what should be built first"
   without reading 100+ pages.
3. **The hardening story is implicit.** Proofs, measurements, red-team
   verdicts and open gates are distributed through prose. Nothing in one
   place says: assumption X — status PROVEN/OPEN — evidence — owner.
4. **The manufacturing story is split** across §9.6 (cell tutorial), §11
   (builds A/B/C), cost fragments in the actuator sections, and §13 outreach.

## Proposed structure (five parts + appendices, mapped to the funnel)

**Part 0 — Executive: the concept and the state of play** (2 pages, new)
  What PHANTM is; the five headline numbers; what is PROVEN (with the number),
  what is OPEN (the gates), the recommended first hardware (Prototype-A), and
  the decision queue by owner (Tristan / Tony / Vlad).

**Part I — The concept design and what must be true**
  Tony's baseline geometry (untouched anchor) · requirements + boundary
  conditions · the actuator↔cell↔PCB interface contract · **THE CLAIMS
  REGISTER** (the new spine — see below).

**Part II — Hardening: facts and testing** (the evidence body)
  II.A actuator FE (current §1–8 core) · II.B cell physics + wall proof
  (§9.1–9.4, 9.8, 9.9) · II.C dynamics + damper (§10.3) · II.D drive
  electronics + firmware evidence (§9.5c compile/run gates) · II.E the
  red-team record (what the council attacked, what fell, what survived).

**Part III — Design choices** (the decision record)
  The Pareto and the two recommended sets · ALL option ledgers together
  (actuator 66 / cell 16 / PCB 11) with kills on the record · topology
  decisions · open gates as NAMED DECISIONS with options (demag FE, gap
  20-vs-30, registration, S108).

**Part IV — How to manufacture**
  Builds A/B/C · cell fabrication tutorial + routes · drawing rules (hold the
  INTERIOR 3.10; thicken outward; plating ≥3 µm) · tolerance sensitivities ·
  cost model + volume thresholds.

**Part V — Who can manufacture**
  ONE unified supplier table (actuator + cell + plating + PCB), contacts,
  recommended first RFQs, outreach drafts (unsent).

**Appendices** — Tony feedback rounds 1–4 with responses (trace) ·
  traceability/verification statement (what the deterministic verifier pins) ·
  artefact index.

## The claims register (the one genuinely new device)
Machine-generated table (new `claims.py`, reads the existing artefact JSONs),
one row per load-bearing assumption:

| Claim | Status | Evidence | Owner of residual risk |
|---|---|---|---|
| e.g. "wall thickness is not an RF dimension" | PROVEN (calc + adversarial) | wall-proof.json §II.B | closed |
| e.g. "dual drive does not demagnetise the PM" | OPEN GATE | §III demag FE pending | blocks dual drive |

Status vocabulary: PROVEN-calc / PROVEN-FE / MEASURED / RED-TEAMED /
OPEN-gate / EXTERNAL (Vlad/Tony input). This is "hardening assumptions with
facts" made auditable — and it is exactly the de-risking evidence the
DIANA/UKDI bids want to cite.

## Recommendation on document count
ONE document with five parts (not a split engineering-dossier + manufacturing
pack). Tony is a single deep reader; a split creates sync burden and the
funnel loses its narrative. Confidence: moderate — flip to a split only if a
partner/bid audience needs a standalone manufacturing pack later (Part IV+V
extract cleanly by construction).

## Increments (each: build → verify ALL GREEN → commit)
A. Freeze v5.2 (done — zip shipped 25 Jul).
B. `claims.py` → claims-register.json + verifier pins (status counts, no
   claim without evidence pointer).
C. Skeleton move: reorder report.py into Parts 0–V + appendices. CONTENT
   STRINGS MOVE UNCHANGED wherever possible (the verifier's ~200 string pins
   are the regression net; update `contains`/section-header pins in lockstep,
   keep every number pin untouched).
D. Write Part 0 executive layer (the only substantial new prose).
E. Unify Parts IV/V from the scattered manufacturing/supplier content.
F. Re-render → verifier ALL GREEN → one council seat on structure/readability
   (fresh-eyes read, not physics) → rebuild package as v6 → new zip.

Effort estimate (independent): ~half a day of work, dominated by C's
verifier-pin lockstep. Risk pole: breaking a string pin silently — mitigated
by running verify_report.py after every increment, never at the end only.
