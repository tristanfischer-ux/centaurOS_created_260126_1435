# JLR FE Front FPK — Literature → First-Principles Form-Follows-Function OVERNIGHT

**Date:** 2026-07-29 / 2026-07-30 (overnight, refreshed 22:13 UTC)  
**Twin:** `out/formula-e-front-mgu-20260729-1432/`  
**Executor:** `scripts/fe-front-overnight-fff-fpk.py` + `fpk-literature-continuous.py` + `fpk-extract-loop.py`  
**Bar:** Jaguar Land Rover Formula E Head of Technology — adversarial  
**Geometry training check:** Hooley Phantom / PHANTM (params → derived mm → named meshes)  
**Honesty:** `ship_ok=false` until HIL / dyno / supplier Gerbers / FIA XYZ / CFD close — literature never closes those.

**Env (this night):** `FPK_LITERATURE_HARD=1` — do **not** soft-skip OA exhaustion. FFF Phase A/F after hard gate (or continuous `oa_exhaustion` with paywalled remainder marked).

---

## 0. Standing definition of “100% literature”

| Layer | Meaning of 100% | NOT 100% |
|---|---|---|
| **Catalogue** | Every harvested DOI has a `pretraining_spec_documents` row + harvest log | — |
| **OA fulltext** | Every DOI for which Unpaywall/OpenAlex returns a PDF URL is downloaded to `~/.forge-truth/fpk-pdfs/`, scraped (`extraction_status=fulltext`), FTS-indexed | IEEE/Elsevier paywalls without OA location |
| **Paywalled remainder** | Marked `no_oa_pdf_url` / `download_failed` in harvest `detail`; abstract remains searchable | Pretending we have the PDF |
| **Claims** | Every fulltext doc (≥5k chars) has ≥1 extracted claim row (or explicit `no_claim`) | Leaving hundreds of fulltext docs unwired |
| **Executable knowledge** | Materials / formulas / geometry / standards in DB + production consumers (Python + TS) | Prove-script-only SELECTs |
| **Accessible** | `lookupFpkClaims` / `fpk_db_consumer` / wire → physics leaves | Orphan JSON |

**Hard gate (code):** `literature_gate_met()` with `FPK_LITERATURE_HARD=1`:
- `pending_download == 0` **OR** continuous finished with `stop_reason=oa_exhaustion`
- `fulltext_5k ≥ 100`, `pdfs ≥ 100`, `claims ≥ 800`
- formula ≥40 / material ≥50 / geometry ≥30 claims
- `fulltext_without_claims ≤ 200` soft (LLM extract lag) while claims floor met; target ≤5 by morning

---

## 1. AUDIT — where we are NOW (2026-07-29 22:13 UTC)

### 1.1 Literature (honest numbers)

| Metric | Value | Verdict |
|---|---|---|
| FPK literature docs | **1268** | Catalogue large |
| Fulltext (≥5k) | **~274** | **~22% of catalogue** — NOT 100% OA |
| PDFs on disk | **~275** | Growing via continuous |
| Claims total | **~3457** | Strong; still lagging newest PDFs |
| Formula / material / geometry claims | ~215 / ~314 / ~241 | Floors met |
| Fulltext docs without claims | **~200** | Extract-loop draining (LLM-bound) |
| Pending Unpaywall candidates | **~1051** | **Overnight job #1** |
| Marked `no_oa_pdf_url` | 36 | Honest paywall |
| Marked `download_failed` | ~46 | Honest fail (403/broken links) — excluded from pending |
| Material prices rows | 20 | Canon + FPK grades present |

**Literature verdict:** Catalogue + DB consumers exist. **OA fulltext is NOT exhausted.** Do not claim 100% until pending→0 or continuous reports `oa_exhaustion`.

### 1.2 DB knowledge

| Item | Status |
|---|---|
| Executable canon (16 Sol packs → DB) | **PASS** (~58 formulas) |
| Materials in `material_prices` + claims | **PASS** |
| Geometry stamps → DB | **PASS** |
| Python + TS consumers | **PASS** |
| Wire floors | **PASS** (~1586 wired / ~57 leaves with refs earlier tonight) |
| Growth ledger (24h) | **PASS** (claims 1298→3457, fulltext 127→274+) |
| Sol `db_knowledge_verdict` | **PASS**; ship **FAIL** |

### 1.3 Form-follows-function / first principles

| Layer | Status | Gap |
|---|---|---|
| Product class / cold twin | Done | — |
| Concentric geometry | Nest/stack/MCU floors green | Analytical cylinders; deepen CadQuery families where forge-truth has STL |
| Blender traction layout | Compounds for prior residual cuboids | Re-verify after next full render if form-meshes drift |
| Mesh authenticity | **1.0 (22/22)** | Hold; proveCatch still fires on empty meshes |
| First-principles ontology | Seeded + selftest OK | Stamp literature provenance onto more physics leaves |
| Topology | **17/17 routed** | proveCatch still names critical edges in shadow — audit honesty |
| PCB | `pipeline_ok` true earlier | Fab/HIL unproven — stay DRAFT |
| Physics engines (CoolProp/fluids/ht) | Selftests pass; live stamp `ok=false` | Wire CoolProp MEG path into twin stamps |
| Excel | DRAFT ~V1.12 | LIVE formula gate; UNVALIDATED tags |
| Race holds / HIL / dyno / FIA / CFD | **OPEN** | Must stay OPEN |

**FFF verdict:** Mechanism morphology is now **compound/CAD-principled** at mesh score 1.0. First-principles FPK is still **not** homologation-ready. Remaining work is literature→claim→leaf densification, physics-engine live stamps, Excel honesty, and OA corpus completion — **not** greenwashing ship_ok.

---

## 2. Overnight phase plan (execute in order)

### Phase L — Literature to OA exhaustion (budget: ~7–8 h) — BLOCKING

1. Keep `fpk-literature-continuous.py` (`--extract-batch 0`, batch 25, sleep 20, max-hours 10).  
2. Keep `fpk-extract-loop.py` (batch 12, single-flight flock) until `fulltext_without_claims` collapses.  
3. Hourly: fulltext prove + `fe-front-prove-db-knowledge.py` + claim wire.  
4. **Exit L only when hard gate OK** (`pending==0` or continuous `oa_exhaustion`) **or** wall-clock L budget; if budget expires with pending>0, audit must say LITERATURE_INCOMPLETE.  
5. Artefacts: `literature-progress.json`, `literature-continuous-final.json`, fulltext proof, growth ledger.

### Phase A — Deep FFF audit (budget: 30 min) — AFTER L

1. Snapshot literature stats + hard/soft bars.  
2. Stamp mesh authenticity (expect ~1.0).  
3. Read geometry / topology / PCB / db usage / physics engines from state.  
4. Emit fresh `JLR-FE-FRONT-FPK-FFF-AUDIT.{md,json}` with ranked gaps (P0/P1/P2).  
5. Ranked gap template:

| ID | Severity | Example |
|---|---|---|
| LIT-PENDING | P0 if pending>0 at L end | Continue OA / mark fails |
| LIT-CLAIMS | P1 | Drain extract-loop |
| PHYS-ENGINES | P1 | CoolProp/fluids/ht live stamp |
| LEAF-WIRE | P1 | Raise leaves-with-refs |
| EXCEL-LIVE | P1 | Formula-only verdicts |
| CAD-FAMILY | P2 | Prefer forge-truth STL over compounds |
| SHIP | P0 forever until HIL | ship_ok stays false |

### Phase F — First-principles FFF execution (budget: remainder − 1 h)

| Step | Action | Success |
|---|---|---|
| F1 | `fpk_first_principles.py --selftest` | exit 0 |
| F2 | `fpk_concentric_geometry.py --selftest` | nest/stack/MCU |
| F3 | `fpk_mesh_authenticity.py --stamp` | score stamped; residual empty or listed |
| F4 | `fpk_topology.py --stamp` | 17/17 + honest proveCatch |
| F5 | DB prove + claim wire | USEFUL |
| F6 | `fe-front-run-physics-engines.py` | improve CoolProp/fluids/ht stamps |
| F7 | Blender re-render if form code changed | form-meshes + heroes |
| F8 | Excel DRAFT rebuild | newest xlsx; ship_ok false |

### Phase C — Sol challenge (budget: 15 min)

1. `fe-front-sol-db-audit.py --reuse-proof`  
2. Expect: `db_knowledge_verdict=PASS`, `ship_readiness_verdict=FAIL`  
3. Record in overnight-summary

### Phase X — Evidence trail

- `_autonomous/overnight-summary.json`  
- `JLR-FE-FRONT-FPK-FFF-AUDIT.md`  
- growth ledger + literature-progress  
- Never set `ship_ok=true`

---

## 3. SOURCE rules (no band-aids)

1. Fix geometry/form in `build_universal_scene.py` / `fpk_*.py` — not one twin’s JSON.  
2. Universal: `isInstrumentDevice` / traction form keys — no Lucid/product silhouette paste.  
3. Every gate: proveCatch + routed fix.  
4. Literature: Unpaywall OA only; mark failures; never invent PDFs.

---

## 4. Ops / anti-thrash (learned tonight)

| Failure | Fix |
|---|---|
| Overnight ↔ ensure forkbomb | Overnight never calls ensure.sh; flock |
| Shell reaps nohup | `fe-front-spawn-detached.py` |
| OpenAlex 429 | Cooldown + sleep + skip `download_failed` |
| Extract TimeoutExpired kills L | extract-loop owns LLM; overnight polls only |
| Soft gate before OA done | `FPK_LITERATURE_HARD=1` (default tonight) |
| Competing extracts | flock + kill orphans |

Monitor:
- `_autonomous/overnight.log`
- `_fpk_literature_continuous.stdout`
- `_autonomous/extract-loop.log`
- `_autonomous/literature-progress.json`

---

## 5. Autostart

```bash
rm -f out/formula-e-front-mgu-20260729-1432/_autonomous/overnight.hold
export FPK_LITERATURE_HARD=1 FPK_OVERNIGHT_HOURS=10 FPK_PHASE_L_HOURS=8
bash scripts/fe-front-autonomous-ensure.sh
```

---

## 6. Non-goals

- No Lucid CAD paste  
- No inventing FIA millimetres  
- No SHIPS greenwash  
- No “all papers on Earth” including paywalled PDFs  

---

## 7. Morning review checklist

1. `literature-continuous-final.json` / pending==0?  
2. `JLR-FE-FRONT-FPK-FFF-AUDIT.md` (post-L)  
3. `_autonomous/overnight-summary.json`  
4. Mesh score still ~1.0?  
5. `ship_ok=false`  
6. Sol ship FAIL  
7. Fulltext / claims / wired leaves deltas  

---

## 8. Expected morning state (honest)

| Bar | Target |
|---|---|
| OA pending | 0 or exhaustion accepted |
| fulltext_5k | ≫274 (as many OA as Unpaywall yields) |
| claims | rising; fulltext_wo_claims ≪200 |
| mesh | ≥0.95 (prefer 1.0) |
| ship_ok | **false** |
| Sol DB | PASS; ship FAIL |
