# Day in the Life QA Testing Script

A weekly manual QA checklist to verify end-to-end flows for CentaurOS personas.

---

## Purpose

This script ensures core platform features remain functional for all user roles. Run weekly (or after major deployments) to catch regressions before they impact users.

## Prerequisites

### Test Accounts Required

| Persona | Email | Role | Notes |
|---------|-------|------|-------|
| Executive | `exec-test@[foundry].com` | Executive | Has approval permissions |
| Founder | `founder-test@[foundry].com` | Founder | Full admin access |
| Apprentice | `apprentice-test@[foundry].com` | Apprentice | Enrolled in apprenticeship programme |

### Environment

- **Test URL**: `https://staging.centauros.io` (or local: `http://localhost:3000`)
- **Browser**: Chrome (latest) with DevTools open for console errors
- **Mobile**: Test on iOS Safari or Chrome Android for responsive checks

### Before You Start

1. Clear browser cache/cookies (or use incognito)
2. Ensure test accounts have data (tasks, messages, objectives)
3. Have a second test account ready for messaging tests
4. Note the current date/time for the test log

---

## How to Report Issues

1. **Critical (blocks testing)**: Post immediately in #bugs Slack channel
2. **Non-critical**: Create GitHub issue with:
   - Title: `[QA] {Persona} - {Feature} - {Brief Description}`
   - Steps to reproduce
   - Expected vs actual result
   - Screenshot/video if applicable
   - Browser/device info

---

## Test Checklists

### Legend

- [ ] = Not tested
- [x] = Passed
- [!] = Failed (note bug ticket)
- [-] = Skipped (note reason)

---

## 1. The Executive

**Role**: High permissions - can approve tasks, manage members, access admin.

### 1.1 Core Flow Tests

#### Login

- [ ] Navigate to `/login`
- [ ] Enter Executive test credentials
- [ ] Click "Sign in"
- [ ] **Expected**: Redirects to `/today`, greeting shows "Good [morning/afternoon/evening], [Name]"
- [ ] **Check**: No console errors

#### Dashboard Load (`/today`)

- [ ] Activity Stream section visible (left 2/3)
- [ ] Needs Attention summary visible
- [ ] Pending approvals count shows (if any exist)
- [ ] **Check**: No loading spinners stuck, no errors

#### Navigation

Test each sidebar item loads without errors:

- [ ] Today (`/today`)
- [ ] Messages (`/messages`)
- [ ] Objectives (`/objectives`)
- [ ] Tasks (`/tasks`)
- [ ] Timeline (`/timeline`)
- [ ] Team (`/team`)
- [ ] Saved Resources (`/saved-resources`)
- [ ] Marketplace (`/marketplace`)
- [ ] RFQs (`/rfq`)
- [ ] Talent (`/talent`)
- [ ] Advice (`/advisory`)
- [ ] Blueprints (`/blueprints`)
- [ ] Help (`/help`)
- [ ] Settings (`/settings`)
- [ ] System Admin (`/admin`) - **Should be visible**

#### Messaging

- [ ] Go to `/messages`
- [ ] Conversation list loads
- [ ] Click on an existing conversation
- [ ] Messages load in thread
- [ ] Type a test message: "QA Test - Executive - [date]"
- [ ] Send message
- [ ] **Expected**: Message appears immediately in thread
- [ ] **Check**: No duplicate messages, correct timestamp

#### Task Creation

- [ ] Go to `/tasks`
- [ ] Click "New Task" button (or + button)
- [ ] Task creation dialog opens
- [ ] Enter title: "QA Test Task - Executive - [date]"
- [ ] Select at least one assignee
- [ ] (Optional) Add description, deadline
- [ ] Click "Create Task"
- [ ] **Expected**: Dialog closes, task appears in task list
- [ ] **Check**: Task has correct assignee, status is appropriate

### 1.2 Executive-Specific Tests

#### Task Approval

- [ ] Go to `/tasks`
- [ ] Filter or find a task with status `Pending_Executive_Approval`
- [ ] (If none exist, create a high-risk task with Apprentice account first)
- [ ] Click on the task to open detail view
- [ ] Click "Approve" button
- [ ] **Expected**: Status changes to `Completed`
- [ ] **Check**: Approval logged, task moves to completed section

#### Task Rejection

- [ ] Find another `Pending_Executive_Approval` task
- [ ] Click "Reject" button
- [ ] Add rejection reason
- [ ] **Expected**: Task returns to assignee with rejection notes
- [ ] **Check**: Rejection notification sent (check Messages or Activity)

#### Member Management

- [ ] Go to `/team`
- [ ] Click "Invite Member" button
- [ ] **Expected**: Invitation dialog opens
- [ ] Verify form has: email, role selection, team assignment
- [ ] Cancel dialog (don't actually invite)
- [ ] **Check**: Can see all team members in foundry

#### Team Operations

- [ ] Go to `/team`
- [ ] Verify can see team list
- [ ] Click on a team to view members
- [ ] (If test team exists) Verify delete option is available
- [ ] **Expected**: Executive can manage teams

#### System Admin Access

- [ ] Click "System Admin" in sidebar
- [ ] **Expected**: Admin dashboard loads at `/admin`
- [ ] Verify can access: Applications, Analytics, GDPR tools
- [ ] **Check**: No permission errors

### 1.3 Executive Logout

- [ ] Click user menu / profile
- [ ] Click "Sign out"
- [ ] **Expected**: Redirected to `/login` or marketing page
- [ ] **Check**: Session cleared (can't access `/today` directly)

---

## 2. The Founder

**Role**: Highest permissions - all Executive capabilities plus foundry management.

### 2.1 Core Flow Tests

*Run all Executive Core Flow Tests (1.1) first, then continue with Founder-specific tests.*

#### Login

- [ ] Navigate to `/login`
- [ ] Enter Founder test credentials
- [ ] Click "Sign in"
- [ ] **Expected**: Redirects to `/today`, greeting shows name
- [ ] **Check**: No console errors

#### Dashboard Load (`/today`)

- [ ] All widgets visible (Activity Stream, Needs Attention)
- [ ] Pending approvals count shows (if any)
- [ ] **Check**: Same experience as Executive

#### Navigation (Quick Verify)

- [ ] Today, Messages, Tasks, Team load correctly
- [ ] System Admin visible and accessible

#### Messaging

- [ ] Go to `/messages`
- [ ] Send a test message: "QA Test - Founder - [date]"
- [ ] **Expected**: Message appears in thread

#### Task Creation

- [ ] Create task: "QA Test Task - Founder - [date]"
- [ ] **Expected**: Task created successfully

### 2.2 Founder-Specific Tests

#### All Executive Capabilities

- [ ] Task Approval works (if pending tasks exist)
- [ ] Member Management accessible
- [ ] System Admin accessible
- [ ] **Check**: No degraded permissions compared to Executive

#### Foundry Settings

- [ ] Go to `/settings`
- [ ] Find Foundry section
- [ ] **Expected**: Foundry settings are EDITABLE (not read-only)
- [ ] Verify can modify: Foundry name, description
- [ ] (Don't save changes unless testing)
- [ ] **Check**: Only Founders should see edit controls for foundry

#### Full Admin Access

Test all admin subsections:

- [ ] `/admin` - Main dashboard
- [ ] `/admin/applications` - Application management
- [ ] `/admin/analytics` - Analytics dashboard
- [ ] `/admin/gdpr` - GDPR tools
- [ ] `/admin/health` - System health
- [ ] **Expected**: All pages load without permission errors

#### Member Role Changes

- [ ] Go to `/team`
- [ ] Click on a member (not yourself)
- [ ] **Expected**: Can see role change options
- [ ] Verify can change member to Executive or Apprentice
- [ ] (Don't actually change unless testing)
- [ ] **Check**: Founder can modify any member's role

### 2.3 Founder Logout

- [ ] Sign out
- [ ] **Expected**: Session cleared

---

## 3. The Apprentice

**Role**: Standard user - limited to own resources, has learning/OTJT features.

### 3.1 Core Flow Tests

#### Login

- [ ] Navigate to `/login`
- [ ] Enter Apprentice test credentials
- [ ] Click "Sign in"
- [ ] **Expected**: Redirects to `/today`, greeting shows name
- [ ] **Check**: No console errors

#### Dashboard Load (`/today`)

- [ ] Activity Stream visible
- [ ] Needs Attention shows overdue items
- [ ] **Check**: Does NOT show "Pending approvals" count (Apprentice can't approve)

#### Navigation

Test each sidebar item:

- [ ] Today (`/today`)
- [ ] Messages (`/messages`)
- [ ] Objectives (`/objectives`)
- [ ] Tasks (`/tasks`)
- [ ] Timeline (`/timeline`)
- [ ] Team (`/team`)
- [ ] Saved Resources (`/saved-resources`)
- [ ] Marketplace (`/marketplace`)
- [ ] RFQs (`/rfq`)
- [ ] Talent (`/talent`)
- [ ] Advice (`/advisory`)
- [ ] Blueprints (`/blueprints`)
- [ ] Help (`/help`)
- [ ] Settings (`/settings`)
- [ ] System Admin - **Should NOT be visible** (unless explicitly granted)

#### Messaging

- [ ] Go to `/messages`
- [ ] Conversation list loads
- [ ] Open a conversation
- [ ] Send message: "QA Test - Apprentice - [date]"
- [ ] **Expected**: Message appears in thread
- [ ] **Check**: Can message Executives/Founders in same foundry

#### Task Creation

- [ ] Go to `/tasks`
- [ ] Click "New Task"
- [ ] Create task: "QA Test Task - Apprentice - [date]"
- [ ] Assign to self
- [ ] **Expected**: Task created successfully
- [ ] **Check**: Apprentice can create tasks

### 3.2 Apprentice-Specific Tests

#### Limited Task Deletion

- [ ] Go to `/tasks`
- [ ] Find a task created by ANOTHER user (Executive/Founder)
- [ ] Attempt to delete it
- [ ] **Expected**: Delete option hidden OR action blocked with error
- [ ] **Check**: RLS policy enforced

- [ ] Find a task created by THIS Apprentice account
- [ ] Attempt to delete it
- [ ] **Expected**: Deletion succeeds
- [ ] **Check**: Can delete own tasks

#### Limited Objective Deletion

- [ ] Go to `/objectives`
- [ ] Find an objective created by ANOTHER user
- [ ] Attempt to delete it
- [ ] **Expected**: Delete option hidden OR action blocked
- [ ] **Check**: RBAC enforced

#### OTJT Hour Logging (if enrolled)

- [ ] Go to `/apprenticeship`
- [ ] Click "Log OTJT Hours" (or similar)
- [ ] Fill in: Date, hours, activity type, description
- [ ] Submit
- [ ] **Expected**: Hours logged with status "Pending" (awaiting mentor approval)
- [ ] **Check**: Hours appear in OTJT log

#### Guild Access

- [ ] Go to `/guild`
- [ ] **Expected**: Page loads without error
- [ ] Verify can see project assignments (if any)
- [ ] **Check**: Apprentice view shows assigned projects

#### Learning Modules (if enrolled)

- [ ] Go to `/apprenticeship`
- [ ] Verify apprenticeship dashboard loads
- [ ] Check for: Enrollment details, OTJT progress, learning modules
- [ ] Click on a learning module
- [ ] **Expected**: Module details visible
- [ ] **Check**: Progress tracking works

#### Skills Progress

- [ ] View skills section in apprenticeship dashboard
- [ ] **Expected**: Skills gap chart or progress indicators visible
- [ ] **Check**: Current skill levels display correctly

### 3.3 Negative Tests (Should Fail)

#### Cannot Approve Tasks

- [ ] Go to `/tasks`
- [ ] Find a `Pending_Executive_Approval` task
- [ ] Verify no "Approve" button visible
- [ ] **Expected**: Approval controls not shown to Apprentice

#### Cannot Access Admin

- [ ] Try navigating directly to `/admin`
- [ ] **Expected**: Redirected OR permission denied error
- [ ] **Check**: Admin routes protected

#### Cannot Delete Others' Content

- [ ] Try deleting task/objective owned by another user
- [ ] **Expected**: Action blocked

### 3.4 Apprentice Logout

- [ ] Sign out
- [ ] **Expected**: Session cleared

---

## Weekly Test Results Log

### Template

Copy this template for each weekly test:

```markdown
## Week of [DATE]

**Tester**: [Name]
**Environment**: [staging/production/local]
**Browser**: [Chrome/Safari/Firefox] [Version]

### Executive Results
- Core Flow: [PASS/FAIL]
- Task Approval: [PASS/FAIL]
- Member Management: [PASS/FAIL]
- Admin Access: [PASS/FAIL]
- Issues Found: [None / List bug tickets]

### Founder Results
- Core Flow: [PASS/FAIL]
- Foundry Settings: [PASS/FAIL]
- Full Admin Access: [PASS/FAIL]
- Issues Found: [None / List bug tickets]

### Apprentice Results
- Core Flow: [PASS/FAIL]
- OTJT Logging: [PASS/FAIL]
- Permission Restrictions: [PASS/FAIL]
- Issues Found: [None / List bug tickets]

### Overall Status
- [ ] All tests passed
- [ ] Issues found and logged
- [ ] Blockers identified

### Notes
[Any additional observations]
```

---

## Past Test Results

<!-- Add completed test logs below -->

---

## Appendix

### Test Data Setup

If test data is missing, use these steps to set up:

**Create Test Tasks**:
1. As Executive: Create 2-3 tasks, assign to Apprentice
2. As Apprentice: Complete a task to trigger approval workflow
3. Result: `Pending_Executive_Approval` task exists for testing

**Create Test Messages**:
1. As Executive: Start DM with Apprentice
2. Send a few messages back and forth
3. Result: Conversation exists for message testing

**Create Test Objectives**:
1. As Founder: Create objective with 3+ tasks
2. As Executive: Create separate objective
3. Result: Objectives exist for deletion permission testing

### Quick Reference - Routes

| Route | Purpose |
|-------|---------|
| `/login` | Authentication |
| `/today` | Main dashboard |
| `/messages` | Messaging center |
| `/tasks` | Task management |
| `/objectives` | Objectives/goals |
| `/timeline` | Gantt view |
| `/team` | Team members |
| `/marketplace` | Service providers |
| `/rfq` | Request for quotes |
| `/guild` | Apprentice community |
| `/talent` | Apprenticeship info |
| `/advisory` | Expert advice |
| `/blueprints` | Knowledge domains |
| `/apprenticeship` | Apprentice dashboard |
| `/settings` | User/foundry settings |
| `/admin` | System administration |

### Quick Reference - Roles

| Role | Can Approve Tasks | Can Delete Any Task | Can Access Admin | Can Edit Foundry |
|------|-------------------|---------------------|------------------|------------------|
| Founder | Yes | Yes | Yes | Yes |
| Executive | Yes | Yes | Yes | No |
| Apprentice | No | Own only | No* | No |

*Unless explicitly granted via `foundry_admin_permissions`
