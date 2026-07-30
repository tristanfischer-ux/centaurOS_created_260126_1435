# JLR FE Front FPK — Promised vs Done + 100% Gap-Closure Plan

**Date:** 2026-07-29 ~22:17 UTC (refreshed live)  
**Twin:** `out/formula-e-front-mgu-20260729-1432/`  
**Bar:** Adversarial — what was *promised* vs what was *delivered*, then how to close every closable gap without greenwash.

**Honesty non-negotiable:** `ship_ok=false` until HIL / dyno / supplier Gerbers / FIA XYZ / CFD close. Literature, Sol, and models never close those.

---

## 0. How to read “100%”

| Domain | Honest 100% | Fake 100% (forbidden) |
|---|---|---|
| **OA literature** | Every Unpaywall/OpenAlex OA PDF URL downloaded + scraped + FTS; paywalls marked `no_oa` / `download_failed`; every ≥5k fulltext has ≥1 claim or explicit `no_claim` | Claiming IEEE/Elsevier paywalled PDFs; inventing PDFs |
| **Executable DB** | Materials / formulas / geometry in DB + Python+TS consumers + growth ledger + Sol PASS on knowledge | Prove-script SELECT only; ship PASS |
| **FFF morphology** | Principals compound/CAD (mesh authenticity ≥0.95, prefer 1.0); topology 17/17; proveCatch still fires on adversarial missing edges | Cuboid proxies; Lucid STEP paste; proveCatch silent |
| **Physics engines** | CoolProp + fluids + ht actually used in twin stamp (`ok=true`) | Selftest-only with live stamp `ok=false` |
| **Excel / PCB** | DRAFT with LIVE formulas; PCB fitness FAIL + NOT_FAB_READY honest | SHIPS / FUNCTIONALLY VERIFIED without HIL |
| **Homologation** | Race holds OPEN with evidence trail | Closing DEC-00x without artefacts |

---

## 1. What you asked for (layered promises)

| # | Promise (user intent) | Acceptance test |
|---|---|---|
| A | Full whitepapers downloaded, scraped, searchable, used — not abstracts-only; prove it | OA pending→0 or `oa_exhaustion`; fulltext proof artefact; FTS; consumers |
| B | Sol audit of formulas (installed, working, Anvil-called); prove categorically | Sol formula audit PASS on packs; CoolProp/fluids/ht live |
| C | Materials / formulas / geometry in DBs; DBs used and growing; prove; Sol audit | DB knowledge proof USEFUL; growth ledger; Sol DB PASS; ship FAIL |
| D | Review for half-jobs / laziness; fix them | Soft-gate removed; extract/download split; detach spawn; no forkbomb |
| E | Once literature is 100% (honest OA), audit FFF readiness, write overnight plan, execute | Hard-L → Phase A audit → Phase F → Sol; morning artefacts |
| F | Keep going autonomously / overnight again after soft-gate mistake | `FPK_LITERATURE_HARD=1`; overnight waits on pending |
| G | **This ask:** review promised vs done; plan to fill all gaps 100% | This document |

---

## 2. Live snapshot (2026-07-29 ~22:17 UTC)

| Metric | Value | vs honest 100% |
|---|---|---|
| lit docs (`formula_e_front_mgu`) | **1279** | Catalogue OK |
| fulltext ≥5k / PDFs on disk | **~312–325 / ~321** | ~24–25% of catalogue — **OA not exhausted** |
| `fpk_extracted_claims` | **~3493** | Floors for F/M/G met |
| formula / material / geometry claims | **217 / 317 / 243** | Floors OK |
| fulltext without claims | **~235–248** | Far from ≤5 |
| pending OA download | **~1002** | **P0 blocker** |
| no_oa marked / download_failed | **36 / ~47** | Honest remainder growing |
| mesh authenticity (FFF audit stamp) | **1.0** (residual []) | Hold; re-verify post next stamp |
| topology routed | **17/17** | proveCatch still names critical edges (honesty OK) |
| claims wired / leaves with refs | **~1586–1658 / ~57–59** | Wired floor met; densify further |
| physics engines live stamp | **`ok=false`** | Selftests pass; CoolProp/fluids/ht not stamped live |
| excel overnight step | **exit 1** | Incomplete |
| `ship_ok` | **false** | Correct |
| hard-L overnight | **RUNNING** (`gate=False`, soft_fff=false) | Correct now |
| soft-gated overnight earlier | Ran L→A→F at pending≈1108 | **Process failure — fixed by HARD=1** |

**Workers alive now:** overnight hard-L, literature-continuous, extract-loop, download batch, ontrack, watchdog, ensure-loop.

---

## 3. Promised vs done matrix

### 3.1 Literature (Promise A) — ~25% of OA corpus / pipeline ~70%

| Deliverable | Status | Evidence |
|---|---|---|
| Harvest topics + DOI seed + OpenAlex ingest | **DONE** | `fpk-literature-topics*.json`, harvest log ~1823 rows |
| Schema / FTS / migrate | **DONE** | `migrate-fpk-literature-schema.py` |
| Unpaywall → PDF → pdftotext → DB | **DONE (partial corpus)** | `download-fpk-oa-fulltext.py`; `~/.forge-truth/fpk-pdfs/` |
| Continuous OA drain | **RUNNING** | `fpk-literature-continuous.py` (`--extract-batch 0`) |
| Claim extract loop | **RUNNING** | `fpk-extract-loop.py` + flock |
| Active proof artefact | **DONE (stale vs live)** | `JLR-FE-FRONT-FPK-LITERATURE-ACTIVE-PROOF.*` |
| Wire claims → physics leaves | **DONE (partial match)** | `fe-front-wire-fpk-claims.py`; ~1752 unmatched earlier |
| OA pending exhausted | **NOT DONE** | pending ≈1002 |
| `literature-continuous-final.json` | **MISS** | Exhaustion not reached |
| Every fulltext has claims/`no_claim` | **NOT DONE** | ~235–248 without claims |

**Verdict:** Pipeline is real and growing. **Honest OA 100% is NOT met.** Soft-gate overnight claimed gate=True with pending>1000 — that was a broken bar (now `FPK_LITERATURE_HARD=1`).

### 3.2 Sol / formulas / engines (Promise B) — ~60%

| Deliverable | Status | Evidence |
|---|---|---|
| Sol formula audit (16 packs) | **DONE** | `fe-front-sol-formula-audit.py`; packs listed in DB proof |
| CoolProp MEG / engine selftests | **DONE** | selftests_pass=true |
| Live twin stamp CoolProp/fluids/ht | **FAIL** | overnight `physics_engines` exit 1; `ok=false` |
| Anvil-called proof in chain path | **PARTIAL** | Engines runnable; twin stamp not green |

### 3.3 DB knowledge growing + used (Promise C) — ~80% closable / ship must stay FAIL

| Deliverable | Status | Evidence |
|---|---|---|
| Executable writeback | **DONE** | `writeback-fpk-executable-knowledge.py` |
| DB knowledge prove | **DONE / USEFUL** | `JLR-FE-FRONT-FPK-DB-KNOWLEDGE-PROOF.json` |
| Python + TS consumers | **DONE** | `fpk_db_consumer.py`, `fe-front-stamp-fpk-db-reads.ts` |
| Growth ledger | **DONE** | claims 1298→~3493; fulltext 127→~312+ |
| Sol DB audit | **DONE (re-run after hard L)** | artefact present; refresh post-exhaustion |
| ship_readiness FAIL | **CORRECT** | Must remain FAIL |

### 3.4 Half-job / ops fixes (Promise D) — ~90%

| Failure | Fixed? |
|---|---|
| Overnight ↔ ensure forkbomb | **YES** — overnight never calls ensure; flock |
| IDE shell reaps nohup | **YES** — `fe-front-spawn-detached.py` |
| OpenAlex 429 storm | **YES** — cooldown + slower sleep |
| Extract TimeoutExpired kills overnight | **YES** — extract-loop owns LLM |
| Soft gate before OA done | **YES now** — `FPK_LITERATURE_HARD=1` (earlier soft runs were the miss) |
| Competing extract processes | **YES** — flock |

### 3.5 Overnight L→A→F→C (Promise E/F) — Phase L in progress; A/F ran early under soft gate

| Phase | Promised | Actual |
|---|---|---|
| L hard OA | Wait pending=0 or `oa_exhaustion` | **In progress** (hard); earlier soft runs skipped wait |
| A deep FFF audit | After hard L | Baseline hard-L audit written; **post-exhaustion audit not yet** |
| F first-principles | After A | Soft run executed F early; physics_engines+excel failed |
| C Sol challenge | After F | Partial / needs post-hard-L re-run |
| Morning summary | `overnight-summary.json` | Exists from soft run — **must rewrite after hard L** |

### 3.6 FFF / geometry / topology / PCB / Excel

| Item | Done? | Gap |
|---|---|---|
| Concentric geometry + selftest | **YES** | Analytical cylinders; deepen CadQuery families |
| First-principles ontology | **YES** | Stamp more literature provenance on leaves |
| Mesh authenticity compounds | **YES (audit 1.0)** | Re-stamp after any blender drift; prefer forge-truth STL |
| Topology 17/17 | **YES** | Keep proveCatch firing on adversarial removals |
| PCB pipeline | **PARTIAL** | Hygiene ≠ fab; fitness FAIL; Gerbers/HIL OPEN |
| Excel DRAFT LIVE | **PARTIAL** | Overnight excel exit 1; raise LIVE formula coverage |
| Race holds / HIL / dyno / FIA / CFD | **OPEN by design** | Never close overnight |

### 3.7 Autonomous 1–9 plan (council-revised)

| REQ | Status (ontrack) | Notes |
|---|---|---|
| REQ-1,3–7 | PROVISIONAL_DONE | Provisional stamps — not homologation |
| REQ-2 | **OPEN** | Literature / OA density (matches LIT-PENDING) |
| REQ-8,9 | DONE | Evidence / red-team artefacts exist |

---

## 4. Gap register (close these for “100% of closable work”)

### P0 — blocking honest literature / process

| ID | Gap | Exit criterion | Owner script / action |
|---|---|---|---|
| **G-LIT-1** | ~1000 OA pending | `pending_download==0` **OR** continuous `stop_reason=oa_exhaustion` + final JSON | Keep continuous; do not soft-gate |
| **G-LIT-2** | No `literature-continuous-final.json` | File written with exhaustion reason + counts | continuous exit path |
| **G-LIT-3** | Soft-gate pollution in overnight-summary | New summary only after hard gate true | overnight rewrite |
| **G-SHIP-1** | Temptation to greenwash | `ship_ok=false` + Sol ship FAIL forever until HIL | no code sets true |

### P0/P1 — claims coverage

| ID | Gap | Exit criterion | Action |
|---|---|---|---|
| **G-LIT-4** | ~235+ fulltext w/o claims | `fulltext_without_claims ≤ 5` (or honest `no_claim` marks) | extract-loop until drain |
| **G-LIT-5** | Stale literature proof | Re-run prove after G-LIT-1+4 | `fe-front-prove-literature-active.py` |

### P1 — FFF / physics / wire / Excel / Sol

| ID | Gap | Exit criterion | Action |
|---|---|---|---|
| **G-FFF-1** | Post-hard-L deep audit missing | Fresh `JLR-FE-FRONT-FPK-FFF-AUDIT.*` after L | overnight Phase A |
| **G-PHYS-1** | CoolProp/fluids/ht live `ok=false` | Stamp `ok=true` (or honest OPEN reason in twin) | Fix `fe-front-run-physics-engines.py` root cause + re-run |
| **G-WIRE-1** | ~1752 unmatched claims; leaves-with-refs ~59 | Raise leaves-with-refs (≥100 target) + reduce unmatched | Improve wire map; re-wire after claim drain |
| **G-EXCEL-1** | Overnight excel exit 1 | Rebuild DRAFT; LIVE formula gate; ship_ok false | stamp excel live plan + rebuild |
| **G-SOL-1** | Sol DB/formula audits stale vs post-L corpus | Re-run both; knowledge PASS / ship FAIL | `fe-front-sol-*-audit.py` |
| **G-TOPO-1** | proveCatch vs “17/17” narrative confusion | Document: routed=17/17; adversarial proveCatch still fires | Keep; clarify in audit |
| **G-PCB-1** | Overlaps / unresolved words / fitness FAIL | Honest NOT_FAB_READY retained; fitness_fail_reason stamped | No false PASS |

### P2 — deepen authenticity (after P0/P1)

| ID | Gap | Exit criterion | Action |
|---|---|---|---|
| **G-CAD-1** | Compounds ≠ forge-truth STL for all roles | Residual roles list with family or OPEN | Seed/import families where exist |
| **G-STD-1** | No dedicated standards scrape floor | Standards claims or harvest log for IEC/ISO/FIA refs | Bounded OA standards harvest |
| **G-BOM-1** | Hollow procurement fields | Real MPN/mfr/price where catalogue exists; TBD explicit | DB cascade only — no invent |
| **G-EM-1** | No FEA / dq maps | OPEN with disposition — do not fake | Stay OPEN |
| **G-THERM-1** | CFD cold-plate OPEN | Stay OPEN; analytical ΔT stamped | proveCatch refuses ship |

---

## 5. 100% closure plan (execute in order)

### Phase 0 — Keep hard-L alive (now → until gate)

1. Do **not** set `FPK_LITERATURE_SOFT` / soft parallel.  
2. Ensure: continuous + extract-loop + overnight + ensure-loop (already up).  
3. Monitor hourly: `literature-progress.json` — pending↓, fulltext↑, claims↑.  
4. If workers die: `bash scripts/fe-front-autonomous-ensure.sh` with `FPK_LITERATURE_HARD=1`.

**Exit 0:** `gate.ok==true` with `oa_pending_exhausted` true **without** soft_fff, **or** continuous final with `oa_exhaustion` and pending==0 for resolvable OA.

### Phase 1 — Literature completion (closable 100%)

| Step | Action | Pass |
|---|---|---|
| L1 | Drain OA pending | pending→0 or exhaustion file |
| L2 | Drain claims | fulltext_wo_claims≤5 |
| L3 | Mark remaining paywalls/fails | detail stamps only |
| L4 | Re-prove literature active | proof JSON/MD refreshed |
| L5 | Writeback executable knowledge | growth ledger +Δ |
| L6 | Wire claims | wired↑; unmatched↓; leaves≥100 preferred |

### Phase 2 — Post-L FFF audit (Phase A)

1. Snapshot stats into audit.  
2. Mesh authenticity stamp (expect ≥0.95).  
3. Topology / PCB / physics-engine / excel / ship honesty.  
4. Emit ranked gaps (must show G-PHYS / G-EXCEL if still red).  
5. Artefact: `JLR-FE-FRONT-FPK-FFF-AUDIT.{md,json}` schema `v1-post-hard-L`.

### Phase 3 — First-principles FFF execution (Phase F)

| Step | Script | Pass |
|---|---|---|
| F1 | `fpk_first_principles.py --selftest` | 0 |
| F2 | `fpk_concentric_geometry.py --selftest` | 0 |
| F3 | `fpk_mesh_authenticity.py --stamp` | score≥0.95 |
| F4 | `fpk_topology.py --stamp` | 17/17 + proveCatch fires |
| F5 | DB prove + claim wire | USEFUL |
| F6 | `fe-front-run-physics-engines.py` | **fix until ok=true or documented OPEN** |
| F7 | Blender re-render if form changed | form-meshes + heroes |
| F8 | Excel DRAFT rebuild | exit 0; ship_ok false |

### Phase 4 — Sol challenge (Phase C)

1. `fe-front-sol-formula-audit.py`  
2. `fe-front-sol-db-audit.py`  
3. Expect: knowledge/formula PASS; **ship FAIL**  
4. Append to `overnight-summary.json` (hard-L edition)

### Phase 5 — Evidence trail + morning checklist

- `_autonomous/overnight-summary.json` (hard-L)  
- growth ledger final entry  
- STATUS.md note: LITERATURE_OA_COMPLETE or LITERATURE_INCOMPLETE  
- Never set `ship_ok=true`

### Phase 6 — Intentionally remaining OPEN (not overnight-closable)

These are **done when honestly OPEN**, not when green:

- DEC-001 SiC die identity  
- DEC-006/010 dyno / overspeed  
- DEC-008 HIL  
- DEC-009 supplier Gerbers  
- FIA port XYZ  
- CFD cold-plate  
- FEA / dq maps  
- Homologation / SHIPS  

**100% of Phase 6 = structured OPEN + evidence trail + ship blocked.** Closing them without hardware is a fail.

---

## 6. Definition of done for “fill all gaps 100%”

### Closable (must be green)

- [ ] OA pending exhausted or `oa_exhaustion` final artefact  
- [ ] fulltext_without_claims ≤ 5  
- [ ] Literature active proof refreshed  
- [ ] DB prove USEFUL + growth ledger shows ↑  
- [ ] Physics engines live stamp ok=true (or twin-stamped OPEN with reason)  
- [ ] Excel overnight step exit 0; DRAFT; ship_ok false  
- [ ] Post-hard-L FFF audit written  
- [ ] Sol formula + DB audits re-run; ship FAIL  
- [ ] Mesh ≥0.95; topology 17/17; claim wire floors held  
- [ ] Hard overnight-summary rewritten (no soft_fff celebration)

### Non-closable without hardware (must stay OPEN)

- [ ] ship_ok false  
- [ ] HIL / dyno / supplier Gerbers / FIA XYZ / CFD OPEN  
- [ ] Sol ship_readiness FAIL  

---

## 7. ETA (honest)

| Work | Rough time |
|---|---|
| OA pending ~1000 @ ~20–25 OK/batch, sleep + Unpaywall | **several hours → overnight** |
| Claim extract ~235 docs @ LLM batch 12 | **hours (parallel with download)** |
| Phase A+F+C after gate | **~1–2 h** |
| Phase 6 holds | **indefinite until lab/supplier** |

---

## 8. Immediate operator actions (do not wait)

1. Leave hard-L overnight running.  
2. Do not relaunch soft overnight.  
3. If pending stalls 2h with no ↓: inspect continuous log for 429 / idle stop; relaunch ensure.  
4. After gate: force Phase A→F→C (overnight continues automatically).  
5. Morning: run §6 checklist before any “literature 100%” claim.

---

## 9. Bottom line

| Promise | Completion |
|---|---|
| Literature OA 100% | **~25% corpus / pipeline built — NOT done** |
| Sol formulas + engines live | **~60% — engines stamp still red** |
| DB used + growing + Sol | **~80% — re-audit after L** |
| Ops half-job fixes | **~90%** |
| Overnight hard L→A→F→C | **L in progress; earlier soft run polluted summary** |
| Homologation / ship | **Correctly 0% closed (OPEN by design)** |

**Next single priority:** finish **G-LIT-1 + G-LIT-4** under hard gate, then Phase A→F→C without soft shortcuts. Everything else is either follow-on or intentionally OPEN.
