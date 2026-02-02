# Context-Aware Messaging Implementation

## Summary

Added context-aware messaging capabilities to the messaging service, allowing messages to be linked to tasks and objectives with automatic bridging to task comments.

## What Was Implemented

### 1. Type Definitions

**Created `/src/types/messaging.ts`:**
- `Message` type with `task_id` and `objective_id` fields
- `MessageInsert` type for creating messages
- `Profile` and `TaskComment` type exports

**Updated `/src/types/tasks.ts`:**
- Added `TaskThreadItem` type for merged message/comment threads
- Includes fields: id, content, author, created_at, source, message_id, task_id, conversation_id

### 2. Messaging Service Functions

**Updated `/src/lib/messaging/service.ts`:**

#### `sendMessageWithContext()`
- Accepts: conversationId, senderId, content, taskId?, objectiveId?
- Creates message with task_id and objective_id fields
- Automatically bridges to task_comments if taskId is provided
- Returns the created message

```typescript
export interface SendMessageWithContextParams {
  conversationId: string
  senderId: string
  content: string
  taskId?: string
  objectiveId?: string
  messageType?: MessageType
  fileUrl?: string
}
```

#### `bridgeMessageToTaskComment()`
- Accepts: messageId, taskId, content, userId
- Creates entry in task_comments table
- Links to message via reference in comment content
- Marks as system-synced (is_system_log: true)
- Prevents duplicate comments by checking existing content
- Automatically retrieves foundry_id from task

#### `getTaskThread()`
- Accepts: taskId
- Fetches all messages where task_id = taskId
- Fetches all task_comments for the task
- Merges them chronologically
- Returns as `TaskThreadItem[]` with full author profiles

#### Updated `Message` Interface
- Added `task_id?: string | null`
- Added `objective_id?: string | null`

#### New `MessageWithContext` Interface
- Extends Message with joined task and objective data
- Includes task: { id, title, task_number, status }
- Includes objective: { id, title }

## Database Schema

### Migration: `20260202260000_add_message_context.sql`

Already exists and adds:
- `messages.task_id` (UUID, nullable, references tasks)
- `messages.objective_id` (UUID, nullable, references objectives)
- Indexes for efficient lookups on both columns

### Task Comments Schema

Existing table used for bridging:
- `task_comments.id` (UUID, primary key)
- `task_comments.task_id` (UUID, required)
- `task_comments.user_id` (UUID, required)
- `task_comments.content` (TEXT, required)
- `task_comments.foundry_id` (TEXT, required)
- `task_comments.is_system_log` (BOOLEAN, nullable)
- `task_comments.created_at` (TIMESTAMPTZ)

## Usage Examples

### Send a message with task context

```typescript
import { sendMessageWithContext } from '@/lib/messaging/service'

const message = await sendMessageWithContext(supabase, {
  conversationId: 'conv-123',
  senderId: 'user-456',
  content: 'Task status update',
  taskId: 'task-789', // Will auto-create task comment
  objectiveId: 'obj-012' // Optional
})
```

### Get a merged task thread

```typescript
import { getTaskThread } from '@/lib/messaging/service'

const thread = await getTaskThread(supabase, 'task-789')
// Returns TaskThreadItem[] sorted chronologically
// Each item has source: 'message' | 'comment'
```

### Bridge existing message to task comment

```typescript
import { bridgeMessageToTaskComment } from '@/lib/messaging/service'

await bridgeMessageToTaskComment(
  supabase,
  'msg-123',
  'task-789',
  'Message content',
  'user-456'
)
```

## Important Notes

### Database Types
The database types in `src/types/database.types.ts` need to be regenerated to include the new columns:
```bash
npm run db:types
```

Until regenerated, TypeScript may show warnings about `task_id` and `objective_id` not existing on the Messages table type. The runtime code will work correctly once the migration is applied.

### Migration Status
The migration `20260202260000_add_message_context.sql` already exists and needs to be applied if not already done:
```bash
npm run db:push
```

### Foundry Isolation
The `bridgeMessageToTaskComment` function properly maintains foundry isolation by:
1. Fetching the task to get its foundry_id
2. Using that foundry_id when creating the task comment
3. Marking comments as system logs for audit trail

### Error Handling
- `sendMessageWithContext` will create the message even if bridging fails
- Bridging errors are logged but don't fail the message send
- `bridgeMessageToTaskComment` checks for duplicate comments
- All functions use proper error messages with context

### RLS Policies
No changes needed to RLS policies:
- Messages inherit conversation-level access control
- Task comments use existing task-level RLS
- System-synced comments respect same permissions as manual comments

## Testing Checklist

- [ ] Apply migration to add task_id and objective_id columns
- [ ] Regenerate database types
- [ ] Test sending message with task context
- [ ] Test sending message with objective context
- [ ] Test sending message with both contexts
- [ ] Verify task comment is created automatically
- [ ] Verify duplicate comments are prevented
- [ ] Test getTaskThread returns merged, sorted results
- [ ] Verify author profiles are properly joined
- [ ] Test with users in different foundries (isolation)
- [ ] Verify RLS policies work correctly

## Next Steps

1. **Apply Migration**: Run `npm run db:push` to apply the schema changes
2. **Regenerate Types**: Run `npm run db:types` to update TypeScript types
3. **Update UI Components**: Integrate the new functions into messaging UI
4. **Add Thread View**: Create UI to display merged task threads
5. **Test Thoroughly**: Verify all scenarios with different user roles and foundries
