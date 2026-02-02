# Agent Handover Document
**Date:** February 2, 2026
**Task:** Simplify navigation from 14 items to 6, then consolidate lost functionality
**Status:** Partially complete - Navigation simplified, but feature integration pending

---

## Context

User wanted to simplify the CentaurOS navigation from 14 items down to 6 core items. The goal is to reduce confusion while maintaining the core value loop: help users discover what they don't know → connect them to experts/products in marketplace → monetize.

**Key insight:** "Blueprints" (now "Product Map") is the differentiator - it proactively shows users what they don't know, unlike Advisory which is reactive Q&A.

---

## COMPLETED ✅

### Navigation Simplification
- Updated `src/components/Sidebar.tsx` - reduced to 6 items
- Updated `src/components/MobileNav.tsx` - matching 6-item structure
- Renamed "Messages" → "Inbox"
- Renamed "Blueprints" → "Product Map"

**New sidebar structure:**
```
Work: Inbox, Objectives, Tasks, Team
Discovery: Product Map, Marketplace
(Settings at bottom)
```

### Page Title Updates
- `src/app/(platform)/messages/messages-page-client.tsx` - title changed to "Inbox"
- `src/app/(platform)/blueprints/blueprints-view.tsx` - title changed to "Product Map"
- `src/app/(platform)/blueprints/page.tsx` - metadata updated

### Team Bandwidth Indicators
- Added to `src/app/(platform)/team/team-comparison-view.tsx`
- Shows "Has capacity" / "At capacity" / "Overloaded" based on workload score
- Formula: `(activeTasks * 20) + (pendingTasks * 10)`, thresholds at 40 and 70

### Redirect Pages Created (PROBLEM - SEE REMAINING TASKS)
These pages were **incorrectly replaced with redirects**, losing functionality:
- `src/app/(platform)/today/page.tsx` → redirects to /messages
- `src/app/(platform)/timeline/page.tsx` → redirects to /tasks
- `src/app/(platform)/advisory/page.tsx` → redirects to /blueprints
- `src/app/(platform)/rfq/page.tsx` → redirects to /marketplace?tab=rfqs
- `src/app/(platform)/talent/page.tsx` → redirects to /marketplace?tab=talent
- `src/app/(platform)/saved-resources/page.tsx` → redirects to /marketplace?tab=saved
- `src/app/(platform)/help/page.tsx` → redirects to /settings

---

## REMAINING TASKS 🔧

**CRITICAL:** The redirect pages broke functionality. The original pages had full features that need to be integrated into the new navigation structure.

### Priority 1: Marketplace Tabs
**Problem:** RFQs, Talent, and Saved Resources functionality is gone
**Files to modify:** 
- `src/app/(platform)/marketplace/page.tsx`
- `src/app/(platform)/marketplace/marketplace-view.tsx`
**Restore from git:**
- `git show e264416:src/app/(platform)/rfq/page.tsx`
- `git show e264416:src/app/(platform)/talent/page.tsx`
- `git show e264416:src/app/(platform)/saved-resources/page.tsx`
**Approach:** 
- Add Tabs component to Marketplace: Browse | My RFQs | Talent | Saved
- Import content from original pages as tab content

### Priority 2: Tasks Timeline View
**Problem:** Timeline/Gantt view is gone
**Files to modify:** `src/app/(platform)/tasks/page.tsx`
**Restore from git:** `git show e264416:src/app/(platform)/timeline/page.tsx`
**Approach:**
- Add view toggle to Tasks: List | Calendar | Gantt
- Reuse `src/components/timeline/GanttView.tsx` and `TimelineListView.tsx`
- Note: Git log shows "feat: add Timeline view to Tasks page" - check if partially done

### Priority 3: Tasks Priority Section
**Problem:** Prioritized "Focus" tasks from Today page are gone
**Files to modify:** `src/app/(platform)/tasks/page.tsx`
**Approach:**
- Add "Today's Focus" card at top showing top 5 prioritized tasks
- Reuse `src/components/DailyPrioritizer.tsx`

### Priority 4: Inbox Activity Stream
**Problem:** Activity stream from Today page is gone
**Files to modify:** `src/app/(platform)/messages/messages-page-client.tsx`
**Restore from git:** `git show e264416:src/app/(platform)/today/page.tsx`
**Approach:**
- Add Activity tab or section to Inbox
- Reuse `src/components/today/activity-stream.tsx`

### Priority 5: Inbox Standup Widget
**Problem:** Daily standup functionality is gone
**Files to modify:** `src/app/(platform)/messages/messages-page-client.tsx`
**Approach:**
- Add Standup section to Inbox
- Reuse `src/components/StandupWidget.tsx`
- User decided: standup belongs in Inbox (part of daily workflow)

### Priority 6: Inbox Daily Pulse
**Problem:** Daily pulse insights are gone
**Files to modify:** `src/app/(platform)/messages/messages-page-client.tsx`
**Approach:**
- Add Daily Pulse widget to Inbox
- Reuse `src/components/reports/DailyPulseWidget.tsx`
- User decided: pulse belongs in Inbox (part of daily briefing)

### Priority 7: Inbox Needs Attention
**Problem:** Needs attention summary is gone
**Files to modify:** `src/app/(platform)/messages/messages-page-client.tsx`
**Approach:**
- Add alerts/notifications section to Inbox
- Reuse `src/components/today/needs-attention-summary.tsx`

### Priority 8: Product Map Q&A
**Problem:** Advisory Q&A functionality is gone
**Files to modify:** `src/app/(platform)/blueprints/[id]/page.tsx` or blueprints-view.tsx
**Restore from git:** `git show e264416:src/app/(platform)/advisory/page.tsx`
**Approach:**
- Add Q&A tab to Product Map detail view
- Questions tagged to knowledge domains
- Reuse `src/app/(platform)/advisory/advisory-view.tsx` and `src/components/advisory/*`
- Keep `src/actions/advisory.ts` - it has all the backend logic

### Priority 9: Settings Help Section
**Problem:** Help documentation is gone
**Files to modify:** `src/app/(platform)/settings/page.tsx`
**Restore from git:** `git show e264416:src/app/(platform)/help/page.tsx`
**Approach:**
- Add "Help & Support" section to Settings page
- Include getting started guide, FAQs, documentation links

---

## KEY DECISIONS MADE BY USER

1. **Messages renamed to "Inbox"**
2. **Blueprints renamed to "Product Map"**
3. **Talent** → Marketplace (not Team)
4. **Daily Standup** → Inbox (not Team)
5. **Daily Pulse** → Inbox (not Team or Settings)
6. **All functionality should be preserved** - just moved to new locations

---

## USEFUL COMMANDS

```bash
# Navigate to project
cd "/Users/tristanfischer/Library/Mobile Documents/com~apple~CloudDocs/Software development/CentaurOS created 260126 1435"

# Check original page content from git
git show e264416:src/app/\(platform\)/today/page.tsx
git show e264416:src/app/\(platform\)/advisory/page.tsx
git show e264416:src/app/\(platform\)/rfq/page.tsx
git show e264416:src/app/\(platform\)/timeline/page.tsx

# Type check
npx tsc --noEmit

# Pre-existing TS errors exist in:
# - src/actions/reports.ts
# - src/actions/search.ts  
# - src/app/(supplier-portal)/*
# These are NOT related to this work
```

---

## IMPORTANT FILES

**Navigation:**
- `src/components/Sidebar.tsx` - Desktop sidebar (already updated)
- `src/components/MobileNav.tsx` - Mobile bottom nav (already updated)

**Pages to integrate into:**
- `src/app/(platform)/messages/` - Inbox (needs activity, standup, pulse)
- `src/app/(platform)/tasks/` - Tasks (needs timeline view, priority section)
- `src/app/(platform)/blueprints/` - Product Map (needs Q&A)
- `src/app/(platform)/marketplace/` - Marketplace (needs tabs for RFQs, Talent, Saved)
- `src/app/(platform)/settings/` - Settings (needs Help section)

**Components to reuse:**
- `src/components/today/activity-stream.tsx`
- `src/components/today/needs-attention-summary.tsx`
- `src/components/StandupWidget.tsx`
- `src/components/DailyPrioritizer.tsx`
- `src/components/reports/DailyPulseWidget.tsx`
- `src/components/timeline/GanttView.tsx`
- `src/components/timeline/TimelineListView.tsx`
- `src/components/advisory/*`
- `src/components/rfq/*`

**Plan file:**
- `~/.cursor/plans/consolidate_features_into_navigation_77fd6787.plan.md`

---

## QUICK START FOR NEXT AGENT

1. Read this document fully
2. Start with **Priority 1: Marketplace Tabs** - most contained change
3. For each priority:
   - Check original content with `git show e264416:src/app/(platform)/[page]/page.tsx`
   - Import/reuse existing components where possible
   - Test the integration works
4. After all integrations, remove the redirect-only pages
5. Run `npx tsc --noEmit` to verify (ignore pre-existing errors in reports.ts/search.ts/supplier-portal)
