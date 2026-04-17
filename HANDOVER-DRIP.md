# Morning Handover — Welcome Drip Build

**Built overnight:** 2026-04-16 → 2026-04-17
**Status:** All four phases shipped. Zero mass emails sent. You control the go/no-go.

---

## TL;DR

The 6-email welcome drip is live for **new signups** (Day 0 fires automatically when anyone registers from now on). The back-enrol endpoint for **existing users** is deployed but in dry-run mode — it will not send anything until you run it with a live flag. Every outbound email now carries a working unsubscribe footer.

---

## What to do this morning (in order)

### 1. Post the LinkedIn supply-side post

Already drafted in `drafts/linkedin-post-supply-side.md`. Copy-paste into LinkedIn. Target time: **08:30 UK**. This is unchanged from last night.

### 2. Verify the welcome drip works (5 minutes)

Open the site on your logged-in browser, then:

**a. Visit the email preferences page:**
```
https://fractionalforge.app/settings/email
```
You should see six channel toggles, a "Pause for 90 days" button, and an "Unsubscribe from everything" button. All toggles should be on (you haven't opted out of anything).

**b. Send yourself a test email.** I can't easily trigger this without a new signup, so the simplest test is:
- Sign up a test account with a different email (or use your @gmail)
- Day 0 welcome should arrive within 30 seconds
- Footer should carry three links: "Unsubscribe from these emails", "Unsubscribe from everything", "Manage preferences"

**c. Click the "Unsubscribe from these emails" link.** It should take you to a confirmation page ("Unsubscribed from this channel") and flip the `welcome_drip` flag on the test user's `email_preferences` row.

**d. Verify with a DB query** (if you want to be thorough):
```sql
SELECT user_id, welcome_drip, unsubscribed_all_at, updated_at
  FROM email_preferences
 ORDER BY updated_at DESC
 LIMIT 5;
```

If all four steps pass, the plumbing is sound.

### 3. Decide on back-enrolling existing users

You approved this last night. The question is just timing — you may want to watch one or two test emails hit YOUR inbox first before enrolling everyone else.

**Dry-run first** (safe, counts only):
```bash
curl -X POST 'https://fractionalforge.app/api/admin/backfill-welcome-drip' \
  -H "Cookie: $(get-your-session-cookie-here)" \
  -H 'Content-Type: application/json' \
  -d '{"dryRun": true}'
```

The response tells you:
- `processed`: how many users were examined
- `enrolled`: how many WOULD be enrolled (live count)
- `skippedExcludedDomain`: @perigee-labs / @fractionalforge users (excluded by design)
- `skippedExisting`: users who already have a welcome_day0 row
- `skippedOptedOut`: users who already unsubscribed from welcome_drip
- `nextOffset`: null if done, or a number for the next page

**Live run** (actually sends Day 0 emails + schedules Days 1-5):
```bash
curl -X POST 'https://fractionalforge.app/api/admin/backfill-welcome-drip' \
  -H "Cookie: $(get-your-session-cookie-here)" \
  -H 'Content-Type: application/json' \
  -d '{"dryRun": false, "confirm": "BACKFILL_WELCOME_DRIP_2026_04_17", "offset": 0}'
```

Pagination: if `nextOffset` is non-null in the response, re-run with `"offset": <nextOffset>` to do the next page.

### How to get your session cookie for the curl

Easiest: in Chrome, F12 → Network tab → visit any `fractionalforge.app` page → inspect any request → copy the full `Cookie:` header. Paste it into the curl.

If the cookie thing is too fiddly, tell me in the morning and I'll build a small admin page at `/admin/backfill-welcome-drip` with a "Dry run" and "Go live" button.

---

## What got built

### Phase 1 — Unsubscribe mechanism (legal prerequisite)

- New table: `email_preferences` (one row per user, per-channel booleans + hard-stop + pause)
- HMAC-signed unsubscribe tokens (30-day expiry, timing-safe verification)
- `/api/unsubscribe` route accepting GET + POST, works without being logged in
- `/settings/email` page with toggles, 90-day pause, and unsubscribe-all
- `sendEmail` now accepts `marketing: { userId, channel }` — triggers preference check + appends footer
- Transactional emails (password reset, order status) bypass this gate entirely

### Phase 2 + 3 — Welcome drip + legacy retirement

- Six new templates in Tristan's Apr 16 letter voice (no headers, no bullets, no boxes):
  - `welcome_day0` — immediate on signup
  - `welcome_day1_investors` — 7,800 investor matching
  - `welcome_day2_specialists` — 13 AI specialists + marketplace
  - `welcome_day3_forge` — The Forge design workbench
  - `welcome_day4_strategy` — business plan to a week of work
  - `welcome_day5_cashburn` — runway + speed-vs-cost tradeoff
- Send time: Day 0 immediate, Days 1-5 at 08:00 UTC (09:00 UK BST)
- Old templates (onboarding_day1_welcome, day3_dfm, day7_assessment, day14_upgrade) removed from code
- Migration 20260417020000 cancels any pending legacy rows — nobody gets both sequences
- The hourly cron (`/api/cron/onboarding-drip` — name kept for continuity) now passes the marketing flag so preference check + footer happen on every send

### Phase 4 — Back-enrol endpoint for existing users

- `/api/admin/backfill-welcome-drip` POST endpoint (admin-only)
- Dry-run by default, live run requires `confirm: "BACKFILL_WELCOME_DRIP_2026_04_17"`
- Paginated: 500 users per call, stable ordering
- Idempotent: skips users who already have a welcome_day0 row
- Respects email_preferences: skips opted-out users
- Excludes internal domains

---

## Files changed (reference)

**Migrations:**
- `supabase/migrations/20260417010000_email_preferences.sql`
- `supabase/migrations/20260417020000_cancel_legacy_onboarding_drip.sql`

**New code:**
- `src/lib/email/preferences.ts` — per-channel helpers
- `src/lib/email/unsub-token.ts` — HMAC-signed tokens
- `src/lib/email/footer.ts` — unsubscribe footer HTML
- `src/app/api/unsubscribe/route.ts` — unauth endpoint for email links
- `src/actions/email-preferences.ts` — server actions for settings page
- `src/app/(platform)/settings/email/page.tsx` — preferences page
- `src/components/settings/email-preferences-form.tsx` — client form
- `src/app/api/admin/backfill-welcome-drip/route.ts` — back-enrol endpoint

**Changed:**
- `src/lib/notifications/channels/email.ts` — marketing gate + footer, 6 new templates, 4 old ones removed
- `src/lib/notifications/types.ts` — EmailTemplate union updated, EmailOptions.marketing added
- `src/actions/onboarding-drip.ts` — rewritten to use new step array
- `src/app/api/cron/onboarding-drip/route.ts` — passes marketing flag
- `src/types/database.types.ts` — regenerated for email_preferences table

---

## Risks I'm watching

1. **Token secret fallback.** `UNSUB_TOKEN_SECRET` env var doesn't exist in prod; the code falls back to deriving from `SUPABASE_SERVICE_ROLE_KEY` (namespaced, so a leaked unsub token can't be used as an SRK). Fine for now. When you have a spare minute, set `UNSUB_TOKEN_SECRET` to a proper 32+ byte random string in Vercel env vars.

2. **BST vs GMT.** Days 1-5 are scheduled at `08:00 UTC` which is `09:00 UK` in BST (Mar-Oct) and `08:00 UK` in GMT (Nov-Feb). During BST this looks right; during GMT it's an hour earlier than ideal but still a reasonable inbox time. Acceptable.

3. **Cron path name.** The Vercel cron is still called `/api/cron/onboarding-drip` because renaming Vercel cron paths mid-flight requires coordinated two-stage deploys. Logs will say "OnboardingDrip Cron" but the code inside says "WelcomeDrip Cron". Cosmetic — no runtime risk.

4. **First-signup flow.** I didn't re-test the signup → scheduleOnboardingDrip path end-to-end live. The code is correct by inspection and passes type checks + tests; but if you see a new signup that doesn't receive a Day 0 email, check the Vercel logs for `[WelcomeDrip]` entries.

---

## Not done tonight (deliberately)

- **Announcement blast (Section 1 of ENGAGEMENT-PLAN).** You approved the drip build, not the blast. That's your morning go/no-go.
- **Dormancy drip (Section 4).** Separate phase — not in scope tonight.
- **`/admin/backfill-welcome-drip` UI page.** CLI-only for now. Tell me if you want the web button.

---

## If something is broken

Reply here. I am waking up when you wake up. Worst case: every marketing send respects the preference check, so even if some path is wrong, unsubscribed users will not receive anything.
