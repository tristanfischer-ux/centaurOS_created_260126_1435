# Formula E Front Powertrain Kit — Half-Done Closure Plan (plain language)

**Date:** 2026-07-30  
**Twin folder:** `out/formula-e-front-mgu-20260729-1432/`  
**Rule:** Prefer full words over abbreviations. When a short form is unavoidable, expand it on first use.

---

## 1. Plain-language glossary (what the jargon meant)

| Short form I used before | Full meaning |
|---|---|
| **OA** | **Open-access** research papers (legal free full text via Unpaywall / publisher open links — not paywalled PDFs we scrape illegally) |
| **FPK** | **Front powertrain kit** (motor + inverter + gearbox + differential + cooling + connectors as one unit) |
| **FFF** | **Form follows function** (geometry forced by physics and use, not by copying a product photo) |
| **BoM** | **Bill of materials** (parts list) |
| **PCB** | **Printed circuit board** |
| **HIL** | **Hardware-in-the-loop** (real control board tested against a simulated plant) |
| **CFD** | **Computational fluid dynamics** (3D coolant flow / heat simulation) |
| **DRC** | **Design rule check** (PCB copper spacing / manufacturing rules) |
| **Sol / GLM / Kimi** | Three external review models that challenge the pack: Sol (`gpt-5.6-sol`), GLM 5.2, Kimi K3 (Opus 5 if Kimi fails) |

---

## 2. What is actually happening with the white papers

Yes — the system is still **reading and extracting** from open-access papers.

| Step | What it does | Status now |
|---|---|---|
| Find papers | Search academic indexes for motor / inverter / gearbox / cooling topics | Done for current topic set (~1,268 document records) |
| Download open full text | Only papers with a legal open PDF / HTML | Open-download queue **empty** (pending = 0). ~605 marked “no open full text” (we do **not** pirate those) |
| Store PDF on disk | `~/.forge-truth/fpk-pdfs/` | ~425 PDFs |
| Extract claims | Large language model pulls formulas, materials, geometry numbers from full text into the database | **Still running.** ~150 open-access full texts still have **no claims extracted yet** |
| Wire claims to design leaves | Attach a paper claim to a specific part leaf in the physics tree | **Weak.** Only 76 of 207 leaves have literature attached |

So: downloading open papers is largely done; **claim extraction and wiring into the design** is the remaining literature work.

---

## 3. Formulas — why “58” and “16” are different things

These are **not** the same pile.

| Thing | Count now | What it is | Expected for a serious concept pack | Verdict |
|---|---|---|---|---|
| Literature formula **claims** in the database | ~700+ tagged formula-like | Snippets extracted from papers (“torque ≈ …”) | Growing; 500+ is fine as a library | **Good as a library** |
| **Selected** literature formulas structured for search / Anvil | growing via `structure-fpk-high-value-formulas.py` | Only snippets with a real expression + powertrain keyword hit | Dozens–low hundreds of *useful* ones — **not all snippets** | **Policy: selective** |
| **Engineering calculator packs** installed in the tool chain | **16 / 16** tested | Real sizing tools (power reconcile, motor size, SiC loss, gear ratio, bus inductance, cold plate, CoolProp coolant properties, …) | All packs that the powertrain needs must self-test and be invoked | **Good for the calculator stack** |
| Live twin using CoolProp / fluids / ht libraries (not handbook fallback) | Must stay `engine_used=true` after `.venv` install | Same coolants maths via libraries | Must show `engine_used = true` in the twin | Re-check each cycle |

### Formula structuring policy (explicit answer)

**No — we are not going to make every formula snippet runnable.**

Most paper snippets are incomplete, unit-ambiguous, or only true under conditions the abstract never states. Forcing them all into executable code would invent false precision.

What we *will* do:

1. Keep extracting formula **snippets** as a searchable library (including from abstracts of papers we cannot download).
2. **Structure only high-value candidates** (expression present + maps to motor/inverter/gear/thermal keywords + sanity check) into `fpk:executable:literature:*` rows.
3. Keep the **16 calculator packs** as the authority for design maths; literature formulas support / challenge those packs, they do not replace them.

Script: `scripts/ingest/structure-fpk-high-value-formulas.py`

### Papers we cannot download (no open full text)

We still extract from the **abstract** (already harvested):

- short **paper summary**
- **formulas** if stated
- **materials** if stated  

Provenance tag: `fpk_literature_abstract:*` with lower confidence.  
Loop: `scripts/ingest/fpk-abstract-extract-loop.py` (runs in parallel with full-text extract).

---

## 4. Geometry — why “48 parts” sounded tiny

“48” is only the **flat seed list** (major named assemblies / parts used as first-principles seeds). It is **not** the full design tree.

| Layer | What we have | What we would expect | Verdict |
|---|---|---|---|
| Flat first-principles seeds | **48** | 40–60 major seeds is normal | **Good for seeds** |
| Recursive physics tree (assemblies → parts → sub-parts → process / material leaves) | **256 nodes / 207 leaves** | 200–400 leaves for a unitised axle kit at concept depth | **Good for concept depth** |
| Bill of materials lines in Excel / state | **84 words** (~79 unique names) | Concept pack: **120–200**; release / procurement: **400–800+** | **Weak for concept-complete; bad for release** |
| Blender meshes shown | **165** (principals authentic) | Every ontology seed + visible sub-parts as non-box shapes | **Good for visual FFF after last re-render** |
| Concentric millimetre stack (housing, stator, rotor, sun/planet, inverter shelf) | Closed analytically; nest/stack fit flags true | Same + GD&T / supplier CAD later | **Good analytical; OPEN for manufacture** |

**In one sentence:** 48 is the headline part list; 207 is the physics breakdown; 84 is what made it into the bill of materials — that last number is the shortfall.

---

## 5. Topology — what “17 / 17” means

**Topology** here means: the **required interface routes** are named and accounted for in the model (high-voltage +, high-voltage −, three phase legs, coolant in/out, low-voltage / CAN, resolver, mounts, halfshafts, etc.).

| Item | Have | Expect | Verdict |
|---|---|---|---|
| Required interface edges routed in the model | **17 / 17** | All principal power / fluid / signal / mechanical interfaces listed | **Good as a checklist** |
| Real harness drawings, pin tables, FIA port XYZ | Mostly **OPEN** | Pin-complete ICD with coordinates | **Bad / not done** (honestly held open) |
| Sensor / connector detail | Partial | Full ICD | **Incomplete** |

**In one sentence:** topology 17/17 means “we know every main hose and cable must exist and where it attaches in the bay model” — not “the wiring harness is finished.”

---

## 6. Scoreboard — have vs expect vs good/bad

| Area | Have now | Expect for Bar A (serious concept dossier ≥9/10) | Expect for Bar B (race / homologation) | Verdict |
|---|---|---|---|---|
| Open-access paper downloads pending | 0 | 0 | 0 | **Good** |
| Open full texts / PDFs | ~425 | ≥400 for this topic set | same | **Good** |
| Papers with claims still missing | ~150 | 0 (or explicitly “empty PDF” marked) | same | **Bad — in progress** |
| Claims in database | ~8.2k+ | ≥8k with formula/material/geometry present | same | **Good volume** |
| Physics leaves with literature attached | **76 / 207** | ≥180 / 207 | ≥207 where literature exists | **Bad** |
| Calculator packs tested | 16 / 16 | 16 / 16 | + measured correlation | **Good (Bar A)** |
| CoolProp / fluids / ht used in twin (not handbook) | false in stamp | true | true + bench data | **Bad** |
| Physics tree coverage | 100% domains stamped | 100% + fewer OPEN validation tags | FEA/CFD/HIL closed | **Good structure / many OPEN proofs** |
| Bill of materials lines | 84 | 120–200 concept-complete | 400–800+ release | **Weak** |
| Material grades on bill lines | 0 | Every structural / magnetic / polymer line | Purchase grades | **Bad** |
| Real manufacturer part numbers | ~10 real / ~30 TBD / ~44 none | ≥60% real or honest “make” with drawing | ≥95% purchasable | **Bad** |
| Prices | 0 | Where database has prices | Full costed pack | **Bad** |
| Printed circuit board pipeline (Gerbers exist, routed) | yes | yes | supplier-controlled Gerbers | **Hygiene good** |
| Gate-drive / sense / CAN channels implemented | **0 of every required type** | Counts match architecture (e.g. 6 gate, 6 desat, 3 current, …) | HIL proven | **Bad** |
| Board placement overlap | U1 vs U2 overlap error | none | none | **Bad** |
| Excel Calculations “show your working” coverage | ~71% | ≥95% | 100% + measured | **Weak** |
| Overview deterministic checks | 105/111 pass (6 fail) | 111/111 | same | **Weak** |
| Executive Summary / PCB / Checks / Quality tabs | 0 | ≥9 (PCB may be honest “engineering draft”) | race-ready only with HIL | **Bad** |
| Verification tab | 4 | ≥9 with OPEN holds listed honestly | holds closed | **Weak (honesty OK if holds listed)** |
| Quality floor (`closure_honesty`) | 2 | ≥9 | ship gate separate | **Bad** |
| Drawing gates (product front view, CAD families) | punch-list open | all pass | same | **Weak** |
| Blender ontology / mesh authenticity | 48/48, score 1.0 | ≥0.95 authenticity | photoreal + CAD families | **Good (Bar A visual)** |
| May we claim “ships / homologated”? | no (`ship_ok=false`) | still no until Bar B | only after HIL/Gerbers/dyno/CFD/FIA | **Correctly blocked** |

---

## 7. Two different “9/10” bars (do not mix)

1. **Bar A — Concept dossier 9/10:** Excel tabs and quality sections that can be closed without race hardware each reach ≥9, and a sceptical powertrain lead would trust the **workbook + drawings** as a serious concept pack.  
2. **Bar B — Race / homologation:** Hardware-in-the-loop, supplier Gerbers, dyno correlation, FIA port coordinates, cold-plate CFD validation. **`ship_ok` must stay false** until these exist. Raising narrative scores must never fake Bar B.

This plan drives **Bar A** hard and keeps Bar B honestly OPEN.

---

## 8. Detailed fix plan (every half-done + missing item)

### Work package 1 — Finish literature extraction (still reading papers)

| Action | Done when | Owner script / rule |
|---|---|---|
| Keep extract-loop running until `fulltext_without_claims` ≈ 0 (or each residual marked empty/corrupt) | Gate stats show ~0 without claims | `fpk-extract-loop.py` |
| Re-run claim wiring after each extract batch | `leaves_with_claim_refs` rising every cycle | `fe-front-wire-fpk-claims.py` |
| Improve matching beyond exact leaf id (aliases / synonyms) without inventing DOI-less “peer” claims | ≥180 / 207 leaves with refs | extend wiring matcher + proveCatch |
| Sol audit of DB usefulness each major cycle | Sol says knowledge useful; ship still FAIL | `fe-front-sol-db-audit.py` |

### Work package 2 — Make fluid / heat engines actually run in the twin

| Action | Done when | Owner |
|---|---|---|
| Install CoolProp, fluids, ht into the **same** Python the stamp uses | import succeeds | env / `.venv` |
| Re-stamp cold-plate / bus path | `engine_used=true` for CoolProp, fluids, ht | `fpk_physics_engines` stamp |
| ProveCatch: handbook-only stamp fails the “live engines” bar | guard green | selftest |

### Work package 3 — Calculations + Overview (Excel trust)

| Action | Done when | Owner |
|---|---|---|
| Every tool result used on Overview emits a worked calculation capture | calc-coverage ≥95% | tool plan + Excel builder |
| Fix 6 failing Overview invariants (power / torque / gear quantities used) | 111/111 pass | power-chain reconcile consumers |
| Rebuild Excel and re-score | Calculations ≥9, Overview ≥9 | `build-excel-export.py` |

### Work package 4 — Bill of materials densify (concept-complete, not fake release)

| Action | Done when | Owner |
|---|---|---|
| Emit one bill line per purchasable / makeable physics leaf (or honest roll-up with child schedule) | **120–200** lines | emitter / densify from physics tree |
| Attach material grade from literature or OPEN “grade TBD” with basis | material modifiers count much greater than 0 | DB consumer → modifiers |
| Split real part number / TBD (detailed design) / make-to-print | no silent fake MPNs | part reality + honesty |
| Attach dimensions from concentric geometry + geometry claims | most structural lines have mm | geometry stamp → modifiers |
| Prices where forge-truth has them; else blank + reason | not all zero without explanation | material_prices / cascade cache |

### Work package 5 — Printed circuit boards (honesty first)

| Action | Done when | Owner |
|---|---|---|
| Implement required channels **or** change disposition to commercial modules with proof | implemented counts = required **or** disposition not “bespoke token board” | atopile generator / architecture |
| Fix U1 vs U2 placement overlap | no overlap error | placement |
| Footprint coverage ≥80% of claimed electronic parts | coverage bar | component resolution |
| Keep `NOT_FABRICATION_READY` until supplier Gerbers + HIL | honesty stamp | gate 38 / homologation |
| PCB tab ≥9 as **honest engineering draft** (not fake fab-ready) | scorecard | Excel PCB sheet rules |

### Work package 6 — Drawings and general arrangement

| Action | Done when | Owner |
|---|---|---|
| Product / instrument general arrangement leads with **front** view (not plant plan) | drawing-gates punch-list clear | `generate_drawing_set` / GA |
| More verified CAD families than a single instrument board proxy | CAD coverage gate pass | CadQuery / forge-truth CAD |
| Keep Blender ontology coverage ≥48/48 and authenticity ≥0.95 after each rebuild | stamps green | `build_universal_scene` |

### Work package 7 — Narrative / closure honesty / verification

| Action | Done when | Owner |
|---|---|---|
| Closure honesty section lists every race OPEN with owner | quality `closure_honesty` ≥9 | honesty ledger |
| Design narrative (mission / why-now / modules) complete | `design_narrative` ≥9 | prose emitters |
| Verification tab scores high **because holds are explicit**, not because holds vanished | Verification ≥9 | verification sheet |

### Work package 8 — Council-guided autonomous loop (Sol + GLM + Kimi)

| Cadence | What happens |
|---|---|
| Every work cycle | Run deterministic fixes from the active punch list |
| After each package or every N minutes | Build a digest (scoreboard + diffs) |
| Call **Sol + GLM 5.2 + Kimi K3** (Opus 5 if Kimi fails) | Each returns REJECT/CONDITIONAL + ordered punch list |
| Merge council punch list | Prefer FATAL/HIGH that map to a source rule |
| Execute next fixes | Never set `ship_ok=true` from council praise |
| Log to `_autonomous/STATUS.md` in plain language | Operator can read without jargon |

**Campaign stop for Bar A:** every closable tab ≥9 **and** homologation still honestly FAIL-closed.  
**Do not stop for Bar B** in this loop — those need hardware.

---

## 9. Ordered execution sequence (autonomous)

```
1  Ensure extract-loop + literature continuous still alive
2  Scoreboard snapshot (this file’s tables → JSON)
3  Council pass 0 (Sol + GLM + Kimi) → ordered punch list
4  WP2 fluid engines install + stamp          ← unblocks honest thermal
5  WP1 claim wire improve + re-wire          ← literature into leaves
6  WP3 calc-coverage + Overview invariants   ← Excel trust
7  WP5 PCB channels or disposition           ← stop lying with pipeline.ok alone
8  WP4 bill of materials densify             ← 84 → 120–200
9  WP6 drawing gates                         ← product front GA
10 WP7 honesty / narrative / verification
11 Rebuild Excel + tab scorecard
12 Council pass N — if still REJECT on Bar A items, loop to worst package
13 Stop only when Bar A met; leave Bar B OPEN
```

---

## 10. Explicit non-goals (so we do not fake progress)

- Do not pirate paywalled papers.
- Do not paste Lucid / Atieva CAD; gold photos are a training check only.
- Do not set `ship_ok=true` without hardware-in-the-loop, supplier Gerbers, dyno, and cold-plate validation.
- Do not inflate the bill of materials with hundreds of fake fasteners to “look complete.”
- Do not call a 6-component token board “fab ready.”

---

## 11. Success metrics (Bar A)

| Metric | Target |
|---|---|
| Tab scorecard minimum (non-mirror) | ≥9 on every closable tab |
| Quality floor | ≥9 |
| Physics leaves with literature | ≥180 / 207 |
| Bill of materials lines | 120–200 with materials + dims |
| Calculations coverage | ≥95% |
| Overview invariants | 111/111 |
| PCB | honest draft ≥9 **or** commercial-module disposition with proof |
| CoolProp / fluids / ht in twin | `engine_used=true` |
| Homologation / ship | still false |

Executor: `scripts/fe-front-half-done-closure-loop.py`  
Ensure / keep-alive: extend `fe-front-autonomous-ensure.sh` to spawn this loop.
