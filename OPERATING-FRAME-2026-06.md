# OPERATING FRAME — getting a genuine ≥8-on-every-tab dossier (2026-06)

> Audience: the agent (me) and Tristan. Purpose: fix the WORKING RELATIONSHIP and the
> PROCESS, not to write code. The headline deliverable is **§2 — THE SELF-PROMPT**: the
> standing directive I give myself at the start of every dossier-quality session.
>
> Hard rules this document obeys (Tristan's, non-negotiable):
> - Every fix UNIVERSAL (keyed on signals — noun/unit/provenance — never a per-archetype table) and PERMANENT (carries a regression guard / `--selftest`).
> - Fix the SOURCE rule, never the symptom. A deterministic engine never "slips" — every wrong output is a wrong RULE.
> - A check must PROVE it catches its adversarial input AND must not false-positive on correct behaviour.
> - Honest scoring is the precondition for self-correction. UNVERIFIED is as bad as FAIL. An 8 must genuinely impress a chartered engineer.
> - Tristan does NOT run terminal commands — the agent does everything.

---

## 1. DIAGNOSIS (honest, with confidence levels)

### 1.1 Is Tristan mis-prompting? No. (confidence: HIGH)

Tristan's worry — "maybe the problem is me, maybe I'm not prompting you correctly" — is the
wrong diagnosis, and I should say so plainly rather than reassure him. The evidence:

- His prompts are **specific, correct, and routed to source** (the 2026-06-27 punch-list reads
  like a chartered engineer's red-pen markup: "B56 incident energy = 3.1, no visible SOURCE";
  "GA-top ≠ Render-interior-top, must be ONE layout"; "feedstock number on a water plant — wrong").
  These are not vague vibes a better prompt would have pre-empted. They are *defects only an
  expert eye catches by looking at the rendered artefact*.
- The "give the model a good prompt and it goes off and does great work" model **does not hold for
  a deterministic multi-stage engine whose output is a 37-sheet engineering deliverable.** That
  model works for one-shot generative tasks where the model both produces AND can see the whole
  output in one context. Here the output is assembled by ~50 stages and rendered into Excel/Blender
  artefacts that the producing model never re-examines. No prompt makes an unseen defect visible.

So: **the prompt is not the bottleneck. The bottleneck is that the engine cannot yet SEE its own
output the way an expert engineer sees it.** Tristan has been the eyes. That is the actual finding.

### 1.2 Why has it been reactive? (confidence: HIGH)

The loop has been: *defect ships → Tristan spots it → Tristan tells me → I fix at source → guard.*
The fix half of that loop is already correct and disciplined (the punch-list shows ~10 source-level
fixes, each universal, each guarded — that part is working). **The reactive half is the failure:
the engine has no adversarial reviewer of its own, so detection depends on Tristan.** Three concrete
structural reasons:

1. **The self-audit scores DATA tabs, not the whole artefact.** Until this session it scored ~16 of
   37 sheets; the drawing/render/meta sheets (P&ID, BFD, GA, isometrics, renders, Checks, Audit) had
   no score at all. An unscored sheet cannot fail. *A fake-8 leaks wherever the scorer doesn't look.*
   (X1 closed this in code this session — banner + gate now span the workbook. Good. But it proves
   the pattern: the engine only catches what it explicitly looks at.)

2. **Some "scores" were HARD-CODED, not COMPUTED.** Overview read 10/10 PASS over visibly-failing
   rows; Connection-trace read "OK" as a literal. *A green light wired to a constant is worse than no
   light — it actively hides the fault from the loop.* (X2/CT1 closed several this session.)

3. **The biggest gaps are not detectable by ANY scorer because the thing being scored does not exist
   yet.** P&ID and BFD render EMPTY for water_treatment because the generators emit no part tags →
   0 coverage. No prompt and no check conjures a drawing generator that was never built. *These are
   build-outs, not detections.*

### 1.3 Pressure-testing the agent's own diagnosis

The agent's stated diagnosis — *"it's not a prompting failure; the engine can't SEE what an expert
sees, so it can't flag its own defects; the cure is to convert every defect into a permanent
self-check; some gaps are real build-outs"* — is **right in its core and I will not soften it.**
But it is **incomplete in two ways, and I push back on the framing in a third:**

- **Incomplete (a): "encode every defect as a check" is necessary but not sufficient.** Encoding a
  check for each *specific* defect Tristan finds is still reactive — it just moves the reactivity one
  level up (now I wait for him to find the *class*, then I guard it). The real shift is to **generate
  the adversarial inputs MYSELF, before he looks** — to run as the skeptic who is *trying to reject
  the dossier*, enumerate the failure modes a chartered engineer would probe, and check each *whether
  or not anyone has flagged it yet*. Detection must become generative, not just responsive.

- **Incomplete (b): the diagnosis under-weights HONEST SCORING as the gating precondition.** A
  self-check is worthless if the scorer it feeds is generous. The hard-coded 10/10-over-failures bug
  is the proof: the engine *had* the data to know it was failing and still reported PASS. So the
  order of operations matters — **honest, computed-from-real-cell-state scoring first, then more
  checks.** A new check bolted onto a lying scorer just produces a confident lie.

- **Push-back on framing: "the engine can't SEE" is true but lets the producing stages off the hook.**
  Many of these defects are not perception gaps — they are **provenance gaps**. The engine emits a
  number (incident energy 3.1, arc-flash IB 144, a cost-waterfall raw-materials figure) with no
  recorded WHERE-FROM. The reason it can't check the number is that *the producing stage never wrote
  down where the number came from*. The cure for a whole bucket of these is not a smarter reviewer —
  it is a **provenance spine**: every number carries its source (up) and consumer (down) as data, so
  "is this number justified?" becomes a deterministic lookup, and an orphan number is a deterministic
  FAIL. That is a build-out, and it is the single highest-leverage one. (See §4.)

**Net diagnosis (HIGH confidence):** Not a prompting problem. A *self-perception + provenance +
honest-scoring* problem. The fix-loop discipline is already good; what's missing is the
**adversarial reviewer who runs before Tristan does**, the **provenance data** that makes most number
defects deterministically checkable, and a **handful of real drawing/economics build-outs** no check
can substitute for.

---

## 2. THE SELF-PROMPT  ★ (the headline deliverable)

> Paste this into `CLAUDE.md` (a "Dossier-Quality Session" section) or a `/dossier-8` skill. It is the
> standing directive I give MYSELF at the start of every dossier-quality session. It flips the loop
> from "fix what Tristan flags" to "BE the chartered engineer trying to REJECT this dossier."

---

**STANDING DIRECTIVE — DOSSIER QUALITY SESSION**

I am not the author of this dossier defending it. **I am the adversarial chartered engineer hired to
REJECT it.** My job this session is to find every reason a competent engineer would refuse to rely on
this document, *before Tristan finds them for me*. Tristan finding a defect I could have found myself
is a process failure on my part, not a prompt failure on his.

**The mindset:** assume the dossier is wrong until I have personally tried to break every tab and
failed. A clean run is not evidence of quality — it is the starting condition for the attack. "It
shipped exit 0" means *my checks didn't catch anything*, which is a statement about my checks, not
about the dossier.

**The loop I run, every session, until done:**

1. **OPEN THE ARTEFACT — never trust stdout.** Read the actual rendered output: pull the Excel sheet
   contents, open the Blender renders/drawings as images, extract the numbers as they appear to a
   reader. The chain log saying "PASS" is the thing under suspicion, not the evidence. (This is the
   single most-broken rule historically: trusting chain stdout.)

2. **ADVERSARIAL REVIEW — go tab by tab as the skeptic.** For EACH tab, apply the genuine-≥8 rubric
   in §3 and ask the expert's questions: *Where did this number come from? Where does it go? Would a
   chartered engineer stamp this? What's the one thing that, if wrong, makes the whole tab untrustworthy
   — and is it right?* Write down every smell, not just confirmed faults. A "looks plausible but I
   can't verify it" is a FAIL, not a pass (UNVERIFIED = FAIL).

3. **ENCODE EACH FINDING AS A PERMANENT CHECK — before fixing it.** For every defect AND every class
   of defect, write the deterministic check that *catches its adversarial input* first. The check
   must: (a) be UNIVERSAL (keyed on a signal — noun/unit/provenance/structure — never on this
   archetype's name); (b) PROVE it catches (a `proveCatch`/`--selftest` that fires on the bad input);
   (c) NOT false-positive on correct behaviour (a counter-case that must pass). If I can't write a
   check that proves the catch, I don't yet understand the defect well enough to fix it.

4. **FIX AT SOURCE, WITH A GUARD.** Trace the defect to the *rule* that produced it (the engine is
   deterministic — there is no per-instance data bug, only a wrong rule). Fix the function, not this
   run's output. Re-spec'ing one part / overriding one price is a BAND-AID and is forbidden as a
   design target. The guard from step 3 is what makes the problem count fall monotonically.

5. **RE-RUN AND RE-ATTACK.** Re-run the engine, re-open the artefact, and run the adversarial review
   AGAIN — including a fresh skeptic pass that ignores the punch-list and looks with new eyes. Fixing
   one defect often unmasks another (the £2.77M phantom panel hid behind a dedup key; the F1 banner
   re-stamp hid behind stage ordering). I am not done when the punch-list is empty. I am done when:

   - the engine's OWN honest, computed-from-real-cell-state scorecard reads **≥8 on EVERY one of the
     37 sheets** (the floor, not the average; UNVERIFIED counts as FAIL; the ship-gate exits non-zero
     otherwise), AND
   - a **fresh skeptic pass finds nothing worth flagging** — I have personally tried to reject each
     tab and failed.

**Honesty contract (the precondition):** I score myself the way Tristan would, not the way that lets
me stop. A generous score hides a fault from this loop and is therefore a form of self-sabotage. If a
tab is an 8, a chartered engineer must go "I can rely on this" — not "the box is ticked." If I cannot
verify a number, the tab is not an 8. A false-UNVERIFIED is as dishonest as a false-PASS. I never
match a target to a requirement-echo; I check the DELIVERED quantity so a genuine miss stays a miss.

**What I escalate to Tristan (not silently guess):** real engineering build-outs that no check
conjures (an empty drawing generator, a missing economics model for a new class), and genuine
judgement calls (design-to-budget, acceptable safety margins). I bring these as *named decisions with
options*, not as defects for him to discover.

**The behavioural inversion, in one line:** *Stop waiting to be told what's broken. Be the engineer
who tries hardest to prove it's broken — and only ship when I've failed to.*

---

## 3. WHAT A GENUINE ≥8 LOOKS LIKE, PER TAB-TYPE

This is the rubric the self-audit must ENCODE (deterministically where possible; LLM-judge as an
advisory complement, never as the gating floor). For each tab-type: the definition of "wow, I can
rely on this", then **what an expert CHECKS that the engine currently doesn't.**

### 3.1 Bill of Materials (Ledger)
**≥8 means:** every line has a tag, a real (catalogue-resolvable) part or an honestly-marked bespoke
item, a quantity that reconciles with the design, a unit price within band of a live source, and a
**visible derivation** (Key inputs / Factors populated — *why this part, this size, this price*).
Child/apportioned rows are consistent and clearly marked. The grand total reconciles to the cost
waterfall.
**Expert checks the engine still under-does:** (a) WHERE-EACH-LINE-GOES — the destination/consumer of
each item (X4/B3, open); (b) that the sum of children = parent and no dedup-collapse merged distinct
lines (the £2.77M phantom — guarded now, keep the guard); (c) bespoke-vs-commodity classification is
honest (a reactor priced as a commodity is a fail).

### 3.2 Calculations
**≥8 means:** every calculated value shows its **inputs, the formula/standard applied, and where the
result FLOWS TO** — an unbroken chain from brief → calc → consumer. No orphan numbers.
**Expert checks the engine still under-does (the big one):** **provenance, both directions.** B56
incident energy = 3.1 and arc-flash IB = 144 appear with no visible source (CA3, open). The expert's
reflex on EVERY number is "where did that come from and is it used downstream or dead?" — the engine
must answer that as DATA, not prose. Encode: *every calc cell must carry a source ref and ≥1 consumer
ref, or it FAILS as an orphan.*

### 3.3 Drawings / Renders (P&ID, BFD, GA, single-line, isometrics, interior/exterior renders, HVAC)
**≥8 means:** the drawing is **non-empty, legible, class-appropriate, and CONSISTENT with every other
view and with the BoM.** A P&ID shows tagged equipment and instrument loops; isometrics 201/202/203 are
*distinct* spools; the GA-top and the interior-render-top show the **SAME layout** (one layout source
feeds both); object sizes are real (no scene littered with default-sized tiny boxes).
**Expert checks the engine still under-does:** (a) EMPTY-drawing detection is a build-out, not a check
— the P&ID/BFD generators don't emit part tags for water_treatment (open, #101); (b) cross-view
consistency (GA2 — two "top" views must be the same layout; currently they differ — CRITICAL); (c)
per-line distinctness (isometrics near-identical); (d) object-sizing sanity (a cabinet's internals
belong IN the cabinet). These are partly checkable (coverage, aspect-ratio, layout-hash equality) and
partly build-outs (the generators themselves).

### 3.4 Financial Model
**≥8 means:** a **class-appropriate** capex/opex/payback frame. For an infrastructure plant (water/
fertigation) that means capex from the BoM, opex (energy/chemicals/labour/maintenance), and a
payback/whole-life cost — NOT a feedstock-driven P&L. No phantom revenue line, no feedstock number on
a plant that has no feedstock.
**Expert checks the engine still under-does:** (a) revenue/value basis appropriate to the class (F1,
open — currently no revenue model; for infrastructure the "return" is avoided-cost/payback, not sales);
(b) cost-waterfall raw-materials figure DERIVED from the BoM, not hard-coded (CW1, open); (c) the
banner score must be re-stamped AFTER economics are known (F1 banner re-stamp — known gap: banner
reads 10 while the gate FAILs). *An honest financial tab on the wrong economic model is still a fail.*

### 3.5 Risk & Regulatory
**≥8 means:** every identified risk is **either closed or carries an explicit, owned mitigation** —
not a list of HIGHs saying "resolve before procurement." If the physics-critic flags a part will
fail, the engine FIXES it (re-specs in the design) and re-runs to confirm closure, then shows the
closure.
**Expert checks the engine still under-does:** **closing the loop** (X6/R1, open). A risk register
that lists known failures and ships them is the opposite of reliable. Encode: *a HIGH physics-critic
finding that names a part + a concrete failure mode must drive a correction and a re-run, or the tab
FAILs.* (Gate 33 machinery exists — wire its closure into the Risk tab's score.)

### 3.6 Self-Audit (and the meta-tabs: Scorecard, Checks, Connection-trace)
**≥8 means:** the audit is **HONEST and COMPUTED.** Every banner reads the real cell state. The
benchmark-net (generative-LLM top-down expectation vs the engine's bottom-up output) is SHOWN, with
whether they agree. The Checks tab's live-input column lines up with its rows. No green over red
anywhere in the workbook.
**Expert checks the engine still under-does:** (a) the audit must surface `state.benchmarkDivergence`
— the expectation-vs-engine comparison (AU2, open); (b) every tab's banner must read REAL state, not a
literal (the recurring fake-8 — mostly closed this session, keep auditing); (c) row alignment (CH2);
(d) the scorecard itself must be scored (no tab exempt). **This tab is the linchpin: if the self-audit
lies, every other tab's score is untrustworthy. Honest scoring here is the precondition for the whole
loop.**

---

## 4. THE PLAN — from here to genuine-≥8-everywhere

Prioritised by leverage. **(a) checks-to-encode** are cheap and compounding (each permanently catches
a whole class). **(b) build-outs** are real engineering work no prompt or check substitutes for. The
order interleaves them by leverage, not by type.

### STAGE 0 — Make the scorer honest and total (PRECONDITION, mostly done — finish it)
*Type (a). Highest leverage because every later judgement depends on it.*
- Finish X1/X2: EVERY one of the 37 sheets scored, EVERY banner computed from real cell state, the
  ship-gate spans the whole workbook, UNVERIFIED = FAIL. (Largely landed this session.)
- **Close the F1 banner re-stamp** (banner reads 10 while the gate FAILs — a residual fake-8). Guard:
  an invariant that asserts no banner score exceeds the gate verdict for the same tab.
- **DONE when:** `dossier_audit --selftest` proves a fabricated green-over-red and a fabricated
  banner-vs-gate mismatch both FAIL, and a correct workbook passes. No tab is exempt.

### STAGE 0.5 — SIGHT: the engine must audit the DELIVERED artefact, not the INTENDED one (FOUNDATIONAL)
*Tristan's crux, 2026-06-26: "the plan doesn't solve that it can't SEE what it's doing — how do you get
it to see?" Correct. Every check below is blind unless it reads what was actually delivered. This stage
is the sense organ the other stages plug into.*

**The reframe:** the chain today audits `state.json` — what the engine MEANT to build. Tristan audits
the rendered Excel + the rendered images — what it ACTUALLY delivered. That gap IS the blindness. Close
it with three senses, cheapest-first (lean on 1–2; use 3 only for the irreducible visual residue):

1. **Read the rendered STRUCTURE (deterministic, ~70% of what a human catches).** Re-ingest the actual
   Excel cells as displayed (positions + values, not state.json), the drawing parts-manifest geometry,
   and per-drawing coverage. This already caught "P&ID empty" (coverage 0). Same sense, extended:
   ⚠Checks cell misalignment (CH2); "walls outside the building" (bbox containment — every interior
   object inside the envelope); "littered with tiny boxes" (count manifest objects below a sane
   size-in-scene threshold); "GA-top ≠ render-top" (assert ONE shared layout source — GA2). None needs
   vision — it is geometry and structure the engine can MEASURE.
2. **Sanity envelopes + the benchmark net (deterministic).** "Would an expert blink at this magnitude?"
   — 124 MW for a 150 kW plant; feedstock on a water plant. Class + magnitude checks (gate 36 partial).
3. **A VISION-model critic — the actual eyes (the irreducible residue ONLY).** A multimodal model LOOKS
   at each render/drawing PNG against its expected description and judges "professional / blobby /
   exploded / littered." This is the real sight organ, BUT vision models are the WEAKEST link (flake,
   hallucinate, "impressive" is subjective). Rule: use it only where geometry can't decide; run it
   ADVERSARIALLY (prompt to REJECT); give it a `proveCatch` on a known-bad image (the littered render
   we already have); pair it with a deterministic structural check wherever one exists; advisory (never
   the sole gate) until it proves a stable catch.

**The architecture: RENDER-THEN-REINGEST.** The chain produces the dossier, then RE-OPENS it — reads
the Excel cells, measures the drawing geometry, shows the images to the vision critic — and audits
THAT, routing each defect to its source stage. This is Tristan's QA loop, automated and made part of
the engine. The bar is not a perfect art critic; it is: *the engine never ships what a 5-second human
glance would reject, because it took that glance itself, first.*
- **DONE when:** a deterministic artefact-reader audits the rendered workbook + drawings (not state) and
  feeds the scorecard; the manifest-litter / bbox-containment / shared-layout-hash checks exist with
  proveCatch; and the vision critic flags the known littered render adversarially without false-firing
  on a clean one.

### STAGE 1 — The provenance spine (HIGHEST-LEVERAGE BUILD-OUT)
*Type (b), with (a) checks riding on it. This is the single biggest move — it converts a whole bucket
of "the engine can't see it" defects into deterministic checks.*
- Every emitted NUMBER (calc cell, BoM line value, quantity, cost-waterfall figure, inputs/assumptions
  value) carries, as DATA: its **WHERE-FROM** (source: brief field / calc / tool output) and its
  **WHERE-TO** (≥1 consumer). Keyed on the number's role, universal across classes.
- Then the checks are cheap and ride for free: *orphan-number check* (no source OR no consumer = FAIL);
  *hard-coded-vs-derived check* (cost-waterfall raw-materials MUST trace to the BoM — CW1); *brief→
  inputs traceability* (IA2); *calc source presence* (CA3 — B56/IB144).
- **DONE when:** every number in Calculations, Quantities, Inputs, Cost-waterfall, and BoM resolves up
  and down; the selftest fabricates an orphan and a hard-coded-not-derived value and both FAIL.

### STAGE 2 — Close the risk loop (high leverage, mostly (a) wiring on existing (b))
*The physics-critic + autocorrect machinery already exists (gate 33). Wire its closure into the score.*
- A HIGH physics-critic finding that names a part + a concrete failure mode must drive a correction +
  re-run, and the Risk tab's score must reflect CLOSURE, not listing (X6/R1).
- **DONE when:** an adversarial brief that forces a known-failing part produces a re-spec + a closed
  risk row, and the selftest proves a listed-but-unclosed HIGH FAILs the Risk tab.

### STAGE 3 — Drawing-content build-outs (the empty generators)
*Type (b) — real work. No check conjures a generator that doesn't exist.*
- **P&ID + BFD generators emit tagged equipment + instrument loops for the water/process archetype**
  (currently EMPTY → 0 coverage, #101). Universal: keyed on the equipment list the engine already
  derived, not on "water_treatment".
- **ONE layout source feeds both GA-top and interior-render-top** (GA2, CRITICAL — they currently
  disagree). Then a deterministic check: *layout-hash(GA-top) == layout-hash(render-top) or FAIL.*
- Object-sizing sanity (no scene of default-sized tiny boxes); isometrics 201/202/203 distinct.
- **DONE when:** drawing_gates (gate 35) scores every drawing ≥8: non-empty, legible, the two top-views
  hash-equal, isometrics distinct; and the selftest proves an empty P&ID and a layout-mismatch FAIL.

### STAGE 4 — Class-appropriate economics build-out
*Type (b) — a real model, with (a) checks on top.*
- A **capex/opex/payback frame for infrastructure** (water/fertigation): capex from BoM, opex stack,
  whole-life/payback; NO feedstock for non-feed-driven classes (F2 done); NO phantom revenue (F1).
- Check on top: *cost-waterfall raw-materials == BoM total* (rides Stage 1); *economics-model-matches-
  class* (a feedstock number on a no-feedstock class FAILs — guard the F2 fix universally).
- **DONE when:** the financial tab presents the class-correct frame, the selftest proves a feedstock-
  on-water-plant and a hard-coded-cost-waterfall both FAIL, and the banner reflects the real economics.

### STAGE 5 — Universal tag + verification coverage (clean-up (a))
- Every row everywhere has a tag (LV1 Line&Velocity has none — X5); Panel-schedule, Process-schedules,
  Assembly-sequence get class-appropriate verification checks (PS1, etc.); Checks-tab row alignment
  (CH2); benchmark-net surfaced in the Audit tab (AU2).
- **DONE when:** no tab carries an un-tagged row or an un-verified "looks plausible"; the benchmark
  divergence is visible in the dossier.

### How to know the WHOLE thing is DONE (the exit condition)
The dossier is genuinely-≥8-everywhere when ALL of these hold simultaneously, with no manual eyeballing:
1. The engine's own honest, computed scorecard reads **≥8 on every one of the 37 sheets** and the
   ship-gate exits 0 (UNVERIFIED counts as FAIL, so this is a real bar).
2. Every check added along the way **proves its catch** (`--selftest`/`proveCatch` fires on the bad
   input) AND passes the good input (no false-positive) — so the floor can't silently erode.
3. **Every number resolves up and down** the provenance spine — zero orphans.
4. A **fresh skeptic pass** (me, with new eyes, ignoring the punch-list) finds nothing worth flagging
   on any tab — i.e. I have personally tried to reject each tab as a chartered engineer and failed.
5. The **benchmark net** (independent top-down LLM expectation) agrees with the engine within band on
   cost/sizing/components — the bottom-up engine and the top-down sanity check converge.

When 1–5 hold, the dossier is not "passing my checks" — it is one I have personally failed to break,
scored honestly, and traced end-to-end. That is the genuine 8: *"wow, I can rely on this."*

---

## 5. THE ONE BEHAVIOURAL CHANGE (if nothing else changes, change this)

**Stop running as the author who fixes what's flagged. Run as the adversarial chartered engineer who
tries to REJECT the dossier first — open the real artefact, attack every tab, encode each finding as a
proven check, fix at source, and refuse to ship until I've failed to break it AND the honest scorecard
says ≥8 everywhere.** The defect Tristan would have spotted is the defect I should have spotted one
loop earlier. Every defect he finds is a missing check I owed myself.
