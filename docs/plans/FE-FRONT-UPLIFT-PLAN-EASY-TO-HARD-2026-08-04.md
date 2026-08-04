# FE Front FPK — Uplift plan (easy → hard)

**Date:** 2026-08-04  
**Twin:** `out/formula-e-front-mgu-20260729-1432`  
**Author:** Grok (execution owner)  
**Council:** Grok 4.5 · Sol (GPT-5.6) · MiniMax-M3 · **Qwen 3.8 Max** (`qwen/qwen3.8-max`)  
**Aim:** Lift concept quality, Jack impression, kit completeness screens, and FE visual authenticity — **without** minting `ship_ok` or inventing Bar B hardware.

---

## 0. Honest starting scores (why this plan exists)

| Dimension | Score | What “lift” means |
|---|---:|---|
| Concept FPK under assumptions | 7.5–8/10 | Keep honesty; polish Jack spine |
| Live EM honesty at freeze | 8/10 | Protect Path B + dual bars; fix lagging consumers |
| Full kit completeness (inv/caps/NVH/IF) | **4/10** | Analytical screens + named OPENs, not fake BOMs |
| FE visual authenticity | **5/10** | Blender kit language that reads race FE, not generic industrial |
| Homologation readiness | **1/10** | Stay 1 until dyno/partners — **do not fake lift** |

**Non-goals (entire plan):** `ship_ok=true`, supplier Gerbers invented, chassis XYZ invented, dyno maps invented, continuous 250 kW thermal greenwash.

---

## 1. Sequencing doctrine

```
HARDWARE / PARTNER  ──────────────────────────────────────────►  never block software waves
        ▲
        │  Bar B asks only (parallel track, no invention)
        │
SOFTWARE WAVES (this plan)
  W0  Protect truth & fix lagging labels     ← MUST FIRST
  W1  Jack impression spine (easy, high value)
  W2  Kit completeness screens (easy–medium analytical)
  W3  FE visual authenticity (medium, Blender)
  W4  Deeper multiphysics screens (harder, still software)
  W5  Partner-gated only (document; do not invent)
```

**Why W0 first:** If Jack docs still quote 81.56 / 0.65× as the live freeze story while Path B is 122.1, every later pretty picture digs the honesty hole deeper.

**Why Jack before Blender deep work:** One-page verdict + dual bars already exist as figures; packaging them as the pack spine is hours, not days. Visual FE authenticity is days.

**Why caps/inverter screens before modal FEA:** You can name capacitor ripple/ESL budget from bus physics without chassis XYZ. Modal mount work needs interfaces you do not have yet.

---

## 2. Wave 0 — Protect truth (do first, ~0.5–1 day)

| ID | Task | Effort | Lifts | Done when |
|---|---|---|---|---|
| **W0.1** | Refresh **bar-B register `live_artefacts`** so mean/required match Path B + dual bars (stop quoting 81.56) | S | Honesty, kit completeness scorecard | `check_bar_b_register_freshness` + artefact numbers = Path B |
| **W0.2** | Jack/ABD prose pass: lead with Path B + dual bars; demote baseline 0.65× to “pre-DEC-009 lineage” | S | Jack impression | ABD + any Jack xlsx summary no longer misleads |
| **W0.3** | Tracker §4b addendum: Bar A software close stands under DEC-008/009; **FE SIGHT-candidate = Path B**; duty_screen still open | S | Process clarity | Tracker paragraph + DEC-009 residual already partial |
| **W0.4** | Coherence re-run after any restamp | S | Deliverable trust | `check_deliverable_coherence --enforce` green |

**Recommendation:** Execute W0.1–W0.4 as a single commit series before any new physics screens.

---

## 3. Wave 1 — Jack impression spine (easy, high value, ~1–2 days)

| ID | Task | Effort | Lifts | Done when |
|---|---|---|---|---|
| **W1.1** | **One-page verdict PDF/PNG** at pack root: architecture, duty assumption, Path B mean, dual bars, ship_ok false, top 8 opens | S | Jack | `em-honesty/00-verdict-one-pager.png` + pack root copy |
| **W1.2** | **Open-by-design one-pager** (Bar B B1–B10 + DEC-001…007 OPEN) | S | Jack, kit completeness | Same pack folder |
| **W1.3** | Ensure every pack rebuild auto-includes `em-honesty/` (**already wired**) + add verdict to MANIFEST top | S | Jack | Build path tested |
| **W1.4** | System **single-line / block diagram**: motor · gearbox · inverter · DC-link · cold plate · HV · coolant | M | Jack, kit story | Drawing or matplotlib schematic in pack |
| **W1.5** | “How to read this pack” 1 page for Jack (concept vs homologation) | S | Jack | PDF page |

**Recommendation:** W1.1 + W1.2 first (same half-day). W1.4 next.

**Council ask:** Does the verdict page risk over-claim if Path B is only sign-consistent?  
**Default answer:** Caption must say *SIGHT-candidate / not duty_screen / not ship_ok* — already doctrine.

---

## 4. Wave 2 — Kit completeness screens (easy → medium analytical, ~3–5 days)

These lift the **4/10 kit score** without pretending Bar B is closed.

### 2A — Power electronics (biggest Jack-visible hole)

| ID | Task | Effort | Done when |
|---|---|---|---|
| **W2.1** | **DC-link capacitor concept screen**: C_min from voltage ripple at design current/PWM class; RMS ripple current; volume envelope inside MCU box; ESL budget vs laminated bus target | M | New kit-case JSON + twin quantities + OPEN residual named |
| **W2.2** | **Inverter class screen tighten**: map DEC-001 SiC class to loss seed, cold-plate land, mass share of 32 kg; explicit “no MPN” | M | `inverter_packaging_*` extended or sibling artefact |
| **W2.3** | **Busbar / loop inductance budget** (analytical): max ESL for switching; flag double-pulse as Bar B | M | Screen + OPEN |
| **W2.4** | Gate-drive / control PCB honesty sheet: what boards exist, DRC, NOT_FAB, missing Gerbers | S | One page in pack |

### 2B — Thermal clarity (you are stronger here — make it Jack-readable)

| ID | Task | Effort | Done when |
|---|---|---|---|
| **W2.5** | Thermal **storyboard**: continuous vs intermittent magnet temp (159 vs 99); DEC-008 decision graphic | S | Figure in em-honesty |
| **W2.6** | Coolant loop one-pager: flow, ΔT, cold-plate Δp seeds; what flow bench must prove (B6) | S | Pack figure |
| **W2.7** | Iron loss corner table (3.9–8.5 kW class) as Jack-facing uncertainty, not hidden | S | Workbook/pack note |

### 2C — Mechanical / vibration (honest partial)

| ID | Task | Effort | Done when |
|---|---|---|---|
| **W2.8** | **Torque-ripple load sheet** from Path B min/max |T| → shaft alternating component estimate | S–M | Artefact |
| **W2.9** | Bearing reaction **order-of-magnitude** under ripple (analytical) + OPEN for life calc | M | Artefact |
| **W2.10** | Rotor FoS screening summary card (1.74) labelled screening not release | S | Pack figure |
| **W2.11** | Explicit **NVH/modal OPEN** register row (no fake modal results) | S | DEC or open-by-design |

### 2D — Driveline

| ID | Task | Effort | Done when |
|---|---|---|---|
| **W2.12** | **Gear ratio writeback** at 24k (named open in tracker) | M–H | Twin ratio + mesh check screen |
| **W2.13** | Gear-oil screen status one-pager (what is cleared analytically vs B7 CFD) | S | Pack |

**Recommendation order inside W2:**  
W2.5 → W2.1 → W2.4 → W2.6 → W2.8 → W2.2 → W2.12 → rest.

---

## 5. Wave 3 — FE visual authenticity (medium, ~1–2 weeks calendar)

Goal: Blender reads as a **Formula E front regen kit**, not a generic industrial pod.

| ID | Task | Effort | Done when |
|---|---|---|---|
| **W3.1** | Visual brief: reference real FE MGU-K / front regen kit cues (casing splits, connectors, cooling, inverter as box) | S | Written brief + image refs (no IP theft — style cues only) |
| **W3.2** | **Kit assembly hierarchy** in Blender: motor · reducer · inverter housing · capacitor region · cold plate · HV connector · coolant QD · sensors | H | Parts-manifest updated |
| **W3.3** | Re-render hero / ghost / exploded / catalogue from kit hierarchy | H | New pack renders |
| **W3.4** | Bay envelope ghost (343×259×267) translucent box | M | One render |
| **W3.5** | Side-by-side “concept industrial vs FE kit” internal QA | S | Reject generic look |

**Recommendation:** Start W3.1 during W2.1 (parallel). Do not block W1/W2 on Blender.

**Dependency:** Cap/inverter volume from W2.1–W2.2 feeds W3.2 box sizes (even if approximate).

---

## 6. Wave 4 — Harder software multiphysics (only after W0–W2)

| ID | Task | Effort | Notes |
|---|---|---|---|
| **W4.1** | Denser FE torque map / multi-angle (still `torque_reliable=false`) | H | Improves ripple story; does not close B2 |
| **W4.2** | OpenFOAM cold-plate if ports frozen | H | Needs geometry commitment |
| **W4.3** | Housing modal **if** mount points exist | H | Else skip |
| **W4.4** | Second-solver EM spot-check (optional Elmer/ngsolve) | H | Only if Jack asks for cross-check; risk of second number |
| **W4.5** | Full Excel rebuild + scorecard after W2 stamps | M | Coherence gate |

**Recommendation:** Prefer W4.1 and W4.5 over W4.4. Do **not** install a second EM stack for vanity.

---

## 7. Wave 5 — Partner-gated (document + ask; never invent)

| ID | Bar B | Action now |
|---|---|---|
| W5.1 | B1/B2 Dyno + torque_reliable | Draft dyno request matrix from Path B operating point |
| W5.2 | B10 / DEC-007 lap log | One-page “what CSV columns we need” |
| W5.3 | B5 chassis XYZ | ICD types list already; refresh ask |
| W5.4 | B4 Gerbers / module MPN | Keep NOT_FAB; ask sheet |
| W5.5 | B6/B7 thermal/oil benches | Ask sheet from W2.6/W2.13 |
| W5.6 | B9 release FEA | Keep screening FoS labelled |

**Homologation score stays ~1/10 until W5 returns data.** That is correct.

---

## 8. Explicit recommended execution order (what I will do)

### Phase A — this week (easy wins stack)

1. **W0.1** bar-B register live_artefacts refresh  
2. **W0.2** Jack/ABD prose Path B lead  
3. **W0.3** tracker addendum  
4. **W1.1** verdict one-pager  
5. **W1.2** open-by-design one-pager  
6. **W1.3** pack MANIFEST top-link  
7. **W2.5** thermal storyboard figure  
8. **W2.1** DC-link capacitor concept screen (first real kit-completeness lift)  
9. **W2.4** PCB honesty sheet  
10. **W1.4** system block diagram  

### Phase B — next (medium)

11. **W2.6–W2.8** coolant + ripple load  
12. **W2.2–W2.3** inverter class + ESL budget  
13. **W3.1** visual brief  
14. **W2.12** gear ratio writeback (if unblocked)  
15. **W3.2–W3.3** Blender kit pass (largest visual lift)  

### Phase C — later / harder

16. **W4.1** denser map  
17. **W4.5** Excel full rebuild  
18. **W5.*** partner ask pack  
19. Optional W4.2–W4.4 only with evidence need  

---

## 9. Success metrics (lift without lying)

| Metric | Now | Target after Phase A | Target after Phase B |
|---|---|---|---|
| Jack can find verdict in &lt;60 s | No | **Yes** | Yes |
| Live FE story = Path B | Twin yes; some artefacts lag | **All consumer artefacts** | Same |
| Capacitor design presence | None | **Named screen + OPEN** | Screen in pack |
| Inverter story | Packaging partial | **Class + mass + OPEN MPN** | Box in Blender |
| FE visual authenticity | ~5/10 | 5.5 (figures only) | **7+/10** kit look |
| Kit completeness | ~4/10 | **5.5/10** | **6.5–7/10** screens |
| Homologation | 1/10 | **1/10** | **1/10** until partners |
| ship_ok | false | **false** | **false** |

---

## 10. Risks & anti-patterns

| Risk | Mitigation |
|---|---|
| Pretty Blender hides open PE | Verdict + open list always first pages |
| Capacitor screen becomes fake BOM | Class/volume only; no MPN without DEC |
| Second EM solver confuses Jack | Ban unless cross-check requested |
| Duty_screen greened in software | Forbidden (W0 doctrine) |
| Scope explosion into full vehicle | Stay front FPK bay envelope |

---

## 11. Council brief (what seats must answer)

1. Is **W0 before W1** correct, or should Jack spine ship first?  
2. Is **W2.1 capacitors** the right first kit-completeness wedge?  
3. Should **Blender (W3)** interleave earlier for Jack optics?  
4. What is the **highest-risk over-claim** in Phase A?  
5. What would you **cut** if only 5 days of agent time remain?  
6. Homologation score: confirm **must not** be “lifted” by software alone.  

Council transcript: `docs/plans/evidence/fe-front-uplift-council-2026-08-04.json`

---

## 12. Immediate next action after council

Execute **Phase A item 1 (W0.1)** unless council blocks with a higher-priority reorder.

---

*End of plan body — council results appended below after run.*

---

## 13. Council result (2026-08-04) — four seats

| Seat | Model | Verdict | Conf. |
|---|---|---|---:|
| Grok | grok-4.5 | **PROCEED_WITH_CHANGES** | 82 |
| Sol | gpt-5.6-terra | **PROCEED_WITH_CHANGES** | 94 |
| MiniMax | minimax-m3 | **PROCEED_WITH_CHANGES** | 78 |
| **Qwen 3.8** | **qwen/qwen3.8-max** | **PROCEED_WITH_CHANGES** | 87 |

**Unanimous:** proceed; do not BLOCK. Homologation score **must stay ~1/10** until partners. Capacitors **are** the right first kit wedge. `ship_ok` stays false.

Full JSON: `docs/plans/evidence/fe-front-uplift-council-2026-08-04.json`

### 13.1 Consensus amendments (LOCKED into execution)

1. **W0 complete before any Jack spine publish** — include **W0.4 coherence** in Phase A (Grok/Qwen/MiniMax).  
2. **Verdict page must print dual-bar arithmetic explicitly:** 122.1 clears 104.1 (~+18 N·m / 1.17×); misses 125.2 (~−3.1 N·m / 0.975×); duty_screen false; ship_ok false; SIGHT-candidate only.  
3. **Capacitor screen (W2.1) = ranges + assumption table + sensitivity**, not a single fake part; caption “no committed volume / no MPN / no lifetime claim” (MiniMax/Sol/Qwen).  
4. **Blender:** only **W3.1 brief + W3.2-lite envelope boxes** may run parallel with W2; **no hero re-render** until W2.1/W2.2 envelopes exist (3 of 4 seats; Sol allows lite only).  
5. **Downgrade score targets** so Jack cannot read “kit 7/10” as hardware ready: Phase A kit ~**5/10** analytical-definition; hardware/partner closure separately **1–2/10** (Grok/Sol).  
6. **Draft partner asks as each screen lands** (Sol) — do not wait for Wave 5 batch.  
7. **Add to Phase A if time:** requirements/assumptions ledger stub; dual-bar gap on verdict; W1.5 how-to-read; mass budget roll-up before box freeze.  
8. **Highest over-claim risk (all seats):** pretty verdict / cap box / Blender read as validated FE kit while Bar B open.

### 13.2 LOCKED Phase A order (execute next)

```
1  W0.1  bar-B register live_artefacts → Path B numbers
2  W0.2  ABD/Jack prose lead with Path B + dual bars
3  W0.3  tracker addendum (FE SIGHT-candidate vs A-DUTY close)
4  W0.4  coherence enforce
5  W1.1  verdict one-pager (with dual-bar arithmetic + non-claims)
6  W1.2  open-by-design / Bar B one-pager (closure-oriented columns)
7  W1.5  how to read this pack (concept vs homologation)
8  W1.3  MANIFEST top-link + pack include check
9  W2.5  thermal storyboard (159 vs 99, DEC-008 labelled)
10 W2.1  DC-link capacitor screen (ranges, not BOM)
11 W2.4  PCB honesty sheet
12 W1.4  system block diagram (energy + control boundaries)
13 W3.1  visual brief (parallel OK from step 10)
14 W2.2  inverter class + mass/volume reconciliation vs 32 kg
```

### 13.3 If only 5 agent-days

Keep: W0.1–W0.4, W1.1, W1.2, W1.5, W2.5, W2.1, W2.4.  
Cut: full Blender hero pass, gear mesh, denser FE map, OpenFOAM, second EM solver, bearing life claims.

---

## 14. Recommendation to Tristan

**Adopt this plan as amended by council.** I will start at **W0.1** unless you stop me.

Homologation and full kit hardware scores stay low **on purpose** until Jack/partners return data — software lifts **definition and honesty**, not race readiness.
