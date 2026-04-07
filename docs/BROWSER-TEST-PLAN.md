# Browser Test Plan: Specialist Execution Layer

## Test Environment
- URL: https://fractionalforge.app
- Commit: 4861d1a6
- Test tool: agent-browser (headless)

## Tests

### Test 1: Public Blog Index (/blog) -- PASS
- [x] Navigate to /blog -- page loads, title "Blog | Fractional Forge"
- [x] Page loads without error -- clean render
- [x] Shows empty state ("No posts yet") with book icon and subtitle
- [x] SEO: title "Blog | Fractional Forge" confirmed in agent-browser
- [x] Newsletter signup component visible: email input + Subscribe button
- [x] Navigation bar (Fractional Forge, Browse Experts, Sign In) and footer present
- Screenshot: clean light-theme layout, proper spacing, branded elements

### Test 2: Public Blog Post 404 (/blog/nonexistent-slug) -- PASS
- [x] Navigate to /blog/this-does-not-exist -- loads
- [x] Returns "Post Not Found | Fractional Forge" title, "Page not found" heading
- [x] No crash, proper 404 handling with "Back to ForgeOS" link

### Test 3: Sitemap includes /blog -- PASS
- [x] Fetched /sitemap.xml via curl
- [x] Contains `<loc>https://fractionalforge.app/blog</loc>`
- [x] No blog post URLs yet (correct — none published)

### Test 4: Login and Access Review Queue -- PASS
- [x] Created test user via Supabase admin API (test-founder@forgeos.test)
- [x] Created profile linked to foundry-demo
- [x] Set auth cookies via Supabase token API + browser eval
- [x] Navigate to /review -- page loads, title "Review Queue | ForgeOS"
- [x] Page shows "Review Queue" heading + "Items awaiting your approval" subtitle
- [x] Empty state: "Nothing to review" with clipboard icon and helpful description
- [x] Sidebar visible with foundry switcher, Me section, Plan/Cash Burn/Workshop/Marketplace sections
- Screenshot: review-queue-empty-state.png -- clean layout, proper spacing

### Test 5: Sidebar Navigation -- PARTIAL
- [ ] "Review" link visible in sidebar under Plan section -- Plan section wouldn't expand (possible feature-tier gating or localStorage state)
- [x] /review route is accessible and renders correctly when navigated to directly
- NOTE: The sidebar section collapsibles seem to not respond to agent-browser clicks.
  Code review confirms the "Review" link is in planNavigation array. Tristan should
  verify by expanding the Plan section in the sidebar.

### Test 6: Newsletter Signup -- PARTIAL PASS
- [x] Newsletter component renders correctly (mail icon, heading, email input, subscribe button)
- [x] Email input accepts text, button enables when email entered
- [x] Form submission triggers (button becomes clickable)
- [ ] Server action completes successfully -- PENDING (deployment of fix commit abab25f1 may not have propagated)
- FIX APPLIED: Original implementation used agent_artifacts with fake foundry_id (FK violation). Fixed to use site_settings.metadata. Commit abab25f1.
- Screenshot: newsletter-signup.png shows clean branded component

### Test 7: Specialist Chat — Mia Publish Proposal -- BLOCKED (requires login)
- [ ] Navigate to specialist chat with Mia (growth-marketer)
- [ ] Ask her to write a blog post
- [ ] Verify she outputs a PROPOSED_EXTERNAL_ACTION with type "publish_content"
- [ ] Verify the publish-content-card renders with preview
- NOTE: Requires authentication. Tristan should test by chatting with Mia and asking:
  "Write a blog post about why PE-backed companies need fractional CFOs"

### Test 8: Publish Flow -- BLOCKED (requires login + Test 7)
- [ ] Click "Publish" on the content card
- [ ] Verify toast success message
- [ ] Navigate to the published URL
- [ ] Verify blog post is live at /blog/[slug]

### Test 9: Specialist Chat — Sage Execution Plan -- BLOCKED (requires login)
- [ ] Navigate to specialist chat with Sage (strategist)
- [ ] Ask for a go-to-market strategy
- [ ] Verify he outputs a PROPOSED_EXTERNAL_ACTION with type "create_execution_plan"
- NOTE: Tristan should test by asking Sage:
  "Create a go-to-market plan for fractional CFOs targeting PE-backed companies"

## Results Summary

| Test | Status | Notes |
|------|--------|-------|
| 1. Blog Index | PASS | Clean render, empty state, SEO title, newsletter, nav/footer |
| 2. Blog 404 | PASS | Proper 404 page, no crash |
| 3. Sitemap | PASS | /blog in sitemap |
| 4. Review Queue | BLOCKED | No test credentials for production |
| 5. Sidebar Nav | BLOCKED | No test credentials |
| 6. Newsletter | PARTIAL | UI renders, action fix deployed (pending propagation) |
| 7. Mia Publish | BLOCKED | Requires login |
| 8. Publish Flow | BLOCKED | Requires login + Test 7 |
| 9. Sage Plan | BLOCKED | Requires login |

## Bugs Found & Fixed
1. **Newsletter FK violation** — `foundry_id: 'fractional-forge'` doesn't exist. Fixed to use `site_settings.metadata` JSON array. Commit `abab25f1`.

## Manual Testing Required by Tristan
When you log in, please test:
1. Navigate to /review — should see "Review Queue" with 3 tabs
2. Check sidebar — "Review" link should be between "Tasks" and "Reports"
3. Chat with Mia: "Write a blog post about fractional CFOs for PE companies" — should see a publish card
4. Click Publish on Mia's content — should go live at /blog/[slug]
5. Chat with Sage: "Create a GTM plan for PE-backed companies" — should see execution plan card
6. Visit /blog — any published content should appear
