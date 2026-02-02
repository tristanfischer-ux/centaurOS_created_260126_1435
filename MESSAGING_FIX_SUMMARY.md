# Messaging Fix Summary

## Issues Fixed

### 1. **Database Error: Infinite Recursion**
- **Problem**: "Failed to create direct conversation: infinite recursion detected in policy for relation 'conversation_participants'"
- **Root Cause**: The RLS policy "Users can view participants of their conversations" created a circular reference by querying `conversation_participants` within a policy defined ON `conversation_participants`.
- **Fix**: Created a new migration that combines two SELECT policies into one non-recursive policy. The new policy checks the `conversations` table directly instead of creating a circular reference.
- **Location**: `supabase/migrations/20260202120000_fix_conversation_participants_recursion.sql`

### 2. **UI Issue: Fuzzy Dialog**
- **Problem**: The New Message dialog appeared blurry/fuzzy
- **Root Cause**: CSS properties `backface-visibility:hidden` and `will-change:[transform,opacity]` combined with transforms caused subpixel rendering issues
- **Fix**: Removed the problematic CSS properties while keeping font smoothing
- **Location**: `src/components/ui/dialog.tsx` (line 11)

## How to Apply the Fix

### Option 1: Run the Script (Easiest)
```bash
./apply-messaging-fix.sh
```

### Option 2: Apply Manually via Supabase Dashboard
1. Go to your Supabase Dashboard: https://supabase.com/dashboard
2. Select your project
3. Navigate to **SQL Editor**
4. Copy the contents of `supabase/migrations/20260202120000_fix_conversation_participants_recursion.sql`
5. Paste into SQL Editor and click **Run**
6. You should see: `RLS policy "Users can view conversation participants" created successfully`

### Option 3: Push All Migrations
```bash
npx supabase db push --linked --include-all
```

## Verification Steps

After applying the fix:

1. **Refresh your browser** to load the updated Dialog CSS
2. **Open Inbox** (click the message icon in navigation)
3. **Click "New Message"**
4. **Select a team member** from the dropdown
5. **Type a test message** (e.g., "testing communicating with you")
6. **Click "Start Conversation"**

**Expected Result**: Conversation should be created successfully without any "infinite recursion" error.

## Technical Details

### The RLS Policy Problem

**Before (Circular Reference):**
```sql
CREATE POLICY "Users can view participants of their conversations"
    ON public.conversation_participants
    FOR SELECT
    USING (
        conversation_id IN (
            SELECT conversation_id 
            FROM public.conversation_participants  -- ❌ CIRCULAR!
            WHERE profile_id = auth.uid()
        )
    );
```

**After (Non-Recursive):**
```sql
CREATE POLICY "Users can view conversation participants"
    ON public.conversation_participants
    FOR SELECT
    USING (
        -- Can view own participation record
        profile_id = auth.uid()
        -- Can view other participants via conversations table (no recursion)
        OR EXISTS (
            SELECT 1 
            FROM public.conversations c  -- ✅ Checks conversations, not conversation_participants
            WHERE c.id = conversation_participants.conversation_id
            AND (
                c.buyer_id = auth.uid()
                OR c.seller_id = auth.uid()
                OR c.creator_id = auth.uid()
            )
        )
    );
```

### The CSS Fix

**Before:**
```css
[text-rendering:optimizeLegibility]
[-webkit-font-smoothing:antialiased]
[-moz-osx-font-smoothing:grayscale]
[backface-visibility:hidden]        /* ❌ Causes blur */
will-change-[transform,opacity]     /* ❌ Causes blur */
```

**After:**
```css
[-webkit-font-smoothing:antialiased]  /* ✅ Keep font smoothing */
[-moz-osx-font-smoothing:grayscale]   /* ✅ Keep font smoothing */
```

## Files Changed

1. `supabase/migrations/20260202120000_fix_conversation_participants_recursion.sql` - New migration
2. `src/components/ui/dialog.tsx` - Removed problematic CSS
3. `apply-messaging-fix.sh` - Helper script
4. `MESSAGING_FIX_SUMMARY.md` - This file

## Testing

To verify the fix works:

```bash
# Start dev server if not running
npm run dev

# In browser:
# 1. Log in as test-foundry-001 (test founder)
# 2. Navigate to Inbox
# 3. Click "New Message"
# 4. Select "Test Executive"
# 5. Type message and click "Start Conversation"
# 6. Should see success toast and conversation should be created
```

## Why This Happened

The issue was introduced in migration `20260201310000_messaging_enhancement.sql` which added support for direct messages and conversation participants. The policy was designed to let users see participants of conversations they're in, but it created a circular reference by checking the same table the policy is defined on.

This is a common RLS anti-pattern in multi-tenant systems. The fix uses the `conversations` table as the source of truth for access control, avoiding the circular reference.

## Related Documentation

- [Supabase RLS Best Practices](https://supabase.com/docs/guides/auth/row-level-security)
- [Avoiding RLS Infinite Recursion](https://github.com/orgs/supabase/discussions/1208)
- CSS `will-change` performance issues: [MDN Docs](https://developer.mozilla.org/en-US/docs/Web/CSS/will-change#best_practices)
