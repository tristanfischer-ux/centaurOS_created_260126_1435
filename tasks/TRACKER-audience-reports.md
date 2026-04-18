# Audience-aware Design Journey Reports — Tracker

**Started:** 2026-04-18
**Plan:** `/Users/tristanfischer/.claude/plans/shiny-zooming-hoare.md`
**Mode:** Autonomous execution — Tristan is away, commit + push frequently, verify Vercel after every push.
**Goal:** Replace the generic Design Journey Report export with four audience-specific variants (investor, engineer, supplier, marketing) × four formats (docx, pdf, pptx, html) = 16 output combinations, each with audience-aware AI-generated narrative.

---

## Scope reminder (locked)

- **PDF engine:** `@react-pdf/renderer` for all four audiences (replaces html2pdf.js)
- **Marketing illustration style:** new `photography` style added to registry
- **45MB docx bloat:** fix in scope via Sharp resize before embed
- **Audience-aware regeneration:** Opus Phase 1 system prompt branches per audience; Gemini Phase 2 inherits
- **Caching:** deferred to v2
- **Scope:** all four audiences in one push

---

## Phase A — Foundation

- [ ] A1. Install `@react-pdf/renderer`; verify `sharp` is present
- [ ] A2. Create `src/lib/constants/brand-tokens.ts`; migrate existing exporter hardcodes to import from it
- [ ] A3. Create `src/lib/cad-lab/audience.ts` — type, `isAudienceViableAtStage()`, labels, descriptions, icon keys
- [ ] A4. Add `audience` field to `DesignReportData` in `src/lib/cad-lab/design-report-types.ts`
- [ ] A5. Add `photography` illustration style to `src/lib/cad-lab/illustration-styles.ts`
- [ ] A6. Create `src/lib/cad-lab/image-resize.ts` (Sharp, 1600px wide, JPEG q85)
- [ ] A7. Commit Phase A

## Phase B — AI narrative pipeline

- [ ] B1. Write `src/lib/cad-lab/prompts/shared.ts` — structural guidance common to all outlines
- [ ] B2. Write `src/lib/cad-lab/prompts/investor-outline.ts` — exec summary with KPIs, problem/solution, market, traction, risks, ask
- [ ] B3. Write `src/lib/cad-lab/prompts/engineer-outline.ts` — module specs, standards refs, tolerance/material grids, CAD metrics, risk register
- [ ] B4. Write `src/lib/cad-lab/prompts/supplier-outline.ts` — BOM with part classification, process/tolerance/finish grids, quantities, lead times
- [ ] B5. Write `src/lib/cad-lab/prompts/marketing-outline.ts` — hero narrative, problem framing, product reveal, at-a-glance specs, CTA
- [ ] B6. Extend `structureReportOutline(data, audience)` in `src/actions/cad-lab-report.ts`
- [ ] B7. Extend `writeReportSections(outline, data, audience, opusTokens)` — audience register to Gemini
- [ ] B8. Extend `generateSlideImages()` — audience-matched illustration style
- [ ] B9. Commit Phase B

## Phase C — Dialog UX

- [ ] C1. Add audience picker to `design-report-dialog.tsx` — four cards with icons (Briefcase / Wrench / Truck / Megaphone)
- [ ] C2. Gating: `isAudienceViableAtStage(audience, stage)` — disable unviable with tooltip
- [ ] C3. Thread `audience` through `structureReportOutline` + `writeReportSections` + exporter calls
- [ ] C4. Filename includes audience: `{project}-{audience}-{stage}-{date}.{ext}`
- [ ] C5. Copy compliance — no AI emphasis ("Investor edition" not "AI-powered investor report")
- [ ] C6. Commit Phase C

## Phase D — Renderers (build order: investor → marketing → engineer → supplier)

### D — Investor
- [ ] D-inv-1. Create shared report-section components (cover, exec-summary, KPI-cards, module-grid, spec-table, cost-table, standards-table, supplier-block, quote-block, press-hero)
- [ ] D-inv-2. Refactor `export-design-report-docx.ts` — accept audience, use image-resize, investor layout
- [ ] D-inv-3. Create `export-design-report-pdf.tsx` (@react-pdf/renderer) — investor layout with embedded Outfit/Playfair fonts
- [ ] D-inv-4. Extend `export-design-report-pptx.ts` — investor with pptxgenjs native KPI charts
- [ ] D-inv-5. Create `export-design-report-html.tsx` — investor print-stylesheet
- [ ] D-inv-6. Delete legacy `export-design-report-pdf.ts`
- [ ] D-inv-7. Visual spot-check via agent-browser (open each file, record in matrix)
- [ ] D-inv-8. Commit Phase D investor

### D — Marketing
- [ ] D-mkt-1. Marketing docx layout
- [ ] D-mkt-2. Marketing PDF layout
- [ ] D-mkt-3. Marketing pptx layout
- [ ] D-mkt-4. Marketing html layout
- [ ] D-mkt-5. Visual spot-check
- [ ] D-mkt-6. Commit Phase D marketing

### D — Engineer
- [ ] D-eng-1. Engineer docx layout
- [ ] D-eng-2. Engineer PDF layout
- [ ] D-eng-3. Engineer pptx layout
- [ ] D-eng-4. Engineer html layout
- [ ] D-eng-5. Visual spot-check
- [ ] D-eng-6. Commit Phase D engineer

### D — Supplier
- [ ] D-sup-1. Supplier docx layout
- [ ] D-sup-2. Supplier PDF layout
- [ ] D-sup-3. Supplier pptx layout
- [ ] D-sup-4. Supplier html layout
- [ ] D-sup-5. Visual spot-check
- [ ] D-sup-6. Commit Phase D supplier

## Phase E — Verification

- [ ] E1. `NODE_OPTIONS="--max-old-space-size=8192" npx tsc --noEmit` clean
- [ ] E2. `npm run test -- cad-lab-report` passes
- [ ] E3. agent-browser login with `~/.claude/scripts/forgeos-login.sh`
- [ ] E4. Seed complete test project (concept → journey) on claude-test-foundry
- [ ] E5. Export all 16 combinations; record results in matrix below
- [ ] E6. Push to main; verify Vercel Production + Preview Ready
- [ ] E7. Smoke test deployed flow with one audience × format
- [ ] E8. Update `tasks/lessons.md` with any rules learned

---

## Visual spot-check matrix

| Format | Investor | Engineer | Supplier | Marketing |
|---|---|---|---|---|
| .docx | ☐ | ☐ | ☐ | ☐ |
| .pdf | ☐ | ☐ | ☐ | ☐ |
| .pptx | ☐ | ☐ | ☐ | ☐ |
| HTML | ☐ | ☐ | ☐ | ☐ |

Legend: ☐ pending · ✓ verified · ⚠ issue (note below)

---

## Success criteria

- Zero `tsc --noEmit` errors
- Vercel Production AND Preview both Ready after final push
- All 16 cells ✓ verified by agent-browser spot-check
- Filenames include audience; legacy callers default to `investor` without breakage
- Docx file size drops from ~45MB to <6MB on HAPS test project (proves image-resize fix landed)
- Dialog copy compliant with "No AI emphasis" rule

## Abort criteria

- `@react-pdf/renderer` cannot embed Outfit/Playfair fonts and no workable fallback exists → fall back to Helvetica + replan
- Two audiences in a row both ⚠ visual with systemic issues not specific to layout → stop, re-architect

## Score ledger

| Date | Phase | Cells ✓ / 16 | Token cost/export (avg) | Notes |
|---|---|---|---|---|
| 2026-04-18 | start | 0 / 16 | — | baseline |

---

## Notes / gotchas discovered during build

(To be filled in as we go — anything surprising gets logged here and copied to `tasks/lessons.md` at the end.)
