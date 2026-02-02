# Inbox Testing - Quick Start Guide

**Status:** ✅ Migrations Applied - Ready to Test  
**Date:** February 2, 2026

---

## 🎯 What to Test

The new inbox has two views:
1. **People View** - WhatsApp-style conversations with context tagging
2. **Tasks View** - Task-grouped conversations with filtering

---

## ⚡ Quick Test (5 minutes)

### 1. Access Inbox
```
Navigate to: /inbox
```

### 2. Test People View
- [ ] See list of people on the left
- [ ] Click a person → conversation appears on right
- [ ] Send a message
- [ ] ✨ **NEW:** Click context dropdown → select a task
- [ ] Send another message with task context
- [ ] Message should show task tag

### 3. Test Tasks View
- [ ] Toggle to "Tasks" view
- [ ] See tasks grouped by objectives
- [ ] Click a task → conversation appears
- [ ] Send a message in task thread
- [ ] Toggle "My Tasks" / "All Tasks" filter

### 4. Test Context Linking
- [ ] In People view, tag a message with a task
- [ ] Switch to Tasks view
- [ ] Find that task
- [ ] **Verify:** Your message appears in task thread

### 5. Test Preferences
- [ ] Set view to "Tasks"
- [ ] Refresh page
- [ ] **Verify:** Still on Tasks view (preference saved)

---

## 🔍 Database Verification

### Check in Supabase Dashboard

**1. Tasks Table:**
```sql
SELECT COUNT(*) FROM tasks WHERE objective_id IS NULL;
-- Should return: 0
```

**2. Messages Table:**
```sql
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'messages' 
AND column_name IN ('task_id', 'objective_id');
-- Should return both columns
```

**3. User Preferences Table:**
```sql
SELECT * FROM user_preferences LIMIT 5;
-- Should show your preferences
```

---

## 📱 Mobile Test (2 minutes)

1. Resize browser to < 768px width
2. Should see list view only
3. Click person/task → right panel slides in
4. Click back → returns to list

---

## ⚠️ What to Watch For

### Errors to Report

- [ ] **Console errors** in browser DevTools
- [ ] **Failed queries** in Supabase logs
- [ ] **Missing data** (empty states when data exists)
- [ ] **Permission errors** (RLS policy violations)
- [ ] **UI glitches** (overlapping content, broken layout)

### Expected Behavior

✅ **Should work:**
- Sending messages in both views
- Context tagging in People view
- Viewing task threads in Tasks view
- Preferences persist after refresh
- Mobile responsive layout

❌ **Should NOT see:**
- Messages from other foundries
- Tasks you don't have access to
- Other users' preferences
- Console errors

---

## 🐛 Found a Bug?

Report with:
1. **What you did:** Step-by-step actions
2. **What happened:** Actual behavior
3. **What you expected:** Expected behavior
4. **Error message:** From console or Supabase logs
5. **Screenshot:** If UI issue

---

## 📊 Implementation Status

### ✅ Complete
- [x] Database migrations applied
- [x] TypeScript types generated
- [x] Messaging service with context
- [x] Preferences service
- [x] Server actions for preferences
- [x] UI components (People/Tasks views)
- [x] Context selector component
- [x] RLS policies

### 📋 Components
- `/src/app/(platform)/inbox/` - Inbox page & layout
- `/src/components/inbox/` - UI components
- `/src/lib/messaging/service.ts` - Messaging logic
- `/src/lib/preferences/service.ts` - Preferences logic
- `/src/actions/user-preferences.ts` - Server actions

---

## 🎓 Key Features

### Context-Aware Messaging
Messages can be tagged with:
- **Task context** - Links to specific task
- **Objective context** - Links to objective
- **Both** - Task and objective

When you send a message with task context:
1. Message is created in `messages` table
2. Automatically bridged to `task_comments` table
3. Appears in both People view and Tasks view
4. Creates unified conversation thread

### Preference Persistence
- **Per-user, per-foundry** settings
- **Defaults:** People view, My Tasks filter
- **Survives:** Page refresh, browser restart
- **Isolated:** Each foundry has own preferences

---

## 💡 Testing Tips

1. **Test with multiple users** - Start conversations
2. **Create tasks first** - Need tasks to test context tagging
3. **Check both views** - People and Tasks should sync
4. **Try different foundries** - Verify isolation
5. **Use mobile device** - Test real mobile experience

---

## 📚 Full Documentation

For detailed testing scenarios and troubleshooting:
- See: `INBOX_MIGRATION_TEST_REPORT.md`
- Implementation details: `CONTEXT_AWARE_MESSAGING_IMPLEMENTATION.md`
- Component docs: `src/components/inbox/README.md`

---

**Ready to test!** Start with the Quick Test above and report any issues found.
