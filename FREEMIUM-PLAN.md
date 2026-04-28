# Freemium Sandbox Plan

**Decision date**: 2026-04-24
**Status**: Plan locked, implementation sequenced
**Driver**: Tristan Fischer (Founder)

## The product shape

**Public play → register on interaction → subscribe after a few goes.**

Cost-aware freemium. Low-cost APIs keep the anonymous tier economical. The bar for entry is "click link, use the product", not "create account, fill form, confirm email".

## Locked answers (2026-04-24)

| Question | Answer |
|---|---|
| Homepage CTA lands where? | `/agents` Brainstorming page, directly (no picker) |
| Anonymous session persistence | 30-day cookie-keyed, survives tab close |
| Anonymous Forge access | Read-only seeded demo project visible to anyone |
| Email verification timing | In immediately, verify in background via drip reminders |
| Right-hand AdvisorPanel | Remove with modal fallback (Phase E) |

## Three states of access

### 1. Anonymous (no account)
- **Cookie**: `forge_anon_id` — UUID, 30-day TTL, httpOnly, Secure
- **Supabase auth**: none; no profile row
- **Caps per `forge_anon_id`**:
  - 1 full brainstorming session on `/agents` (pick an idea prompt or type own topic, run end-to-end, see output on screen; output NOT saved to any DB row)
  - 3 investor searches on `/investors` (full semantic matching, top-10 results; not saved)
  - Read-only browse of `/the-forge-v2` (one seeded demo project visible)
  - Full browse of `/marketplace` and `/recruits` (no save/contact actions)
- **Hard walls requiring registration**:
  - Starting a 2nd brainstorming session
  - Running a 4th investor search
  - "Save investor", "Save listing", "Contact", "Export", "Download"
  - Creating a Forge project
- **Rate limits** (abuse protection):
  - Max 5 brainstorm calls / hour per IP + anon_id
  - Max 15 searches / day per IP + anon_id
  - Above threshold → force registration wall
- **Model tier**: every anonymous LLM call routes to cheapest available model (Haiku / Gemini Flash / GLM / DeepInfra via OpenRouter). Never use premium models on anonymous tier.
- **Cost logging**: every anonymous LLM call logged to `anonymous_usage` table.

### 2. Registered free tier (post-signup, pre-pay)
- Created automatically from any registration trigger. Sandbox foundry: `is_sandbox=true`.
- Monthly caps:
  - 10 brainstorming sessions
  - 30 investor searches
  - 1 Forge project (no PDF export)
  - 50 saved items (listings, investors, outputs)
- On-screen usage meter in sidebar footer (tiny, non-intrusive): `12/30 searches this month`
- **Every feature works** — no feature-based gating, only volume-based.

### 3. Paid (existing Explorer / Starter / Pro / Enterprise)
- Plans already set up in Stripe.
- Hand-off from free tier on hard walls (see subscription triggers).

## Subscription triggers

Any ONE of these fires → route to `/pricing?from=<cap-name>`:

| Rule | Trigger | Behaviour |
|---|---|---|
| `brainstorming_sessions_this_month >= 8` | soft nudge | Banner: "2 sessions left — upgrade to keep going" |
| `brainstorming_sessions_this_month >= 10` | hard wall | Block next brainstorm, inline subscription card |
| `investor_searches_this_month >= 30` | hard wall | Block next search, inline subscription card |
| 2nd Forge project creation | hard wall | Block, inline card |
| Click "Export", "Generate PDF", "Download" | hard wall | Block, premium action |

The `?from=<cap-name>` query param must be logged on `/pricing` so we can measure which cap drives the most conversions and tune accordingly.

## Registration trigger (the inline sign-up card)

- Shown inline, not as a full-page blocker.
- Copy: *"Save this to your sandbox — takes 20 seconds. No credit card."*
- Fields: **email + password** (or Google OAuth — one click). Nothing else at this step.
- On submit:
  1. Create Supabase auth user
  2. Call `setupNewUser()` with `role='executive'` and `is_sandbox=true` foundry
  3. Auto-port the anonymous session data: brainstorm outputs + search history joined on `forge_anon_id` cookie, migrated into the new sandbox foundry as saved items
  4. Clear `forge_anon_id` cookie
  5. Land on `/agents` with toast: *"Saved — this is your sandbox."*
- Company name, stage, industry, sector come later (can nudge inside the app when they create a Forge project or run a targeted investor search).
- Email verification is NOT blocking. User is in immediately. Background drip: verify at 24h, nudge at 72h, warn at 7 days, degrade experience only after 14 days unverified.

## Data model

### New tables

```
anonymous_usage
  id           uuid PK
  anon_id      text (forge_anon_id cookie value, indexed)
  action       text ('brainstorm' | 'investor_search' | 'forge_browse' | ...)
  model_used   text (actual model slug, e.g. 'haiku-4-5')
  tokens_in    int
  tokens_out   int
  cost_usd     numeric(10,6)
  ip_address   inet (for rate limiting + abuse detection)
  created_at   timestamptz default now()
  ⇒ index on (anon_id, created_at)
  ⇒ index on (ip_address, created_at)

usage_meters (or RPC computed on the fly)
  foundry_id               text PK
  month                    date PK (first day of month)
  brainstorm_sessions      int
  investor_searches        int
  forge_projects_created   int
  saved_items              int
  updated_at               timestamptz
```

### Schema additions

```sql
alter table foundries add column is_sandbox boolean default false;
alter table profiles add column email_verified_at timestamptz;
```

Middleware — on registration with an active `forge_anon_id`:
```
-- Pseudo: in setupNewUser(), after profile creation
UPDATE anonymous_usage
SET anon_id = NULL, migrated_to_foundry_id = <new foundry_id>
WHERE anon_id = <cookie_value>;

-- Move saved anonymous brainstorm outputs into the new foundry's saved items
-- (if we ever decide to save anonymous outputs server-side; default MVP is to
-- keep anonymous outputs client-only and just migrate the USAGE COUNTERS).
```

## Implementation order

Step (a) is load-bearing — ship it invisibly before anything else. Steps (b)–(e) all depend on the plumbing in (a).

### Phase F Step 1 — Plumbing (invisible)
- [ ] Middleware: set/read `forge_anon_id` cookie (30-day TTL, httpOnly, Secure) on every request from an unauthenticated user
- [ ] Migration: create `anonymous_usage` table + indexes
- [ ] Model tier selector: new helper `getModelForTier('anonymous' | 'free' | 'paid')` that returns the cheapest available model from the OpenRouter roster for each tier
- [ ] Logging: wrap every LLM call site with usage logging (add to existing `callLlm()` wrapper if one exists)
- [ ] NO UI changes in this step

### Phase F Step 2 — Unlock anonymous `/agents` + `/investors`
- [ ] `/agents` server component: check auth; if unauthenticated, enforce per-anon-id cap of 1 brainstorm session, use cheap model
- [ ] `/investors` server component: same pattern, cap of 3 searches
- [ ] Both pages: inline signup card component rendered when hard wall hit

### Phase F Step 3 — Inline signup + session migration
- [ ] Extract `BriefSpecialistDialog`-style pattern into a reusable inline signup component
- [ ] Call `setupNewUser({ is_sandbox: true, migrate_anon_id: cookie })` on submit
- [ ] Session migration query: update `anonymous_usage.anon_id` → link to foundry
- [ ] Clear `forge_anon_id` cookie post-signup

### Phase F Step 4 — Usage meters + gating
- [ ] `usage_meters` table or RPC: compute month-to-date counts per foundry per metered action
- [ ] Sidebar footer meter component (desktop + mobile)
- [ ] Soft-nudge banner at 80% cap
- [ ] Hard-wall modal at 100% cap → route to `/pricing?from=<cap-name>`
- [ ] Premium-action gates: "Export", "PDF", "Download" buttons check `user.subscription_tier` before firing

### Phase F Step 5 — Homepage CTA
- [ ] Replace current homepage primary CTA with "Try it now — no signup" → `/agents`
- [ ] Secondary CTA: existing "Sign in" stays
- [ ] Remove any "Sign up" friction from the marketing surface

## Success metrics (instrument these from day 1)

- `anonymous_usage` rows per IP per day — abuse baseline
- Anonymous → registered conversion: % of `forge_anon_id` cookies that sign up within 7 days
- Registered → paid conversion: % of registered users that hit a hard wall and subscribe within 30 days
- Cap-to-conversion attribution: which `?from=<cap-name>` param drives the highest conversion
- Cost per anonymous session: total `anonymous_usage.cost_usd` ÷ distinct anon_ids per day

## Risks + mitigations

| Risk | Mitigation |
|---|---|
| Anonymous abuse (bots, scraping, LLM-cost DDoS) | Rate limits per IP + per anon_id; cheap model tier hard-coded; daily cap on total anonymous cost (kill switch) |
| Anonymous session data loss on cookie clear | User clears cookies = they start fresh. Acceptable; document on homepage: "Play without an account. Save what you build by signing up." |
| Paid users feel less special | Premium features (PDF export, bulk actions, unlimited Forge projects) stay paid; free tier is volume-capped, not feature-capped — paid gets real value |
| Existing founders on `/today` get disoriented | `/today` route stays mounted (deep links work), but new default is `/agents`. Already shipped as Phase C. |

## Related decisions already landed

- Brainstorming page (`/agents`) is the new default landing (Phase C)
- Sidebar collapsed: BRAINSTORMING / FUNDRAISING / WORKSHOP / MARKETPLACE (Phase A)
- Key leaders swapped to Fang/Chase/Fiona/Sage
- Right-hand AdvisorPanel being removed in favour of modal fallback (Phase E)
