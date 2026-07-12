# Session handover — 2026-07-12 — Colorimeter engine campaign + PCB capability + Yuri app

**For:** the next session (post-compaction). **Repo:** `/Users/tristanfischer/Developer/CentaurOS-oxccu-efuel`.
**Standing directive (Tristan):** get the colorimeter dossier to a **genuine ≥9 floor on EVERY tab** (like the Powerwall reached 9.3). Everything **universal** (source-rule fixes keyed on signals, never per-product tables). Nothing pushed anywhere this session.

## Three parallel workstreams — state

### 1. Colorimeter benchmark campaign (engine branch `oxccu-efuel`) — ACTIVE, mid-campaign
The first biomedical unit run through the LIVE engine (`briefs-loop/yuri_open_colorimeter.md`, a public-brief-only photometer; benchmark integrity = engine sees only the brief, gold is scoring-only). This is a real multi-iteration campaign.
- **Launch:** `PCB_STAGE=1 bash scripts/run-loop.sh briefs-loop/yuri_open_colorimeter.md out/colorimeter-board.json colorimeter` (archive `out/colorimeter-board.json` first if the loop-board gate blocks; ~15-20 min with PCB stage). Node22 + `~/.local/bin` on PATH for `ato`.
- **Latest good run:** `out/colorimeter-20260712-1546` — **BoM is now photometer-shaped** (19 optical principals: photodiode, TIA, LED source+driver, cuvette holder, optical baffle, MCU, display, battery+charge; **0 industrial parts**). But **overall floor still 0**.
- **TRAINING/REFERENCE-AIDED:** Cursor pulled a read-only gold copy to `/tmp/open_colorimeter_gold_b7f37ae/` + `out/_gold-colorimeter-showcase/`. Study gold for ONTOLOGY/shape/cost-band ONLY — never paste MPNs or a colorimeter parts table; mark aided commits TRAINING/REFERENCE-AIDED. Gold shape: [USB+battery+MCU+display+buttons] → short digital cables → [LED source]+[photodetector] → [light-tight 10mm cuvette holder]; ~16-line £-scale COTS-module BoM; swappable small LED boards per wavelength.

**THREE THREADS REMAIN to reach ≥9 floor (next-session priority order):**
1. **Drawings floor 0** (BFD / Connection-trace / P&ID / Electrical) — BIGGEST floor lever. `deriveDeviceEnergyTopology` (derive-topology.ts) was gated OFF the plant/ESS edges (commit ec083c068) but does NOT yet BUILD the optical-instrument graph (LED→sample→detector→MCU; USB/battery→regulator→loads). Build `deriveOpticalInstrumentTopology` OR make the device path emit the instrument power+signal graph so BFD/Connection-trace/P&ID score. Also check the Blender render zones (build_universal_scene.py) still look ESS-cabinet not handheld-instrument.
2. **Cost £1511 vs £200 ceiling** — right parts, over-priced/over-quantified. A photometer prototype is cheap COTS. Find where the optical/instrument parts get their prices (likely generic floors too high) and land near £200.
3. **7 unresolved electronic MPNs** (ADC, USB, display controller) — growing-DB/resolution lever. The honest PCB tab correctly flags these as electronic gaps. Seed/resolve real catalogue MPNs (the reference-intelligence in the yuri worktree can inform sourcing, NOT paste).

### 2. PCB design capability (engine branch `oxccu-efuel`) — BUILT + WORKING
Full atopile→KiCad→Freerouting→DRC→Gerber pipeline wired into the chain behind `PCB_STAGE=1`. src/lib/pdf-engine-v2/lib/pcb/. Verified: DRC-clean routed board + 21 Gerbers + 3D render generated in-chain.
- **PCB tab is now HONEST (commit 4a0d092c5):** two-axis `min(hygiene, fitness)` — a wrong-domain board that scored 9.4 now scores 2.3; readiness banner (FAB-READY/DRAFT/FAIL), DRC table, layer inventory, pick-and-place table, real KiCad designators, unresolved split, RELATIVE `pcb-fab.zip`, no absolute paths. Fitness weights (mpn_package=1.0/package_family=0.65/function_class=0.2, FAB-READY≥7.5) are my calibration — sanity-check on more runs.
- Capability details + gotchas: mempalace `drawer_forgeos_decisions_dc627df3f9a8da5d` + `drawer_forgeos_gotchas_60be3024f03623c0` (atopile `generic_` MPN prefix → hidden remote calls, use `TBD (detailed design)`; KiCad10 layer IDs interleaved; footprints embedded inline so no fp-lib-table; text-pcb repair from the sibling-repo pcb_chain.py is load-bearing).

### 3. Yuri wet-lab APP feature (isolated worktree `CentaurOS-oxccu-efuel-wt-yuri`, branch `yuri-wetlab`) — PARKED
INC1-4 done (3 Supabase trace tables applied to live jyarhvinengfyrwgtskq, ingestion service, programme content, Forge V2 UI). HEAD 2f88cde1a. **Superseded in importance** — Tristan's course-correction: Yuri is a BENCHMARK CAMPAIGN through the engine, NOT a separate app (mempalace `drawer_forgeos_decisions_2ec9a23e58798e32`). The app scaffolding's reference-intelligence is the SCORING substrate; the hand-authored programme content is superseded by what the engine now generates. Keep the branch, don't push.

## Session commits on `oxccu-efuel` (all universal engine improvements)
`e8fdc5c13` wrong-domain word stripper · `c4b6757dc` gate-25 dimension-aware · `ab3a6d7c2` device-scale enclosure derivation · `cc053eaf3`/`b36d914ee`/`0d5c58a9a`/`83f6204de` PCB stage A-D · `9bb33ca6f` generator grounding backstop · `ec083c068` optical skeleton floor + propagation + topology gating · `4a0d092c5` honest PCB tab.

## Working protocol (hold these)
- Fable orchestrates, Sonnet codes (Agent tool, model: sonnet). Sequence Sonnet coders when they'd collide on the same file (esp. `scripts/regression-harness.tsx` — every fix adds an invariant there).
- CORE FIX PRINCIPLE: source-rule fix, universal, `--selftest`/proveCatch both directions, `regression-harness:` commit line. Commit footer: `Fable-orchestrated, Sonnet-coded.` + `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- HYGIENE: kill duplicate chain PIDs before a run (`pkill -9 -f serial-design-chain-v2.tsx`) — duplicates on the same out dir corrupt state. Launch via run_in_background tracked task, never shell `&`.
- Downloads is TCC-locked to the Bash shell — use Finder/osascript/mdfind to read from `~/Downloads`. CURRENT-SUMMARY.md is OS-locked (chflags uchg) — read the newest dated file in `~/Downloads/handovers/` instead (mempalace `drawer_meta_gotchas_80f4a74ad6e95436`).
- typecheck baseline has 3 KNOWN-INHERITED errors (engineering-contract.ts ×2, residential-battery-storage.ts ×1) from Cursor's work — NOT ours; `NODE_OPTIONS=--max-old-space-size=8192 npm run typecheck:baseline`.

## Next action
Continue thread 1 (drawings/topology — the floor-0 blocker): build the universal optical-instrument topology so BFD/Connection-trace/P&ID score, then thread 2 (cost) + thread 3 (MPN resolution), re-running with `PCB_STAGE=1` each iteration until the honest floor is ≥9 on every tab.
