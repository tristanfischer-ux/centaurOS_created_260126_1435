# Red Team: Specialist Execution Layer — 5 Rounds

## What We're Testing
The new specialist execution layer that enables:
1. Content publishing (blog posts, pages, case studies)
2. Review queue with inline editing and revision loop
3. Execution plans (strategy → task decomposition)
4. Newsletter capture
5. Site settings for config-driven features

## Red Team Protocol
Each round: identify issues → fix issues → verify fix → document. 
Only move to next round after all issues from current round are resolved.

---

## Round 1: Security & Data Isolation

### Checklist
- [ ] RLS on agent_artifacts publish columns — can a non-founder publish?
- [ ] RLS on execution_plans — can User A see User B's plans?
- [ ] Published content RPC — does it leak draft content?
- [ ] Newsletter signup — can it be abused (rate limiting, spam)?
- [ ] Site settings — can a non-founder modify?
- [ ] Slug injection — can XSS be injected via slug field?
- [ ] Content XSS — does markdown rendering sanitize dangerous content?

### Findings
(filled during testing)

### Fixes Applied
(filled after fixes)

---

## Round 2: Error Handling & Edge Cases

### Checklist
- [ ] What happens when publish_metadata is null/malformed?
- [ ] What happens when slug is empty or contains special characters?
- [ ] What happens when the same slug is used twice in the same foundry?
- [ ] What happens when a non-existent artifact ID is passed to publishContent?
- [ ] What happens when execution plan decomposition has 0 tasks?
- [ ] What happens when getReviewQueue is called with no foundry?
- [ ] What happens when newsletter signup gets invalid email?
- [ ] Blog index with 0 posts — does it render cleanly? (verified: yes)
- [ ] Blog post 404 — does it render cleanly? (verified: yes)

### Findings
(filled during testing)

### Fixes Applied
(filled after fixes)

---

## Round 3: Integration & Flow Integrity

### Checklist
- [ ] Does the specialist sweep actually include revision context?
- [ ] Does the PROPOSED_EXTERNAL_ACTION parser handle publish_content correctly?
- [ ] Does the external-action-card switch statement cover all new types?
- [ ] Does revalidatePath actually work after publishing?
- [ ] Does the sitemap dynamically include new blog posts after publish?
- [ ] Does the review queue update after publishing an item?
- [ ] Does plan status auto-advance when all tasks complete?

### Findings
(filled during testing)

### Fixes Applied
(filled after fixes)

---

## Round 4: Performance & Scalability

### Checklist
- [ ] Blog index with 100+ posts — does pagination work?
- [ ] Review queue with 50+ items — does it load efficiently?
- [ ] Newsletter subscribers at 1000+ — does JSONB approach hold?
- [ ] Execution plan with 20+ tasks — does decomposition handle it?
- [ ] Published content view count — does increment_content_view have race conditions?
- [ ] Sitemap with 500+ blog posts — does it generate within timeout?

### Findings
(filled during testing)

### Fixes Applied
(filled after fixes)

---

## Round 5: User Experience & Polish

### Checklist
- [ ] Blog post page — does it look professional enough for a PE fund?
- [ ] Review queue — is the empty state helpful?
- [ ] Publish action card — does the preview render properly?
- [ ] Newsletter signup — does success state show correctly?
- [ ] Error messages — are they user-friendly (not raw SQL)?
- [ ] Mobile responsiveness of blog and review pages
- [ ] Loading states for all async operations

### Findings
(filled during testing)

### Fixes Applied
(filled after fixes)

---

## Summary
(filled after all 5 rounds)
