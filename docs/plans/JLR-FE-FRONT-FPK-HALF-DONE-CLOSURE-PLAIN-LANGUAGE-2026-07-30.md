# Formula E Front Powertrain Kit — Half-Done Closure Plan (plain language)

**Twin folder:** `out/formula-e-front-mgu-20260729-1432/`  
**Latest workbook:** `20260730-0653-V1.43-DRAFT-formula-e-front-mgu-engineering-workbook.xlsx`  
**Rule:** Prefer full words over abbreviations. When a short form is unavoidable, expand it on first use.  
**Standing practice:** Use parallel sub-agents for independent work packages; keep extract / abstract / closure loops alive via `fe-front-autonomous-ensure.sh`.

---

## 0. Status update — 2026-07-30 ~06:53 UTC+1 (after parallel agents)

### Verdict

**Bar A (concept dossier) is largely closed at ≥8 on every Excel tab.** Most tabs are ≥9 or 10. Three surfaces still sit at **8** and block a clean “every closable tab ≥9” claim: Executive Summary, Quality & Audit (mirror the floor), and Printed circuit board (honest engineering draft). Quality scorecard floor is **8** (mean 9.5). **`ship_ok` remains false. Homologation remains NOT_HOMOLOGATED.** That is correct.

### What parallel agents finished (this campaign)

| Work | Before → after | Notes |
|---|---|---|
| Literature → physics leaves | 76/207 → **207/207** | Alias-safe wiring; ship still false |
| CoolProp / fluids / heat libraries in twin | handbook fallback → **all three live** | `.venv` install + stamp |
| Bill of materials lines | 84 → **147** words / **102** ledger rows | Concept band 120–200 met |
| Bill ledger / Part names | ~3.8 → **9.5 / 10** | Honest TBD + prices; no fake MPNs |
| Overview / Calculations / Cost waterfall | 0 / 8.1 / 0 → **10 / 10 / 10** | Live formula binding |
| Drawings / GA / Renders / Connection | ~6 / 1.6 / 1.6 / 2 → **9 / 9 / 9 / 10** | Product FRONT GA; drawing gates pass |
| Electrical / Verification / Checks | ~7 / 4 / 0 → **10 / 9.5 / 10** | SLD coverage + honest holds |
| Closure honesty / design narrative / drawing_gates (quality) | 2 / 6 / 6 → **10 / 9 / 10** | Freshen from live artefacts |
| PCB Excel tab | 0 → **8** honest draft | Channels still **0 implemented**; NOT_FAB true |
| Abstract-only paper mining | not running → **alive** | Summaries + formulas + materials from no-PDF papers |
| Open full-text claim drain | ~150 left → **~64 left** | Still running |

### Live Excel tab floor (lowest first)

| Score | Tab |
|---|---|
| **8.0** | Executive Summary, Quality & Audit, Printed circuit board |
| **9.0+** | Drawings, GA, Renders, Decision Register, Equipment, BoM Ledger, Verification, … |
| **10.0** | Overview, Brief, Calculations, Cost waterfall, Connection, Part names, Electrical, Checks, … |

Quality floor **8** (sections still at 8: `bill_of_materials`, `performance_card` — advisory / disclosed trial rates, not race greenwash).

---

## 1. Plain-language glossary

| Short form | Full meaning |
|---|---|
| **Open-access papers** | Legal free full text via Unpaywall / publisher open links — not piracy |
| **Front powertrain kit** | Motor + inverter + gearbox + differential + cooling + connectors as one unit |
| **Form follows function** | Geometry forced by physics and use, not by copying a product photo |
| **Bill of materials** | Parts list |
| **Printed circuit board** | Control / gate-drive electronics boards |
| **Hardware-in-the-loop** | Real control board tested against a simulated plant |
| **Computational fluid dynamics** | 3D coolant flow / heat simulation |
| **Sol / GLM / Kimi** | Review models: Sol, GLM 5.2, Kimi K3 (Opus 5 if Kimi fails) |

---

## 2. Literature (white papers) — current

| Step | Status now | Verdict |
|---|---|---|
| Find / catalogue papers | ~1,268+ records; topics seeded | **Good** |
| Download open full text | Pending downloads **0**; ~425 PDFs on disk | **Good** |
| Extract from open full text | **~64** full texts still without claims | **In progress** |
| Extract from abstracts (no open PDF) | Loop alive; ~1,074 summary claims; ~4.8k abstract-tagged claims; ~645 abstracts still unclaimed | **In progress** |
| Wire claims to physics leaves | **207 / 207** leaves have claim refs | **Good (Bar A)** |
| Total claims in database | **~15.4k** | **Good volume** |

**Policy unchanged:** do not pirate paywalled papers; abstracts get formulas + materials + a short summary at lower confidence.

---

## 3. Formulas — two piles + selective structuring

| Thing | Have | Verdict |
|---|---|---|
| Engineering calculator packs | **16 / 16** tested | **Good** |
| Literature formula snippets | large library (growing) | **Good as library** |
| Structured high-value literature formulas | selective via `structure-fpk-high-value-formulas.py` | **Policy: not all snippets runnable** |
| CoolProp / fluids / ht in twin | **engine_used=true** for all three | **Good** |

We are **not** making every paper formula snippet executable. Calculators stay the design authority.

---

## 4. Geometry / bill of materials / topology

| Layer | Have | Expect (Bar A) | Verdict |
|---|---|---|---|
| Flat seeds | 48 | 40–60 | **Good** |
| Physics tree | 256 nodes / 207 leaves | 200–400 leaves | **Good** |
| Bill lines | **147** words / **102** ledger | 120–200 concept | **Good concept band** |
| Release / procurement BoM | not attempted | 400–800+ | **Out of Bar A scope** |
| Topology interfaces | 17/17 routed | checklist complete | **Good checklist** |
| Harness pin tables / FIA XYZ | OPEN | race ICD | **Bar B OPEN** |
| Blender ontology / authenticity | 48/48, authenticity ~1.0 | ≥0.95 | **Good** |
| Product GA leads FRONT | yes; drawing gates pass | pass | **Good** |

---

## 5. Scoreboard — have vs expect (live)

| Area | Have now | Bar A expect | Bar B expect | Verdict |
|---|---|---|---|---|
| Open-access downloads pending | 0 | 0 | 0 | **Good** |
| Full texts still missing claims | ~64 | ~0 | same | **Weak — draining** |
| Abstract-only still unclaimed | ~645 | drain or mark empty | same | **In progress** |
| Leaves with literature | 207/207 | ≥180 | peer-validated | **Good** |
| CoolProp / fluids / ht live | true/true/true | true | + bench | **Good** |
| Bill of materials concept lines | 147 | 120–200 | 400–800+ | **Good / release later** |
| Bill / Part names tabs | 9.5 / 10 | ≥9 | purchasable | **Good** |
| Overview / Calculations / Checks | 10 / 10 / 10 | ≥9 | measured | **Good** |
| Drawings / GA / Renders / Connection | 9 / 9 / 9 / 10 | ≥9 | photoreal CAD | **Good** |
| Electrical / Verification | 10 / 9.5 | ≥9 with OPEN holds | holds closed | **Good** |
| PCB tab (honest draft) | **8** | ≥9 honest draft | fab + HIL | **Weak — channels still 0** |
| PCB channels implemented | **0** of required | counts match or COTS disposition | HIL | **Bad for product PCBA** |
| Executive Summary / Quality & Audit | **8** (mirror) | ≥9 | n/a | **Weak — floor mirrors** |
| Quality scorecard floor | **8** | ≥9 | ship separate | **Weak** |
| Quality `bill_of_materials` / `performance_card` | 8 / 8 | ≥9 | n/a | **Weak advisory** |
| Homologation / ship | NOT_HOMOLOGATED / false | still false | true only with hardware | **Correctly blocked** |

---

## 6. Two bars (do not mix)

1. **Bar A — Concept dossier 9/10:** every closable Excel tab and quality section that does not require race hardware ≥9; sceptical lead trusts workbook + drawings.  
2. **Bar B — Race / homologation:** hardware-in-the-loop, supplier Gerbers, dyno, FIA port XYZ, cold-plate CFD. Never fake with narrative scores.

---

## 7. Work package status

| Package | Status | Residual |
|---|---|---|
| WP1 Literature extract + wire | **Mostly done** | Drain ~64 full texts; keep abstract loop; re-wire after batches |
| WP2 CoolProp / fluids / ht | **Done** | Guard against overnight re-stamp on system Python |
| WP3 Calculations + Overview | **Done** | Keep LIVE binding on rebuilds |
| WP4 Bill densify | **Done for concept** | Optional: more real MPNs where catalogue exists; release BoM later |
| WP5 Printed circuit board | **Half done** | Tab 8 with honesty; **channels still 0**; U1/U2 overlap disclosed; need implement-or-COTS path for tab ≥9 |
| WP6 Drawings / GA | **Done** | Keep FRONT GA after Blender re-renders |
| WP7 Honesty / narrative / verification | **Done** | ES/QA still mirror 8 until PCB/advisory floors rise |
| WP8 Council loop | **Running** | Sol/GLM/Kimi + half-done closure loop; use parallel sub-agents |

---

## 8. Next steps (ordered)

### Phase N1 — Close Bar A tab floor to ≥9 (parallelisable)

Run these as **parallel sub-agents** where file ownership does not collide:

1. **Printed circuit board → honest draft ≥9**  
   - Either implement required channel counts (gate×6, desat×6, phase×3, resolver, CAN, LV bucks, isolation) in the board generator, **or** change disposition to commercial modules with proof.  
   - Clear or permanently disclose U1/U2 overlap with score rules that do not fake fab-ready.  
   - Keep `NOT_FABRICATION_READY=true` until supplier Gerbers + hardware-in-the-loop.

2. **Executive Summary / Quality & Audit → ≥9**  
   - Once PCB and quality advisory sections reach ≥9, mirrors rise.  
   - If mirrors still lag, ensure Excel verdict re-ingests live quality floor (already partially wired).

3. **Quality advisory sections → ≥9**  
   - `bill_of_materials` section at 8 (disclosed trial-rate macros).  
   - `performance_card` at 8.  
   - Fix at SOURCE of those section builders; do not greenwash race readiness.

4. **Literature drain (background, keep running)**  
   - Full-text extract until ~0 without claims.  
   - Abstract extract until residuals marked empty/off-topic.  
   - Periodic Sol DB usefulness audit (ship still FAIL).

5. **Council re-attack**  
   - Fresh Sol + GLM + Kimi pass on the V1.43 dossier digest.  
   - Only chase FATAL/HIGH that map to a source rule.  
   - Never accept `ship_ok=true` from praise.

### Phase N2 — Bar A “sceptical lead” polish (after N1)

- SIGHT pass on rendered drawings + hero images (vision critic with proveCatch).  
- Wire `fpk-literature-search` / class-reference search into the production chain (left unstaged earlier for drift gate).  
- Stop overnight Excel rebuild races stomping good scorecards (serialize Excel writes or skip rebuild when scorecard already ≥8 and state unchanged).  
- Optional: raise Calculations / BoM from “honest TBD” toward more real catalogue MPNs **without inventing numbers**.

### Phase N3 — Bar B (hardware — out of autonomous fabrication)

Do **not** claim done until artefacts exist:

| Hold | Need |
|---|---|
| DEC-008 | Hardware-in-the-loop proof |
| DEC-009 | Supplier-controlled Gerbers |
| DEC-010 | Dyno correlation |
| DEC-001 / 006 / 007 | Race / magnet retention / related OPEN decisions |
| CFD cold plate | Validated thermal (not only analytical) |
| FIA port XYZ | Interface control document coordinates |

---

## 9. Campaign stop conditions

| Goal | Stop when |
|---|---|
| **Bar A campaign** | Every closable Excel tab ≥9 **and** quality floor ≥9 **and** ship/homologation still honestly false |
| **Bar B** | Only after Phase N3 artefacts exist — not this autonomous loop’s job to fake |

---

## 10. Explicit non-goals

- Do not pirate paywalled papers.  
- Do not paste Lucid / Atieva CAD.  
- Do not set `ship_ok=true` without hardware-in-the-loop, supplier Gerbers, dyno, and cold-plate validation.  
- Do not inflate the bill with fake fasteners or hallucinated part numbers.  
- Do not call a token board with zero implemented channels “fabrication ready.”

---

## 11. Success metrics (updated)

| Metric | Target | Live (~06:53) |
|---|---|---|
| Tab scorecard minimum | ≥9 | **8** (ES / QA / PCB) |
| Quality floor | ≥9 | **8** |
| Physics leaves with literature | ≥180/207 | **207/207** |
| Bill concept lines | 120–200 | **147** |
| Calculations | ≥9 | **10** |
| Overview | ≥9 | **10** |
| PCB honest draft | ≥9 | **8** |
| CoolProp / fluids / ht | live | **live** |
| Homologation / ship | still false | **false / NOT_HOMOLOGATED** |

---

## 12. How we work from here

```
Parallel sub-agents (preferred):
  Agent A — PCB channels or COTS disposition → tab ≥9
  Agent B — quality bill_of_materials + performance_card sections → ≥9
  Agent C — literature drain + claim re-wire + Sol audit
  Agent D — council digest + SIGHT on drawings

Keep alive (ensure.sh):
  full-text extract-loop
  abstract-extract-loop
  half-done-closure-loop (Sol/GLM/Kimi)
  watchdog / ontrack

After each agent pack:
  rebuild Excel once (serialized)
  update THIS plan §0 status
  commit/push SOURCE (not twin churn)
```

Executor: `scripts/fe-front-half-done-closure-loop.py`  
Ensure: `scripts/fe-front-autonomous-ensure.sh`  
Scoreboard JSON: `out/formula-e-front-mgu-20260729-1432/_autonomous/half-done-scoreboard.md`
