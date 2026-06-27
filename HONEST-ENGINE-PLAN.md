# Plan: kill the DEFECT CLASSES, not the instances (permanent + universal)

**Context.** Building a multi-tab Excel "dossier" from a brief, for ANY archetype (BESS, water
treatment, vertical farm, …). The engine scores its own 34 sheets 0–10 and ships at ≥8/all. The owner
caught the engine (and me) **inflating scores** and **whack-a-moling** symptoms. New archetypes keep
re-surfacing the same underlying diseases. The mandate: every fix PERMANENT + UNIVERSAL + DETERMINISTIC
+ AUTOMATIC, each proven by a `proveCatch` self-test wired into `verify-engine-guards.sh` (runs every
commit/push). "I looked" is never a check.

## The 6 root defect CLASSES (with the universal mechanism for each)

### C1 — False scores (a sheet reads high while carrying an unverified/assumption line)
- **Root:** the per-tab scorer counts a narrow proxy (tag-coverage) and treats "advisory / unverified /
  out-of-scope" as a free, non-penalising note.
- **Universal mechanism (DONE):** `_apply_universal_honest_cap` — ONE pass over every merged tab score
  (data + drawing + render + meta, any archetype): a VERIFICATION-GAP marker caps the tab at ≤7 (FAIL);
  a SOFT caveat (assumption/estimate/out-of-scope/TBD) caps at ≤8 (never a perfect 10). proveCatch wired.
- **Still needed:** every scorer must SURFACE what it did NOT verify as an explicit caveat line (a tab
  can only be capped if it declares its gap). Audit each tab's scorer for a silent "didn't check".

### C2 — Engine blind to the DELIVERED artefact (SIGHT)
- **Root:** scores read `state.json` (what was INTENDED), not the rendered Excel cells / drawing
  geometry / rendered image (what was DELIVERED).
- **Universal mechanism:** render-then-reingest. Deterministic readers of the DELIVERED artefact
  (openpyxl over the real cells; parts-manifest geometry; coverage) carry ~70%. The irreducible visual
  residue (a render that *looks* wrong) needs a vision-model critic with a proveCatch on a known-bad
  image. Until a dimension is verified from the delivered artefact, C1 keeps its score capped.
- **Status:** partial. The render visual-quality is UNVERIFIED today (no vision critic wired) — so C1
  correctly caps all renders at 7. Earning ≥8 REQUIRES wiring the vision critic.

### C3 — Hardcoded class assumptions (BESS-shaped logic on any archetype)
- **Root:** baked class tables/keywords (capex categories, the headline-output metric, gate shapes).
- **Universal mechanism:** derive from the design/contract; never a baked class table.
  - capex categories → FUNCTION-based regex (DONE: membrane→Filtration, pump→Rotating, not battery/thermal).
  - **headline output metric** (OPEN): the cover shows "6,000 cultivation containers" for a WATER plant
    (it echoed the brief's served-asset count). Fix: the headline output must be the plant's OWN
    principal deliverable (largest process throughput in the plant's output unit), and a UNIVERSAL
    "foreign-unit" detector flags when the brief headline unit is a count of a served asset that the
    plant does not itself produce.

### C4 — Fake matching / Goodhart (a manufactured PASS)
- **Root:** loose matching grabs the closest/any quantity to claim a compliance PASS.
- **Universal mechanism (DONE):** match by IDENTITY (subsystem noun), exclude unit tokens + rate units +
  requirement-echoes. proveCatch: hand-watering(25) must NOT match the fertigation pump(90). Plus the
  Exec Summary is capped at the dossier FLOOR (the cover can't out-score its weakest sheet).

### C5 — Over-decomposition / count errors (a brief population multiplied/duplicated)
- **Root:** synthesis re-emits a brief population (e.g. "200 actuated valves") under many words/categories.
- **Universal mechanism (PARTIAL):** singular/plural population dedup done. OPEN: a deterministic
  count-reconciliation that asserts a brief count appears in ONE consolidated word and the design total
  equals the brief — and flags the same count multiplied across categories. Needs a proveCatch.

### C6 — Stray geometry (a render artifact: the red beam)
- **Root:** UNKNOWN. My edge-length approach FAILED on real data (longest edges are legit tank loops at
  3.2× median; the beam isn't a length outlier). Lead (unverified): "3 Phase Power Input" has
  `shape: horizontal_vessel` — a power feed rendered as a long horizontal cylinder may be the beam → a
  wrong-shape-mapping defect, not placement/length.
- **Universal mechanism (OPEN — need a sound approach):** candidate ideas: (a) a per-part shape-vs-type
  appropriateness check (a power-feed/electrical item must not get a vessel/beam shape); (b) a vision
  critic (C2) on the render with a proveCatch on this exact image; (c) a manifest check for a part whose
  aspect ratio is beam-like AND whose type is not a pipe/beam.

## Execution order (highest leverage first)
1. **C2 vision critic** — once renders are verified from the image, the biggest score block (8 sheets)
   resolves honestly AND C6 likely falls out of the same critic.
2. **C3 headline-output** — universal foreign-unit detector + derive from plant throughput.
3. **C5 count-reconciliation** — deterministic, proveCatch.
4. **C6 shape-appropriateness** — if the vision critic doesn't subsume it.
5. **C1 audit** — every scorer surfaces its own gaps (so the cap can fire).

## Questions for the council
1. Are these the right 6 root classes, or is there a deeper single cause? (e.g. "the engine never reads
   its own output" subsumes C1+C2.)
2. Is the universal honest-cap (C1) sound, or does capping-by-declared-caveat create a perverse
   incentive to simply NOT declare caveats (gaming by omission)? How to prevent silent omission?
3. C2: deterministic-first vs vision-critic — what is the right split, and how do you proveCatch a
   vision critic so it can't silently rot?
4. C6 stray-geometry: which of the three approaches is most robust + universal, or is there a better one?
5. C3: is "derive headline from largest process throughput" safe across archetypes, or will it pick the
   wrong quantity (e.g. a recirculation loop bigger than the product flow)?
6. Biggest blind spot we're missing?

---

# COUNCIL VERDICT (Gemini 3.1 Pro · Grok 4.3 · GLM-5.1 · MiMo-2.5-Pro — 2026-06-27)

**Unanimous (4/4): my 6 "classes" are SYMPTOMS, not roots. Two deeper roots subsume all six, and the
whole plan is still "inspecting quality in at the end of the line" instead of generating-correct-by-
construction.**

- **ROOT A — Untyped syntactic generation (subsumes C3/C4/C5/C6).** The engine matches STRINGS/tokens,
  not a typed node-edge GRAPH of the facility. "200 valves" is text to be parsed, not a typed object
  `{Instance: Valve, count: 200, subsystem: …}`. With a real typed graph, fake-matching and count
  errors are *physically impossible* and shape is a typed lookup, not text inference.
- **ROOT B — Proxy validation / open-loop (subsumes C1/C2).** The engine grades its INTENT (the
  intermediate JSON + its own self-declared caveats), never its DELIVERED artefact (the real Excel
  cells / geometry / image). It validates its thoughts, not its work.

**Two of my proposed fixes were flagged WRONG (4/4 blockers):**
1. **C1 cap-by-declared-caveat is gameable by SILENCE** — don't declare a caveat, don't get capped; it
   "trusts the liar." FIX (unanimous): INVERT THE BURDEN OF PROOF. Default score = 0 (unverified).
   Every number/spec cell must carry a non-null PROVENANCE pointer (brief-param-ID │ physics-calc-node │
   standard/component-ID). A deterministic null-check: **missing provenance → hard FAIL**. You cannot
   game a null check. proveCatch: strip all "caveat" words from the engine's vocabulary and force
   generation — if any sheet scores ≥8 without per-number provenance, the guard fails.
2. **C3 "headline = largest process throughput" is dangerous** — recirc/cooling/utility loops routinely
   dwarf product flow (activated-sludge recycle 3–5×; cooling loops > grid export). FIX (unanimous):
   the deliverable is the **net flow crossing the SYSTEM BOUNDARY outward** (product water / dispatched
   kWh / harvested kg), from an explicit `Primary_Deliverable_Tag`, excluding waste/exhaust — never max
   internal flow.

**On the open questions:**
- **C2 vision critic (4/4 skeptical):** deterministic artefact-readers are the GATE (openpyxl exact
  cell values; geometry kernel: clash/containment/port-topology). A non-deterministic VLM **may only
  FLAG/FAIL, never PASS**, and is itself proveCatch'd by a FROZEN library of known-bad renders injected
  every run — if it passes a known-bad, the push is blocked. Better: shrink allowed geometry so a
  deterministic checker rejects everything that would have needed eyes.
- **C6 stray geometry (4/4):** drop heuristics. Use **typed shape ontology** (`ElectricalInput → Point/
  Cable`, never `HorizontalVessel`; unknown class → a bright red `MISSING_SHAPE` placeholder, never a
  guess) + **spatial containment** (every vertex inside the site boundary; every solid touches terrain/
  mount/another solid → orphan check). The red beam fails containment/typing deterministically.
- **Q6 blind spot (unanimous):** "you're trying to inspect quality into a probabilistic generator."
  Move the LLM to the FRONT (brief → a strict, validated, LOCKED typed Design-Basis graph), then the
  Excel + geometry are DUMB DETERMINISTIC SERIALIZATIONS of the proven graph. **"The engine must be a
  compiler, not an author."** Then C1/C3/C4/C5/C6 disappear *by design*, not by inspection.

# REVISED PLAN (council-driven), highest-leverage first
1. **PROVENANCE-OR-FAIL** (kills C1 game-by-silence + C2 proxy + most false-PASS). Every emitted
   number carries a machine-readable provenance pointer; a deterministic reader over the DELIVERED
   Excel cells fails any number with null provenance. Burden of proof inverted. proveCatch'd.
2. **SYSTEM-BOUNDARY DELIVERABLE** (fixes C3 headline + the foreign-unit cover). Tag the boundary-
   crossing product stream; headline = that, never max throughput.
3. **TYPED SHAPE ONTOLOGY + SPATIAL CONTAINMENT** (fixes C6 deterministically; no vision needed).
4. **DETERMINISTIC ARTEFACT-READ AS THE GATE** (C2); vision, if any, FLAG-only + frozen known-bad
   proveCatch.
5. **COUNT-RECONCILIATION from the typed node-graph** (C5).
6. **NORTH STAR — compile-not-author:** migrate generation to fill constrained slots in a locked typed
   Design-Basis graph; serialize deterministically. The big rebuild that makes the rest permanent.

