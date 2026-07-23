# PCB / Firmware Audit Findings — 2026-07-23

**Audience:** Terminal (Claude Code) + Cursor lane + Tristan  
**Scope:** Everything learned from fixpack17→20, MemPalace, `~/.memory`, harness inbox, and SIGHT of delivered packs.  
**Goal:** Mistakes cannot regress; good work is preserved in code + doctrine.

---

## 1. Executive verdict

| Question | Honest answer |
|---|---|
| Is firmware being tested virtually? | **Yes, at bring-up level** — QEMU Cortex-M ELF calls `virt_i2c_read8` on RAM-modelled devices. |
| Does that prove the product works? | **No.** Not SAMD21 SERCOM, not physical chips, not HIL. |
| Max Excel claim | **FAB-READY — UNPROVEN IN HARDWARE** |
| Forbidden | **FUNCTIONALLY VERIFIED** without HIL |

---

## 2. Mistake timeline (encode-or-lose)

| # | Mistake | Who caught it | Fix pack | Encoded where |
|---|---|---|---|---|
| M1 | Sold Tier-2 Mac host mock as “firmware on a board” | Tristan | 17→18 honesty | Inbox + `FIRMWARE_TIER_TRUTH[2]`; Mach-O vs ARM proveCatch |
| M2 | QEMU ran ARM ELF but `main.c` hardcoded `CHECK … PASS` | Tristan | 19 | `virt_i2c_read8` required; theatre detector; empty bus FAIL |
| M3 | Oversold as “firmware tested and working” | Tristan | docs + honesty module | `pcb-firmware-honesty.ts` + Excel status strings |
| M4 | Firmware buried under `pcb/firmware-*` in pack | Tristan | Terminal `c9c58980a` | Top-level `firmware/` + bundler proveCatch |
| M5 | Firmware only generated under `out/`, not in git | Tristan | 20 `32b5501e3` | `firmware/pcb-bringup/` + fail-closed resolve |
| M6 | Excel `readiness_why` still said “Tier-0” only | Cursor tip | Terminal `cf54f9a81` | `_pcb_firmware_status_string` + tier-aware why |

---

## 3. Good stuff to preserve (do not lose on merge)

### Cursor lane (`origin/cursor-pcb`, tip ≥ `dc538830b` / code `32b5501e3`)

- `firmware/pcb-bringup/` — first-class C bring-up
- `emitTier1McuProject` copies tree; generates only binds
- QEMU Tier-3 + virt I²C proveCatch both directions
- `pcb-firmware-honesty.ts` (+ tests) — **canonical status strings**
- `.cursor/rules/pcb-firmware-honesty.mdc`
- `prove-pcb-fix-claims.py` D/D2/D3 + tree presence
- Regression: `UNIVERSAL.pcb_firmware_bringup_*` + `…_status_tier3_is_virtual_bringup`

### Terminal lane (`oxccu-efuel` — already landed, absorb on merge)

- `_pcb_firmware_status_string` + PCB tab Firmware row (`cf54f9a81`)
- Top-level deliverable `firmware/` (`c9c58980a`) with README honesty + proveCatch
- MemPalace gotcha: firmware lives under `pcb-project/*/firmware-proof/`, Gerbers under `pcb-boards/` — bundler must bridge both
- Merged fixpack17–19; **still needs merge of fixpack20** (`firmware/pcb-bringup` in git) — as of audit, not yet ancestor of oxccu tip

### Shared doctrine (lockstep)

Excel Python and TS must stay aligned on:

```
VIRTUAL BRING-UP PASS (QEMU + modelled I²C) — UNPROVEN IN HARDWARE
HOST BIND / CONTRACT PASS — UNPROVEN IN HARDWARE
COMPILE / CONTRACT ONLY — UNPROVEN IN HARDWARE
FAB-READY — UNPROVEN IN HARDWARE
```

If either side drifts → FAIL proveCatch (TS tests + Excel `--selftest`).

---

## 4. Path contracts (MemPalace + SIGHT)

| Artefact | Path |
|---|---|
| Gerbers / drill / kicad | `<run>/pcb-boards/<board>/pcb/` |
| Firmware proof (chain) | `<run>/pcb-project/<primary>/firmware-proof/` |
| Firmware proof (solo) | `<run>/firmware-proof/` |
| Git source of truth | `firmware/pcb-bringup/` |
| Emailable pack | `<slug>-deliverable/firmware/mcu-bringup/` + `firmware/boards/<id>/` |
| Forbidden pack layout | `pcb/firmware-mcu`, `pcb/firmware-other`, `pcb/<board>/firmware` as sole copy |

If Cursor moves emit paths, **update Terminal bundler globs in the same change** or firmware silently drops from the zip (MemPalace gotcha).

---

## 5. Open actions (Terminal / Claude)

1. **Merge `origin/cursor-pcb` tip ≥ `32b5501e3`** so `firmware/pcb-bringup/` exists on oxccu.
2. Confirm next bake pack has top-level `firmware/` (already proven on 0442) **and** sources match git tree after merge.
3. Keep Excel status helper aligned with `pcb-firmware-honesty.ts` (or import shared JSON later).
4. Do **not** invent SAMD21-full QEMU busywork unless Tristan asks — honest next rung is HIL or a named closer silicon model.

### Cursor HOLD

No competing PCB chain. Residual = absorb Terminal Excel/bundler after merge if any string drift.

---

## 6. Memory / lessons written

- `tasks/lessons.md` — RULE 2026-07-23 PCB firmware honesty
- `~/.memory/lessons.md` — Recent lesson + pre-flight (this session)
- `.cursor/rules/pcb-firmware-honesty.mdc`
- MemPalace: existing drawer on firmware vs gerber trees; this audit doc is the Cursor write-up

---

## 7. proveCatch checklist (must stay green)

- [ ] `npx jest …/pcb-firmware-honesty.test.ts`
- [ ] `npx jest …/pcb-firmware-mcu-sim.test.ts` (empty FAIL + good PASS)
- [ ] `python3 scripts/prove-pcb-fix-claims.py out/pcb-solo-organoid-fixpack20`
- [ ] `build-excel-export.py --selftest` (Terminal) — top-level firmware + VIRTUAL BRING-UP README
- [ ] Regression harness UNIVERSAL.pcb_firmware_* 

---

*Cursor audit 2026-07-23 — encode findings, tip Terminal/Claude, preserve honesty.*
