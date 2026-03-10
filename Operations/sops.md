# Fractional Forge — Standard Operating Procedures

**Last Updated**: 3 March 2026
**Status**: Initial framework

---

## 1. Deployment & Release

### Production Deployment

ForgeOS deploys to Vercel on push to `main`.

**Pre-deployment checklist**:
1. Run `npm run verify` (TypeScript + ESLint + Playwright smoke)
2. Run `./scripts/check-design-tokens.sh` if UI changes
3. Ensure all tests pass locally
4. Review Vercel preview deployment (auto-created on PR)
5. Merge to `main` — Vercel auto-deploys
6. Monitor Sentry for new errors post-deploy (15 minutes)
7. Spot-check key flows: login, specialist conversation, marketplace browse

**Rollback procedure**:
1. Go to Vercel dashboard → Deployments
2. Find last known good deployment
3. Click "Promote to Production"
4. Investigate root cause before re-deploying

### Database Migrations

1. Create migration: `npx supabase migration new [name]`
2. Write SQL in `supabase/migrations/`
3. Test locally: `npx supabase db push` (against linked project)
4. Regenerate types: `npx supabase gen types typescript --linked > src/types/database.types.ts`
5. Verify: `npx tsc --noEmit`
6. Deploy: migrations run automatically on `db push`

**NEVER**: Run destructive migrations (DROP TABLE, DROP COLUMN) without a backup plan.

---

## 2. Incident Response

### Severity Levels

| Level | Definition | Response Time | Example |
|-------|-----------|--------------|---------|
| **P1 — Critical** | Service completely down, data loss risk | Immediate | Database unreachable, auth broken |
| **P2 — Major** | Core feature broken, significant user impact | Within 1 hour | Specialist conversations failing, payments broken |
| **P3 — Minor** | Feature degraded, workaround exists | Within 4 hours | Slow page loads, UI glitch |
| **P4 — Low** | Cosmetic issue, no user impact | Next business day | Typo, minor styling issue |

### Incident Response Steps

1. **Detect**: Sentry alert, user report, or monitoring
2. **Assess**: Determine severity level
3. **Communicate**: If P1/P2, post status update (when status page exists)
4. **Mitigate**: Apply quickest fix (rollback, feature flag, etc.)
5. **Resolve**: Proper fix with tests
6. **Review**: Post-incident write-up for P1/P2

### Key Service Contacts

| Service | Status Page | Support |
|---------|------------|---------|
| Vercel | status.vercel.com | Support ticket |
| Supabase | status.supabase.com | Support ticket |
| Stripe | status.stripe.com | Dashboard support |
| Anthropic | status.anthropic.com | Support email |
| OpenAI | status.openai.com | Support portal |

---

## 3. Customer Support

### Current Process (Founder-Led)

1. Support requests via email (to be set up)
2. In-app help page (`/help`) with FAQ
3. Direct engagement for early users

### Triage Rules

| Type | Priority | Response SLA |
|------|----------|-------------|
| Payment issues | High | Same day |
| Can't login / auth issues | High | Same day |
| Feature not working | Medium | Within 24 hours |
| Feature request | Low | Within 1 week |
| How-to question | Low | Within 48 hours |

### Templates Needed
- [ ] Welcome email for new signups
- [ ] Activation nudge (day 3, day 7)
- [ ] Support acknowledgement
- [ ] Bug report follow-up
- [ ] Feature request acknowledgement

---

## 4. Marketplace Provider Onboarding

### Onboarding Flow

1. **Application**: Provider applies via `/provider-signup` or direct outreach
2. **Review**: Check profile, portfolio, credentials (manual for now)
3. **Approval**: Approve or request more information
4. **Setup**: Provider completes `/provider-portal` setup (listing, pricing, portfolio)
5. **Stripe Connect**: Provider connects Stripe account for payouts
6. **Go Live**: Listing published to marketplace
7. **Check-in**: Follow up at 2 weeks to ensure they're getting enquiries

### Provider Quality Standards
- Complete profile with professional photo
- At least one portfolio item or case study
- Relevant experience in hardware/manufacturing domains
- Responsive to enquiries (target <24 hour response)
- Professional communication

---

## 5. Vendor Management

### Current Vendors

| Vendor | Service | Monthly Cost | Contract Type | Renewal |
|--------|---------|-------------|--------------|---------|
| Vercel | Hosting | ~£20 | Pay-as-you-go | Monthly |
| Supabase | Database/Auth | ~£25 | Subscription | Monthly |
| Stripe | Payments | % of revenue | Pay-as-you-go | N/A |
| Anthropic | Claude AI | Usage-based | API key | N/A |
| OpenAI | GPT-4o | Usage-based | API key | N/A |
| Google | Gemini AI | Usage-based | API key | N/A |
| Modal.com | CAD execution | Usage-based | API key | N/A |
| Resend | Email | ~£20 | Subscription | Monthly |
| Sentry | Monitoring | ~£26 | Subscription | Monthly |
| GitHub | Source control | Free | Free tier | N/A |

### Vendor Review Cadence
- Monthly: Review costs vs. budget
- Quarterly: Assess alternatives, negotiate if spending increases
- Annual: Full vendor audit

---

## 6. Security Operations

### Access Control

| System | Who Has Access | 2FA Required |
|--------|---------------|-------------|
| GitHub repo | Founder | Yes |
| Vercel dashboard | Founder | Yes |
| Supabase dashboard | Founder | Yes |
| Stripe dashboard | Founder | Yes |
| AI provider accounts | Founder | Yes |
| Domain registrar | Founder | Yes |

### Key Rotation
- API keys: Rotate quarterly or on any suspected breach
- Database credentials: Managed by Supabase (rotate if compromised)
- Stripe keys: Rotate if any team member leaves

### Monitoring
- Sentry: Error tracking and alerts
- Vercel: Deployment monitoring
- Supabase: Database performance dashboard
- Stripe: Payment event monitoring

---

## 7. Data Backup & Recovery

### Current State
- Database: Supabase handles backups (daily, point-in-time recovery on Pro)
- Code: GitHub (distributed, every developer has full clone)
- User files: Supabase Storage (backed up with database)

### Disaster Recovery
- **RTO (Recovery Time Objective)**: <1 hour for re-deployment
- **RPO (Recovery Point Objective)**: <24 hours (Supabase daily backups)
- Vercel can redeploy any previous git commit in minutes
- Database restore via Supabase dashboard

---

## Action Items

1. [ ] Set up customer support email address
2. [ ] Create status page (StatusPage, Instatus, or simple GitHub page)
3. [ ] Document all API keys and their locations (securely)
4. [ ] Set up Sentry alert rules for P1/P2 incidents
5. [ ] Write provider onboarding email sequence
6. [ ] Schedule first vendor cost review (monthly)
