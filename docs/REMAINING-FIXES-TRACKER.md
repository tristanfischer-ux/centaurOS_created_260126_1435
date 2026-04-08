# Remaining Fixes — No Skipping

## Issues (must ALL be fixed before stopping)

### 1. /experts page — root cause crash (not just error boundary)
- [ ] Find the actual render error
- [ ] Fix it so experts actually display
- [ ] Verify on production with real data
- [ ] Screenshot proof of working page

### 2. Specialist conversation in browser
- [ ] Open specialist chat
- [ ] Type a message
- [ ] Watch streaming response
- [ ] Verify PROPOSED_EXTERNAL_ACTION renders (if applicable)
- [ ] Screenshot proof

### 3. Onboarding wizard stuck at Step 2
- [ ] Reproduce the bug
- [ ] Find root cause (why won't it advance?)
- [ ] Fix it
- [ ] Test complete onboarding flow

### 4. Newsletter signup verification
- [ ] Submit newsletter on /blog after fix deployment
- [ ] Verify subscriber saved to site_settings
- [ ] Screenshot proof of success state

### 5. Mobile responsiveness check
- [ ] Test key pages at mobile viewport (375px width)
- [ ] Fix any layout breaks

## Rules
- Do NOT mark an issue as fixed until verified on production
- Do NOT add error boundaries as a substitute for fixing the bug
- Do NOT move to next issue until current one is actually resolved
