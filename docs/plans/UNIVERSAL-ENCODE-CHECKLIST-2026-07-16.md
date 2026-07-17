# Universal encode checklist — product-ladder wins → permanent code

**INTENT:** Every ≥9/10 win on Colorimeter → Codema → Powerwall → NinjaPCR → Poseidon is *training data for the engine*. If the lesson stays in an LLM session or a one-off patch, the next archetype re-pays the same tuition. This checklist is the encode backlog: each item must become a **SOURCE rule** + **proveCatch / selftest** keyed on form/scale/signal — never `if product == <brand>`.

**Rule of promotion:** a win is not encoded until (1) the rule is universal, (2) a bad artefact fails a guard, (3) the next product inherits it without re-discovery.

**Status key:** `DONE` already in code with guard · `PARTIAL` rule exists but gap remains · `TODO` not durable yet

---

## 0. Meta (how we encode)

| # | Lesson | Encode as | Status |
|---|---|---|---|
| 0.1 | Fix the RULE, not this run’s pixels/MPNs | SOURCE + proveCatch; reject gold-paste | DONE (policy) |
| 0.2 | Form family ≠ product noun | `is_*_form(class/part vocab)` + TRAINING aliases | PARTIAL (optical / PCR / syringe / lab_microscope) |
| 0.3 | Mesh checklist ≠ gold twinship | Layer-3 **render glance** after checklist | DONE (`form_render_glance.py`) |
| 0.4 | Fast Blender loop before full chain | `form_converge_loop` / visual_converge | DONE (glance wired) |
| 0.5 | SIGHT audits DELIVERED artefacts not `state.json` | Render-then-reingest / Excel cells / PNG | PARTIAL (human+LLM still) |
| 0.6 | Every gate proves its catch | `proveCatch` + adversarial input | PARTIAL (many shadow gates) |

---

## 1. Scale & class routing (Colorimeter / Powerwall / Codema / devices)

| # | Win / failure mode | Universal rule to encode | Primary surface | Status |
|---|---|---|---|---|
| 1.1 | Device briefs get plant kW / plant rooms | `isInstrumentDevice` + envelope m³ suppresses plant rooms | `build_universal_scene` parts-manifest | DONE |
| 1.2 | 1001 kW phantom on USB instruments | Device-scale `connected_electrical_load_kw` authority | electrical load derivation | DONE |
| 1.3 | Industrial MPNs on kit slots | Device industrial scrub + scale reject at emitter-completion | `emitter-completion.ts` | DONE |
| 1.4 | PCR brief classified as pcb_assembly | Class registry beats thin PCB slug | product-classifier / class graphs | DONE (thermocycler) |
| 1.5 | Syringe “carriage” → vehicle misroute | Class + part co-signals; stop plantish `pump` alone | classifier + form gate | DONE |
| 1.6 | Bare `pump` matches syringe_pump in plantish | Instrument form gate requires syringe+linear together | `is_syringe_pump_form` | DONE |
| 1.7 | Codema / plant vs wall Powerwall envelope | Product-scale wall envelope ≠ container metadata ship lie | envelope / scorecard honesty | PARTIAL |
| 1.8 | False SHIPS from wrong form-factor metadata | Scorecard must refuse container claims on wall/device | excel / tab-scorecard + `form_factor_honesty_*` | DONE |
| 1.9 | Unseen archetype class missing hard slots | Lock-gate HARD slots derivable per class | engineering-lock-gate + harness | DONE pattern |

---

## 2. Form grammar families (Colorimeter / NinjaPCR / Poseidon)

| # | Win / failure mode | Universal rule to encode | Primary surface | Status |
|---|---|---|---|---|
| 2.1 | Handheld optical use-physics (L-step, tower, cap, HMI) | Optical form constants + interior authenticity | `instrument_form_grammar` | DONE |
| 2.2 | Body clay-wash / crushed charcoal | Softbox energies + `body_luminance_ok` | grammar + studio lights | DONE |
| 2.3 | Cutaway = empty grey box | Min story meshes + authentic CAD fraction | interior_authenticity_ok | DONE |
| 2.4 | Source harness missing / plant-scale drop | Device-scale source→enclosure harness (4-colour) | blender harness proveCatch | DONE |
| 2.5 | Thermocycler exterior hid guts (optical policy leak) | Form-keyed exterior keep list (`u_se_tc_*`) | `_thermocycler_exterior_keep_visible` | DONE |
| 2.6 | Lid dumped into cavity (+Rx) | Tip-back open = −Rx; cam looks down onto star | `tipback_lid_*` | DONE |
| 2.7 | Vision critic preferred wrong image | Form-keyed vision image candidates | `tipback_lid_vision_image_candidates` | DONE |
| 2.8 | Syringe sealed cube / FALLBACK | OPEN array placer + form checklist | `_place_syringe_pump_layout` | DONE (iterate twinship) |
| 2.16 | Microscope → sealed colorimeter / FALLBACK | OPEN flexure placer + cream glance + floors | `is_lab_microscope_form` + `_place_lab_microscope_layout` | DONE (twinship iterate) |
| 2.17 | Materials 3–10× gold with SHIPS | Gold materials ±15% band gate | `gold_cost_band.py` | DONE (enforcement still campaign) |
| 2.9 | Tall chassis crates hide mechanism | Side rail height ceiling + open mid-bay | `SP_CHASSIS_*` + glance CRATE_WALLS | DONE |
| 2.10 | Tablet reads as fascia bar / top glass | Tilt + cam Z floors; HMI must face 3/4 cam | SP_DISPLAY / SP_CAM_* + HMI_FACE | PARTIAL |
| 2.11 | Harness vanished in product cam | Min OD + coloured wires + trunk | checklist stems + OD floor | DONE |
| 2.12 | Chip speck on console | Min chip plan size | `SP_CHIP_*` | DONE |
| 2.13 | **NEW** Checklist PASS / hero FAIL | Deterministic **form render glance** per family | `form_render_glance.py` | DONE |
| 2.14 | Form rules scattered across Blender | `FORM_FAMILIES` registry (detect → checklist → glance → cams → exterior keep) | grammar module | DONE (stub) |
| 2.15 | GOLD-WHY docs not linked to guards | Each GOLD-WHY row cites proveCatch id | docs + selftest names | DONE (`GOLD-WHY-syringe-pump-form.md`) |

---

## 3. Blender / renders / cams

| # | Win / failure mode | Universal rule to encode | Status |
|---|---|---|---|
| 3.1 | Framing loop only (TOO_SMALL etc.) | Keep `render_quality_score`; never claim semantic | DONE |
| 3.2 | Wide+low OPEN array height occupancy fail | Form-keyed cam fractions (dist/frame/z) | PARTIAL |
| 3.3 | Service cam empty on OPEN array | Service cam Y/X/Z fractions for form | DONE pattern |
| 3.4 | Inspect cams ≠ product hero | Never score inspect overlays as product twinship | DONE (`INSPECT_CAM` proveCatch) |
| 3.5 | Instrument BESS wall detail litter | Skip cabinet mounting wall on instruments | DONE |
| 3.6 | Optical litter on syringe hero | Hide optical story meshes when syringe form | DONE |
| 3.7 | Presentation bevel / samples | Instrument Cycles defaults in grammar | DONE |
| 3.8 | Downstream drawings stale after form fix | Form converge must regen GA/interconnect or stamp dirty | DONE (`form_converge_loop` → `generate_drawing_set`) |

---

## 4. BoM / floors / cost (all ladder products)

| # | Win / failure mode | Universal rule to encode | Status |
|---|---|---|---|
| 4.1 | Hollow GENERIC modules | Exclusive actuation/fluid/maintenance floors | DONE (syringe) |
| 4.2 | Floors stripped by PADDING_RE / word-id dedup | Floor nouns that survive strip + exclusive keep | DONE |
| 4.3 | Device cost plant-scale | ARCH_HANDHELD + device price ceiling | DONE |
| 4.4 | Powerwall empty ledger / E5 circular SUM | Structural take-off + Excel formula hygiene | DONE |
| 4.5 | Pack dominance / thermal spine (wall BESS) | Role band placement + thermal process keep | DONE |
| 4.6 | Ex-works ceiling honesty | Independent cost sanity family bands | PARTIAL (gate 32 shadow) |
| 4.7 | Union instrument floors (stepper+driver) | Actuation PCB collect + BoM union | DONE |

---

## 5. PCB (Colorimeter / Powerwall / Poseidon)

| # | Win / failure mode | Universal rule to encode | Status |
|---|---|---|---|
| 5.1 | Plant COTS forced on-board as SOIC/JST | Off-board plant assemblies | DONE |
| 5.2 | Touch Display steals actuation MCU | Keep actuation-drive on-board despite HMI | DONE |
| 5.3 | Fuse pad-overlap DRC (F1/F2) | Pad-extent pitch + Fuse_1206 + Freerouting | DONE |
| 5.4 | Compact clamp on actuation boards | Compact only from compact-source heuristic | DONE |
| 5.5 | Optical 40 mm vs actuation 120 mm | Outline band by board class | DONE |
| 5.6 | Off-board ≠ electronic gap | Triage readiness | DONE |
| 5.7 | Embed top+bottom PCB views | Excel PCB tab images | DONE |
| 5.8 | IC/SMD band overlap | SMD band below IC; pitch floors | DONE |

---

## 6. Interconnect / parts ledger / connection-trace

| # | Win / failure mode | Universal rule to encode | Status |
|---|---|---|---|
| 6.1 | Device connectivity from topology | Authoritative topology + terminals | DONE |
| 6.2 | `"feed" in "feedback"` false missing_input | Boundary keyword match | DONE |
| 6.3 | Force/stall/end-stop → instrument TYPE_RULES | Ledger type rules | DONE |
| 6.4 | Syringe principal graph | Form-keyed interconnect story | DONE |
| 6.5 | Power-protection + indicator roles | Close instrument graph | DONE |
| 6.6 | Connection-trace 0→10 fast harness | Deterministic trace from ledger | DONE |

---

## 7. Drawings / GA / gates (Powerwall / Codema / instruments)

| # | Win / failure mode | Universal rule to encode | Status |
|---|---|---|---|
| 7.1 | GA fp ≠ manifest after FFL rebase | Stamp settled `placement_fp`; restamp after restore | DONE |
| 7.2 | Product-scale GA coverage credit | Form-factor aware coverage | DONE |
| 7.3 | Fluid-less instrument plant schedules | Skip process schedules / line-velocity | DONE |
| 7.4 | Panel drawings on PCR | Suppress plant panel on fluid-less instruments | DONE |
| 7.5 | Drawing-gates shadow by default | Enforcing + punchlist route-to-stage | PARTIAL |
| 7.6 | Vision glance on drawings | Adversarial proveCatch on known-bad PNG | PARTIAL |
| 7.7 | Blender form change without drawing regen | Dirty flag / auto regenerate set | **TODO** |

---

## 8. Excel / tabs / verification

| # | Win / failure mode | Universal rule to encode | Status |
|---|---|---|---|
| 8.1 | HARD “PCB pipeline ok” floors Verification | Pipeline.ok + DRC must be real | DONE pattern |
| 8.2 | Engineering Analysis MultiCellRange crash | openpyxl range type hygiene | PARTIAL (skipped tab) |
| 8.3 | Live heating calcs for PCR | Class-appropriate calc tools | DONE pattern |
| 8.4 | Photometry calibration curve for optical | Beer–Lambert series | DONE |
| 8.5 | Tab floor honesty (no mirror LLM floor) | Deterministic sections floor the ship gate | DONE |

---

## 9. Vision critic / desirability

| # | Win / failure mode | Universal rule to encode | Status |
|---|---|---|---|
| 9.1 | Optical rubric on OPEN syringe | Form-keyed vision rubric | DONE |
| 9.2 | PCR empty-box / lid star | Thermocycler rubric + image preference | DONE |
| 9.3 | LLM judge flake | Deterministic hard-signals first (gate 31) | PARTIAL |
| 9.4 | Gold twinship still LLM SIGHT | Form render glance (layer 3) | **TODO** |

---

## 10. Encode priority for this session

**P0 — must land now (training otherwise wasted):**

1. ~~`form_render_glance.py`~~ DONE — `scripts/lib/form_render_glance.py`
2. ~~Wire glance into `form_converge_loop`~~ DONE — converge requires glance PASS
3. ~~`FORM_FAMILIES` registry stub~~ DONE — `instrument_form_grammar.FORM_FAMILIES` + `resolve_form_family`
4. ~~proveCatch synthetic adversarials~~ DONE — `--selftest` crate / no-HMI / empty PCR

**P1 — next cold encode (don’t wait for another product failure):**

5. Inspect-cam ≠ product-hero scoring policy assert
6. Form-converge dirty → regenerate drawing set
7. Scorecard form-factor honesty (wall vs container vs device)
8. Expand glance metrics for thermocycler (star-knob / tip-back lid face) and optical (charcoal body + glass)

**P2 — close shadow gates / docs:**

9. Link every GOLD-WHY row to a named proveCatch
10. Promote drawing-gates + cost-sanity proveCatch coverage where still SHADOW

---

## Acceptance for “encoded”

For each P0 item:

- [ ] Rule keys on form/scale/signal, not product noun
- [ ] `python3 … --selftest` / harness invariant fails on adversarial input
- [ ] Happy path still passes on a known-good (synthetic or settled) artefact
- [ ] Next form family can register without copy-paste Poseidon branches
