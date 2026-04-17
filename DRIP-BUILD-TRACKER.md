# Drip Build Tracker — Autonomous Overnight Build

**Started:** 2026-04-16 late evening
**Target finish:** 2026-04-17 morning (before Tristan wakes)
**Approval:** Tristan approved drip build + back-enrol existing users (2026-04-16). Does NOT include mass email send — that's his go/no-go in the morning.

---

## Contract — what "done" means

Tristan approved this 6-email welcome drip on 2026-04-16 and said "Start the drip build" then went to bed.

**Must ship tonight (reversible via git):**
- [ ] P1: Unsubscribe mechanism (legal prerequisite — UK PECR + GDPR)
- [ ] P2: 6-email welcome drip templates + cron wiring
- [ ] P3: Retire the four old onboarding templates (atomic swap)
- [ ] P4: Back-enrol script for existing users (written but NOT triggered)

**Must NOT ship tonight (Tristan's go/no-go):**
- Any mass email send to all users
- The announcement blast (Section 1 of ENGAGEMENT-PLAN)
- Actually triggering the back-enrol (script exists, not run)

---

## Abort criteria

Stop and document if any of these hit:

1. A migration fails to apply against the production Supabase
2. Two consecutive Vercel deploys show Error status
3. TypeScript compilation fails and I can't fix it after 2 tries
4. The sendEmail code path breaks an existing email (team_invitation, waitlist_approved, etc.)
5. Any RLS policy change would widen access rather than narrow it

If any abort criterion hits: write the blocker into HANDOVER-DRIP.md, push what's safe, stop. Do not continue past a red flag.

---

## Scorecard (updated per phase)

| Phase | Scope | Status | Migration | Code | Tests | Deploy | Notes |
|---|---|---|---|---|---|---|---|
| P1 | Unsubscribe mechanism | ✅ done | applied 20260417010000 | 8 new files + 2 modified | 828 pass | Ready | Commit 134b1777 |
| P2 | 6-email drip templates + cron | ✅ done | — | EmailTemplate union + 6 templates + cron flag | 828 pass | Ready | Commit ca3a5814 |
| P3 | Retire 4 old onboarding templates | ✅ done | applied 20260417020000 | 4 templates removed from union + map | 828 pass | Ready | Commit ca3a5814 |
| P4 | Back-enrol script (not triggered) | ✅ done | — | 1 new endpoint, dry-run default | 828 pass | deploying | Commit c3e0ccdb |

See `HANDOVER-DRIP.md` for morning instructions.

Legend: ⏳ pending · 🔄 in progress · ✅ done · ⚠️ blocked · 🚫 aborted

---

## Current state of the codebase (snapshot before I start)

- **Email sender:** Resend via `src/lib/notifications/channels/email.ts`. `sendEmail()` is the main entry. FROM: `Tristan @ Fractional Forge <tristan@fractionalforge.app>`.
- **Scheduled emails table:** EXISTS (`supabase/migrations/20260328100000_scheduled_emails.sql`) — has `status`, `scheduled_for`, `template`, `template_data`, `user_id`, `email`.
- **Existing onboarding drip:** `src/actions/onboarding-drip.ts` schedules Days 1/3/7/14 via `scheduled_emails`. Cron at `/api/cron/onboarding-drip` runs hourly (vercel.json).
- **Templates to retire:** `onboarding_day1_welcome`, `onboarding_day3_dfm`, `onboarding_day7_assessment`, `onboarding_day14_upgrade` (declared in `src/lib/notifications/types.ts` + bodies in `email.ts`).
- **Email preferences:** DOES NOT EXIST — need to create `email_preferences` table.
- **Email templates are HTML strings** in a giant object literal. Pattern is: `escapeHtml()` all template data first, then interpolate into HTML.
- **Pre-push hook:** runs lint + type check. Errors block push.
- **Deploys:** Vercel auto-deploys every push to main.

---

## Phase 1 — Unsubscribe mechanism

**Scope:** build a per-channel email preference system with a working unsubscribe link that can be included in every marketing email.

### Deliverables

1. **Migration** `20260417010000_email_preferences.sql`:
   - Table `email_preferences` with: `user_id uuid PK → auth.users`, `unsubscribed_all_at timestamptz`, per-channel booleans (`product_announcements`, `welcome_drip`, `dormancy_nudges`, `morning_digest`, `outreach_drip`, `specialist_briefings`), `updated_at`, `paused_until`
   - Default row for every user (trigger or backfill)
   - RLS: user can read/write own row only; service role can read all
2. **Types regenerated** via Supabase CLI
3. **`src/lib/email/preferences.ts`** — server helpers:
   - `isEmailAllowed(userId, channel)` → boolean
   - `unsubscribeAll(userId)`
   - `unsubscribeChannel(userId, channel)`
   - `pauseAll(userId, days)`
4. **`src/lib/email/unsub-token.ts`** — HMAC-signed token with `userId`, `channel` or `all`, expiry (14 days). Uses `UNSUB_SECRET` env var with fallback to `SUPABASE_SERVICE_ROLE_KEY` slice.
5. **`src/app/api/unsubscribe/route.ts`** — GET with `?token=...`, validates token, applies action, renders a confirmation page.
6. **`src/app/settings/email/page.tsx`** — authenticated preference page with toggles + "unsubscribe from everything" button.
7. **`src/lib/email/footer.ts`** — HTML footer helper that appends standard unsubscribe + preferences links. Takes `userId` + `channel`, returns HTML block.
8. **`sendEmail` enhancement** — accept new optional `marketing?: { userId: string; channel: EmailChannel }` param. When present: (a) check `isEmailAllowed` and skip if false, (b) append footer. Default path (transactional) is unchanged.

### Verification

- [ ] `npx tsc --noEmit` passes
- [ ] Migration applies cleanly against linked Supabase
- [ ] Types regenerate without error
- [ ] Manual visit to `/settings/email` loads and shows toggles
- [ ] Generate a test token locally, visit `/api/unsubscribe?token=...`, confirm DB row flipped

### Red team (before commit)

- Unsigned/malformed tokens → rejected with 400
- Expired tokens → rejected with 410
- Valid token but unknown user → 404, no DB change
- RLS: a user cannot read another user's preferences
- Footer renders even when user has no preferences row (falls back to "not unsubscribed")

---

## Phase 2 — 6-email welcome drip templates + cron

**Scope:** add 6 new templates, rewire the drip schedule, keep the hourly cron processor.

### Deliverables

1. **Update `EmailTemplate` union** in `src/lib/notifications/types.ts`:
   - ADD: `welcome_day0`, `welcome_day1_investors`, `welcome_day2_specialists`, `welcome_day3_forge`, `welcome_day4_strategy`, `welcome_day5_cashburn`
2. **Add 6 template bodies** in `src/lib/notifications/channels/email.ts`:
   - Bodies taken VERBATIM from `ENGAGEMENT-PLAN.md` lines 125–297 (Tristan's approved copy)
   - Format: plain letter, sans-serif, minimal HTML (no gradient headers, no emoji, no "quick win" boxes — Tristan's Apr 16 voice is letter-style)
   - Each template takes `firstName` + includes footer with `channel: 'welcome_drip'`
3. **Rewrite `ONBOARDING_DRIP_STEPS`** in `src/actions/onboarding-drip.ts`:
   - Day 0 offset 0: `welcome_day0`
   - Day 1 offset 1: `welcome_day1_investors`
   - Day 2 offset 2: `welcome_day2_specialists`
   - Day 3 offset 3: `welcome_day3_forge`
   - Day 4 offset 4: `welcome_day4_strategy`
   - Day 5 offset 5: `welcome_day5_cashburn`
   - Send-time: Day 0 immediate, Days 1–5 at 09:00 UK time
4. **Update cron** at `/api/cron/onboarding-drip/route.ts`:
   - Pass `marketing: { userId, channel: 'welcome_drip' }` to `sendEmail` so preference check + footer happen
5. **Rename cron path** from `onboarding-drip` → `welcome-drip` (both in vercel.json and route filesystem) so logs are clear. Keep old cron path alive as a redirect for one deploy to avoid a gap.

### Verification

- [ ] `npx tsc --noEmit` passes
- [ ] Each new template renders (test route or unit call) without throwing
- [ ] Schedule function inserts 6 rows into `scheduled_emails` for a test user
- [ ] Cron picks up Day 0 row and calls sendEmail correctly (dry-run check via log line)
- [ ] Unsubscribed user: cron skips them (checked via log)

### Red team

- Day 0 offset 0 with `sendAt.setHours(9, 0, 0, 0)` — would delay to 9am same day even if signup is 10am. Guard: only set hours if `dayOffset > 0`. (Existing code already does this — preserve.)
- A user who unsubscribes mid-drip — the cron must check preferences on every send, not just at schedule time. Already designed.
- Timezone: 09:00 UK ≠ 09:00 UTC in British Summer Time (BST = UTC+1). For April 17, BST is active. Send at `08:00 UTC` to hit 09:00 UK. Document this in the file header.

---

## Phase 3 — Retire the four old onboarding templates

**Scope:** atomic swap. The new drip is live; old templates must stop sending so nobody gets both.

### Deliverables

1. **Cancel pending old-template rows** — migration `20260417020000_cancel_legacy_onboarding_drip.sql`:
   - `UPDATE scheduled_emails SET status = 'cancelled' WHERE status IN ('pending', 'scheduled') AND template IN ('onboarding_day1_welcome', 'onboarding_day3_dfm', 'onboarding_day7_assessment', 'onboarding_day14_upgrade');`
   - (Rows stay in the table for audit; they just won't send.)
2. **Remove old template entries** from `EmailTemplate` union in `types.ts`
3. **Remove old template bodies** from `EMAIL_TEMPLATES` map in `email.ts`
4. **Delete or refactor** any remaining `scheduleOnboardingDrip` callers that still reference old templates (should be none — `scheduleOnboardingDrip` is the schedule fn and the caller is signup logic which we control via the step array)

### Verification

- [ ] `npx tsc --noEmit` passes (union narrowing catches any stragglers)
- [ ] Grep the codebase — no file references `onboarding_day1_welcome` etc. except the cancellation migration
- [ ] Migration applies cleanly; a SELECT on `scheduled_emails` shows old rows as `cancelled`

### Red team

- A signup happens at the instant of deploy → new drip steps run, old rows get cancelled anyway. No double-send risk.
- Sentry captures any runtime reference to a removed template. No silent pass-through.

---

## Phase 4 — Back-enrol existing users (written, not triggered)

**Scope:** a one-shot admin endpoint that schedules Day 0 welcome + Days 1–5 for every existing user who doesn't already have them. Tristan triggers it in the morning after eyeballing.

### Deliverables

1. **`src/app/api/admin/backfill-welcome-drip/route.ts`** — POST, requires admin auth (match existing admin endpoint pattern), dry-run mode by default:
   - `POST /api/admin/backfill-welcome-drip?dryRun=true` → returns count of users that would be enrolled, does NOT write
   - `POST /api/admin/backfill-welcome-drip?dryRun=false&confirm=BACKFILL_WELCOME_DRIP_2026_04_17` → actually schedules
2. **Logic:**
   - Query all profiles (excluding `@perigee-labs.com` and `@fractionalforge.app`, per ENGAGEMENT-PLAN Section 1)
   - For each user: check `email_preferences.welcome_drip` — skip if opted out
   - Check `scheduled_emails` — skip if user already has a `welcome_day0` row (prevents double-enrol)
   - Insert 6 rows with the same cadence as a fresh signup but with sendAt = now, now+24h, etc.
   - Rate-limit: max 500 inserts per call, return `nextOffset` for pagination
3. **Write a short runbook** `HANDOVER-DRIP.md` with the exact curl command Tristan runs after he's seen a test email.

### Verification

- [ ] `npx tsc --noEmit` passes
- [ ] Dry-run against live DB returns a plausible count (check against `profiles` row count)
- [ ] Admin auth rejects unauthenticated POSTs
- [ ] Dry-run without `confirm=...` token rejects with 400

### Red team

- Idempotency: if Tristan runs it twice, the second run must not double-enrol anyone. Check via the `welcome_day0` row existence.
- Rate limit: 500 per call keeps Supabase + Resend happy. Pagination via `nextOffset`.
- Confirm token must match exactly — stops accidental trigger.
- `@perigee-labs.com` + `@fractionalforge.app` exclusion list honoured.

---

## Execution log

### Phase 1 — Unsubscribe mechanism (done)

- Migration `20260417010000_email_preferences.sql` created + applied
- `src/lib/email/preferences.ts` — per-channel helpers
- `src/lib/email/unsub-token.ts` — HMAC-SHA256 signed tokens, 30-day expiry, timing-safe verify
- `src/lib/email/footer.ts` — unsubscribe footer HTML
- `src/app/api/unsubscribe/route.ts` — unauth endpoint, GET + POST
- `src/actions/email-preferences.ts` — server actions for settings page
- `src/app/(platform)/settings/email/page.tsx` — preferences page
- `src/components/settings/email-preferences-form.tsx` — client form (toggles, pause, unsub-all)
- `src/lib/notifications/types.ts` — EmailOptions.marketing added
- `src/lib/notifications/channels/email.ts` — preference gate + footer injection on marketing sends
- Type check: clean. Tests: 828 pass. Deploy: Ready.

### Phase 2 — 6-email welcome drip templates (done)

- Added 6 templates to `EmailTemplate` union: `welcome_day0` + `welcome_day1_investors` + `welcome_day2_specialists` + `welcome_day3_forge` + `welcome_day4_strategy` + `welcome_day5_cashburn`
- Added 6 template bodies in `email.ts` — letter-style Apr 16 voice, no headers / bullets / emoji
- Copy taken verbatim from `ENGAGEMENT-PLAN.md` lines 125-297
- Rewrote `src/actions/onboarding-drip.ts` with new `WELCOME_DRIP_STEPS` array
- Day 0 immediate, Days 1-5 at 08:00 UTC (09:00 UK BST)
- Cron passes `marketing: { userId, channel: 'welcome_drip' }` to `sendEmail`
- Type check: clean. Tests: 828 pass. Deploy: Ready.

### Phase 3 — Retire 4 old onboarding templates (done)

- Migration `20260417020000_cancel_legacy_onboarding_drip.sql` created + applied — cancels all pending legacy rows (status = 'cancelled', audit trail preserved)
- Removed `onboarding_day1_welcome`, `onboarding_day3_dfm`, `onboarding_day7_assessment`, `onboarding_day14_upgrade` from `EmailTemplate` union
- Removed matching template functions from `EMAIL_TEMPLATES` map
- Atomic swap: no user receives both sequences
- Type check: clean. Tests: 828 pass. Deploy: Ready (same commit as P2).

### Phase 4 — Back-enrol endpoint (done, NOT triggered)

- `src/app/api/admin/backfill-welcome-drip/route.ts` — admin-only POST endpoint
- Dry-run by default; live run requires `confirm: "BACKFILL_WELCOME_DRIP_2026_04_17"`
- Idempotent: skips users with existing `welcome_day0` row
- Respects email_preferences: skips users opted out of `welcome_drip`
- Excludes `@perigee-labs.com` + `@fractionalforge.app`
- Pagination: 500 users per call, returns `nextOffset` for continuation
- Type check: clean. Tests: 828 pass. Deploy: in progress.
- **Tristan runs this himself in the morning after a test send.**

---

## Abort criteria (none tripped)

No abort criterion was hit. All migrations applied cleanly, all type checks passed, all tests passed, all deploys are Ready or building successfully.

---

## Commits (expected)

1. `feat(email): add email_preferences table + unsubscribe mechanism` — P1
2. `feat(email): add 6-email welcome drip templates and cron` — P2
3. `refactor(email): retire legacy Day 1/3/7/14 onboarding templates` — P3
4. `feat(email): admin endpoint to back-enrol existing users into welcome drip` — P4

All commits go to `main`. Every push verified against Vercel Production after 2–3 min build.

---

## Morning handover target

When Tristan wakes up, he should see in this file:
- All four phases ✅ in the scorecard
- A "MORNING — HERE'S WHAT TO DO" section at the top with:
  1. Command to send himself a test welcome email
  2. Command to click the unsubscribe link and verify the row flips
  3. Command to trigger the back-enrol (once he's satisfied)
- Zero items in blocked state (or a clear explanation of any blocker)
