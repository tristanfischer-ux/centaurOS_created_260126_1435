# PCB Design Capability → Anvil Engine Integration

**Date:** 2026-07-12 · **Branch:** `oxccu-efuel` (live engine) · **Driver:** Yuri colorimeter campaign (a PCB-based instrument needs a real board deliverable)
**Scope (Tristan 2026-07-12):** FULL BOARD — engine nets → atopile → KiCad schematic → Freerouting autoroute → KiCad DRC → Gerbers/drill/placement/3D render, added to the dossier as verified artifacts, with an honest-failure gate.

## Foundation (verified live 2026-07-12)
- kicad-cli 10.0.4 (`/opt/homebrew/bin`), atopile 0.2.69 (`~/.local/bin/ato`), Freerouting 2.2.4, OpenJDK, 222 KiCad symbol libs, 15,435 footprints.
- `prototypes/pcb-capability/` — clean contracts, selftests PASS: `pcb-disposition.ts` (COTS-vs-bespoke, 10 cases), `pcb-outline.ts` (bespoke `Edge.Cuts` shapes), `discover-pcb-capability.ts` (`canAuthor/canRoute/canVerifyAndExport: true`).
- Prior art (adapt mechanics, NOT verbatim — drops its hardcoded /tmp paths, static price table, and dishonest optimistic-failure): `~/Developer/CentaurOS created 260126 1435/scripts/pcb-chain/pcb_chain.py` (atopile→KiCad→DSN→Freerouting→DRC→Gerber/render, invoked `python3 pcb_chain.py <ato-project-dir>`).

## Design principles
- **First principles:** the engine already sizes the electronics (photodiode-TIA, MCU/LED/display/battery parts + topology nets). The PCB stage turns THAT into a real board — nothing copied from the reference device (the reference is scoring-only).
- **Honest failure (load-bearing):** a bespoke board that will not build / route / DRC-clean is reported as a FAILURE in the dossier — never faked. Matches the engine's gate philosophy.
- **Additive + shadow-by-default:** the PCB stage is opt-in (env flag) until proven, so every existing archetype run is byte-unaffected. Enforce only once green on the colorimeter.
- **Universal:** keyed on the design's own electronic content (bespoke-PCBA disposition), never a product-class table.

## Phases

### Phase A — Foundation in-engine (discovery + disposition + stage skeleton)
Port `discover-pcb-capability` (robust off-PATH tool detection) + `pcb-disposition` (bespoke-vs-COTS policy) into `src/lib/pdf-engine-v2/lib/pcb/` (engine-side, not prototypes/). Add a chain stage `runPcbStage()` that: detects the toolchain; for a PCB-bearing design decides bespoke vs COTS-modules; records `state.pcb` (disposition + capability). SHADOW (records, emits nothing to dossier yet). Wire into `serial-design-chain-v2.tsx` behind `PCB_STAGE=1`. proveCatch on the disposition policy.

### Phase B — atopile project generator (the core new capability)
`generateAtopileProject(design, outDir)`: map the engine's electronic modules/words/parts + topology nets → a valid atopile `main.ato` + `ato.yaml`. Real components (MCU, photodiode, TIA op-amp, LED + driver, display, USB, LDO/charger, connectors) mapped to real KiCad footprints; nets from the topology (`~` merges signals). Handle: part→symbol/footprint resolution (use the 222 libs / 15,435 footprints; DB-first where the engine already has MPNs), power/ground nets, decoupling. Honest gap-list when a part can't be resolved to a footprint. Unit-test the generator against the colorimeter design snapshot.

### Phase C — pipeline runner (clean adaptation of pcb_chain.py)
`runPcbPipeline(atoProjectDir, runDir)`: `ato build` → `.kicad_pcb` → text-pcb repair (the pcb_chain.py fix for CLI-unloadable text boards) → Specctra DSN export → Freerouting autoroute (bounded passes) → KiCad DRC → Gerber/drill/pos/3D-render exports, ALL under `runDir` (no /tmp, no hardcoded paths). Returns a structured result with real DRC violation counts + artifact paths, or an honest failure at whichever stage broke. No optimistic success.

### Phase D — dossier integration + honest-failure gate
Add verified artifacts to the dossier: schematic (SVG/PDF), board 3D render, Gerber set (zipped), drill, DRC report, PCBA BoM tab. A new gate: a design the disposition says NEEDS a bespoke PCB but that has no DRC-clean board → dossier FAILS that surface honestly (routed to the PCB stage). Enforce the PCB stage once green.

### Phase E — colorimeter through-run + score + iterate
Run the colorimeter with `PCB_STAGE=1`, open the board + schematic, score against the IO Rodeo gold standard (scoring-only, no copying), drive defects back to source. Loop to a genuine board.

## Guardrails
- Build under `runDir`; never mutate the reference material; never claim a DRC pass without the real kicad-cli DRC exit + zero-violation report.
- Every phase: proveCatch/selftest, typecheck-baseline zero-new, commit per phase with the house footer. Do not push.
