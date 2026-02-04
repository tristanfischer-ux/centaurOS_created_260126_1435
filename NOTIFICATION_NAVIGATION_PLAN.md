# Notification Navigation Plan

## Problem Statement

Notifications in the NotificationCenter dropdown are not actionable. Users must click a tiny external link icon to navigate to the relevant task/issue, which is not discoverable or intuitive. The notification body only marks the notification as read without navigating.

## Current Behavior (Lines 161-194 in NotificationCenter.tsx)

```tsx
<div onClick={() => markAsRead(notification.id)}>  // Only marks as read
  {/* notification content */}
  {notification.link && (
    <Link href={notification.link}>
      <ExternalLink />  // Tiny icon, hard to discover
    </Link>
  )}
</div>
```

**Issues:**
1. Clicking notification body only marks it as read (no navigation)
2. Navigation requires clicking tiny external link icon
3. External link icon stops propagation, so clicking it doesn't mark as read
4. Not discoverable - users don't know notifications are clickable

## Desired Behavior

✅ Clicking anywhere on the notification should:
1. Mark it as read
2. Navigate to the linked page (if link exists)
3. Close the popover dropdown
4. If no link exists, just mark as read

## Solution Design

### Approach: Make entire notification item a clickable link

**Implementation:**

```tsx
// If notification has a link, wrap in Link component
{notification.link ? (
  <Link
    href={notification.link}
    onClick={() => {
      markAsRead(notification.id)
      setIsOpen(false)  // Close popover
    }}
    className="block p-3 hover:bg-slate-50 transition-colors"
  >
    <NotificationContent notification={notification} />
  </Link>
) : (
  <div
    onClick={() => markAsRead(notification.id)}
    className="block p-3 hover:bg-slate-50 transition-colors"
  >
    <NotificationContent notification={notification} />
  </div>
)}
```

### Visual Changes

**Remove:** External link icon (redundant - entire card is clickable)
**Add:** Subtle visual indicator that notifications are clickable:
- Change cursor to `cursor-pointer`
- Slightly stronger hover state
- Optional: Add subtle arrow or chevron on right side

## Implementation Steps

### 1. Update NotificationCenter.tsx

**File:** `src/components/NotificationCenter.tsx`

**Changes:**
- Line 161-194: Refactor notification item rendering
- Wrap items with `notification.link` in Next.js `Link` component
- Add `onClick` handler that:
  - Marks notification as read
  - Closes popover (`setIsOpen(false)`)
- Remove external link icon (lines 187-191)
- Add visual indicator (cursor-pointer, optional chevron)

**Pseudocode:**
```tsx
{notifications.map(notification => {
  const handleClick = () => {
    markAsRead(notification.id)
    if (!notification.link) {
      // If no link, just close popover
      setIsOpen(false)
    }
  }

  const notificationContent = (
    <div className="flex gap-4">
      <span>{getIcon(notification.type)}</span>
      <div className="flex-1 min-w-0">
        <p>{notification.title}</p>
        {notification.message && <p>{notification.message}</p>}
        <p>{formatDistanceToNow(...)}</p>
      </div>
      {notification.link && (
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      )}
    </div>
  )

  return notification.link ? (
    <Link
      key={notification.id}
      href={notification.link}
      onClick={handleClick}
      className={cn(
        'block p-3 hover:bg-slate-50 cursor-pointer transition-colors',
        !notification.is_read && 'bg-blue-50/50'
      )}
    >
      {notificationContent}
    </Link>
  ) : (
    <div
      key={notification.id}
      onClick={handleClick}
      className={cn(
        'block p-3 hover:bg-slate-50 cursor-pointer transition-colors',
        !notification.is_read && 'bg-blue-50/50'
      )}
    >
      {notificationContent}
    </div>
  )
})}
```

### 2. Verify Notification Links

**Check these files to ensure notifications have proper links:**

| Notification Type | File | Link Format |
|---|---|---|
| task_assigned | `src/actions/notifications.ts:331-348` | `/tasks?taskId=${taskId}` ✅ |
| task_completed | `src/actions/notifications.ts:350-374` | `/tasks?taskId=${taskId}` ✅ |
| delegation_created/revoked | `src/actions/notifications.ts:378-399` | `/settings/delegations` ✅ |
| advisory_answer | `src/actions/notifications.ts:401-423` | `/advisory/${questionId}` ✅ |
| marketplace notifications | `src/actions/notifications-marketplace.ts` | Need to check |

**Action:** Verify that all notification creation functions include proper `link` parameter.

### 3. Testing Plan

**Test Cases:**
1. ✅ Click task assignment notification → Navigate to Tasks page with task detail open
2. ✅ Click task completion notification → Navigate to Tasks page
3. ✅ Click advisory answer notification → Navigate to advisory question detail
4. ✅ Click delegation notification → Navigate to settings/delegations
5. ✅ Notification is marked as read on click
6. ✅ Popover closes after navigation
7. ✅ Unread count decrements
8. ✅ Hover state indicates clickability
9. ✅ Notifications without links still mark as read and close popover

## Edge Cases

### 1. Task ID in query parameter
- Format: `/tasks?taskId=${taskId}`
- Tasks page must handle `taskId` query param and open task detail dialog
- **Check:** Does tasks page already handle this?

### 2. Marketplace notifications
- Need to verify marketplace notifications have proper links
- Format should be: `/marketplace/listing/${listingId}` or similar

### 3. No link notifications
- System notifications might not have links
- Behavior: Mark as read + close popover (no navigation)

## Files to Modify

| File | Changes | Lines |
|---|---|---|
| `src/components/NotificationCenter.tsx` | Refactor notification items to be clickable Links | 161-194 |
| (Optional) `src/actions/notifications-marketplace.ts` | Verify marketplace notifications have links | TBD |

## Risk Assessment

**Low Risk:**
- Single component change (NotificationCenter.tsx)
- No database changes required
- No breaking changes to notification creation logic
- Backwards compatible (notifications without links still work)

## Success Criteria

✅ Clicking any notification navigates to the relevant page
✅ Notification is marked as read on click
✅ Popover closes after navigation
✅ Visual indicator shows notifications are clickable
✅ All notification types have working navigation
✅ Unread count updates correctly

## Timeline

- Implementation: 15 minutes
- Testing: 10 minutes
- Total: ~25 minutes
