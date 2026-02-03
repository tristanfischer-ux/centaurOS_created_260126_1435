# Task Message Indicators - Implementation Summary

## Overview
Added message count indicators to task cards in the "All Tasks" view, so users can see at a glance which tasks have messages/discussions without opening each one.

## Changes Made

### 1. Tasks Page - Message Count Fetching
**File:** `src/app/(platform)/tasks/page.tsx`

**Added:** Fetches message counts for all tasks after loading them from the database.

```typescript
// Fetch message counts for all tasks
const tasksWithMessageCounts = await Promise.all(
    (tasks || []).map(async (task) => {
        const { count } = await supabase
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .eq('task_id', task.id)

        return {
            ...task,
            message_count: count || 0
        }
    })
)
```

This counts all messages linked to each task (via the `task_id` field).

### 2. Task Card Component - Message Count Display
**File:** `src/app/(platform)/tasks/task-card.tsx`

**Updated:**
1. Added `message_count?: number` to the `Task` type
2. Added `MessageSquare` icon import from lucide-react
3. Added message count indicator in the task card metadata section

**Visual Indicator:**
- Shows a message icon (💬) with the count next to it
- Only displays when `message_count > 0`
- Positioned next to the attachments indicator
- Clickable - opens the thread panel when clicked

```tsx
{task.message_count !== undefined && task.message_count > 0 && (
    <button 
        className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors cursor-pointer" 
        title="View messages"
        onClick={(e) => {
            e.stopPropagation()
            setShowThread(true)
            setShowHistory(false)
        }}
    >
        <MessageSquare className="w-3 h-3" />
        {task.message_count}
    </button>
)}
```

## User Experience

### Before:
- Users had to open each task to see if there were any messages/discussions
- No way to quickly identify tasks with active discussions

### After:
- **Message count badge** appears on each task card showing the number of messages
- Users can see at a glance which tasks have discussions
- Clicking the message indicator opens the thread panel directly
- The indicator appears next to the attachments count for consistency

## Visual Example

```
┌────────────────────────────────────────────┐
│ #272 [Pending]                            │
│ Research Job Market and Salary...          │
│                                            │
│ 📅 Start: Feb 10  📎 0  💬 3              │
│                   ↑attachments  ↑messages  │
└────────────────────────────────────────────┘
```

## Notes
- Message counts include ALL messages linked to a task (via `task_id`)
- The count includes both direct messages in task threads and messages that reference the task
- The indicator only appears when there are messages (count > 0)
- Clicking the indicator opens the same thread panel as the attachments button

## Related Files
- `src/app/(platform)/tasks/page.tsx` - Server component that fetches tasks and message counts
- `src/app/(platform)/tasks/task-card.tsx` - Client component that displays the task card
- `src/components/tasks/inline-thread.tsx` - Thread panel that opens when clicking the indicator

## Similar Implementation
This follows the same pattern as the Home/Inbox page (`src/app/(platform)/home/page.tsx`), which already had message count indicators on the task list view. Now both views are consistent.
