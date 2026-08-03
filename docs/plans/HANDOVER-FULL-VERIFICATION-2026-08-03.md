# Handover — Full independent verification of the FE Front FPK deliverable

**Written 2026-08-03 by Claude Code for Grok Build.**
**Twin:** `out/formula-e-front-mgu-20260729-1432/` · repo `/Users/tristanfischer/Developer/CentaurOS-oxccu-efuel` · branch `oxccu-efuel` @ `80cae3479`
**Reviewed after by:** Claude Code (parent session).

---

## 1. What this job is

This pack is about to be sent to an external engineer who has seen none of the
work. **Your job is to find what is wrong with it before he does.**

You are not being asked to improve the design, re-run the chain, or close any
hold. You are being asked to **verify** — independently, deterministically, and
adversarially — that every artefact in the deliverable says something true.

Two rules govern everything below.

**RULE 1 — DETERMINISTIC, NOT JUDGED.** Every check you report must be a command
that produced an output. "I read the tab and it looks consistent" is not a
check. If a property matters and no code tests it, **write the code**, following
the pattern in `scripts/lib/physics_plausibility.py`: pure arithmetic, a
`--selftest` that proves the catch in both directions, and registration in
`.husky/pre-commit` + `scripts/verify-engine-guards.sh`. The LLM is the thing
being checked, not the checker.

**RULE 2 — A CLEAN RESULT HAS THREE POSSIBLE CAUSES** and only one is good: the
defect was fixed, the detector was weakened, or the offender was excluded. When
something passes, establish which. The step that catches a weakened detector is
feeding it its original adversarial input and confirming it still fires; nothing
else catches it.

### Hard stops — non-negotiable

- `ship_ok` is **false** and stays false. Do not mint `ship_ok`, `CLEARED` or
  `homologated` from a software screen.
- **Never invent** chassis XYZ, supplier Gerbers, dyno CSV, HIL results or
  measured ESL. A fabricated coordinate is worse than an empty field because it
  ships.
- Do not close a Bar B hold. All ten need measured evidence.
- Do not weaken, skip, or exclude a failing check to make a number go green.
  A found defect is a **success** of this job, not a failure.
- Leave findings uncommitted unless a fix is obvious, universal and guarded —
  see §8.

---

## 2. The trap that makes this job necessary

**Every artefact recording a conclusion about this design is a snapshot with no
mechanism to invalidate itself.** This has now bitten five subsystems in this
campaign — drawings, motor-stack screens, escalation stubs, the parts manifest,
and the Bar B readiness register, which was three days stale and **wrong in six
of ten rows** while being the document that becomes the customer ask.

So: **re-run the producer; never read its artefact as current state.** Before
quoting any number from a `.json` in the twin, either re-run the script that
wrote it or diff it against the live source. Use `.venv/bin/python` — `ijson`
and `openpyxl` are not in system python.

Related trap, four instances: **two stores, and the consumer reads the empty
one.** When something reads as absent, check the producer's own artefact before
believing it. Twelve motor parts were once reported "genuinely absent" when 194
meshes existed — two registries had drifted.

---

## 3. Scope — six areas, all of them

### 3.1 The Excel workbook

Latest: `20260803-1357-V1.280-DRAFT-formula-e-front-mgu-engineering-workbook.xlsx`
(31 tabs). Builder: `scripts/build-excel-export.py`.

Check, per tab:

- **It opens without a repair prompt.** Excel corruption has already happened
  once in this campaign. Verify with `openpyxl` load AND by checking the zip
  members are well-formed.
- **Every number traces.** Any figure presented as an achievement must carry a
  `basis` / `provenance` and must match the twin artefact it claims to come
  from. A figure with `source='brief'` is a **REQUIREMENT, not an achievement** —
  if one is presented as delivered performance, that is a finding.
- **No tab contradicts another.** The same quantity appearing on two tabs with
  two values is the highest-value class of defect here. Enumerate the
  quantities that appear more than once and compare them mechanically.
- **The honesty tabs are honest.** `Holds & exclusions`, `⚠ Checks`,
  `Decision Register`, `Questions for the customer`, `Quality & Audit`. An empty
  or thin holds tab next to a `ship_ok: false` state is a contradiction.
- **`Suppliers`** — three blocks (PINNED / OPEN BY DESIGN / SHORTLIST). Confirm
  nothing in OPEN BY DESIGN has silently acquired a fabricated part number, and
  that `is_unresolved_part_number()` in `scripts/lib/homologation_honesty.py`
  and the builder still agree on what "unresolved" means.
- **`PCB`** — must reflect `pcb-stage.json` and `pcb-stage-result.json`. Both
  filenames are in the `PCB_SIDECAR_FILENAMES` registry precisely because a
  consumer once read only one of two. Confirm the registry is still honoured.

Also verify the **design-pack zip** (`20260803-1357-V1.280-...-design-pack.zip`):
every file it claims to contain is present, non-zero, and the same version as
the workbook. A pack referencing a render that isn't in it is a shipping defect.

### 3.2 The Blender renders

`out/.../renders/` — hero, product exteriors, ghost-shell set, cutaway,
exploded.

- **Every BoM line appears somewhere it should.** The claim on record is 100%
  coverage across renders / GA / SLD, up from 47.8%. Re-derive it; do not read
  the last coverage artefact.
- **Nothing is rendered that is not in the BoM** — the reverse direction. A mesh
  with no ledger line is as much a defect as a ledger line with no mesh.
- **Open the images.** Grepping is not verification. A render can be
  structurally correct and visually wrong — stray beams, a floating part, a
  shell at a stale pose. The stale-shell defect was universal across six sealed
  instruments and every dossier scored before it was found had an unreliable
  containment verdict.
- Check exit codes, not just output presence: there are **two render engines**
  (bespoke `<class>-9shot.py` and the universal fallback) and a silent fallback
  changes what you are looking at.

### 3.3 The GA and single-line drawings

`renders/ga-A1.pdf`, `general-arrangement.svg`, `single-line-A1.pdf`,
`single-line-diagram.svg`.

- Re-run the drawing gates: `.venv/bin/python scripts/lib/drawing_gates.py --twin <dir>`
  (or the invocation `verify-engine-guards.sh` uses). The claim is **23/23**.
- **A gate that abstains renders as a green tick.** Check whether any "abstain"
  reason is actually a Python exception being swallowed. This has happened.
- GA dimensions must come from **measured** geometry, not a synthesized tower.
  `manifest_bbox_mm` in `scripts/blender-universal/ga_projection_contract.py`
  prefers a measured w/d/h triple over nominal dia/len — confirm it is getting
  one.
- SLD: the head-noun rule in `draw_single_line.py` decides what is electrical.
  Confirm no housing/cover/shaft/bearing has leaked onto the electrical diagram
  and no genuine electrical part has been excluded by it.

### 3.4 The PCB work

`out/.../pcb/`, `pcb-boards/`, `pcb-project/`, `pcb-fab.zip`, `pcb-stage.json`.
Stack: atopile → KiCad → Freerouting.

- Claim on record: **2 routed boards, 0 DRC violations, fitness 7.6/10,
  `NOT_FABRICATION_READY`**. Re-derive each from the project files, not the
  summary json.
- **0 DRC violations is exactly the shape of a check that cannot go red.**
  Establish that DRC actually ran against the routed boards, with real rules,
  and would report a violation if one existed. Introduce one deliberately in a
  scratch copy if that is what it takes.
- `NOT_FABRICATION_READY` must survive. If anything in the workbook or pack
  implies these boards can be ordered, that is a finding.
- Confirm the power tree, positions.csv and channel list are mutually
  consistent and match the BoM electronics.

### 3.5 The physics

Re-derive independently; do not accept the artefact.

| Claim | Where |
|---|---|
| Torque required **125.2193 N·m** from `T = P_elec/(η_combined·ω)`, η=0.9777 | contract |
| Delivered **81.558 N·m** baseline; **1.069×** under DEC-009 (24,000 rpm / 130 mm) | FE campaign |
| Iron loss **6035 W**, `basis: screening_estimate`, range **3.9–8.5 kW** | `fe_iron_loss_writeback.py` |
| Magnet **83.8 °C** under DEC-008 intermittent duty; 99.4 °C under DEC-009 vs 150 °C limit | cooling screen |
| Two thermal screens agree to **0.1 K** | LPTN + chain |
| Falsifiability **0 of 169** unfalsifiable | `check_falsifiability_audit.py` |

⚠ **The torque denominator trap.** `mgu_shaft_torque_nm = 119.7` is torque *at*
the 244.49 kW shaft power. The DUTY requirement is **125.2193 N·m**. Dividing by
119.7 flatters the ratio to 0.681×. Every solver artefact uses 125.2193 —
confirm the workbook and pack do too.

⚠ **Iron loss is a `screening_estimate`, not a bound.** The error is two-sided
(≈0.65×–1.4×). If any document calls it an upper bound, that is a finding — it
was wrong once already and was corrected in code and both customer-facing docs.

⚠ **DEC-008 and DEC-009 are reversible decisions, not facts.** Confirm they are
presented that way, and that DEC-009 is visibly dependent on DEC-008.

### 3.6 The guards themselves

- `bash scripts/verify-engine-guards.sh` — ~5 minutes, and the **only** thing
  that sees cross-module interactions. "My selftest passes" is not a licence to
  push; the last defect of 2026-08-03 appeared only where two individually
  correct changes met, in a third module's fixture.
- `node scripts/check-typecheck-baseline.mjs`
- `.venv/bin/python scripts/lib/check_bar_b_register_freshness.py --twin <dir>`
- `.venv/bin/python scripts/lib/check_falsifiability_audit.py --twin <dir>`
- `.venv/bin/python scripts/lib/physics_plausibility.py --twin <dir>`
- `.venv/bin/python scripts/lib/gate-registry.ts --selftest` equivalent — **audit
  finding on record: only ~9 of 29 gates block by default.** Confirm the ones
  guarding this deliverable are among the enforcing ones. A gate that exists but
  does not block is decoration.

**Known-open item, not a defect to re-report but worth confirming:**
auto-generated escalation stubs in `tasks/harness-stubs/` have no mechanism to
retract when their gate goes green. Four stale ones were deleted by hand. If any
have reappeared for a currently-passing gate, that is the sixth instance of the
snapshot family and a freshness check for them is small and well-defined.

---

## 4. The scorecard — read this before you interpret it

`quality-scorecard.json`: **floor 4, mean 9.1, allPass false.** The floor is
`release_readiness = 4`, and that is **correct and deliberate** — the design is
not ready for release and the scorecard says so. Twelve of fourteen sections are
at 10.

Do not "fix" release_readiness. If you find a way to raise it that does not
involve measured Bar B evidence, you have found a defect in the scorecard, not
an improvement to the design.

The related principle, learned expensively: *if you can't score yourself
correctly you can't fix yourself.* A pass is good; **unverified and fail are
both bad**, and unverified must not render as a pass.

---

## 5. Method

For each finding:

1. **Name the claim** and where it is asserted.
2. **Re-derive it independently** — a different route to the same number, not a
   re-read of the same file.
3. **State the command and its output.** No command, no finding.
4. **Classify:** WRONG (contradicts reality) · UNSUPPORTED (may be true, nothing
   proves it) · STALE (was true, no longer) · UNFALSIFIABLE (the check cannot
   fail) · COSMETIC.
5. **Say what a reader would conclude** from the wrong version. That is the
   severity.

Run a **negative control** on anything you touch: legitimate cases must stay
silent. A detector that fires on everything is as useless as one that fires on
nothing.

---

## 6. Definition of done

- [ ] All six areas in §3 covered, each with commands and outputs
- [ ] A findings list, ordered by what an external reader would conclude, each
      classified per §5
- [ ] Every claim in the §3.5 table independently re-derived, with your number
      next to the claimed number and the gap stated
- [ ] `bash scripts/verify-engine-guards.sh` passes
- [ ] `node scripts/check-typecheck-baseline.mjs` passes
- [ ] Any new check has a `--selftest` with proveCatch **in both directions** and
      is registered in pre-commit + verify-engine-guards
- [ ] Every detector you touched, fed its original adversarial input, still fires
- [ ] `ship_ok` still **false**; no hold closed; nothing invented
- [ ] Explicit statement of **what you did not check and why** — silent partial
      coverage reads as full coverage and is itself the defect this campaign has
      paid for most often

---

## 7. What "good" looks like

A clean bill of health is a **possible** outcome and, if earned, is worth having.
But a report that finds nothing across six areas of a deliverable this size is
more likely to mean the checks were shallow than that the work is perfect. The
previous review of this pack found six defects in the discipline layer that was
supposed to be checking everything else.

If you find nothing in an area, say what you tried that would have found
something, so the parent session can judge whether the absence is real.

---

## 8. Committing

Report first, commit second. Fix in place only when the fix is (a) at the SOURCE
rule, not the data point, (b) universal rather than a per-product patch, and
(c) accompanied by a guard that proves the catch. Anything else, write it up and
leave it.

Commit style: `fix:` / `test:` / `docs:`, trunk-based on `oxccu-efuel`, no
feature branches. Note that other sessions push to this branch concurrently — on
rejection, `git fetch` then check overlap with
`git diff --name-only HEAD...origin/oxccu-efuel`; rebase, never force. Twin
files under `out/` are tracked-but-gitignored and must be stashed by path before
a rebase or it will refuse.
