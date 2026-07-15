# Colorimeter finish plan — before NinjaPCR

**Status:** Claude Code terminal stopped ~23:10 BST 2026-07-12 after diagnosing Connection-trace; **no live chain**.  
**Best artefact:** `out/colorimeter-20260712-2137` (complete cold run, `PCB_STAGE=1`, exit shipped DRAFT).  
**Authoritative handover:** `docs/plans/COLORIMETER-TO-9-EVERY-TAB-HANDOVER.md` §8  
**Do not start NinjaPCR until the bar in §4 below is met (or Tristan explicitly waives).**

---

## 1) What the overnight session achieved

### Product / ontology (real progress)
- Classifies as `optical_instrument` + `isInstrumentDevice=true`
- Module spine is instrument-shaped: photodiode, LED source, MCU, display, cuvette holder, battery, DC fuses — not a BESS/plant skid
- Plant tabs honestly NA’d where checkable (Electrical single-line, P&ID fluid, Line & velocity, Process schedules, HVAC)
- Many industrial ghosts killed earlier in the day (Banner battery pin, lid interlock, DN80 water, PCIe≠USB, polymer enclosure, etc.)

### Gold-informed TRAINING (partial)
- Gold opened (BOM.xlsx + showcase); **no gold MPN paste** into emitters
- **Render form-factor fixed** (`6e6b09e8f`): wide-flat handheld + display/buttons/cuvette port; 2137 exterior/hero SIGHTed as benchtop colorimeter (not black cabinet)
- **Device-scale price ceiling** (`3473e877b`): Engine B plant-scale estimates capped; dry-run £576→~£208 — **in code only, not baked into 2137** (dossier still OEM transfer **£1,109**, Sense-check still RADICAL)

### PCB plumbing
- PCB stage runs; DRC **0 violations**; fab zip present
- Off-board triage + top/bottom board views on tab
- Still **ENGINEERING DRAFT**: fitness ~2.x, mostly `function_class`, not Open Colorimeter board architecture (small LED PCB + COTS MCU/detector)

### Process hygiene
- Killed overlapping chain trees; one clean 2137 run completed (~22:55)
- Empty `out/colorimeter-20260712-2307/` = aborted/never-started follow-up
- Loop board has **36 undisposed defects** blocking clean re-launch until disposed
- `TRAINING-gap-list.md` from overnight plan §1 was **never written**

### Honest scorecard (2137 workbook / `tab-scorecard.json`)
- **Floor 0 / DRAFT** — does not ship
- Fail tabs (&lt;8): Connection trace, Sense-check, PCB, Part names, Renders, Quantities, Calculations, BoM, Assembly, Drawings (+ Executive Summary / Q&A as **floor mirrors**)
- Punchlist can disagree (shows softer floor) — **trust workbook/json + SHIP GATE stdout**

---

## 2) Where it stopped (exact next code fix)

Diagnosed and scoped in handover; **not implemented**:

**Connection trace = 0** — 5 `parts-ledger` connectivity concerns:
1. DC Input Fuse — `missing_input`
2. Input Fuse — `missing_input`
3. Polyfuse Resettable — `missing_input`
4. Power Indicator LED — `orphan_instrument`
5. Battery Charge Management — `missing_input`

**Root:** `deriveInstrumentTopology` in `scripts/lib/derive-topology.ts` (~power spine) never assigns a role to series-protection parts / power-indicator loads; charge-mgmt orphans when no typed `power_in` source.

**Fix (universal):** `power_protection` role (fuse/polyfuse/TVS/ESD/reverse-polarity/thermal cutoff/overcurrent) wired **source → protection → rail**; power-indicator as rail→load; if `sources` empty, synthesise USB/DC-input as `power_in`.  
**Guard:** `parts_ledger.py` on colorimeter state → **0 connectivity_concerns**.  
**Then:** dispose board items + one clean chain so Sense-check gets the cost ceiling bake-in.

---

## 3) Remaining work to finish Open Colorimeter (ordered)

### Gate 0 — unblock the loop (5–15 min)
1. Dispose `out/colorimeter-board.json` defects that are fixed or advisory (`python3 scripts/lib/loop_board.py dispose …`) — especially render/cost/benchmark notes that aren’t blockers
2. Confirm no stray `serial-design-chain` PIDs

### Wave 1 — make the floor move (must do)
| # | Work | Evidence of done |
|---|---|---|
| 1 | Implement Connection-trace power-spine fix + proveCatch | `parts_ledger` concerns = 0 on frozen or new state |
| 2 | One clean `PCB_STAGE=1` chain (bake cost ceiling + topology) | New `out/colorimeter-*`; Sense-check not RADICAL; OEM £ in low hundreds |
| 3 | SIGHT dossier.xlsx + hero/exterior vs showcase | Still looks like colorimeter; cost class closer to gold ~£100–150 COTS |

### Wave 2 — replica content (required before “device done”)
| # | Work | Why |
|---|---|---|
| 4 | Kill remaining non-colorimeter BoM (Interface Membrane £60, Banner residue, absurd battery) at **pin/emitter** | Gold has keypad≠membrane skid; COTS pack |
| 5 | PCB architecture toward gold: small LED module + COTS MCU/detector disposition; raise fitness (real MPNs/packages) | DRC-clean placeholders ≠ replica |
| 6 | Part-names / drawing-tag coverage for device tags | Tab still ~3–4 |
| 7 | Calculations coverage (Beer–Lambert / optical worked-calcs) + Quantities provenance | Eval checklist + tabs &lt;8 |
| 8 | Assembly steps derived from real build order | Tab &lt;8 |
| 9 | Renders interior (fill/protrusions) — exterior mostly done | Vision critic / Renders ~4 |

### Wave 3 — ship bar (Yuri colorimeter closed)
| # | Bar |
|---|---|
| 10 | Honest **floor ≥8 every non-NA tab** (mirrors follow) — no NA-dodges |
| 11 | Eval checklist items present in dossier narrative (blanking, cal persistence, 10 mm path, stray light, LED stability) |
| 12 | Tag run `TRAINING/REFERENCE-AIDED`; optional later: **black-box freeze with gold hidden** for scored Yuri number |
| 13 | Short written closeout in harness Terminal reply: best `out/`, scores, residual gaps |

### Explicitly defer / do not block forever
- Perfect gold MPN identity (PyBadge 4624 / TSL2591 1980) via **catalogue growth**, not hardcoded paste
- Class-graph neighbour bootstrap (deep root for membrane birth) — fix if membrane still births after Wave 2 pins
- NinjaPCR / next ladder device

---

## 4) Definition of “colorimeter finished — OK to move on”

A skeptical engineer opening the best `out/colorimeter-*` would say **Open Colorimeter-class**, and:

- [ ] Floor ≥8 (workbook/json), ship_ok or explicit Tristan waiver with listed residuals  
- [ ] Exterior render = handheld colorimeter (already ~true on 2137)  
- [ ] Connection concerns = 0; Sense-check not RADICAL  
- [ ] BoM £-scale, photometer spine, no membrane/Banner/plant ghosts  
- [ ] PCB story honest: either usable small-board + COTS disposition **or** clearly ENGINEERING DRAFT with fitness explained (prefer first)  
- [ ] Harness Terminal reply filled; board defects disposed or routed  

Until then: **stay on colorimeter**.

---

## 5) Immediate restart command (for the next terminal session)

```bash
# 1) Read docs/plans/COLORIMETER-TO-9-EVERY-TAB-HANDOVER.md §8
# 2) Implement derive-topology power_protection + proveCatch
# 3) Dispose board blockers
# 4) Launch ONE chain:
PCB_STAGE=1 CHAIN_SKIP_BENCHMARK_NET=0 bash scripts/run-loop.sh \
  briefs-loop/yuri_open_colorimeter.md out/colorimeter-board.json colorimeter
# 5) SIGHT new out/ vs this finish plan §4
```

Fast harness for Python-only scorers against **2137** is OK for Connection-trace iteration **after** a topology change is validated on a chain that re-emits topology into state — topology lives in the chain; don’t expect a pure Excel rebuild to fix Connection trace without re-deriving edges.
