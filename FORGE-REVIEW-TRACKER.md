# Forge End-to-End Review Tracker

**Opened:** 2026-04-17
**Owner:** Agent (autonomous — user is away)
**Scope:** Design → Specify → Source → Assemble, end-to-end walkthrough on production using HAPS UAV dummy project, fix everything that breaks, 5 red team rounds.

**Dummy project:** European HAPS UAV — 5–10m wingspan, 20km altitude, 7–14 day endurance, comms/ISR payload. Already exists in `fractionalforge.app` (screenshotted by user, Specify 8/8, images queued).

---

## Success criteria

- [ ] Every page (Design, Specify, Source, Assemble) loads without console errors
- [ ] All 8 illustrations render (not stuck queued, not stuck failed)
- [ ] Every interactive element on each page works (buttons, tabs, CTAs, downloads)
- [ ] Data flows correctly through the 4 stages
- [ ] Cost Summary on Specify has prominent BETA warning (requested by user)
- [ ] All red team rounds (5) produce findings AND fixes, not just findings
- [ ] All P0/P1 bugs fixed on `main`, deployed, verified on live site
- [ ] Final written report lists every issue with status

## Abort criteria

- If a fix causes a regression in a feature not being reviewed → stop, revert, document
- If a fix requires a migration and migration fails → stop, diagnose, do not leave unapplied
- If Vercel deploy fails twice in a row → stop, diagnose with `vercel logs`

---

## Phase 0 — Setup (DONE)

- [x] agent-browser 0.25.3 verified
- [x] Topic files loaded (cad-lab-react-patterns, cad-lab-specify-architecture, pipeline-lessons-learned)
- [x] Latest commit noted: `99a585b7 fix(cad-lab): unstuck Images tab when hero generation fails`
- [x] Uncommitted expert-match diff reviewed — safe, not mine to commit
- [x] Tracker created

## Phase 1 — User's explicit request: Cost Summary BETA warning

- [ ] Add prominent amber warning banner above Cost Summary
- [ ] Language: (1) BETA, (2) rough early estimates, could be completely wrong, (3) must be fully reviewed by qualified people
- [ ] Commit + push
- [ ] Verify Vercel deploy (Production AND Preview Ready)
- [ ] Verify on live site with agent-browser

## Phase 2 — Design page walkthrough

- [ ] Open HAPS UAV project on fractionalforge.app
- [ ] Research tab: content renders, no console errors
- [ ] Modules tab: 8 modules present, each has required fields
- [ ] Images tab: all 8 illustrations either complete or have retry
- [ ] Re-Research button works
- [ ] Download Engineering Report works
- [ ] Capture bugs → findings list below

## Phase 3 — Specify page walkthrough

- [ ] Overview tab renders (with new BETA banner)
- [ ] Module Specs tab: diagnostic fields, "Continue to Review" gate logic
- [ ] Specialist Review tab: 4 engineers, Start Review flow
- [ ] Manufacturing Intelligence tab: (new, not in stale 4-tab memory)
- [ ] Executive Review tab: (new, not in stale 4-tab memory)
- [ ] Download Report works
- [ ] Bottom CTA to Source works

## Phase 4 — Source page walkthrough

- [ ] BOM renders
- [ ] Supplier matching per module
- [ ] Quote request flow
- [ ] Back to Specify preserves state

## Phase 5 — Assemble page walkthrough

- [ ] Assembly instructions render
- [ ] Outputs / exports present
- [ ] Get Quote CTA functional

## Red Team — 5 rounds (each round: find, fix, verify, log)

- [ ] Round 1 — Image pipeline (timeouts, stuck states, idempotency, cache-bust, Flight payload)
- [ ] Round 2 — State / navigation (stale closures, hydration, deep-link, back/forward)
- [ ] Round 3 — Auth, tenancy, RLS (cross-foundry probes, signed URLs, server action wrappers)
- [ ] Round 4 — Error states (API failure, 300s cap, empty/partial data, silent errors)
- [ ] Round 5 — Mobile / responsive / a11y (light theme enforced, keyboard, focus, contrast)

## Phase 7 — Final report

- [ ] Issues found (by severity + fix status)
- [ ] Screenshots of key states
- [ ] Remaining follow-ups
- [ ] Lessons written to `tasks/lessons.md`
- [ ] Fix log updated in `~/.claude/projects/-Users-tristanfischer/memory/forgeos-fix-log.md`

---

## Findings log (append as we go)

_(populated during execution)_

## Scorecard

| Page | Loaded OK | Interactive OK | Data OK | Bugs Found | Bugs Fixed |
|------|-----------|-----------------|---------|------------|------------|
| Design | — | — | — | 0 | 0 |
| Specify | — | — | — | 0 | 0 |
| Source | — | — | — | 0 | 0 |
| Assemble | — | — | — | 0 | 0 |

## Commit log

_(each commit referenced here as we go)_
