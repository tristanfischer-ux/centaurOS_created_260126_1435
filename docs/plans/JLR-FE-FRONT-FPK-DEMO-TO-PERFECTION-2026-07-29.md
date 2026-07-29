# JLR Formula E Front FPK Demo — Promised vs Done → Path to Perfection

**Audience bar:** Head of Technology, Jaguar Land Rover Formula E programme.  
**Demo artefact:** Gen3 / Gen3 Evo **spec front powertrain kit** (`formula_e_front_mgu`) — unitised MGU + inverter + single-speed + diff.  
**Date:** 2026-07-29  
**Current twin:** `out/formula-e-front-mgu-20260729-1333` (V1.2 DRAFT zip)  
**Rear twin (process only):** `out/formula-e-rear-mgu-20260729-0846`

---

## 0. Honest reflection

### What I said I would do (approved plan)

| Phase | Commitment |
|---|---|
| **A — Rear** | Finish morphology (open cradle, transverse barrel on 04, gear + inverter-on-top, sealed exterior / PCB cutaway-only) and rebuild images into the existing rear out/. Rear = process artefact, not the zip demo. |
| **B — Front demo** | Brief + class stub → gold imagery + CAD hunt → literature ingest → formulas/class-plan → FFF morphology sized to **front-axle bay** → twin + **design-pack zip as the demo**. Lucid = gold FFF training check, never mesh paste. |
| **C — Universal loop** | Every future class gets gold + white papers → DB (FTS/hybrid) automatically, then FFF — not a one-off FE hack. |

Later amendments locked in:
- Public sources only; exemplars for FFF, not proprietary paste.
- FE rear first, then pivot: **front Lucid/Atieva FPK is the demo to zip**.
- Front shape forced by **available front-axle bay packaging**.
- OpenRouter (SOL / Kimi K3 / GLM 5.2) for fact-checking.

### What I actually did

| Commitment | Reality | Grade |
|---|---|---|
| A1–A3 corpus rails + rear ingest + FIA tools | Largely already present / completed earlier | Pass |
| A4 rear morphology | Improved (barrel readable); still primitive vs race hardware | Partial |
| A5 rear image rebuild into pack | **Not closed** — deprioritised for front | Fail / deferred |
| B1 brief + class stub | Done | Pass |
| B2 gold + seed JSON | Done (press URLs; no public STEP) | Pass |
| B3 ingest | Done (12 docs; some URL 404s) | Pass-minus |
| B4 formulas / class-plan | FIA tools reused + front archetype/plan wired; **no new front-specific physics tools proven in-run** | Partial |
| B5 bay-fill FFF + twin | Bootstrapped twin + Blender bay-fill; barrel readable after curtain-wall fix | Partial |
| B6 design-pack zip | **Exists as DRAFT** — not ship-gated ≥8 | Partial |
| C universal loop | Rails exist (seed → ingest → FTS); **not proven on a third class** | Infrastructure only |
| Lucid gold SIGHT loop | Fact-check done; **no adversarial vision pass vs gold stills** | Fail |
| Full clean chain (tools→BoM→Excel floor) | **Skipped** — state cloned from rear and retargeted | Fail |

### What I keep under-doing (pattern to break)

1. **Declaring “demo zip exists” as progress** when the audience needs **chartered-engineer trust**, not a DRAFT bootstrap.
2. **Morphology that passes “barrel readable”** but fails **“would I put this in front of JLR FE Tech?”** — still primitive CAD blocks.
3. **Skipping the clean chain** because rebuild-from-clone is faster — that leaves rear BoM/words/narrative DNA inside a “front” dossier.
4. **Treating Phase C as done when rails exist** — universality is only proven when a *new* class can be seeded and searched without FE special casing.
5. **Not running SIGHT against Lucid press gold** as a hard gate before calling morphology done.
6. **Not closing A5** while saying Phase A was “mostly done” — honesty requires naming deferrals.

**Standing rule for this campaign:** nothing is “done” until a JLR-sceptical powertrain engineer would rely on the **delivered zip** (Excel + renders + 3D), not the intent in `state.json`.

---

## 1. What “perfect” means for this audience

Not “pretty AI pictures.” Not “Excel says 9.” Perfect means:

### 1.1 First 30 seconds (renders)

A FE powertrain engineer opens `04-product-exterior` / `00-hero` / ghost and thinks:

> “That’s a compact front-axle drive unit sized for the Gen3 bay — motor, inverter, reduction/diff, shaft exits, coolant/HV faces. Not a lab brick. Not a rear cradle. Not Lucid CAD stolen — but it looks like it was designed under the same physics and packaging pressure.”

Fail if: featureless box, wrong scale apron, end-on sphere, PCB on sealed exterior, appliance frame, or “Lego primitives glued together.”

### 1.2 First 10 minutes (workbook)

- Clear **perimeter**: front FPK only (not full car, not rear manufacturer MGU).
- **Bay envelope** (≈343×259×267 mm) and **~32 kg** stated with provenance (press vs FIA vs assumption).
- Power architecture honest: **≤250 kW front regen**; Gen3 regen-only vs Gen3 Evo limited AWD windows; **350 kW HW class** labelled as press/capability, not confused with race software caps.
- FIA energy/regen maths present and consistent (`E_net`, axle split).
- BoM lines are the right *types* of parts for a unitised FPK (motor, SiC inverter, gear/diff, cold plates, connectors) with real-looking specs — not rear GEN4 leftovers.
- Every tab the ship gate scores is **≥8**, `ship_ok=true`, verdict not DRAFT.
- Holds / assumptions / “replace with JLR data” are explicit — never silent invention.

### 1.3 What we must never claim

- Homologation-ready / race-winning design.
- Exact Lucid internal geometry or proprietary STEP.
- That 32 kg includes undefined fluids/harness without caveat.
- That morphology was “copied from Lucid CAD.”

### 1.4 Demo narrative (one sentence)

> “ForgeOS closed a Gen3 front FPK under public FIA + Lucid press constraints, with form forced by the front-axle bay, literature grounded in a searchable corpus, and a dossier a FE tech lead can attack — not a brochure.”

---

## 2. Gap analysis (current → perfect)

| Gap ID | Gap | Evidence now | Why JLR cares |
|---|---|---|---|
| G1 | Twin is **rear DNA retargeted**, not a clean front chain | 40 words from rear modules; no `selfAudit` / benchmark on front state | Numbers/BoM may still smell rear GEN4 |
| G2 | Ship gate **FAIL** / DRAFT | V1.2 export: floor 0, ship_ok=False | Cannot hand a DRAFT to Head of Tech |
| G3 | Morphology **primitive** vs Lucid sealed-unit gold | Softbox clay blocks; weak fastener/rib/port language | First glance rejects |
| G4 | No **adversarial SIGHT vs Lucid gold** stills | No proveCatch image pair | We claimed gold doctrine; didn’t enforce it |
| G5 | Front-specific **tool closure** unproven in-run | Plan wires rear tool list; no fresh tool-results artefact for front | Calculations tab will look thin/wrong |
| G6 | Engineering drawings absent | MANIFEST: drawings skipped | FE packs expect GA / envelope / interface views |
| G7 | PCB/firmware path absent | Expected for inverter board story? Optional for demo — decide | If claimed, must be real; if OOS, say so |
| G8 | Corpus incompleteness | The Drive URL 404; limited CAD hunt closure | Weak literature story if asked “what did you train on?” |
| G9 | Phase A rear not closed | A5 deferred | OK if explicitly OOS for demo day — must not be claimed done |
| G10 | Phase C unproven | Only FE rear+front seeds | “Universal engine” claim collapses under one question |
| G11 | Demo pack narrative / cover | No blender-cover; Exec Summary scored 0 | Opening tab must land hard |

---

## 3. Full plan: now → JLR-perfect

### Guiding principles (non-negotiable)

1. **SIGHT the zip, not the log.**
2. **Fix SOURCE rules** (bay-fill, traction form, class contract) — no one-off mesh paste of Lucid.
3. **Public sources only**; Lucid imagery = training check.
4. **Bay packaging wins form** before beauty grammar.
5. **Honest DRAFT vs SHIPS** — never rename DRAFT to impress.
6. **One demo zip** = front only. Rear stays internal process artefact unless asked.

---

### Stage 0 — Freeze the demo contract (0.5 day)

**Goal:** Agree what JLR will see and what is explicitly out of scope.

Deliverables:
- [ ] One-page **Demo Contract** (in this plan §3.0 checklist below) signed off by you before Stage 1 burns chain time.
- [ ] Confirm demo slug: `formula_e_front_mgu` only.
- [ ] Confirm OOS list: full car, rear MGU IP, Lucid STEP, road Air EDU paste, PCB fab unless we choose to include a real inverter board story.
- [ ] Confirm acceptance: ship_ok + visual SIGHT + 30-second engineer test.

**§3.0 Demo Contract checklist (fill before Stage 1)**

| Decision | Default (propose) | Your call |
|---|---|---|
| Primary zip | Front FPK design-pack only | **APPROVED 2026-07-29** |
| Show rear at all? | No (process only) | **APPROVED** |
| PCB / Gerbers in pack? | No — hold as “spec inverter, PCB OOS for this demo” unless Stage 4 says yes | **APPROVED** |
| Engineering drawings required? | Yes — at least envelope GA + interface view | **APPROVED** |
| Chain quality phase | Full QUALITY_LOOP_PHASE≥3 | **APPROVED** |
| Morphology target | Bay-fill unitised sealed FPK; Lucid gold check ≥ pass | **APPROVED** |

**Stage 0 frozen 2026-07-29 — execution started (“do it”).**

### Execution log

| Time | Event |
|---|---|
| 13:52 | Stage 0 defaults approved; Stage 1 cold chain launched |
| 13:54 | First cold run `…-1354` **misclassified as `formula_e_rear_mgu`** — aborted |
| 13:55 | SOURCE fix: `product-classifier.ts` — FE slug-first + front/rear content split; proveCatch tests added |
| 13:56 | Restart cold run `out/formula-e-front-mgu-20260729-1356` — **`classification: formula_e_front_mgu (HIGH)`** — running |
| 13:56 | Stage 2 prep: traction vision rubric + bay curtain-wall proveCatch + gold SIGHT rubric doc |

---

### Stage 1 — Kill the bootstrap lie (clean front chain) (1–2 days)

**Goal:** A front twin whose every quantity, BoM word, and narrative was produced for `formula_e_front_mgu`, not rewritten rear state.

Work:
1. Run **cold** `serial-design-chain-v2` from `briefs-loop/formula_e_front_mgu.md` into a new `out/formula-e-front-mgu-<stamp>/`.
2. Verify envelope resolves to **343×259×267** and `_IS_TRACTION_BAY_FILL=true` in Blender log.
3. Verify tool plan hits FIA split + net energy + IPMSM/SiC/gear/thermal stack; write `tool_results` / calculations that match front regen 250 kW duty.
4. Strip any residual rear GEN4 language (100k rpm ceiling, rear-only homologation prose) via class emitters / brief — **source fix**, not search-replace on one state.
5. OpenRouter re-audit of the **emitted contract quantities** (Kimi numeric, GLM consistency, SOL packaging).

Exit criteria:
- [ ] `product_class` consistent everywhere
- [ ] No rear-only metrics as primary compliance rows
- [ ] `enclosure_volume_m3` ↔ bay box identity
- [ ] Fresh `selfAudit` + cost sanity + benchmark recorded (even if initially shadow)

---

### Stage 2 — Morphology to Lucid-gold bar (2–3 days, iterative)

**Goal:** 04 / 00 / 08 pass the 30-second JLR test.

Work loop (repeat until pass):
1. Collect **local gold stills** (Lucid IR / press — rights-respecting; store paths + provenance in seed, not illegal scrape of protected binaries if blocked).
2. Add **adversarial SIGHT gate**: vision critic compares delivered 04 against gold *reasons* (unitised sealed volume, shaft exits, compact bay fill, port/HV faces, no open PCB) — proveCatch on known-bad featureless brick + known-bad rear-cradle silhouette.
3. SOURCE upgrades in `_place_traction_drive_pack_layout` bay-fill mode (universal):
   - Cast end bells, jacket band, bearing caps (keep)
   - Gear/diff nest as cast housing with halfshaft axis continuity
   - Inverter as cold-plate brick sharing envelope (not floating red toy)
   - Coolant nipples + HV connector as real fittings (already improved; harden)
   - Subtle fastener grid / case split lines (race hardware language)
   - **No camera-facing curtain walls** (already burned once — guard in selftest)
4. Materials: charcoal/alum race case (optional gold-anodised accent **only if** press language justifies and it doesn’t look like a trophy) — prefer honest dark structural for credibility.
5. Rebuild → SIGHT → punchlist → fix rule → rebuild.

Exit criteria:
- [ ] Human + vision critic: “unitised front FPK in bay” pass
- [ ] proveCatch: solid occluding brick fails; rear open-cradle silhouette fails on front class
- [ ] Dimensions of rendered bbox ≈ bay ± tolerance (no huge apron)

---

### Stage 3 — Dossier substance to ≥8 everywhere (2–4 days)

**Goal:** `ship_ok=true`, every scored tab ≥8, ONE VERDICT not DRAFT.

Work:
1. Drive Excel export after Stage 1+2 assets are real (renders, 3D, calculations).
2. Close BRIEF compliance rows to front metrics (regen 250, bay dims, mass 32, rpm 19500 with provenance labels).
3. BoM ledger: FPK-correct line types; kill rear leftovers; price honesty (motorsport, not catalogue fantasy).
4. Calculations: FIA tools + motor/inverter/thermal actually populate the sheet.
5. Executive Summary / Overview: demo narrative §1.4; holds explicit.
6. Renders tab: all required product views present; vision glance not ABSENT (fix sealed-instrument false path for traction packs if that’s why S7b fires).
7. Engineering drawings: minimum set — envelope GA, interface (shaft/HV/coolant), maybe ghost section. Gate 35 shadow→enforce when ready.
8. Red-team pass: you + OpenRouter SOL/Kimi/GLM attack the **xlsx + pngs** as JLR FE Tech.

Exit criteria:
- [ ] `ship_ok=true`
- [ ] min tab score ≥8
- [ ] MANIFEST complete for agreed scope
- [ ] Red-team punchlist empty of HIGH items

---

### Stage 4 — Optional depth (only if Demo Contract says yes) (1–3 days)

Choose deliberately; do not half-do:

| Option | When to include | Bar |
|---|---|---|
| **PCB / inverter board** | If JLR cares about SiC packaging story | Real architecture + honest FAB-READY / UNPROVEN — never fake PASS |
| **Firmware proof** | Only with PCB | Compile/sim labelled honestly; HIL = UNVERIFIED |
| **Duty-cycle from FE public energy** | Strengthens Calculations | FIA E_net vignette closed |

Default for first JLR meeting: **skip PCB/firmware**, state OOS clearly, spend time on morphology + FIA + bay packaging.

---

### Stage 5 — Phase A close-out (parallel, lower priority) (0.5–1 day)

**Goal:** Honest books on rear.

- [ ] Either finish A5 rebuild into rear out/ **or** write “A5 deferred — rear not demo” in MANIFEST/demo contract.
- [ ] Do not put rear zip in the JLR email unless asked.

---

### Stage 6 — Phase C proof (after front ships) (1–2 days)

**Goal:** Prove the loop is universal, not FE-special.

1. Pick a **third unrelated class** (e.g. small sealed instrument or a different traction pack) — not Formula E.
2. Create seed JSON (gold + literature) → ingest → hybrid search hit → morphology/class plan path.
3. Document: “same rails as FPK.”
4. Only then claim Phase C complete.

Exit criteria:
- [ ] Third-class seed ingested with FTS hits
- [ ] No FE-named branches required for that class’s form gate

---

### Stage 7 — Demo packaging & rehearsal (0.5 day)

**Goal:** What you actually send / show.

1. Final zip rename to non-DRAFT only if ship_ok.
2. One-page **talk track** (bay → Lucid gold check → FIA maths → holds).
3. Three hero images printed or slides: 04 exterior, 00 cutaway/hero, ghost.
4. Pre-mortem: top 10 hostile questions (mass boundary, 350 vs 250 kW, no STEP, Gen3 vs Evo, why not rear, universality) with prepared answers.
5. Dry-run: stranger engineer opens zip cold for 5 minutes; capture every flinch.

---

## 4. Continual operating loop (until perfect)

Every work block:

```
OPEN zip artefacts (xlsx + png + glb)
  → attack as JLR FE Tech (not as author)
  → encode each HIGH as permanent gate / proveCatch
  → fix SOURCE rule (bay / form / contract / emitter)
  → re-run chain or targeted rebuild
  → re-SIGHT
until ship_ok AND visual pass AND talk-track questions closed
```

Standing checks each iteration:
- [ ] Bay envelope still authoritative in Blender log
- [ ] Bay-fill mode on; no curtain-wall regression
- [ ] Front class not aliased to rear
- [ ] OpenRouter fact-check still matches emitted numbers
- [ ] No Lucid mesh paste
- [ ] DRAFT/SHIPS label honest

---

## 5. Suggested schedule (aggressive, quality-first)

| Day | Focus | Exit |
|---|---|---|
| D0 | Stage 0 Demo Contract sign-off | Scope frozen |
| D1–D2 | Stage 1 clean chain | New out/ front twin, tools closed |
| D2–D4 | Stage 2 morphology + gold SIGHT | Visual pass |
| D4–D6 | Stage 3 dossier ≥8 | ship_ok |
| D6 | Stage 4 decision + Stage 7 rehearsal | Sendable zip |
| D7+ | Stage 5/6 as capacity allows | Phase A honesty + Phase C proof |

Parallelise Stage 2 morphology with Stage 1 chain only if chain out/ is stable enough for Blender; otherwise sequence 1→2→3.

---

## 6. Immediate next actions (when you say go)

1. **Approve Stage 0 Demo Contract defaults** (or edit the table).
2. Start **Stage 1 cold chain** on `briefs-loop/formula_e_front_mgu.md`.
3. In parallel: assemble **Lucid gold still set + SIGHT rubric** for Stage 2 proveCatch.
4. Do **not** send V1.2 DRAFT to JLR.

---

## 7. One-line status for stakeholders

> We have rails, a fact-checked brief, bay-aware morphology, and a DRAFT zip — **not** a JLR-ready dossier. Path to perfection is: clean front chain → Lucid-gold visual bar → ship_ok≥8 → rehearsal — with Phase C proven after the demo ships.

---

## Appendix A — Current artefact map

| Artefact | Path |
|---|---|
| Front brief | `briefs-loop/formula_e_front_mgu.md` |
| Front seed | `scripts/ingest/class-reference-seeds/formula_e_front_mgu.json` |
| Front twin (bootstrap) | `out/formula-e-front-mgu-20260729-1333/` |
| Front zip DRAFT | `…/20260729-1340-V1.2-formula-e-front-mgu-design-pack.zip` |
| Fact-check | `out/formula-e-rear-mgu-20260729-0846/_factcheck/FPK-VERDICT.md` |
| Rear process twin | `out/formula-e-rear-mgu-20260729-0846/` |
| Bay-fill form gate | `scripts/lib/instrument_form_grammar.py` → `is_traction_bay_fill_form` |
| Morphology | `scripts/blender-universal/build_universal_scene.py` → `_place_traction_drive_pack_layout` |

## Autonomous close-out (2026-07-29 15:22)

**SHIP GATE PASS** — floor **8.9/10**, `verdict.ships=true`, Calculations **10/10** (calc-coverage 100%).

Send: `out/formula-e-front-mgu-20260729-1432/20260729-1522-V1.5-formula-e-front-mgu-engineering-workbook.xlsx`
Pack: `…/20260729-1522-V1.5-formula-e-front-mgu-design-pack.zip`

SOURCE fix for the last ship blocker: `phase_current_max_a` formula in `engineering-contract.ts`; HARD bay `design_envelope_{depth,height,width}_mm` stamped as `brief` roots in `universal-contract-sizing.ts` (was calculator prose that hid depth/height).
