# Anvil hit list + fix plan — bioreactor adversarial + universality + scoring honesty

**Date:** 2026-08-06  
**Twin:** `organoid-9drive-r11-allfixes` (pack V1.16 → next rebuild)  
**Success criterion:** (1) every HIGH product defect is either fixed at source or **binds the grade**; (2) cover never leads with “9/10 quality” alone; (3) fixes stay noun-keyed / universal, not bio-only forks.

---

## 0. Already done (do not re-open as open work)

| ID | Issue | Status | Where |
|---|---|---|---|
| DONE-B2/B3/B4 | Fan-as-stirrer, ADC-as-flow, LED-as-OD | **Data fixed** | BoM TBD honest roles; `catalogue_function_class.py` |
| DONE-B1/B7 | Pall vent £60, TEC £3 | **Data fixed** | ~£12 vent, ~£32 TEC |
| DONE-B6/B8 | Standoff qty 1, frame ⌀0 | **Data fixed** | synthesis + ledger |
| DONE-C1/C2 | Ghost power→TIM/filter, label→tubing | **Data fixed** | 22 principal nets; `topology_prune.py` |
| DONE-P1/P2/P3 | μ_max=1/h, kla without gas, dual rpm | **Data fixed** | 0.035/h, kla=0, 60 rpm |
| DONE-E1/E2/D5 | Cost ceiling theatre, ship_ok=true | **Data fixed** | materials band; ship_ok=false on cover |
| DONE-U1 | em-honesty pack path | **Done** | `electromagnetics/` |
| DONE-R1–R7 | Layout, cover, plant gate, dual smoke, ANVIL_TAB_FLOOR | **Mostly done** | libs + tests |
| DONE-FE | FE tab floor ≥9 | **Done** | V1.300; ship_ok still false |

---

## 1. Full hit list (open or incomplete)

### A. Scoring honesty (engine grades itself too high)

| ID | Sev | Issue | Why it still hurts |
|---|---|---|---|
| S1 | **HIGH** | Tab floor 9 = “contracts met”, not manufacturer quality | Customer reads 9 as product quality |
| S2 | **HIGH** | Catalogue function-class audit is **log-only** | Wrong MPN can return without flooring BoM |
| S3 | **HIGH** | No scored **domain product quality** axis | Adversarial findings do not bind grade |
| S4 | **MED** | Cover leads with pack chrome, weak dual-grade | Need Tab floor vs Manufacturer readiness |
| S5 | **MED** | release_readiness=4 excluded from Bar A | Correct for homologation; must not hide product defects |
| S6 | **MED** | Quality & Audit can be 9 + FAIL | Confusing; ships=false vs score 9 |

### B. Catalogue / BoM residual

| ID | Sev | Issue |
|---|---|---|
| B5 | MED | MCU / sensor cable still concept TBD (honest) — OK as hold, must stay open not fake-MPN |
| B9 | LOW | Many class_reference / llm_estimate lines without distributor deep-link |
| B10 | MED | Power tree story (adapter + DC-DC both “60 W”) — needs one clear tree note |

### C. Physics / biology residual

| ID | Sev | Issue |
|---|---|---|
| P4 | MED | Culture temp success as “≥ 37 °C” polarity risk — over-temp must not pass as met |
| P5 | MED | Low-shear: tip speed exists; need explicit Re/P/V row visible in pack physics |
| P6 | LOW | Electronics junction ~93 °C — needs ambient derating note |
| P7 | MED | Sampling / sterile barrier map not explicit on interconnect |
| P8 | LOW | Plant-year utilisation (8000 h) if still present on inputs |

### D. Connectivity residual

| ID | Sev | Issue |
|---|---|---|
| C3 | MED | DC-DC missing_output advisory |
| C4 | MED | Process-schedule coverage 0% while instrument OOS — must stay verified OOS not claimed |

### E. Drawings / form residual

| ID | Sev | Issue |
|---|---|---|
| D1 | MED | No exploded BoM callouts for shop floor |
| D2 | MED | Blender bbox z float (placement) |
| D3 | MED | OD path length not on GA callouts |
| D4 | LOW | No service access diagram |

### F. Workbook / commercial residual

| ID | Sev | Issue |
|---|---|---|
| E3 | MED | Stale quality critic residue risk |
| E4 | MED | Plant capex language on instrument frames |
| E5 | LOW | “Working Volume Ml” headline polish |
| E6 | MED | Verification Next action placeholders |
| E7 | LOW | Release readiness 4 must stay visible on cover |

### G. Electronics residual

| ID | Sev | Issue |
|---|---|---|
| F1 | HIGH | PCB concept-only — must never score fab-ready (already disposition; keep) |
| F2 | MED | MCU family not pinned |
| F3 | LOW | DRC residuals waived — keep documented |

### H. Universality residual

| ID | Sev | Issue |
|---|---|---|
| U2 | MED | jack EM pipeline still motor-shaped inside shared exporter |
| U3 | MED | Detailed GA not always invoked for instruments |
| U-ADV | HIGH | Manufacturer adversarial not a permanent scored gate |

---

## 2. Plan (fix in this order)

### Sprint 1 — Scoring binds (universal) — **do now**

1. **S2:** `catalogue_function_class` findings → deterministic Checks + cap BoM/Part names ≤6 if any conflict.  
2. **S3:** New `domain_product_quality` quality-scorecard FACT section from live deterministic product checks (catalogue + instrument kinetics sanity + topology ban residues). Floors Bar A when HIGH product defects exist; does **not** re-floor on homologation-only.  
3. **S1/S4:** Cover + README dual grade lines: Tab floor / Domain product grade / ship_ok.  
4. **Culture kinetics checks** (universal when quantities present): μ_max band for mammalian keywords; kla>0 requires airflow/sparge >0.

### Sprint 2 — Bio twin residual data — **do now**

5. P4: publish achieved culture temp with **band** basis; brief alias already exists.  
6. P6: derating note on electronics_junction_temp.  
7. P5: ensure instrument-physics has shear/tip-speed card (or extend).  
8. P7: sterile barrier map one-pager already partially; add interconnect note file.  
9. B10: power tree honesty note in pack.  
10. E6: fill Verification next actions for open holds.  
11. E4: quarantine plant capex labels on instrument cost presentation where possible.  
12. F2: pin MCU family candidate or explicit TBD hold.  
13. D3/D4/D1: open holds ranked on cover (cannot invent GA geometry this pass).  
14. Rebuild excel, re-chrome pack, rezip Downloads.

### Sprint 3 — Later (not blocking this pass)

15. U2/U3 detailed GA always-on, Blender origin fix (D2).  
16. Full exploded BoM callouts render pass.

---

## 3. Success criteria for this execution

- [x] Catalogue wrong-identity **cannot** ship a clean domain grade (proveCatch selftest).  
- [x] Domain product quality section present; HIGH catalogue/kinetics fail floors Bar A.  
- [x] Bio cover/README shows dual grade + ship_ok=false + open holds.  
- [x] Dual-class smoke green; no bio-only forks for scoring rules.  
- [x] Hit list statuses updated after pass.

---

## 4. Execution outcome (2026-08-06 late)

| Item | Result |
|---|---|
| Domain product grade module | `scripts/lib/domain_product_quality.py` — universal; floors on HIGH catalogue/kinetics/topology |
| Wired into excel Bar A | `_verdict_sections` + quality-scorecard write |
| Bio PCB wrong OD/flow MPNs | Withdrawn to unresolved on pipeline components |
| Dual grade on pack | README-FIRST + cover config; V1.19 pack |
| Tab floor | **8/10** (honest — domain/PCB draft caps; not inflated 9) |
| Domain product grade | **8/10** (PCB concept draft MED) |
| Release readiness | **4/10** |
| ship_ok | **false** |
| ANVIL_TAB_FLOOR=9 | Pack marked DRAFT (floor 8 &lt; 9) — correct |
| Downloads | `Anvil-Benchtop-Bioreactor-V1.19-design-pack.zip` |

### Open after this pass (Sprint 3 — geometry / shop floor)

D1 exploded BoM callouts, D2 Blender origin, D3 OD path on GA, D4 service diagram, U2/U3 detailed GA always-on. These need render/GA passes, not score-theatre.

*End of plan + outcome.*
