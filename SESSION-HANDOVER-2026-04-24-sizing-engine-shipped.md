# Session handover — 2026-04-24 (autonomous night run)

**Branch:** `feat/forge-v2-cutover` (NOT main). Flag `new_forge_experience` OFF for everyone except Tristan + test user. 3 new commits this run.

**HEAD:** `44943b15` — sizing engine + V2 chain + quotes table.

---

## What shipped this autonomous run (3 commits)

1. `ecee06c3` **feat(v2): Forge sizing engine** — domain-aware dimensional solver wired into Fang
2. `6977d5a2` **feat(v2): chain Fang sizing after Max + fix after() cookies + quotes table**
3. `44943b15` **fix(sizing): rename `module` → `mod`** — Next.js lint rule

---

## Sizing engine — NOW LIVE in the pipeline

### Files
- `src/lib/sizing/types.ts` — contracts (DomainRules / Envelope / DimensionSheet / ModuleDimensions)
- `src/lib/sizing/envelopes.ts` — canonical 20ft / 40ft / 53ft / warehouse bay / heat-pump cabinet
- `src/lib/sizing/sizing-engine.ts` — generic solver + module-id → slot matcher (tiered: name 10× > purpose 3× > keyParts 1×)
- `src/lib/sizing/prompt-adapter.ts` — DimensionSheet → VisualStyleSpec enrichment
- `src/lib/sizing/rules/_registry.ts` — industry-domain → library lookup
- `src/lib/sizing/rules/bess-v1.ts` — battery energy storage (ported from prototype, 5 trials validated)
- `src/lib/sizing/rules/vertical-farm-v1.ts` — CEA indoor farms
- `src/lib/sizing/rules/heat-pump-v1.ts` — outdoor heat-pump cabinets
- `src/actions/specialists/run-fang-sizing.ts` — orchestrator (foreground + background + scheduleAfterMax)
- `scripts/verify-sizing-engine.mjs` — standalone harness; 5 BESS trials match prototype

### Runtime wiring
- **Max's `after()` chain** (`src/actions/specialists/run-max-decomposition.ts`) now fires:
  1. `runFangSizingBackground(projectId, foundryId, "auto.max-complete")`
  2. `runBomGeneratorBackground(projectId, foundryId, userId, "auto.max-complete")`

- **Per-module image render** (`src/actions/forge-v2-generate-one-module-image.ts`) loads `dimension_sheet` and enriches `visualStyle.moduleDimensionNotes` + `overallDimensionsMm` so the existing prompt builders (buildModulePrompt, buildReferenceAwareModulePrompt, buildDimensionalConstraints) render modules at correct proportions inside the declared envelope.

- **Hero (interior-exploded) render** (`src/actions/forge-v2-generate-system-illustration.ts`) gets the full dimension table via `formatHeroDimensionTable()` passed as `researchExcerpt` → the hero respects real spatial positions.

### Migration
- `supabase/migrations/20260423120000_cad_lab_dimension_sheet.sql` — `dimension_sheet JSONB` on `cad_lab_projects`. Applied via MCP.

### Validation
- BESS 931e0220's dimension_sheet seeded via `/tmp/bess-seed-sheet.mjs` — all 8 modules matched correctly (battery_racks, pcs_inverter, dc_distribution, ac_switchgear, hvac, fire_suppression, scada_controls, container_shell). 500 kWh / 100 kW fits 40ft at 31.8% floor utilisation.

---

## Open tasks cleared

- **#87 quotes table** — `supabase/migrations/20260423130000_quotes_rfq.sql` applied. RLS foundry-scoped.
- **#88 stall-recovery Phase-2** — `waitForStage` now re-triggers once on `TIMEOUT_STALL` (Max + BOM wired with reTrigger callbacks).
- **#90 after() cookies** — `runMaxDecompositionBackground` + `runBomGeneratorBackground` variants take foundryId/userId explicitly. Autopilot now uses the Background variant.
- **#96 module-rendering ship** — the sizing injection IS the last piece; modules now render dimensioned on next autopilot run.

---

## V2 ship status — NEXT MERGE

- `feat/forge-v2-cutover` HEAD is `44943b15`.
- Flag `new_forge_experience` is OFF for everyone except Tristan's profile.
- Preview build status when the autonomous run handed off: `Building` on `n70mip2o7.vercel.app`.
- Merge to main is the final step. Because the flag is OFF, merging is safe — nobody sees the new UI until the flag flips.

### To merge
```bash
git checkout main
git pull
git merge --no-ff feat/forge-v2-cutover
git push origin main
```

After merge, verify a Production deploy lands green, then flip `new_forge_experience` for Tristan + test user on the Production backend:
```sql
UPDATE profiles SET feature_flags = jsonb_set(feature_flags, '{new_forge_experience}', 'true')
WHERE id = '<tristan_profile_id>';
```

---

## Tasks not carried forward

All sizing-engine and V2-fix tasks are CLOSED. Remaining board items:
- **#106** Re-render BESS 931e0220 end-to-end with sizing — DB seed proves shape works; next autopilot run on BESS will validate images + PDF.
- **#107** V2 merge — see above. Instruction-clear, one command away.

---

## One-liners worth remembering next session

- Sizing engine is a generic solver + per-domain coefficient libraries. Adding a new domain = one file in `src/lib/sizing/rules/` + one line in `_registry.ts`.
- Every after() → action handoff must use a `*Background` variant (cookies are gone post-response). Max, BOM already converted. If a future stage uses withAuth, wrap it.
- Module-slot matching: name 10× > purpose 3× > keyParts 1×. This prevents "HVAC Thermal Management" from falsely matching `container_shell` because a keyPart contains "structural".
- Dimension sheet is the source of truth. Downstream (image prompts, BOM envelope check, Fang review) all read from it.
