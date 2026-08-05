# FE Front for Jack — Takeover plan (this session)

**Date:** 2026-08-05  
**Owner after approval:** this Grok Build session (`019fd07c…`)  
**Repo:** `~/Developer/CentaurOS-oxccu-efuel`  
**Twin:** `out/formula-e-front-mgu-20260729-1432`  
**Customer spine:** `_motor_stack/jack_em_pack/` + design-pack zip (latest V1.295)  
**Success criterion (software):** honest dual-bar story + Sprint 2 EM evidence package + PCB **draft-review** grade card + V1.296 pack with coherence green — **`ship_ok` still false**.

---

## 0. What I found (handover from other terminals)

### Other Grok Build (`019fc6e7…`, PID 6717, ttys000)

| Fact | Detail |
|---|---|
| Scale | ~77 user turns, 8 compactions, last active ~06:52 today |
| Done | Bar A falsifiability workflow; Path B DEC-009; dual-bar stabilize; uplift phases A–E; fieldplot pack; **EM Sprint 1** grade card ≥ B+/A− |
| Last commit | `2eceae5f6` — *EM grade Sprint 1 — identity, voltage circle, grade card ≥ B+* |
| Interrupted | Tristan: *do Sprint 2, all scores A− min* → plan written → then *get PCB to A−* → then *hi*. **Sprint 2 not executed** (only plan artefact) |
| Sprint 2 plan path | `…/_discipline/EM-SPRINT2-TO-A-MINUS-PLAN-2026-08-04.md` |

### Live EM grade card (Sprint 1, on disk)

| Layer | Grade | Still open |
|---|---|---|
| Toolchain & method | **A−** | mesh sensitivity stamp |
| Kit-case Path B story | **A−** | `torque_reliable` / dyno |
| Map / MTPA depth | **B+** | FOC-matched spine + MTPA locus |
| Voltage / FW | **B+** | pure-FE λ (not only airgap-B), FW envelope |
| Partner field viz | **A−** | rotor animation polish |
| Release / homologation | **B+_readiness** | dyno, ICD, Gerbers — **not ship** |

### Twin honesty (stabilize stamp 2026-08-04)

| Quantity | Value |
|---|---|
| Path B kit-case mean | **122.100 N·m** (SIGHT-candidate, `torque_reliable=false`) |
| Architecture duty bar (24k / 250 kW) | **104.099 N·m** → ratio **1.173× clear** |
| Binding conservative bar | **125.215 N·m** → ratio **0.975× fail** |
| Product torque | **133.85 N·m** option-screen product (not kit-case FE) |
| Pre-DEC-009 lineage | 81.56 N·m retained as **lineage only** |
| `ship_ok` | **false** |

### PCB (live `pcb-stage.json`)

| Fact | Value |
|---|---|
| Boards | 2 (`traction_control`, `traction_gate_drive`), routed, pipeline complete |
| DRC | **0** violations (real KiCad 10.0.4) |
| Channels required = implemented | gate×6, desat×6, phase sense×3, resolver, CAN, LV rails×3, isolation |
| Design-fitness (workbook) | **7.6/10** |
| Flags | `NOT_FABRICATION_READY=true`, `forgeDraftOnly=true`, `ship_ok=false` |
| VERIFY2 risk | banner can skim as *FAB-READY* despite *UNPROVEN* |

### Other processes (not co-owning twin writes now)

| Process | Role |
|---|---|
| Other Grok PID 6717 | Same twin historically; **idle since Sprint 2 plan write** — must not race writers |
| Claude PID 70197 (s007) | cwd `$HOME`; long-lived — not currently twin-writing |
| tmux `em-fia-pipeline`, `fe-redteam-v6` | Old; no active FE solve attached |
| Cursor agent workers | CentaurOS main + phantm — **out of scope** for this twin |

### What is **not** the problem for this pass

- Bar A engine defects already closed (falsifiability 0/169, thermal agreement, iron loss honesty).  
- Jack pack already has 47 artefacts (verdict, dual bars, kit screens, fieldplots, grade card).  
- Gap is: **Sprint 2 unfinished**, **grades not yet re-earned**, **PCB grade + banner honesty**, **pack not at V1.296**.

---

## 1. Council consultation (2026-08-05)

**Profile:** diverse · 3 seats · live OpenRouter  
**Seats:** `moonshotai/kimi-k3` · `openai/gpt-5.6-sol` · `z-ai/glm-5.2`  
**Raw log:** `out/formula-e-front-mgu-20260729-1432/_discipline/takeover-council-2026-08-05-raw.log`

### Consensus (2+ seats = binding)

| Finding | Seats |
|---|---|
| **P1 honesty audit is a hard gate before Sprint 2 polish** | all 3 |
| **Do not pre-commit “all A−”** — grades are outcomes of cited artefacts | all 3 |
| **Binding miss 0.975× + `torque_reliable=false` must lead Jack spine** (cannot bury under grades) | all 3 |
| **PCB A− only as draft-review readiness**, never fab; keep `NOT_FABRICATION_READY` | all 3 |
| **7.6 fitness is not A−** without real fitness lift or honest B+ hold | Kimi + GLM (Sol: predeclared rubric + independent rescore) |
| **Voltage B+→A− needs explicit Sprint 2 evidence** (λ_FE + FW envelope), not hand-wave | GLM + Sol + Kimi |
| **No `ship_ok`, no dyno invent, no Gerbers invent, no DEC unfreeze** | all 3 |
| **V1.296 only after evidence closed** | all 3 |
| **Rotor GIF: ship it, zero grade weight** | Kimi (+ Sol: must match geometry) |

### Council-driven revisions to Tristan’s “all A−” ask

1. **Commit to work packages**, not guaranteed letter grades.  
2. Award **A− only where Sprint 2 produces a cited delta**; if a layer fails the pre-frozen rubric, **keep B+** and say so.  
3. PCB label must read **“PCB draft-review readiness”**, not bare “PCB A−”.  
4. If fitness stays &lt; ~8.0 under frozen rubric → **honest B+** for PCB, not grade inflation.

---

## 2. Recommended plan (for approval)

### Success criterion

After this pass, a second engineer can open **V1.296** and see:

1. Dual bars + Path B 122.1 + binding fail + `torque_reliable=false` on **every** Jack-facing torque surface.  
2. Sprint 2 artefacts on disk (λ_FE multi-witness, FW envelope, map spine card, mesh stamp, rotor GIF) with hashes/provenance.  
3. EM grade card re-scored **per layer** against a rubric frozen **before** rescore; any layer without evidence stays prior grade.  
4. PCB grade card: draft-review axis + fabrication **F** + banners intact.  
5. `check_deliverable_coherence --enforce` green; **`ship_ok=false`**.

### Non-goals (hard stops)

- `ship_ok=true` / homologation lift  
- Invented dyno, Gerbers, chassis XYZ, measured correlation  
- Forcing `torque_reliable=true`  
- Unfreezing DEC-008 / DEC-009  
- Moving fitness threshold to make 7.6 “pass”  
- Concurrent writers from other Grok / Claude on this twin  
- Editing `em_fia_front_kit_case.py` to green the duty screen (Cursor HOLD R8 still stands unless you override)

---

### Phase P0 — Ownership lock (≈15 min)

1. Declare this session sole twin writer (inbox note + discipline stage open).  
2. Snapshot: `git status`, HEAD, twin mtimes, inventory of `jack_em_pack` + grade card.  
3. Pin invariants in a one-line guard check: `ship_ok=false`, `NOT_HOMOLOGATED`, `torque_reliable=false`, DEC-008/009 present.  
4. **Do not** kill other Grok unless you ask — but **do not** start FE/PCB writers there.

**Gate:** ownership note + baseline hash list committed to `_discipline/`.

---

### Phase P1 — Honesty audit (gating, ≈1–2 h)

1. Sweep twin + all 47 Jack artefacts + latest pack for stale **81.56-as-live**, lone **1.17×**, missing **0.975×**, missing `torque_reliable=false`, PCB banner skim risk.  
2. Fix **sources** (stabilize consumers / renderers / captions), not hand-edit PNGs.  
3. Confirm dual-bar stabilize numbers still match Path B artefact hashes.  
4. Freeze **EM + PCB rubrics** (written JSON/MD) *before* any rescoring.

**Gate:** zero unresolved honesty findings; rubrics frozen; dual-bar present on spine header artefacts.

---

### Phase P2 — Sprint 2 EM evidence (main, hours)

Execute work packages from existing plan; **grade after evidence**:

| WP | Work | Intended layer effect |
|---|---|---|
| S2.1 | Pure-FE λ from field (multi-witness; explain if FE circuit λ off-scale vs airgap-B / torque-implied) | Voltage/FW toward A− |
| S2.2 | FW envelope (speed vs usable bus / back-EMF; DEC-009 24k; DEC-008 duty respected) | Voltage/FW toward A− |
| S2.3 | FOC-matched map spine + dense@kit-angle consistency card + MTPA locus from available λ map | Map/MTPA toward A− |
| S2.4 | Mesh sensitivity stamp (e.g. n=32 vs n=64 field stats) | Toolchain confirm A− |
| S2.5 | Rotor-position GIF from existing sweep (label SIM-ONLY; **no grade weight**) | Viz polish |
| S2.6 | Rebuild `em_grade_card.json` **per layer** against frozen rubric | Outcome grades |

**Council rule:** if Voltage or Map still lack measurable delta → **leave B+**. Already-A− layers = confirmation pass only.

**Gate:** each claimed A− cites artefact path + hash + one-line delta vs Sprint 1.

---

### Phase P3 — PCB draft-review to A− *if earned* (parallel after P1, serial grade after P2 interface if needed)

1. Fix skim-misread banner language → **DRAFT / NOT FABRICATION READY / UNPROVEN IN HARDWARE** (no leading “FAB-READY”).  
2. Publish explicit **PCB grade card** axes:
   - draft-review readiness  
   - fabrication readiness = **F**  
   - composite: `NOT_FABRICATION_READY`  
3. Re-run DRC + channel/BOM/positions consistency (VERIFY2 residual items).  
4. Attempt software-honest fitness lift **7.6 → ≥8.0** only via real design-fitness findings closure (not threshold move).  
5. If fitness still &lt; threshold under frozen rubric → **report B+** with written justification (council preference).

**Gate:** banners honest; grade card scoped; DRC 0 still true; no Gerber “release” claim.

---

### Phase P4 — Pack V1.296 + Jack spine (after P1–P3)

1. Rebuild design pack + workbook from twin (not manual patch of V1.295 in place).  
2. Auto-include `em-honesty/` + new Sprint 2 + PCB grade artefacts.  
3. `check_deliverable_coherence --enforce`.  
4. Changelog: every real delta; lead spine with **binding miss + dual bars**, not grade wallpaper.

**Gate:** coherence green; pack SHA matches workbook where required.

---

### Phase P5 — Finish council + commit (staged only)

1. Finish-discipline councils (start already pattern in repo).  
2. Checklist gate: `ship_ok=false`, `NOT_HOMOLOGATED`, `NOT_FABRICATION_READY`, `torque_reliable=false`, dual bars, no invented dyno/Gerbers.  
3. Commit only intentional paths (scripts + twin JSON/PNG grade artefacts + pack stamp); avoid bulk junk / husky noise unless needed.

**Gate:** staged diff reviewed; finish council PROCEED or honest HOLD documented.

---

## 3. Recommended sequence (≤12 steps)

1. P0 lock + baseline inventory  
2. Freeze EM/PCB A− rubrics (what A− means **without** dyno/fab)  
3. P1 honesty sweep of twin + 47 Jack artefacts  
4. Fix sources so dual bars + binding fail + `torque_reliable=false` propagate  
5. S2.1 λ_FE multi-witness + voltage circle update  
6. S2.2 FW envelope  
7. S2.3 FOC map spine + consistency card  
8. S2.4 mesh stamp + S2.5 GIF  
9. P3 PCB banner + grade card + fitness attempt  
10. Independent per-layer rescore (no pre-filled A−)  
11. V1.296 pack + coherence enforce  
12. Finish council + staged commit  

---

## 4. Specific recommendations for Tristan to approve

| ID | Recommendation | Why |
|---|---|---|
| **R-A** | **Approve takeover by this session** as sole twin writer; leave other Grok open but non-writing (or you quit it) | Prevent dual-writer races that already cost a morning of stabilize work |
| **R-B** | **Approve P0→P5 sequence** with P1 as hard gate before Sprint 2 | Council unanimous |
| **R-C** | **Approve “evidence-first grades”** — I will aim for all EM layers A− and PCB draft-review A−, but I will **not invent** grades; B+ may remain where evidence is thin | Avoids greenwash vs your “all A−” wording |
| **R-D** | **Approve PCB scope = draft-review A−**, fabrication stays F / `NOT_FABRICATION_READY` | Matches your PCB ask without fab greenwash |
| **R-E** | **Hold `ship_ok=false`** and do not send Jack a “closed homologation” pack | Correct engineering position |
| **R-F** | **Optional later (not this pass):** refresh Jack email / note with Path B + dual bars + Sprint 2 artefacts | Only after V1.296 exists |
| **R-G** | **Do not** unfreeze DEC-008/009 or force `torque_reliable` in this pass | Binding 0.975× is a real residual for partners/dyno |

### Decision menu (reply with letters or “approve all”)

- **Approve all R-A…R-G as written** → I execute immediately.  
- **Approve but force letter grades to A− anyway** → I will push back once; only override in writing.  
- **PCB only first** → reverse P2/P3 order after P1 (council slightly prefers EM map before PCB channel re-check; either works if interfaces unchanged).  
- **Stop after honesty audit + pack restamp** → no Sprint 2 physics (narrower).

---

## 5. Effort & risk

| Risk | Mitigation |
|---|---|
| FE λ scale still ~10× low vs airgap-B (seen in Sprint 1) | Multi-witness + explicit “not used for absolute if out of band”; do not green voltage on broken λ |
| Other Grok wakes and writes twin | Ownership note; you can quit PID 6717 |
| Long FEMM runs | Prefer reusing fieldplot grids / dense artefacts; full FE only where needed |
| Fitness cannot reach 8.0 honestly | Hold PCB B+; still ship banner fix + grade card honesty |

**Estimate:** P0–P1 same morning; P2 main compute block; P3–P5 same day if FE reuses existing sweeps.

---

## 6. Files / commands (preview — not run until approved)

```text
Repo:  ~/Developer/CentaurOS-oxccu-efuel
Twin:  out/formula-e-front-mgu-20260729-1432
Key scripts likely:
  scripts/motor-stack/em_grade_sprint1.py  (extend → sprint2 or sibling)
  scripts/lib/stabilize_fe_front_honesty.py
  scripts/lib/check_deliverable_coherence.py
  scripts/fe-front-run-pcb-pipeline.ts / prove-pcb-fix-claims.py
  pack builder path used for V1.295
```

---

**Awaiting Tristan approval before any twin writes or Sprint 2 execution.**
