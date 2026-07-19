# Organoid-space — autonomous session blockers & handover

*Live doc written while Tristan is asleep (2026-07-19). What got done, what's blocked.*

## Blocked (need Tristan / credits)
1. **Wire composer into the CHAIN render** — the chain's default render is the BESPOKE
   `render-blender-scene.py` (LLM-emitted scene via `generate-blender-scene.tsx`), NOT the
   universal `build_universal_scene.py` where the composer (COMPOSER=1) lives. Routing the
   chain to the composer is an architectural change with regression risk to the makers-kit
   runs the watch is actively doing, and needs a credit-spending chain run to verify. Deferred
   as unsafe for unattended work. Decision needed: composer as default vs opt-in alternate;
   then a verified chain run when credits are healthy + watch idle.
2. **Full auto-costed chain dossier for M2+M1** — same dependency (credits + clear checkout).

## Done autonomously (credit-free, isolated to composer/Blender — my files only)
- (in progress) Rendered the organoid machine set M1–M8 through the composer→Blender path.
- Gridded the cassette wells plate-style (commit c1f88e3da).
- Visual deck + form-fidelity polish (see 02-MACHINE-SET-VISUAL-DECK.md when written).
