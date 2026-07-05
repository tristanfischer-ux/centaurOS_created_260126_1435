# Archetype Campaign Playbook — how to take any archetype to ≥9/10 fast

> Distilled from the Codema water-treatment campaign (~80 commits, v50→v79) and the BESS campaign
> (~30 commits, v1→v8), 2026-07-02 → 2026-07-05. Every lesson here was paid for. Read this BEFORE
> starting a new archetype; run the pre-flight (`scripts/archetype-preflight.py`) before the first
> chain run.

## The 9 defect families (every campaign defect fell into one of these)

1. **Vocabulary/matcher gaps** — the class's nouns, tag prefixes, and ISA letters are unknown to
   shared matchers. Hit ~10 different matchers across two campaigns (benchmark metric matcher,
   drift detector's GENERIC_HEADS, catalogue-candidacy lexicon, valve/instrument recon regexes,
   glossary prefixes, HVAC hub patterns, schedule ISA synonyms, plural folds — 'mains' is a mass
   noun, 'uf' is a domain token). **Rule: a bare noun can never decide a join; qualifiers decide,
   generics support** (the f9dfc2918 discipline). New class ⇒ audit every matcher for its
   vocabulary FIRST.
2. **Two-truths / multi-mint** — the same physical quantity minted independently in 2+ places
   (kVA: tool vs design-loop vs drawing; cell Ah: contract vs closure hardcode vs octopart static
   mint vs pybamm fallback ×4; transformer impedance; RTE-in-a-comment). **Rule: one mint, one
   owner; every consumer reads the contract quantity; grep for the class's key constants before
   the first run** — a numeric literal inside a class plan/closure is a bug waiting.
3. **Stale-artefact / ordering** — a consumer reads state before a later writer settles it
   (workbook before late corrections → GATE 38; identity snapshot before the fill → pin-then-lost;
   connection ledger authored before scope-demotion → trace ghosts; partVerifications snapshot
   after savedAt → BoM ghosts). **Rule: any authored artefact must be re-validated against the
   FINAL state (reconciliation authorities), and evidence runs need a staleness gate.**
4. **Identity field-swaps** — a parent's manufacturer+PN copied onto its accessory (fan tray
   wearing the PCS's identity; sensor mount wearing the detector's). **Rule: an accessory-shaped
   word whose researched PN disagrees with the copied modifier PN prefers the researched identity**
   (`_ACCESSORY_IDENTITY_RE` family in requirements_bom.py).
5. **Placeholder/default trust** — wholesale defaults (4.2 A, 15 A) trusted by downstream
   consumers; the dominant-default detector itself can be out-voted by one board's fan-out
   (de-duplicate before voting). **Rule: a reading that matches a schedule-wide default AND
   contradicts the consumer's own arithmetic is a placeholder — derive from own evidence.**
6. **Denominator dishonesty** — coverage/score fractions dividing by populations that include
   non-applicable lines (labels/certs/commodity in 3D coverage; allowance rows in valve recon;
   BMS electronics in instrument counts). **Rule: the expectation derives from the same shared
   classification that governs rendering (ga_massing/TYPE_RULES) — one classification, both
   sides.** Also the honest-status taxonomy: fabricated / architecturally-excluded /
   OEM-proprietary / generic-spec / commodity vs TRUE not-found.
7. **Scorer double-penalties / silent caps** — blanket caveat-caps re-penalising gaps already
   priced into arithmetic (TBD, ADVISORY, placeholder, cell-contract diagnostics — four
   instances); min(8) modesty caps that can't be exceeded; mirror tabs included in the floor they
   mirror (a 0 becomes self-sustaining). **Rule: every deduction exactly once; caps only with
   differentiated excellence criteria; mirrors out of their own min.**
8. **Procurement-model mismatches** — pricing a component-by-component self-assembly when the
   market buys integrated blocks (BESS DC block at $80/kWh vs summed Western parts at £147/kWh).
   **Rule: capture the archetype's real procurement model (with market citations) as contract
   inputs BEFORE judging any cost anchor; block price = authority, component lines = reconciled
   transparency breakdown.**
9. **LLM re-roll surfaces** — every LLM stage either caches on a content hash (brief parse,
   research, generator, critiques, benchmark expectation) or is corroboration-gated before it can
   score or block (physics critic, vision critic, benchmark radicals, gate 33). **Rule: no LLM
   opinion may score, block, or vary a deliverable without either a cache hit or deterministic
   corroboration.** Both directions matter: gates also produce FALSE positives (the alloy-grade
   regex count, the fuse ampacity claim, the autocorrect proposing a non-existent part) — verify
   the gate's claim against deterministic evidence before "fixing".

## The campaign process (what actually worked)

- **Read-only classified triage first** (A: check/scorer bug, B: artefact missing/stale, C: genuine
  engine defect, D: data/content gap, E: human decision) → seeds parallel file-disjoint waves.
  Never fix-as-found.
- **Diagnose→execute split**: a read-only diagnosis agent produces a one-shot spec; the executor
  verifies each claim as it goes. Agents told to verify evidence first will correctly REFUSE wrong
  fixes (three occasions: alloy grade, fuse ampacity, mass-cap "bug" that was a regex).
- **Every fix = source rule + proveCatch both directions.** No exceptions. This is the ratchet.
- **Cross-archetype byte-identity per change** on saved run dirs of the OTHER classes — catches
  cross-class regressions in minutes; deliberate cross-effects get enumerated, never silent.
- **Offline replay verification** against a stable run dir, but budget ~2 fresh runs per wave —
  fresh runs surface what replays can't (ordering, generator dice, live-DB drift).
- **Parts research**: calibration harness against the REAL exported matcher on a scratch DB before
  committing rows (`FORGE_TRUTH_DB_PATH_OVERRIDE`); expect diminishing returns after round ~3 —
  the tail is engine rules (candidacy, retry exclusivity, persistence), not data.
- **Human decisions are inputs**: the decisions register (per-brief .decisions.json) renders
  who/when/why inline; an undecided divergence still fails. Surface decision items early —
  Tristan's market facts twice resolved what agents mis-assumed (5MWh/20ft density; $80/kWh
  procurement scope: BESS-only, no MV).
- **Shared-branch hygiene**: explicit-pathspec commits only (`git commit --only <paths>`); agents
  keep scratchpad .patch backups; never accept a nondeterminism claim from a shared tree without
  re-testing quiesced.
- **Cost regime**: Sonnet executes with detailed briefs; the orchestrator (main session) verifies
  selftests, commits, sequences, and makes judgment calls.

## New-archetype pre-flight (run BEFORE the first chain run)

`python3 scripts/archetype-preflight.py <class_slug> <brief_path>` audits:
1. Vocabulary: the brief/class's tag prefixes + equipment nouns vs every shared matcher lexicon.
2. Constants: numeric literals in the class plan / closures / emitter that should be contract reads.
3. BoP roles: the class's expected equipment families vs `_BOP_ROLES` + TYPE_RULES + ga_massing.
4. Conditional render paths: exporter branches only this class shape exercises (soft-miss strings,
   verdict families) — the bare-literal walk on a synthetic state.
5. Procurement model: is there a market-cited block price / anchor scope for the class's cost
   closures? A decisions file?
6. Dormant defaults: schedule-wide placeholder values the class's topology would trust.
Every finding maps to one of the 9 families above with its known fix pattern.

## Campaign phase order (fastest observed path)
1. Pre-flight fixes (above) → 2. baseline run → 3. classified triage → 4. parallel waves
   (scorer honesty / drawings / emitter-physics / content-lineage) → 5. market recalibration +
   human decisions → 6. denominator honesty + labels → 7. tails (parts rounds, calc capture)
   → 8. convergence runs → 9. reproduction pair → 10. certified workbook.
Codema took ~10 laps learning these; BESS took ~8 applying half of them; the next archetype
should take ~4 with the pre-flight.
