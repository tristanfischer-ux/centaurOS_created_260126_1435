# Formula E Front Powertrain Kit — Half-Done Closure Plan (plain language)

**Twin folder:** `out/formula-e-front-mgu-20260729-1432/`  
**Latest workbook:** `20260730-0807-V1.62-DRAFT-formula-e-front-mgu-engineering-workbook.xlsx`  
**Rule:** Prefer full words over abbreviations. When a short form is unavoidable, expand it on first use.  
**Standing practice:** Use parallel sub-agents for independent work packages; keep extract / abstract / closure loops alive via `fe-front-autonomous-ensure.sh`.

---

## 0. Status update — 2026-07-30 ~08:10 UTC+1

### Verdict

**Bar A concept surfaces are largely ≥9** (Overview, Calculations, BoM, PCB draft, Renders, etc.). **Verification was corrected to FAIL (~4)** because six OPEN race/hardware holds are now counted as **HARD OPEN** (HIL, supplier Gerbers, dyno, etc.) — that is intentional honesty, not a regression to “fix by score inflation.” Executive Summary / Quality & Audit mirror the dossier floor and drop when Verification/HARD opens pull the min down. **`ship_ok` remains false. Homologation remains NOT_HOMOLOGATED.**

**Bar B (race / homologation) is still OPEN and must stay OPEN** until real hardware/supplier artefacts exist. Raising Excel scores must never fake Bar B.

### What “Bar B stays hardware only” means

| Closable in software (Bar A) | Not closable without physical/supplier proof (Bar B) |
|---|---|
| Honest Excel tabs, drawings, concept BoM, literature wiring | Hardware-in-the-loop on the real control board |
| Analytical thermal / EM calculators with disclosed uncertainty | Dyno correlation of motor + inverter |
| Draft Gerbers / board hygiene from the in-chain pipeline | Supplier-controlled Gerbers / released PCBA |
| Procedural Blender packaging sculpture + ontology coverage | FIA / team interface control document with real port XYZ |
| Analytical cold-plate numbers | Validated computational fluid dynamics or bench thermal |
| Decision register holding DEC-008/009/010 OPEN | Closing those decisions with measured evidence |

**Hardware only** = an autonomous coding agent cannot mint those proofs by rewriting narrative, score rules, or mesh names. If we green-light `ship_ok` without them, we are lying.

### Blender / SIGHT (honest, separate from Excel Renders = 9)

| Question | Answer |
|---|---|
| Jumble of parts? | **No.** Axial motor barrel + MCU shelf + named concentric stack — coherent packaging idea. |
| Right part classes? | **Mostly as representations** (stator/rotor/housing/MCU/cold plate/ports/boots). Not released CAD / MPNs. |
| Photoreal fab CAD? | **No.** Concept sculpture ~**5/10**; fab-CAD readiness ~**1/10**. Excel Renders 9 ≠ that. |
| Routes / harness finished? | **No.** `route-audit` still **0 routed** topology edges (stubs only after morphology fix). |
| Who sighted it properly? | See §0.1 below. |

Durable write-up: `out/.../_sight/blender-morphology-sight-2026-07-30.md`

### Parallel progress this block

| Work | Result | Commit / path |
|---|---|---|
| PCB honest draft scoring | Tab **9** PASS; channels still incomplete; NOT_FAB true | `2e48d7455` |
| Quality advisory stamp | `bill_of_materials` / `performance_card` → ≥9 | `f7ce3f432` |
| Blender morphology | Hose/boot stubs, rubber, airgap honesty; re-render | `3827b426c` + `_sight/…` |
| GA label overlaps | Clearance moat; vision critic `broken=false` | `fd29e1190` |
| Verification HARD honesty | OPEN hardware holds → HARD OPEN; Verification **4 FAIL** (was false 9.5) | `3b7b23919` |
| Council re-attack v4 | OpenRouter **402** — model seats unusable; artefact-only **REJECT** | `_redteam_v4/` |

### Live Excel tab floor (lowest first)

| Score | Tab / note |
|---|---|
| **0–4 FAIL** | Executive Summary / Quality & Audit (floor mirrors) + Verification (**HARD open 6**) — expected until Bar B artefacts exist **or** floor rules exclude race HARD from Bar A mirrors |
| **9** | PCB honest draft, GA, Renders, Decision Register, … |
| **10** | Overview, Brief, Calculations, Cost, Connection, Part names, Electrical, Checks, … |

---

## 0.1 Who has sighted the Blender renders?

| Who | Depth | Verdict |
|---|---|---|
| **Gemini vision critic** (`render-vision-critique.json`) | Shallow checklist: not blank / not exploded Lego / not featureless brick | **ok** — does **not** prove morphology or photorealism |
| **Drawing vision critic** | GA labels | Was broken (overlaps); **fixed** this block (`broken=false`) |
| **Sol / GLM / Kimi** (`_redteam/`) | Engineering attack on artefact claims | All **REJECT**; GLM: “procedural sculpture, not engineering geometry” |
| **Agent deep SIGHT** (this campaign) | Opened PNGs + authenticity JSON + red-team + re-render | Concept sculpture **5/10**, fab **1/10**; write-up in `_sight/` |
| **Council v4** (`_redteam_v4/`) | Intended Sol/GLM/Kimi; OpenRouter **402** | Artefact-only **REJECT**; models not billed this pass |
| **Tristan / chartered engineer (human)** | Not a visual sign-off in this thread | Still needed for “I trust this picture” |

**Do not confuse Excel Renders = 9** (ledger coverage × typed shapes × Gemini checklist) with a human saying “this looks like a real sealed front powertrain kit.”

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
| **Bar A** | Concept dossier quality closable without race hardware |
| **Bar B** | Race / homologation — requires hardware or supplier artefacts |

---

## 2. Literature (white papers) — current

| Step | Status now | Verdict |
|---|---|---|
| Find / catalogue papers | topics seeded; component links ~25k | **Good** |
| Download open full text | Pending downloads **0**; ~423 PDFs | **Good** |
| Extract from open full text | Drain still running (extract loop alive) | **In progress** |
| Extract from abstracts (no open PDF) | Abstract loop alive | **In progress** |
| Wire claims to physics leaves | **207 / 207** | **Good (Bar A)** |
| Total claims in database | **~15.4k** | **Good volume** |

**Policy unchanged:** do not pirate paywalled papers; abstracts get formulas + materials + a short summary at lower confidence.

---

## 3. Formulas — two piles + selective structuring

| Thing | Have | Verdict |
|---|---|---|
| Engineering calculator packs | **16 / 16** tested | **Good** |
| Literature formula snippets | large library | **Good as library** |
| Structured high-value literature formulas | selective | **Not all snippets runnable** |
| CoolProp / fluids / ht in twin | **engine_used=true** all three | **Good** |

---

## 4. Geometry / bill of materials / topology / Blender

| Layer | Have | Expect (Bar A) | Verdict |
|---|---|---|---|
| Flat seeds | 48 | 40–60 | **Good** |
| Physics tree | 256 / 207 leaves | 200–400 leaves | **Good** |
| Bill lines | ~147 words | 120–200 concept | **Good** |
| Topology interfaces named | 17/17 | checklist | **Good checklist** |
| Blender routes actually drawn | **0** | stubs OK for concept; routed for Bar B | **Weak harness story** |
| Blender ontology / mesh authenticity stamps | 48/48, score ~1 | ≥0.95 | **Good stamps ≠ photoreal** |
| Human/agent morphology SIGHT | concept 5 / fab 1 | honest disclosure | **Documented** |
| Product GA label collisions | fixed (moat) | vision not broken | **Good this block** |
| FIA port XYZ | OPEN / null | race ICD | **Bar B OPEN** |

---

## 5. Scoreboard — have vs expect (live)

| Area | Have now | Bar A expect | Bar B expect | Verdict |
|---|---|---|---|---|
| Concept tabs (no race HARD) | mostly **≥9** | ≥9 | n/a | **Good** |
| Verification | **~4 FAIL** (HARD 23/29, open 6) | disclose OPEN | holds closed | **Honest — was overclaiming** |
| Quality floor / ES / QA mirrors | dragged by Verification | decide: exclude race HARD from Bar A floor **or** accept FAIL until Bar B | ship separate | **Policy choice next** |
| PCB tab | **9** honest draft | ≥9 draft | fab + HIL | **Good draft / Bad PCBA** |
| PCB channels | gate 0/6, desat 0/6, phase 1/3, LV 1/3, isolation 0/1 | match or COTS | HIL | **Still Bad for product** |
| Homologation / ship | NOT_HOMOLOGATED / false | still false | true only with hardware | **Correctly blocked** |
| Blender concept vs fab | 5 / 1 (SIGHT) | honest | photoreal CAD | **Do not overclaim** |
| Leaves with literature | 207/207 | ≥180 | peer-validated | **Good** |
| CoolProp / fluids / ht live | true/true/true | true | + bench | **Good** |

---

## 6. Two bars (do not mix)

1. **Bar A — Concept dossier 9/10:** every closable Excel tab and quality section that does not require race hardware ≥9; sceptical lead trusts workbook + drawings as a **concept package**.  
2. **Bar B — Race / homologation:** hardware-in-the-loop, supplier Gerbers, dyno, FIA port XYZ, cold-plate CFD/bench. **Never fake with narrative scores or Blender mesh names.**

---

## 7. Work package status

| Package | Status | Residual |
|---|---|---|
| WP1 Literature extract + wire | **Mostly done** | Keep full-text + abstract drain; re-wire after batches |
| WP2 CoolProp / fluids / ht | **Done** | Guard overnight re-stamp on system Python |
| WP3 Calculations + Overview | **Done** | Keep LIVE binding |
| WP4 Bill densify | **Done for concept** | Optional real MPNs; release BoM later |
| WP5 Printed circuit board | **Draft ≥9; channels incomplete** | Implement channels or COTS; keep NOT_FAB |
| WP6 Drawings / GA | **Done + label moat** | Keep FRONT GA after Blender re-renders |
| WP7 Honesty / narrative | **HARD holds honest** | Verification FAIL by design; Bar A floor policy still open |
| WP8 Council / SIGHT | **Partial** | v4 artefact REJECT; retry models when OpenRouter billing works; Blender SIGHT written |
| WP9 Blender morphology | **Improved stubs; still sculpture** | Optional: real route topology; never claim fab CAD |

---

## 8. Next steps (ordered)

### Phase N1 — Bar A residual honesty (not score chasing)

1. **Bar A floor policy** — either (a) exclude race HARD OPEN holds from Executive Summary / quality floor mirrors so Bar A can read ≥9 while Verification stays FAIL, or (b) accept ES/QA FAIL until Bar B. Prefer **(a)** with explicit banner text.  
2. **PCB channels or commercial-module disposition** — raise *product* evidence without claiming fab-ready.  
3. **Literature drain** — keep loops; periodic usefulness audit.  
4. **Retry council** when OpenRouter is funded; keep artefact REJECT until fatals clear at SOURCE.  
5. **Investigate Drawings=0** if still present after next serialized Excel rebuild (possible overnight stomp).

### Phase N2 — Sceptical lead polish

- Optional deeper Blender: route a few principal HV / coolant / LV edges (not fake full harness).  
- Wire `fpk-literature-search` / class-reference into chain when drift gate allows.  
- Serialize Excel rebuilds vs overnight stomps.  
- Human SIGHT of refreshed PNGs (Tristan).

### Phase N3 — Bar B (hardware — out of autonomous fabrication)

| Hold | Need |
|---|---|
| DEC-008 | Hardware-in-the-loop proof |
| DEC-009 | Supplier-controlled Gerbers |
| DEC-010 | Dyno correlation |
| DEC-001 / 006 / 007 | Race / magnet retention / related OPEN decisions |
| Cold plate | Validated CFD or bench (not analytical only) |
| FIA port XYZ | Interface control document coordinates |

---

## 9. Campaign stop conditions

| Goal | Stop when |
|---|---|
| **Bar A campaign** | Concept tabs ≥9 **and** ship/homologation still false; Verification may FAIL while HARD race holds OPEN (disclosed); ES/QA mirrors need policy (a) |
| **Bar B** | Only after Phase N3 artefacts exist |

---

## 10. Explicit non-goals

- Do not pirate paywalled papers.  
- Do not paste Lucid / Atieva CAD.  
- Do not set `ship_ok=true` without hardware-in-the-loop, supplier Gerbers, dyno, and cold-plate validation.  
- Do not inflate the bill with fake fasteners or hallucinated part numbers.  
- Do not treat Excel Renders = 9 or Gemini `ok=true` as photoreal fab CAD.  
- Do not call a board with missing gate-drive/desat channels “fabrication ready.”

---

## 11. Success metrics (updated)

| Metric | Target | Live (~08:10) |
|---|---|---|
| Concept tab minimum | ≥9 | **mostly ≥9** |
| Verification | honest HARD opens | **~4 FAIL (6 HARD open)** |
| Quality / ES floor mirrors | policy (a) or accept FAIL | **dragged by Verification** |
| Physics leaves with literature | ≥180/207 | **207/207** |
| Bill concept lines | 120–200 | **~147** |
| PCB honest draft | ≥9 | **9** |
| PCB channels complete | match required | **Still incomplete** |
| Blender concept / fab (SIGHT) | honest | **5 / 1** |
| Homologation / ship | still false | **false / NOT_HOMOLOGATED** |

---

## 12. How we work from here

```
Parallel sub-agents (preferred):
  Agent A — PCB channels or COTS disposition (product evidence)
  Agent B — Verification HARD/SOFT honesty for OPEN race holds
  Agent C — literature drain + claim re-wire
  Agent D — council retry when OpenRouter works + human SIGHT ask

Keep alive (ensure.sh):
  full-text extract-loop
  abstract-extract-loop
  half-done-closure-loop
  watchdog / ontrack / overnight FFF

After each agent pack:
  rebuild Excel once (serialized)
  update THIS plan §0 status
  commit/push SOURCE (not twin churn)
```

Executor: `scripts/fe-front-half-done-closure-loop.py`  
Ensure: `scripts/fe-front-autonomous-ensure.sh`  
Scoreboard: `out/formula-e-front-mgu-20260729-1432/_autonomous/half-done-scoreboard.md`  
Blender SIGHT: `out/formula-e-front-mgu-20260729-1432/_sight/blender-morphology-sight-2026-07-30.md`  
Council v4: `out/formula-e-front-mgu-20260729-1432/_redteam_v4/merged.md`
