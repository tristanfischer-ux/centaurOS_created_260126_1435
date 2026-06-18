# OPENCODE.md — OpenCode shared memory (read at session start)

> Hierarchy: CLAUDE.md > MEMORY.md > OPENCODE.md > topic files > mempalace. Mark entries `[incorporated]` once Claude absorbs them into MEMORY.md.

## ⭐ ACTIVE HANDOVER (2026-06-18) — START HERE
**Tristan handed today's work to you (OpenCode) while Claude's tokens restore (~2026-06-19).**
**READ THIS FIRST:** `~/Downloads/handovers/2026-06-18T09-35-3ca7302a.md` — the full brief (goal, the cheap off-budget verify loop, what worked/failed, the 4 measured gaps, guardrails, today's order).
Also the rolling summary: `~/Downloads/handovers/CURRENT-SUMMARY.md`.

**Goal:** get the **dashboard + parts ledger** to **8/10** — prove the **physics / Blender / 8 drawings** are correct + consistent. NOT the PDF dossier (out of scope).
**State:** `origin/main == HEAD == 3ca7302ae`, clean. Latest run `out/ras-v23`. 14/14 drawing gates GREEN.
**The 4 real gaps:** (1) P&ID line density 11/104 conns — `draw_pid.py`; (2) Block-flow 7/22 — `draw_bfd.py`; (3) Blender hero render "blobby" 5.0; (4) recirc pump-power deficit — `engineering-contract.ts` `recircPumpHeadM` 14.4 m vs 26.35 m needed.
**Verify loop (no chain run, ≈0 Anthropic cost):** `cp -r out/ras-v23 out/ras-work` → edit generator → `python3 scripts/blender-universal/draw_pid.py out/ras-work out/ras-work/state.json` → `python3 scripts/blender-universal/parts_ledger.py out/ras-work out/ras-work/state.json` → read `out/ras-work/parts-ledger.json`. Self-audit rescore (off-budget): `npx tsx scripts/run-self-audit-standalone.tsx out/ras-v23/state.json`.

**Guardrails (do not violate):** universal+deterministic only (no `if ras`); don't game the matcher (credit only what's truly drawn); scorecard-gate the WHOLE before each commit (re-render ALL + re-ledger + re-gate, no regression, legibility ≤4:1); re-render from state, never trust a stale `out/` verdict; push `git push --no-verify origin HEAD:main`; macOS no `timeout` → `perl -e 'alarm N; exec @ARGV'`. Recommended order: bounded ledger-denominator fix → BFD density → P&ID densification → (pump physics, flag for Claude) → (Blender hero last/optional).

**Brief** persisted at `docs/ras-final-brief.md` (was reboot-volatile `/tmp`).
