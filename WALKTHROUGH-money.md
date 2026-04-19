# Money V2 — Agent-browser walkthrough script

**Scope per Tristan 2026-04-19:** new `/money/*` routes only. Do NOT regression-test legacy `/cash-burn/*`, `/investors`, `/fundraise`, `/the-forge`.

**Test account:** `claude-test@forgeos.test` (flag ON, seeded with test data).
**Login:** `~/.claude/scripts/forgeos-login.sh /money/cockpit`
**Preview URL:** latest feat/money-redesign Vercel preview (resolve via `vercel ls` when the abc54b48 build surfaces).

## Contention rule (per Tristan 2026-04-19)

5 terminals active. Probe agent-browser before using:
1. `agent-browser --version` — if hangs or errors, another terminal has it.
2. On contention: sleep 120s, retry probe.
3. After 3 consecutive failed probes (~6 min), escalate. Don't fight.
4. `agent-browser close --all` when done so the next terminal finds it free.

## Seeded test data in claude-test-foundry

- **money_settings:** GBP, credits_cap_cents=10000, defaults for runway thresholds
- **plan_line_items:** 6 cost lines (salaries / coworking / SaaS / materials) + 2 income lines (consulting / Innovate UK grant)
- **money_scenarios:** 'Base case' (default) + 'Worst case: grant slips'
- **investor_round:** 'Pre-seed · Summer 2026', target £500k, active state
- **investor_pipeline_state:** 7 rows across all stages (target / researching / contacted / meeting / due_diligence / verbal / passed) with match scores + commit amounts

## Routes to walk (in order)

### Cockpit
- [ ] `/money/cockpit` · populated state — runway tile visible, 26-week table renders, Xero "Manual only" badge, no active-round banner gone (since we seeded a round)
- [ ] `/money/cockpit/connect` · Xero not-connected card, "Start plan manually" link

### Plan
- [ ] `/money/plan` · costs grid (6 rows) + income grid (2 rows) + scenario picker shows Base case active
- [ ] `/money/plan/new` · new-line form renders
- [ ] `/money/plan/item/[id]` · pick any line id, verify edit form populates
- [ ] `/money/plan/scenario/[id]` · Base case detail with override list (empty)
- [ ] `/money/plan/scenario/new` · new-scenario form
- [ ] `/money/plan/variance` · variance table renders (probably empty until Xero syncs)
- [ ] `/money/plan/pnl` · 12-month forecast P&L
- [ ] `/money/plan/import` · CSV import stub
- [ ] `/money/plan/log-expense` · quick expense form
- [ ] `/money/plan/send-invoice` · quick invoice form

### Raise
- [ ] `/money/raise` · kanban populated with 7 pipeline rows across 8 stages, round header shows target/committed progress
- [ ] `/money/raise/new-round` · create-round wizard
- [ ] `/money/raise/investor/[id]` · pick a pipeline_state id, verify detail + events timeline
- [ ] `/money/raise/thesis` · thesis builder (empty, no active version yet)
- [ ] `/money/raise/pitch` · 8-section overview (all not_started)
- [ ] `/money/raise/pitch/company` · single section editor
- [ ] `/money/raise/update` · list empty, "Draft new update" CTA
- [ ] `/money/raise/log-touch` · standalone log-touch form

### Settings
- [ ] `/money/settings` · settings form + 6-step onboarding checklist
- [ ] `/money/settings/permissions` · Founder sees self as member, Grant exception dialog opens
- [ ] `/money/settings/audit-log` · audit rows (probably a few from seeding)
- [ ] `/money/settings/credits` · usage widget (probably 0 usage until specialist_call events accrue), budget form, per-specialist + per-section tables

### Sidebar + Today
- [ ] Sidebar shows "MONEY [V2]" header + 3-item group (Cockpit / Plan / Raise) when flag on
- [ ] Sidebar "Credits" pill appears under the existing AI Credits bar
- [ ] `/today` V3b RunwayStub shows live runway card (or not-connected CTA); V4 MoneyPipelineTile shows £500k target progress; V9 MoneySignalCard renders composite

## Capture per route

For each route:
- `agent-browser snapshot` → verify page structure (h1, nav, data tables present)
- `agent-browser screenshot /tmp/money-walk-<slug>.png` → visual sanity check
- Note any: 500 errors, hydration warnings, layout overflow, missing data, semantic-token violations

## Log results

Write findings to TRACKER-money-redesign.md §Walkthrough log. Each issue gets a ticket in fix pass.
