# Archetype Campaign Playbook — how to take any archetype to ≥9/10 fast

> **ENFORCED BY `scripts/archetype-preflight.py` via `scripts/run-validation.sh` — this
> document is the rationale, the code is the rule.** The runner derives the class slug,
> prints the pre-flight report into every validation run log, and PAUSES a never-run
> class on findings (`--force` overrides; established classes never pause).
> `scripts/verify-engine-guards.sh` runs the auditor's `--selftest` so it cannot rot.

> Distilled from the Codema water-treatment campaign (~80 commits, v50→v79) and the BESS campaign
> (~30 commits, v1→v8), 2026-07-02 → 2026-07-05. Every lesson here was paid for. Read this BEFORE
> starting a new archetype; run the pre-flight (`scripts/archetype-preflight.py`) before the first
> chain run.

## The 10 defect families (every campaign defect fell into one of these)

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
10. **Unit-family comparison without normalization** — the #1 recurring cross-archetype defect
    (item-12 in CLAUDE.md's mistakes-to-avoid list): a value in unit A (kg, day, kWh, W…) reaches
    a comparison or division against a band/target in unit B of the SAME physical family (tonne,
    year, MWh, kW…) with no canonical conversion on the path. Hit BESS (cell-Ah) and CO2 TWICE in
    one session (gate-32 kg-vs-tonne false-block on the cost-sanity gate; a caco3 closure
    t/day-vs-kg/day mismatch). **Rule: a value in unit A compared to a band/target in unit B needs
    a `targetPerformanceValueAs`-style canonical-factor conversion somewhere on the path — never
    compare raw magnitudes across a unit-family boundary.** GUARDED as a reusable DETECTOR (not a
    refactor — it finds the structural pattern, it never edits the files it scans): SURFACE 7 /
    family 10 in `scripts/archetype-preflight.py` (`scan_unit_family_comparisons`) and its
    TypeScript port `UNIVERSAL.unit_family_comparison_normalized` in
    `scripts/regression-harness.tsx` (`scanUnitFamilyComparisons`) — kept in sync by proveCatch
    fixtures on both sides, not a shared import (the two tools run in different runtimes). Fires
    when an arithmetic/comparison operator sits directly between two identifiers that share a
    physical-quantity stem but carry conflicting unit suffixes (mass_kg vs mass_t; time_day vs
    time_yr; kwh/mwh/gwh; w/kw/mw) with no conversion literal/call nearby.

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
7. Unit-family comparison: a codebase-wide (class-agnostic) static scan for a value in unit A
   compared/divided against a band or target in unit B of the same physical family with no
   canonical conversion on the path — the gate-32 kg-vs-tonne + caco3 t/day-vs-kg/day shape.
Every finding maps to one of the 10 families above with its known fix pattern.

**Severity weighting (2026-07-05):** a flat finding count overstates difficulty — CO2 got 21/33
tabs ≥9 on its first run despite 61 raw findings. Every finding is additionally tagged BLOCKER
(hits a hard gate / a contract HARD_REQUIRED_SLOT / a closure — the run dies or a tab reads 0) or
QUALITY (vocabulary/coverage polish that manifests as a sub-9 score, not a failure). The summary
reads e.g. "CO2: 57 findings — 15 BLOCKER, 42 QUALITY-polish" so a campaign fixes blockers first.
Family 2 (constants) splits on WHETHER the shadowing literal reads the contract first (`?? literal`
/ `q(contract, name, literal)` = a defensive default, QUALITY) or is a bare closure-hardcode with
no read at all (the true "two-truths" shape, BLOCKER). Family 6 (BoP roles) splits on whether the
part gets NO placement regex at all (a visible 3D scene drop, BLOCKER) vs merely falling through
TYPE_RULES to 'other' (a narrower drawing-coverage expectation, QUALITY). Families 7 and 10 are
always BLOCKER (a wrong verdict or an un-normalised unit comparison corrupts the scorecard itself);
families 1, 5, 8 are always QUALITY (vocabulary gaps, dormant-default review notes, and a missing
market anchor — the last only feeds gate 32/36, both SHADOW by default). See
`scripts/archetype-preflight.py::_finding_weight`.

## Campaign phase order (fastest observed path)
1. Pre-flight fixes (above) → 2. baseline run → 3. classified triage → 4. parallel waves
   (scorer honesty / drawings / emitter-physics / content-lineage) → 5. market recalibration +
   human decisions → 6. denominator honesty + labels → 7. tails (parts rounds, calc capture)
   → 8. convergence runs → 9. reproduction pair → 10. certified workbook.
Codema took ~10 laps learning these; BESS took ~8 applying half of them; the next archetype
should take ~4 with the pre-flight.

## Cross-archetype meta-lessons (learned live 2026-07-05)

1. **Unit-family comparison is the #1 recurring defect, and it is now guarded.** Hit BESS
   (cell-Ah) and CO2 TWICE in one session (gate-32 kg-vs-tonne false-block; a caco3 closure
   t/day-vs-kg/day mismatch). Family 10 + `scripts/archetype-preflight.py` SURFACE 7
   (`scan_unit_family_comparisons`) + `scripts/regression-harness.tsx`
   (`UNIVERSAL.unit_family_comparison_normalized`) now catch the STRUCTURAL shape
   class-agnostically, in both the pre-flight audit and the build-blocking harness — a future
   archetype should never re-pay this lesson from scratch.
2. **A new archetype fuzzes the gates.** Expect 1-2 UNIVERSAL gate bugs per new class (a gate
   written against the first few classes' shapes trips on an assumption the new class breaks) —
   these are gifts, not setbacks: fixing them tightens the gate for every class, not just the one
   that found it. Both CO2 and BESS surfaced universal gate bugs, not class-specific ones.
3. **A flat pre-flight finding count overstates difficulty — weight by stage.** CO2's first run
   scored 21/33 tabs ≥9 despite 61 raw pre-flight findings; most were vocabulary/coverage QUALITY
   polish, not blockers. The pre-flight now tags every finding BLOCKER or QUALITY (see §Severity
   weighting above) so a campaign fixes the handful of true blockers first instead of triaging a
   flat list top-to-bottom.
4. **`--force-measure-then-triage` beats fix-blind when a class-plan already exists.** Running the
   full measurement (baseline chain + audits) before triaging, on a class that already has a
   `class-plans/<slug>.ts` file, surfaces the REAL defect set faster than reasoning from the
   pre-flight report alone — the pre-flight narrows WHERE to look, the measured run confirms WHAT
   is actually broken.
5. **Partition parallel waves by engine LAYER, not by tab.** The three-sibling-agent split that
   worked was (a) contract/emitter (`engineering-contract.ts`, the class emitters,
   `requirements_bom.py`), (b) geometry/drawings (`scripts/blender-universal/*.py`), and (c)
   exporter/tabs (`scripts/build-excel-export.py`, `scripts/lib/dossier_audit.py`) — each a
   file-disjoint region with its own defect families. Splitting by RENDERED TAB instead (e.g. "one
   agent per worksheet") repeatedly produced merge conflicts because every tab reads from the same
   contract/emitter layer; splitting by layer keeps waves file-disjoint and cheaply parallel.
