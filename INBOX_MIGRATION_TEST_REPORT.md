# Inbox Migration & Testing Report

**Date:** February 2, 2026  
**Status:** ✅ Migrations Applied - Ready for Manual Testing

---

## Migration Summary

### Step 1: Migration History Repair ✅

Resolved migration history conflicts between local and remote:
- Reverted remote migrations: `20260202174817`, `20260202174818`, `20260202174819`
- These migrations conflicted with our new inbox feature migrations

### Step 2: Applied Migrations ✅

Applied three migrations in sequence:

#### 1. `20260202260000_add_message_context.sql` ✅
- **Purpose:** Add task and objective context to messages
- **Changes:**
  - Added `task_id` column to `messages` table (nullable UUID, references `tasks.id`)
  - Added `objective_id` column to `messages` table (nullable UUID, references `objectives.id`)
  - Created indexes: `idx_messages_task_id`, `idx_messages_objective_id`
- **Result:** SUCCESS - Columns already existed, migration idempotent

#### 2. `20260202270000_enforce_task_objectives.sql` ✅
- **Purpose:** Ensure all tasks have an objective
- **Changes:**
  - Created "No objective set" default objective for each foundry
  - Updated all tasks with NULL `objective_id` to point to default objective
  - Made `tasks.objective_id` NOT NULL constraint
- **Result:** SUCCESS - Constraint applied
- **Notice:** "objective_id constraint successfully applied to tasks table"

#### 3. `20260202280000_add_user_preferences.sql` ✅
- **Purpose:** Store per-user, per-foundry inbox preferences
- **Changes:**
  - Created `user_preferences` table
  - Added columns: `inbox_view` (people/tasks), `inbox_task_filter` (my_tasks/all_tasks)
  - Created RLS policies for user-only access
  - Added trigger for `updated_at` timestamp
  - Created indexes for efficient lookups
- **Result:** SUCCESS - Table created
- **Notice:** "user_preferences table created successfully"

### Step 3: TypeScript Type Generation ✅

Regenerated database types with new schema:

```bash
npx supabase gen types typescript --linked > src/types/database.types.ts
```

**Verified New Types:**

1. **messages table** now includes:
   ```typescript
   {
     task_id: string | null
     objective_id: string | null
     // ... other fields
   }
   ```

2. **user_preferences table** created:
   ```typescript
   {
     id: string
     profile_id: string
     foundry_id: string
     inbox_view: string        // 'people' | 'tasks'
     inbox_task_filter: string // 'my_tasks' | 'all_tasks'
     created_at: string
     updated_at: string
   }
   ```

---

## Manual Testing Checklist

### 🔍 Migration Verification

Navigate to Supabase Dashboard → Table Editor to verify:

- [ ] **tasks table:**
  - [ ] All tasks have `objective_id` (no NULL values)
  - [ ] Run query: `SELECT COUNT(*) FROM tasks WHERE objective_id IS NULL;` → Should return 0
  - [ ] "No objective set" objectives exist for foundries

- [ ] **messages table:**
  - [ ] Has `task_id` column (type: uuid, nullable)
  - [ ] Has `objective_id` column (type: uuid, nullable)
  - [ ] Indexes exist: `idx_messages_task_id`, `idx_messages_objective_id`

- [ ] **user_preferences table:**
  - [ ] Table exists in public schema
  - [ ] Has correct columns: `inbox_view`, `inbox_task_filter`
  - [ ] RLS policies active (4 policies total)
  - [ ] Trigger `trigger_update_user_preferences_timestamp` exists

### 👥 People View Testing

Access: Navigate to `/inbox` with People view selected

- [ ] **View Toggle**
  - [ ] "People" tab is visible and selectable
  - [ ] "Tasks" tab is visible and selectable
  - [ ] Active tab has visual indicator

- [ ] **People List (Left Panel)**
  - [ ] See list of people with recent conversations
  - [ ] Each person shows: avatar, name, last message preview, timestamp
  - [ ] Unread message indicators (if applicable)
  - [ ] Search bar functions to filter people
  - [ ] Clicking person loads conversation

- [ ] **Conversation View (Right Panel)**
  - [ ] See full conversation history with selected person
  - [ ] Messages display: sender name, content, timestamp
  - [ ] Message input field at bottom
  - [ ] Context selector dropdown visible

- [ ] **Context Tagging**
  - [ ] Click context selector → see dropdown of tasks
  - [ ] Tasks grouped by objective
  - [ ] Select a task context
  - [ ] Type message → send
  - [ ] Message appears in conversation
  - [ ] Context tag visible on message (e.g., "Re: Task Name")

- [ ] **Cross-Reference**
  - [ ] Navigate to Tasks view
  - [ ] Find the task you tagged in message
  - [ ] Click task → verify message appears in task thread

### 📋 Tasks View Testing

Access: Toggle to Tasks view in inbox

- [ ] **View Structure**
  - [ ] Tasks grouped by objective
  - [ ] Each objective section is collapsible
  - [ ] "No objective set" section exists (if applicable)

- [ ] **Task Filter Toggle**
  - [ ] "My Tasks" / "All Tasks" toggle visible
  - [ ] Toggle to "My Tasks" → see only assigned tasks
  - [ ] Toggle to "All Tasks" → see all foundry tasks
  - [ ] Filter state persists on page refresh

- [ ] **Task List**
  - [ ] Each task shows: title, status, assignee
  - [ ] Unread message indicators on tasks with new messages
  - [ ] Search bar filters tasks
  - [ ] Clicking task opens conversation panel

- [ ] **Task Conversation**
  - [ ] Right panel shows task-specific conversation
  - [ ] All messages tagged with this task appear
  - [ ] Can send new messages in task thread
  - [ ] Messages appear immediately after sending

- [ ] **Context from People View**
  - [ ] Messages sent from People view with task context appear here
  - [ ] Message shows sender and original conversation context

### 🎛️ Preferences Persistence

Test that user preferences are saved and restored:

- [ ] **View Preference**
  - [ ] Set inbox to "People" view
  - [ ] Refresh page → verify still on "People" view
  - [ ] Switch to "Tasks" view
  - [ ] Refresh page → verify still on "Tasks" view
  - [ ] Test across different browser sessions

- [ ] **Filter Preference**
  - [ ] In Tasks view, set filter to "My Tasks"
  - [ ] Refresh page → verify filter still "My Tasks"
  - [ ] Switch to "All Tasks"
  - [ ] Refresh page → verify filter still "All Tasks"

- [ ] **Per-Foundry Preferences**
  - [ ] If multi-foundry user: Set different preferences in each foundry
  - [ ] Switch between foundries
  - [ ] Verify each foundry remembers its own preferences

### 📱 Mobile Responsive Testing

Test at viewport width < 768px:

- [ ] **Default State**
  - [ ] Left panel (list) shows by default
  - [ ] Right panel (conversation) is hidden

- [ ] **Navigation**
  - [ ] Click person/task in list
  - [ ] Right panel slides in with conversation
  - [ ] Left panel is hidden
  - [ ] Back button/icon visible

- [ ] **Return to List**
  - [ ] Click back button
  - [ ] Left panel slides back in
  - [ ] Right panel is hidden
  - [ ] Can select different person/task

- [ ] **View Toggle**
  - [ ] People/Tasks toggle remains accessible
  - [ ] Switching views updates list appropriately

- [ ] **Message Input**
  - [ ] Keyboard doesn't obscure input field
  - [ ] Context selector is accessible
  - [ ] Send button is reachable

### 🧪 Edge Cases & Error Handling

- [ ] **Empty States**
  - [ ] No conversations → shows empty state message
  - [ ] No tasks in objective → shows empty state
  - [ ] Search with no results → shows no results message

- [ ] **Loading States**
  - [ ] Loading spinner while fetching conversations
  - [ ] Loading indicator for messages
  - [ ] Skeleton screens for initial load

- [ ] **Error States**
  - [ ] Network error → shows error message with retry
  - [ ] Failed to send message → shows error indicator
  - [ ] Permission denied → shows appropriate message

- [ ] **Context Selection**
  - [ ] Can send message without selecting context (general conversation)
  - [ ] Can change context mid-conversation
  - [ ] Context selector shows current selection

- [ ] **Message Threading**
  - [ ] Messages appear in chronological order
  - [ ] Real-time updates (if implemented)
  - [ ] No duplicate messages

### 🔐 Security & Permissions

- [ ] **RLS Verification**
  - [ ] Users only see their own user_preferences
  - [ ] Users only see conversations they're part of
  - [ ] Users only see tasks in their foundry
  - [ ] Cannot view other foundry's messages

- [ ] **Foundry Isolation**
  - [ ] Switch foundries → see different conversations
  - [ ] Tasks from Foundry A don't appear in Foundry B
  - [ ] Preferences are per-foundry

---

## Known Issues & Notes

### Migration Notes

1. **Idempotency:** All migrations use `IF NOT EXISTS` / `IF EXISTS` clauses, making them safe to re-run
2. **Default Objectives:** A "No objective set" objective is automatically created for each foundry
3. **Existing Data:** Migration handles existing tasks without objectives gracefully

### Testing Prerequisites

Before testing, ensure:
- [ ] User has at least one conversation
- [ ] User has at least one task assigned
- [ ] User has access to multiple objectives (for grouping test)
- [ ] Test in multiple foundries if available

### Browser Console Checks

During testing, monitor browser console for:
- [ ] No JavaScript errors
- [ ] No failed API requests
- [ ] No RLS policy violations
- [ ] No TypeScript type errors

### Supabase Logs

Check Supabase Dashboard → Logs for:
- [ ] No RLS policy errors
- [ ] No failed queries
- [ ] No trigger errors
- [ ] Successful user_preferences CRUD operations

---

## Testing Scenarios

### Scenario 1: First-Time User
1. New user logs in for the first time
2. Navigate to inbox
3. Should see empty state (no conversations yet)
4. View preferences should default to "People" view
5. Task filter should default to "My Tasks"
6. Start a conversation with someone
7. Send a message
8. Verify conversation appears in list

### Scenario 2: Context Tagging Workflow
1. User in People view with active conversation
2. Needs to discuss a specific task
3. Selects task from context dropdown
4. Sends message: "When can you complete this?"
5. Message appears in conversation with task tag
6. Navigate to Tasks view
7. Find the task in the list
8. Click task → see the message in task thread
9. Reply in task thread
10. Go back to People view → reply appears there too

### Scenario 3: Task-Focused Workflow
1. User switches to Tasks view
2. Sees tasks grouped by objectives
3. Filters to "My Tasks" only
4. Finds urgent task with unread indicator
5. Clicks task → sees conversation
6. Sends update: "I'm working on this now"
7. Message appears in thread
8. Other participants see the message

### Scenario 4: Preference Persistence
1. User sets preferences:
   - View: Tasks
   - Filter: All Tasks
2. Works in inbox, sends messages
3. Closes browser tab
4. Opens new tab, navigates to inbox
5. Preferences should be restored:
   - Still in Tasks view
   - Still showing All Tasks
6. Switch foundries → different preferences may apply

### Scenario 5: Mobile Experience
1. User on mobile device
2. Opens inbox → sees people/task list
3. Taps conversation → right panel slides in
4. Sends message
5. Taps back → returns to list
6. Switches to Tasks view
7. Taps task → conversation slides in
8. Smooth navigation throughout

---

## Issue Reporting Template

If you encounter errors, report using this format:

### Issue: [Brief Description]

**Step:** [Which testing step were you on?]

**What happened:**
```
[Describe the error or unexpected behavior]
```

**Expected:**
```
[What should have happened?]
```

**Error Message:**
```
[Copy any error messages from browser console]
```

**Supabase Logs:**
```
[Copy any relevant errors from Supabase Dashboard → Logs]
```

**Browser:** [Chrome/Firefox/Safari] [Version]

**Device:** [Desktop/Mobile] [Screen size]

**Foundry ID:** [If relevant]

**Steps to Reproduce:**
1. [Step 1]
2. [Step 2]
3. [Error occurs]

---

## Success Criteria

This implementation is considered successful when:

- [ ] All migrations applied without errors
- [ ] TypeScript types generated successfully
- [ ] No NULL `objective_id` values in tasks table
- [ ] user_preferences table exists with correct schema
- [ ] messages table has context columns
- [ ] All RLS policies active and correct
- [ ] People view displays and functions correctly
- [ ] Tasks view displays and functions correctly
- [ ] Context tagging works bidirectionally
- [ ] Preferences persist across sessions
- [ ] Mobile responsive layout works
- [ ] No console errors during normal use
- [ ] No RLS policy violations
- [ ] Performance is acceptable (< 1s load times)

---

## Next Steps

After successful testing:

1. **Document Findings:** Update this report with test results
2. **Fix Issues:** Address any bugs or errors found
3. **Performance Review:** Check query performance for large datasets
4. **User Feedback:** Gather initial user feedback
5. **Iterate:** Make improvements based on testing and feedback

---

## Appendix: Quick SQL Queries

### Check Task Objectives
```sql
-- Count tasks without objectives (should be 0)
SELECT COUNT(*) FROM tasks WHERE objective_id IS NULL;

-- List "No objective set" objectives
SELECT * FROM objectives WHERE title = 'No objective set';

-- Count tasks per objective
SELECT 
  o.title,
  COUNT(t.id) as task_count
FROM objectives o
LEFT JOIN tasks t ON t.objective_id = o.id
GROUP BY o.id, o.title
ORDER BY task_count DESC;
```

### Check Message Context
```sql
-- Count messages with context
SELECT 
  COUNT(*) FILTER (WHERE task_id IS NOT NULL) as with_task,
  COUNT(*) FILTER (WHERE objective_id IS NOT NULL) as with_objective,
  COUNT(*) FILTER (WHERE task_id IS NULL AND objective_id IS NULL) as no_context,
  COUNT(*) as total
FROM messages;

-- List recent contextual messages
SELECT 
  m.content,
  m.created_at,
  t.title as task_title,
  o.title as objective_title
FROM messages m
LEFT JOIN tasks t ON m.task_id = t.id
LEFT JOIN objectives o ON m.objective_id = o.id
WHERE m.task_id IS NOT NULL OR m.objective_id IS NOT NULL
ORDER BY m.created_at DESC
LIMIT 10;
```

### Check User Preferences
```sql
-- List all user preferences
SELECT 
  up.*,
  p.name as user_name
FROM user_preferences up
JOIN profiles p ON up.profile_id = p.id;

-- Count preferences by view type
SELECT 
  inbox_view,
  COUNT(*) as count
FROM user_preferences
GROUP BY inbox_view;
```

---

**Report Prepared By:** AI Agent  
**Report Status:** Ready for Manual Testing  
**Last Updated:** February 2, 2026
