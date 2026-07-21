# PCB product work — how we actually get it working (2026-07-21)

**Audience:** Terminal (execution) + Tristan (decision).  
**Context:** Honesty gates (P1–P9 / Gate 38) **work**. Organoid **product** PCB does **not**. Firmware proof **exists** but is correctly **skipped** until design fitness is green.  
**Fixture truth:** `out/organoid-bioreactor-20260721-rebake2` (and rebake3 when landed).  
**Do after:** rebake3 SIGHT of the new dossier — then this lane (R5), not before.

---

## What “working” means (honest ceilings)

| Ceiling | When allowed |
|---|---|
| **ENGINEERING DRAFT** (current honest max) | Bespoke needed but fitness / placement / route / channels incomplete |
| **FAB-READY — UNPROVEN IN HARDWARE** | Per-board clean: fitness OK, placed, routed, DRC, Gerbers, Tier-0 firmware prove PASS, **no HIL** |
| **FUNCTIONALLY VERIFIED** | Only with current-revision **HIL** on populated boards — **not** this week’s target |

Do **not** chase a green PCB tab by bypassing fitness or faking stir/pump channels.

---

## Why it fails today (ordered chain)

```
ARCHITECTURE (3 boards planned → 1 KiCad project, multiBoardMerged=true)
  → COMPONENTS / CHANNELS (USB/ESD/flash/LED missing; OD/heater/stir/pump channels = 0)
  → PLACEMENT (pad overlaps ×4 — amplified by merged board)
  → ROUTE / DRC / GERBERS (never reached)
  → FIRMWARE (skipped: design_fitness_ok_false)
```

Fixing placement alone will not make it “work.”

---

## SOURCE sequence (do in this order)

### Step 1 — Stop merging boards (architecture)

**Bug:** `derivePcbArchitecture()` already wants `wet_lab_hat` + `od_optics` + `wet_actuation`, but the chain flatMaps all `requiredWordIds` into **one** `generateAtopileProject()` / one pipeline.

**Fix:** In `scripts/serial-design-chain-v2.tsx`, loop boards with `requiresKiCadDeliverable`; emit `pcb-project/<boardId>/`; run pipeline per board; store `state.pcb.boardPipelines[]`; aggregate `pipeline.ok` only if **every** required board is clean; `multiBoardMerged=false`.

**Done:** three project dirs; Excel/Gate38 see per-board truth.  
**proveCatch:** multi-board fixture → 3 dirs; word IDs do not cross boards; aggregate fails if one child fails.

### Step 2 — Close wet_lab_hat required roles (components)

**Missing today:** `firmware_storage`, `usb_power`, `esd`, `power_led` (plus unresolved_component findings).

**Fix:** curated verified candidates + pinouts (`pcb-verified-candidates.ts`, `pcb-manufacturer-pinouts.ts`) + generator resolution for those roles. USB ≠ PinHeader. Firmware may be **integrated MCU flash** only if architecture records that closure explicitly — never silent.

**Done:** no `partial_board_scope` for wet_lab_hat.  
**proveCatch:** USB→PinHeader fails; panel LED denylist still fails; good MCU+USB+ESD+LED fixture passes fitness slice.

### Step 3 — Real channel evidence (not name counting)

**Bug:** channels counted from placeholder `functionRequirements` → OD/heater/stir/pump stay 0.

**Fix:** generator emits `implementedChannels` with **basis + component word IDs**. Chain consumes that for fitness.

| Channel | Honest path |
|---|---|
| `heater_channel` | Pioreactor heater gold topology (TMP1075 + DRV5021 + sense R + FFC…) when those parts are on the board |
| `od_measurement_channel` | Source + detector/ADC path |
| `stir_channel` / `pump_channel` | Stay **unresolved / DRAFT** until real HAT electrical evidence exists — do **not** mint 1/1 |

**Done:** heater/OD can close; stir/pump honest DRAFT if unpublished.  
**proveCatch:** extend `pcb-pioreactor-wet-actuation-topology.test.ts` — DRV8876 as heater fails; stir=1 with no evidence fails.

### Step 4 — Placement per board

**After** Steps 1–3, re-run placement. Fix residual overlaps in `pcb_pipeline_runner.py` (`place_components` / `validate_placement`) with board-class keepouts — not by inflating a merged slab.

**Done:** each board reaches route (or structured placement fail with refs).  
**proveCatch:** per-board organoid-shaped fixture validates; merged three-board layout forbidden.

### Step 5 — Route / DRC / Gerbers + aggregate Gate38

Aggregate: every required board clean **and** `designFitness.ok` **and** `!multiBoardMerged`. Excel PCB tab lists per-board status.

### Step 6 — Firmware Tier-0 (only after fitness)

`runTier0FirmwareProof` already fail-closes correctly. After fitness green: per-control-board prove; max readiness **FAB-READY — UNPROVEN IN HARDWARE**. Prototype pytest already green (9/9); NinjaPCR shows native+compile can PASS without HIL.

---

## After rebake3 (Terminal execution order)

1. SIGHT rebake3 dossier (tabs + PNGs + `state.pcb`) — confirm R1–R4 / Excel-save claims.
2. `jq` the pcb block — if still multiBoardMerged + fitness false, start Step 1 (do not “tweak placement”).
3. Land Steps 1→3 with proveCatch; harness green.
4. PCB-focused re-run (`PCB_STAGE=1`) or full rebake4 only for PCB — one product.
5. SIGHT: fitness, boardPipelines, placement/route, firmwareProof (not skipped).
6. Only then consider Gate38 enforcing on a clean twin.

**Cursor lane (optional, file-disjoint):** candidates + pinouts only. Terminal owns chain loop + generator + pipeline runner. No waiting.

---

## What NOT to do

- Skip `designFitness` to “run firmware”
- Fake stir/pump channels to green the tab
- Fix pad overlap by growing a **merged** board
- Claim FUNCTIONALLY VERIFIED without HIL
- `if organoid` patches — key off architecture / working_volume / board roles
- Treat honesty-gate green as product-done

---

## Relation to Terminal’s current table

| Their row | Cursor note |
|---|---|
| R5 after rebake3 | **Correct sequencing** — SIGHT first, then this roadmap |
| R6 keep ex-works | **Agree** — volume model last; no ceiling Goodhart |
| R4 grew enclosure | SIGHT must confirm micro-dims + phenotype; if sprawl “fixed” only by ballooning envelope, revisit packing |
| R8 decomp now | OK parallel with PCB Steps 1–2 if file-disjoint |

---

*Honesty is done. Product PCB = Steps 1→6 above.*
