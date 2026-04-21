# Handover — PDF polish + image-gen investigation + vertical-farm walk

**Created:** 2026-04-21 post-compaction. Branch `feat/forge-v2-cutover`.
**Last commits on branch:** `2a8e02c6` (sys-illus button), `9dde8453` (mod-renders button), `033ad711` (kitchen-sink PDF), `b2ac9deb` (persist sys-illus URL), `596c2609` (per-module render loop), `119babae` (autopilot).

## Context

Tristan reviewed the 28.8 MB PDF (`nethawk-12-debris-removal-cubesat-rev-A (3).pdf` in Downloads) generated for project `352f5660-fdf7-4674-a676-9e0f4438a1f2` (NetHawk-12 cubesat). He's broadly happy with the content depth but flagged a specific list of fixes + questions + a second-project walkthrough. He pre-authorised all edits + the next walk.

## Next-round plan (in priority order)

### 1. PDF layout bugs (small / fast)
- **Cover title + subtitle collision.** The white "Revision A · Claude Test Foundry · Shipped" subtitle renders right under the title with insufficient margin; at certain title widths they visually overlap. Fix `styles.coverBandTitle` / `styles.coverBandSub` in `src/actions/export-project-pdf.tsx` — add explicit `marginTop` on subtitle and/or bump `marginBottom` on title to a value the h1 font descender can't eat into.
- **"Totals at a glance" row spills onto next page.** The `statRow` block at the bottom of the cover body pushes the last row (unit cost / ceiling / headroom / reviews) to page 2. Either move the entire stats grid above the cover image, or mark the grid `wrap={false}`, or move stats onto their own page.

### 2. Module section ordering (small / fast)
Currently renders `Purpose → Description → Why it matters`. Tristan wants `Purpose → Why it matters → Description`. Edit `ModulePage` in `export-project-pdf.tsx` — re-order the three `View style={styles.para}` blocks.

### 3. Specialist attribution everywhere (small / fast)
Every time a specialist is named in the PDF (headings, Finn's cost breakdown, Fang's review, Chase's supplier match, pipeline audit rows) add a parenthetical role + "(specialist AI)" or "(AI specialist — <role>)". Example: `Finn's cost breakdown (Finance Lead — specialist AI)`. Apply consistently throughout the PDF.

### 4. Source attribution (medium / important)
Tristan flagged three "where does this come from?" gaps:
- **Cost basis.** Add a caption under the cost waterfall explaining: "Estimates from Finn (DeepSeek-chat), grounded against `material_properties` table (N rows, last updated DATE) and `process_capabilities` table (M rows)." Query those tables for row counts + max(updated_at) to populate N/M/DATE. See `src/actions/cad-lab-cost.ts` line 78-95 for the existing DB grounding.
- **BOM basis.** Add a caption: "BOM derived from Max's module decomposition key parts (Claude Opus 4.7), expanded by Anthropic Claude Opus 4.7 in the bom.generate pipeline." See `src/actions/bom.ts:33` `BOM_MODEL`.
- **Supplier basis.** Add a caption: "Shortlist from Chase (VP Supply) scoring each supplier in the `suppliers` / `marketplace_listings` table against each module's process + material. Scoring logic: `src/actions/cad-lab-supplier-match.ts`." Also diagnose **why only 2 suppliers matched** for NetHawk — check if the supplier directory has real space-aerospace coverage (probably doesn't) and surface the honest count. Tristan asked whether semantic search is working; check `matchCadLabModuleSuppliers` for embedding-based search path.

### 5. Image-generation investigation (medium / important)
Multiple issues Tristan flagged:
- **Cover isometric looks different to module blueprints.** Different prompt templates → different visual style. In V1 there's a `visualStyle` spec that locks palette + line weight across all images for a project. Check whether V2's `generateCadLabSystemIllustrationAction` + `generateCadLabSingleImageAction` are both receiving the same `visualStyle` / `illustrationStyle`. If not, they produce incoherent output.
- **Some module images have labels, others don't.** Image-generation prompt should include "no labels, no callouts, no text" language. Find the per-module prompt in `src/lib/cad-lab/image-generator.ts` or `src/actions/cad-lab-images.ts` and audit. V1 had explicit anti-label language per Tristan.
- **Port vs starboard solar wings aren't mirror images.** Currently each module generates independently. V1 had a `mirrorOf` field on `CadLabModule` that caused the image generator to render the port wing first, then mirror it for starboard. Verify `mirrorOf` is being set correctly (check Max's output for NetHawk modules) AND that the image generator respects it. Fix likely in `image-generator.ts`.
- **Which model is generating images?** Currently probably Nano Banana (Gemini-based) per the pipeline-run-chip "nano banana" labels. Tristan wants the best image creator. Audit `generateModuleImage` / `generateResearchIllustration` in `src/lib/cad-lab/image-generator.ts` for which provider is called and whether a better model is reachable (e.g. Stable Diffusion Ultra via `getStabilityKey()`, or Flux via Replicate via `getReplicateKey()`). Both helpers exist in `src/lib/ai/api-keys.ts`.

### 6. Review → design update cascade (medium / important)
Tristan asked: "when the specialist reviews things, does that then trigger an update of the design like it did in V1?" Audit:
- `src/actions/specialists/run-fang-review.ts` — does it only WRITE the review, or does it also modify module fields (mass, process, material, etc.) based on the review's recommendations?
- V1 behaviour per Tristan: review triggered a design mutation. V2 currently may not — needs to be verified.
- If V2 is review-only, we need a second pass: after Fang's review lands, apply any high-confidence recommendations to the module itself. E.g. if Fang says "thrust block should be Ti-6Al-4V not Al 7075" with high severity, update `m.targetMaterial`. Gate on verdict = "fail" | "warn" + severity = "critical" to avoid auto-applying trivial suggestions.

### 7. Pipeline audit cleanup (small / fast)
Table shows:
- Inconsistent model names: "OPUS 4.7" vs "Anthropic Claude OPUS 4.7" vs just "Anthropic" — normalise via a small formatter.
- Finance-lead `failed` rows appear before the final `done` row. Since Tristan retried and it succeeded, hide or de-duplicate the earlier failures. Option: filter to "latest status per (specialist, stage)" OR add an explicit "3 earlier attempts failed, this one succeeded" chip instead of listing each.
- Some rows show 2m 43s duration but no in/out tokens. Investigate: is that a run that didn't actually hit the model, or a token-tracking bug? If the run DID execute but tokens weren't recorded, the cost tracker is lying.

### 8. Multi-model audit (medium)
Tristan: "You only seem to be using Anthropic and DeepSeek. Can you just give an update in terms of which models are actually doing all of this work?" Pull a model-usage summary from `pipeline_runs` over the last week and write it into the PDF (or a separate file). Should show breakdown by provider.

### 9. Fresh walk: modular vertical farm in a shipping container
After all above changes land and deploy is green, run the full walk on a FRESH project with brief: **"Modular vertical farm using a shipping container as the primary structure"**. Use either the "Run autopilot" button (commit `119babae`) OR drive manually via agent-browser. Generate a new PDF at the end and hand it back to Tristan.

## Critical reference info (preserve across compaction)

- **Repo:** `/Users/tristanfischer/Developer/CentaurOS created 260126 1435`
- **Branch:** `feat/forge-v2-cutover` (not main)
- **Supabase project id:** `jyarhvinengfyrwgtskq`
- **NetHawk-12 project id:** `352f5660-fdf7-4674-a676-9e0f4438a1f2` (already shipped, 10 modules, all images rendered)
- **Login script:** `~/.claude/scripts/forgeos-login.sh` — reads `~/.claude/secrets/forgeos-test.env`. Test user: `claude-test@forgeos.test`.
- **Preview URL pattern:** `https://centaur-os-created-260126-1435-<HASH>.vercel.app` — find latest via `vercel ls`.
- **Deploy wait:** ~5 min from push to Ready. Single-shot wait, not a polling Monitor (per memory `feedback_autonomous_no_permission_loops.md`).
- **Per-module image render time:** ~60s per module via the per-module loop. 10 modules = ~10 min wall-clock.
- **PDF regenerate time:** ~60s.

## Key file paths to touch

| Task | File |
|---|---|
| PDF cover layout + section ordering + specialist attribution + source captions | `src/actions/export-project-pdf.tsx` |
| Cost grounding audit | `src/actions/cad-lab-cost.ts` |
| BOM model | `src/actions/bom.ts` |
| Supplier match + semantic search | `src/actions/cad-lab-supplier-match.ts` |
| Image generation prompts + mirror logic + model choice | `src/lib/cad-lab/image-generator.ts`, `src/actions/cad-lab-images.ts` |
| Fang review → design mutation | `src/actions/specialists/run-fang-review.ts` |
| Pipeline audit dedupe | inside the PDF generator (audit-page render block) |

## Done definition for this round

- PDF regenerated on NetHawk-12 shows: no cover-page layout bugs, correct section order, specialist names with roles, source captions on cost/BOM/suppliers, deduped pipeline audit with consistent model naming.
- Image-generation audit produces a written summary of (a) which model is used, (b) whether port/starboard mirror works, (c) whether no-labels language is in the prompt. Fixes applied if any of (b) (c) are broken.
- Review→design cascade either verified working or a new pass lands it.
- Fresh vertical-farm project walked through to a generated PDF, handed to Tristan.
