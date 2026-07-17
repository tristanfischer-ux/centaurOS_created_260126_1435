> **Canonical colorimeter takeover:** `docs/plans/2026-07-13-CURSOR-TAKEOVER-colorimeter.md` (this file is a copy for root discoverability).

# Cursor takeover — Open Colorimeter campaign

**Date:** 2026-07-13 ~08:00 BST  
**Authority going forward:** **Cursor (this session / next Cursor session)** — execute + delegate (Task subagents / optional Claude later).  
**Prior owner:** Claude Code terminal (unresponsive — safe to quit).  
**Branch:** `oxccu-efuel` (ahead of origin; nothing must be pushed without Tristan).  
**Status:** Partially complete — instrument ontology landed; floor still **0 / DRAFT**; next work is RAG+pin paths then **one** clean chain.

---

## Can you close the Claude terminal?

**Yes.** Chains are dead (Cursor killed nested PIDs ~07:55). Artefacts frozen. Code + docs committed through `59c60a805`. No live work depends on that Claude session.

---

## Should you work with Cursor instead?

**Yes — preferred for the next section.**

| | Claude terminal (old) | Cursor (recommended) |
|---|---|---|
| Interaction | Stuck / can’t type | You talk here |
| Nested chains / OOM | Caused exit 137 | Can enforce one PID + flock |
| Advice loop | Ignored harness often | Same agent executes |
| Delegation | N/A | Task subagents; can brief Claude later if wanted |

Optional: open a **fresh** Claude later for parallel ingest/long chains only — not required to continue.

---

## What they actually achieved (verified)

### Real code (universal, device-gated)
| Commit | What |
|---|---|
| `6e6b09e8f` | Instrument exterior form-factor (not cabinet) |
| `3473e877b` | Device-scale price ceilings |
| `496765a22` | Topology power_protection + indicator roles |
| `21007d36c` | `connected_electrical_load_kw` ~W not 1001 kW |
| `640aec74a` | Connection-trace from authoritative topology (0→10) |
| `223def03b` | Dark charcoal shell |
| `b1576678f` + `3d46bd4b9` | MPN wrong-family reject at emitter-completion |

### Real ingest
- Optical seed **10/10 live-verified** into `~/.forge-truth/forge-truth.db` (BPW34, TCS34725, OPA333/334, ADS1220, TLC5916, ATSAMD21, MCP1700, MCP73831, REF3025). Candidates: scratchpad `optical-seed-candidates.json` (also under Claude scratchpad — copy if needed).

### Real runs
| Run | Role |
|---|---|
| `out/colorimeter-20260713-0358` | Clean complete; Connection-trace fixed via fast harness |
| `out/colorimeter-20260713-0717` | Bake-in; dossier written ~07:53; then **nested procs → OOM/kill** |
| **`out/colorimeter-20260713-0717-FROZEN-at-075507/`** | **Authoritative snapshot** (dossier, state, scorecard, hero, exterior, pcb) — use this |

### Honest score (0717 freeze)
Floor **0**. Connection-trace cleared. Still &lt;8: Sense-check, PCB, Renders, Part-names, Calcs, Quantities, BoM, Assembly (+ mirrors).

---

## What their “handover” is vs isn’t

**Is real:** `docs/plans/COLORIMETER-TO-9-EVERY-TAB-HANDOVER.md` **§8g** (0717 SIGHT + Banner path + OOM) — written ~07:56 after kill.  
**Is not enough alone:** Same file is a **rolling overnight log**; early §8 still says Connection-trace “NOT YET FIXED” (stale). Don’t start from the top — start from **this doc** + §8f–8g.

Also useful:
- `docs/plans/2026-07-13-colorimeter-finish-before-ninjapcr.md` — finish bar before NinjaPCR  
- `docs/plans/CURSOR-HARNESS-INBOX.md` — advisory history (now superseded by this takeover)  
- Gold: `out/_gold-colorimeter-showcase/`, `out/_gold-colorimeter-repo` → `/tmp/open_colorimeter_gold_b7f37ae`  
- Brief: `briefs-loop/yuri_open_colorimeter.md`

---

## Open punchlist (do in this order)

1. **DB dedup** — `pretraining_extracted_parts` on `(manufacturer, part_number)`; seed script was duplicating rows.  
2. **RAG / `dbFirstLookup` lead-segment** — plural fold + prefer `web_verified_ingest` when head noun leads (`probe-fill.ts "Microcontroller"`).  
3. **Banner S22 + Schneider LV430630** — still pinned via a path that **skips** `dbHitAcceptableForWord` (deterministic-emitter / Stage 10.5). Grep those MPNs; same device reject.  
4. **One PID cold chain** into a **new** `out/colorimeter-…` (never relaunch into 0717). Cap concurrency / no nested spawn.  
5. **R-VISUAL V1** — charcoal landed; still need stepped body, top-deck UI, square cuvette well, external green LED PCB (fast: `render-blender-scene.py --force`).  
6. **Cost** — Sense-check still RADICAL (~£697–1100 OEM vs ~£150 band); tighten ceilings / COTS disposition (PyBadge+TSL2591), no fractional `design-to-target`.  
7. Near-miss tabs: Part-names, PCB fitness, Calcs, Assembly, Quantities.  
8. **Do not start NinjaPCR** until finish-plan §4 (honest ≥8 / replica bar) or Tristan waives.

---

## Fast harness (prefer over full chains)

```bash
# Connection / excel rescore on frozen state
python3 scripts/blender-universal/parts_ledger.py <dir> <dir>/state.json
.venv/bin/python3 scripts/build-excel-export.py <dir> <dir>/out.xlsx

# Re-render only
python3 scripts/render-blender-scene.py --state <dir>/state.json --out-dir <dir> --force
```

Full chain only when TS contract/emitter/RAG must re-emit. Use node@22 via `scripts/run-loop.sh`. **One** tree per `out/`.

---

## Mode

`TRAINING/REFERENCE-AIDED` — gold may be opened to teach rules; **never** paste gold MPN table into emitters.

---

## First actions for next Cursor session

1. Read **this file**.  
2. SIGHT `out/colorimeter-20260713-0717-FROZEN-at-075507/04-product-exterior.png` vs showcase.  
3. Start punchlist item **1** (dedup) or **3** (Banner path) — both unblock the next chain.  
4. Quit Claude terminal anytime.
