---
name: secure-database
description: Security checklist for Supabase database operations in CentaurOS. Use when creating database migrations, adding RLS policies, modifying tables, or writing database queries. Use when the user mentions RLS, policy, migration, database security, or multi-tenant. Prevents data leakage through missing or incorrect RLS policies.
---

# Secure Database Operations

Ensure proper Row Level Security (RLS) and multi-tenant isolation in Supabase.

## RLS Policy Checklist

Every table with user data MUST have RLS enabled with proper policies.

### Enable RLS on New Tables
```sql
-- Always enable RLS
ALTER TABLE public.new_table ENABLE ROW LEVEL SECURITY;

-- Force RLS even for table owner (defense in depth)
ALTER TABLE public.new_table FORCE ROW LEVEL SECURITY;
```

### Standard Policy Patterns

#### Foundry-Isolated Tables
```sql
-- SELECT: Users can only see their foundry's data
CREATE POLICY "Users can view own foundry data"
  ON public.resources FOR SELECT
  USING (foundry_id = get_my_foundry_id());

-- INSERT: Users can only insert into their foundry
CREATE POLICY "Users can insert into own foundry"
  ON public.resources FOR INSERT
  WITH CHECK (foundry_id = get_my_foundry_id());

-- UPDATE: Users can only update their foundry's data
CREATE POLICY "Users can update own foundry data"
  ON public.resources FOR UPDATE
  USING (foundry_id = get_my_foundry_id())
  WITH CHECK (foundry_id = get_my_foundry_id());

-- DELETE: Users can only delete their foundry's data
CREATE POLICY "Users can delete own foundry data"
  ON public.resources FOR DELETE
  USING (foundry_id = get_my_foundry_id());
```

#### User-Owned Tables
```sql
-- SELECT: Users can only see their own data
CREATE POLICY "Users can view own data"
  ON public.user_settings FOR SELECT
  USING (user_id = auth.uid());

-- INSERT: Users can only insert their own data
CREATE POLICY "Users can insert own data"
  ON public.user_settings FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- UPDATE/DELETE follow same pattern
```

#### Immutable Audit Tables
```sql
-- Only INSERT allowed, no UPDATE or DELETE
CREATE POLICY "Insert only for audit logs"
  ON public.audit_logs FOR INSERT
  WITH CHECK (true);

-- Add triggers to prevent modification
CREATE OR REPLACE FUNCTION prevent_audit_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Audit logs cannot be modified';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prevent_audit_update
  BEFORE UPDATE ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_modification();

CREATE TRIGGER prevent_audit_delete
  BEFORE DELETE ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_modification();
```

## Helper Functions

Use security definer functions instead of direct subqueries to prevent recursion:

```sql
-- Get current user's foundry_id (SECURITY DEFINER prevents RLS recursion)
CREATE OR REPLACE FUNCTION get_my_foundry_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT foundry_id FROM profiles WHERE id = auth.uid()
$$;
```

## Common RLS Mistakes

### Infinite Recursion
```sql
-- ❌ WRONG - Causes infinite recursion
CREATE POLICY "bad_policy" ON profiles FOR SELECT
  USING (foundry_id = (SELECT foundry_id FROM profiles WHERE id = auth.uid()));

-- ✅ CORRECT - Use helper function
CREATE POLICY "good_policy" ON profiles FOR SELECT
  USING (foundry_id = get_my_foundry_id());
```

### Missing Policy
```sql
-- ❌ WRONG - RLS enabled but no policies = no access
ALTER TABLE public.data ENABLE ROW LEVEL SECURITY;
-- No policies created!

-- ✅ CORRECT - Always add policies after enabling RLS
ALTER TABLE public.data ENABLE ROW LEVEL SECURITY;
CREATE POLICY "select_policy" ON public.data FOR SELECT USING (...);
```

### Overly Permissive
```sql
-- ❌ WRONG - Anyone can read all data
CREATE POLICY "public_read" ON public.user_data FOR SELECT
  USING (true);

-- ✅ CORRECT - Restrict to owner/foundry
CREATE POLICY "owner_read" ON public.user_data FOR SELECT
  USING (user_id = auth.uid());
```

## Storage Bucket Security

### Signed URLs vs Public URLs
```typescript
// ❌ WRONG - Public URL exposes file permanently
const { data } = supabase.storage.from('private-files').getPublicUrl(path)

// ✅ CORRECT - Signed URL with expiration
const { data } = await supabase.storage
  .from('private-files')
  .createSignedUrl(path, 3600)  // 1 hour expiry
```

### Storage Policies
```sql
-- Private bucket - only owner can access
CREATE POLICY "Users can access own files"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'private-files' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Public bucket with foundry isolation
CREATE POLICY "Foundry members can access files"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'foundry-assets' 
    AND (storage.foldername(name))[1] = get_my_foundry_id()::text
  );
```

## Migration Checklist

Before applying any migration:

- [ ] RLS enabled on all new tables: `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
- [ ] FORCE RLS added: `ALTER TABLE ... FORCE ROW LEVEL SECURITY`
- [ ] SELECT policy added with proper USING clause
- [ ] INSERT policy added with proper WITH CHECK clause
- [ ] UPDATE policy uses both USING and WITH CHECK
- [ ] DELETE policy added if deletions are allowed
- [ ] No direct profile subqueries (use `get_my_foundry_id()`)
- [ ] Audit tables have immutability triggers
- [ ] Storage policies use signed URLs for private data

## Testing RLS Policies

```sql
-- Test as specific user
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'user-uuid-here';

-- Try to access data
SELECT * FROM resources WHERE id = 'some-id';

-- Should only return data the user owns/can access
```

## Common Vulnerabilities

| Vulnerability | Example | Fix |
|--------------|---------|-----|
| No RLS | Table without policies | Enable RLS + add policies |
| Policy recursion | Subquery to same table | Use helper function |
| Public by default | `USING (true)` | Restrict to owner/foundry |
| Missing storage policy | Direct public URLs | Use signed URLs + policies |
| Mutable audit logs | UPDATE/DELETE allowed | Add prevention triggers |

## When to Use This Skill

Use this skill when:

1. **Creating new database tables** - every table needs RLS enabled with appropriate policies
2. **Adding or modifying RLS policies** - need to understand the correct patterns for foundry vs user isolation
3. **Writing database migrations** - migrations must include security considerations
4. **Setting up storage buckets** - storage needs access policies and signed URL patterns
5. **Debugging "permission denied" errors** - often caused by missing or incorrect RLS policies

## When NOT to Use

| Scenario | Use Instead |
|----------|-------------|
| Creating API routes that query the database | [secure-api-routes](../secure-api-routes/SKILL.md) |
| Writing Server Actions with database operations | [secure-server-actions](../secure-server-actions/SKILL.md) |
| Displaying user-provided URLs in frontend | [secure-frontend](../secure-frontend/SKILL.md) |
| Reviewing code for all security issues | [security-review](../security-review/SKILL.md) |
| Applying migrations to Supabase | [supabase-migration](../supabase-migration/SKILL.md) for the process |

## Quick Reference

| Decision | Answer | Notes |
|----------|--------|-------|
| Enable RLS on new table? | **Yes, always** | Use both `ENABLE` and `FORCE` |
| Foundry-scoped or user-scoped? | Foundry for shared resources, user for personal | Check existing similar tables |
| How to get user's foundry ID? | `get_my_foundry_id()` | Never use direct subquery |
| Public URL or signed URL? | **Signed for private data** | 1 hour expiry is typical |
| Audit table policies? | INSERT only, add triggers | Prevent UPDATE/DELETE |
| Need DELETE policy? | Only if deletions are allowed | Many tables are soft-delete |
| What if policy causes recursion? | Use SECURITY DEFINER helper | Set `search_path = public` |

## Troubleshooting

### Issue: "infinite recursion detected in policy"
**Cause:** RLS policy has a subquery that triggers the same table's policies  
**Fix:** Replace the subquery with a `SECURITY DEFINER` helper function like `get_my_foundry_id()`. Example:
```sql
-- Wrong: USING (foundry_id = (SELECT foundry_id FROM profiles WHERE id = auth.uid()))
-- Right: USING (foundry_id = get_my_foundry_id())
```

### Issue: Users get empty results despite data existing
**Cause:** RLS enabled but no policies created, or policies don't match user's context  
**Fix:** Check that SELECT policy exists with correct USING clause. Verify the user has a profile with `foundry_id` set if using foundry isolation.

### Issue: Storage files accessible without authentication
**Cause:** Bucket is public or missing storage policies  
**Fix:** Create storage policies on `storage.objects` table. Use signed URLs with expiration for private files instead of public URLs.

### Issue: Unable to update/delete audit records (intentional)
**Cause:** Immutability triggers preventing modification  
**Fix:** This is by design. If you need to fix audit data, use a service role connection that bypasses RLS (admin only).

### Issue: Migration applies but RLS blocks all access
**Cause:** `ENABLE ROW LEVEL SECURITY` without corresponding policies  
**Fix:** Always include CREATE POLICY statements in the same migration that enables RLS.

## Related Skills

- [security-review](../security-review/SKILL.md) - Comprehensive security checklist including database security section
- [secure-server-actions](../secure-server-actions/SKILL.md) - Server-side ownership checks that complement RLS
- [secure-api-routes](../secure-api-routes/SKILL.md) - API-level security that works with database policies
- [supabase-migration](../supabase-migration/SKILL.md) - Process for creating and applying migrations safely
