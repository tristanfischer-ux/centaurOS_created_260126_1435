# Wave 6 Removal Notes

## Fix 2: /plan + Plan stickiness removal (2026-04-25)

### What was removed

- `src/app/(platform)/plan/` — the /plan route and all sub-pages
- `src/app/(platform)/plan/_components/` — plan-history-feed, decision-log, streak-chip, what-changed-banner
- `src/actions/plan/` — fetch-plan-history.ts, fetch-plan-streak.ts, fetch-plan-summary.ts, log-decision.ts
- `src/lib/email/weekly-plan-digest-template.ts` — weekly plan email template
- `src/app/api/cron/weekly-digest/` — cron route that sent weekly digest emails
- Weekly-digest cron entry removed from `vercel.json`
- Plan sidebar section removed from `src/components/sidebar/Sidebar.tsx`
- Redirect added: `/plan` and `/plan/*` now redirect to `/agents`

### Database tables left in place (cheap dead tables, safe to leave)

These tables still exist in the Supabase database and will continue to be visible in the schema. No migrations were created to drop them because:
1. Dropping tables is destructive and irreversible
2. The tables are not harming anything by existing
3. They can be dropped later via a dedicated migration if desired

Tables to clean up when ready:
- `plan_history` — stores the history of plan changes per foundry
- `decisions` — decision log entries
- Profile columns: `plan_streak_current`, `plan_streak_longest`, `plan_streak_last_updated` (on `profiles` table)

To drop them, create a migration in `supabase/migrations/` with appropriate DROP TABLE and ALTER TABLE statements.

### Routes left in place (sidebar entries removed but routes still exist)

- `/strategy` — route exists, no longer in sidebar
- `/new-objectives` — route exists, no longer in sidebar
- `/new-tasks` — route exists, no longer in sidebar

These routes are not broken, just unreachable from the sidebar. They can be deleted in a later wave or repurposed.

---

## Fix 3: /admin/cost removal (2026-04-25)

### What was removed

- `src/app/(platform)/admin/cost/` — the cost dashboard route

### What remains

- `src/app/(platform)/admin/layout.tsx` — kept (other admin routes may still use it)
- `src/app/(platform)/admin/waitlist/` — kept
- `llm_usage` table — kept in Supabase; cost logging instrumentation continues writing to it
- Direct SQL queries via Supabase MCP are the replacement: `SELECT * FROM llm_usage ORDER BY created_at DESC LIMIT 50`

---

## Fix 5: Settings audit (2026-04-25)

### Audit findings

| Item | Status | Notes |
|---|---|---|
| Account email + change password | Present | `/settings/account/page.tsx` handles this |
| Subscription / billing tier | Present | `/settings/billing/page.tsx` shows current tier and "Manage subscription" |
| Forge Ambassador status | Present | Wave 2C — ambassador chip visible in `/me` and `/settings` |
| Email preferences | Gap filled | See below |
| Foundry settings | Present | `/settings/company/page.tsx` |
| Privacy / data export | Present | `/settings/privacy/page.tsx` with GDPR export link |
| Delete account | Present | `/settings/account/page.tsx` with destructive action |

### Empty states added

- Email preferences: `src/app/(platform)/settings/email/page.tsx` — rendered honest empty state with copy "Email preferences are not yet configurable in-app. To update your email preferences, contact support at hello@fractionalforge.com." No new schema required.

---
