---
name: secure-server-actions
description: Security checklist for Next.js Server Actions in CentaurOS. Use when creating or modifying any server action in src/actions/, when adding database queries, when implementing CRUD operations, or when the user mentions action, server action, mutation, or data modification. Prevents IDOR vulnerabilities, missing authentication, and foundry isolation issues.
---

# Secure Server Actions

Every server action in CentaurOS MUST follow these security patterns to prevent IDOR, authentication bypass, and data leakage.

## Required Security Checks

Every server action must include these checks IN ORDER:

```typescript
export async function myAction(input: Input): Promise<Result> {
  const supabase = await createClient()
  
  // 1. AUTHENTICATION - Always verify user is logged in
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'Not authenticated' }
  }
  
  // 2. FOUNDRY ISOLATION - Get user's foundry context
  const foundryId = await getFoundryIdCached()
  if (!foundryId) {
    return { error: 'No foundry context' }
  }
  
  // 3. OWNERSHIP VERIFICATION - Before any read/update/delete by ID
  const { data: resource } = await supabase
    .from('table')
    .select('foundry_id')  // or owner_id, created_by, etc.
    .eq('id', resourceId)
    .single()
  
  if (!resource || resource.foundry_id !== foundryId) {
    return { error: 'Resource not found' }  // Generic message, don't reveal existence
  }
  
  // 4. Now perform the actual operation
  // ...
}
```

## IDOR Prevention Patterns

### Direct Resource Access
```typescript
// ❌ WRONG - No ownership check
export async function getResource(id: string) {
  const { data } = await supabase.from('resources').select('*').eq('id', id).single()
  return data  // Anyone can access any resource!
}

// ✅ CORRECT - Verify foundry ownership
export async function getResource(id: string) {
  const foundryId = await getFoundryIdCached()
  if (!foundryId) return { error: 'No foundry context' }
  
  const { data } = await supabase
    .from('resources')
    .select('*')
    .eq('id', id)
    .eq('foundry_id', foundryId)  // Filter by foundry
    .single()
  
  return { data }
}
```

### Nested Resource Access
When resource doesn't have direct `foundry_id`, verify via parent:

```typescript
// Blueprint expertise → belongs to coverage → belongs to blueprint → has foundry_id
export async function removeExpertise(expertiseId: string) {
  const foundryId = await getFoundryIdCached()
  if (!foundryId) return { error: 'No foundry context' }

  const { data: expertise } = await supabase
    .from('blueprint_expertise')
    .select('coverage:blueprint_domain_coverage(blueprint:blueprints(foundry_id))')
    .eq('id', expertiseId)
    .single()
  
  const blueprintFoundryId = (expertise?.coverage as any)?.blueprint?.foundry_id
  if (!blueprintFoundryId || blueprintFoundryId !== foundryId) {
    return { error: 'Expertise not found' }
  }
  
  // Now safe to delete
}
```

### User Ownership (Non-Foundry Resources)
For user-specific resources like notifications:

```typescript
// ✅ CORRECT - Filter by user_id
export async function markNotificationRead(notificationId: string) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', notificationId)
    .eq('user_id', user.id)  // CRITICAL: ownership check
}
```

## Error Message Security

Never reveal whether a resource exists:

```typescript
// ❌ WRONG - Information disclosure
if (!resource) return { error: 'Resource does not exist' }
if (resource.foundry_id !== foundryId) return { error: 'Unauthorized' }

// ✅ CORRECT - Generic message
if (!resource || resource.foundry_id !== foundryId) {
  return { error: 'Resource not found' }
}
```

Use `sanitizeErrorMessage()` for database errors:

```typescript
import { sanitizeErrorMessage } from '@/lib/security/sanitize'

if (error) {
  console.error('Database error:', error)  // Log full error server-side
  return { error: sanitizeErrorMessage(error) }  // Generic message to client
}
```

## Checklist Before Committing

- [ ] Authentication: `getUser()` called and user verified
- [ ] Foundry isolation: `getFoundryIdCached()` called for shared resources
- [ ] Ownership check: Resource verified before read/update/delete
- [ ] Generic errors: No information disclosure about existence
- [ ] Error sanitization: `sanitizeErrorMessage()` used for DB errors
- [ ] No email exposure: Remove `email` from select queries going to client

## Common Vulnerabilities to Avoid

| Vulnerability | Example | Fix |
|--------------|---------|-----|
| Missing auth | No `getUser()` call | Add authentication check first |
| Direct ID access | `.eq('id', id)` without ownership | Add `.eq('foundry_id', foundryId)` |
| Existence oracle | Different errors for "not found" vs "unauthorized" | Use single generic message |
| Email exposure | `select('*, profile:profiles(email)')` | Remove email from select |
| Parent bypass | Delete child without verifying parent ownership | Verify parent chain |

## When to Use This Skill

Use this skill when:

1. **Creating new Server Actions** in `src/actions/` - every action needs auth and ownership checks
2. **Implementing CRUD operations** - create, read, update, delete all need security verification
3. **Accessing resources by ID** - any `.eq('id', someId)` pattern requires ownership verification
4. **Building features that modify data** - mutations are high-risk and need extra scrutiny
5. **Working with nested resources** - child resources need parent chain verification

## When NOT to Use

| Scenario | Use Instead |
|----------|-------------|
| Creating API routes in `src/app/api/` | [secure-api-routes](../secure-api-routes/SKILL.md) |
| Writing database migrations or RLS | [secure-database](../secure-database/SKILL.md) |
| Building frontend with user URLs | [secure-frontend](../secure-frontend/SKILL.md) |
| Comprehensive pre-commit review | [security-review](../security-review/SKILL.md) |
| Implementing complete features | [feature-implementation-guide](../feature-implementation-guide/SKILL.md) first |

## Quick Reference

| Decision | Answer | Notes |
|----------|--------|-------|
| First check in every action? | `getUser()` authentication | Return early if no user |
| Second check for shared resources? | `getFoundryIdCached()` | Get foundry context |
| How to verify ownership? | Add `.eq('foundry_id', foundryId)` | Or `user_id` for personal resources |
| Error for "not found"? | `{ error: 'Resource not found' }` | Same message for unauthorized |
| Error for "not authenticated"? | `{ error: 'Not authenticated' }` | Check auth first |
| Include email in SELECT? | **Never** | Exclude from client-facing queries |
| Nested resource ownership? | Verify via parent chain | Follow relationship to foundry |
| How to sanitize DB errors? | `sanitizeErrorMessage(error)` | Never expose raw errors |

## Troubleshooting

### Issue: Users accessing other users' resources (IDOR)
**Cause:** Missing `.eq('foundry_id', foundryId)` or `.eq('user_id', user.id)` filter  
**Fix:** Add ownership filter to every query that uses an ID parameter. Pattern:
```typescript
const { data } = await supabase.from('table')
  .select('*')
  .eq('id', resourceId)
  .eq('foundry_id', foundryId)  // Add this
  .single()
```

### Issue: Action works but reveals resource existence
**Cause:** Different error messages for "not found" vs "unauthorized"  
**Fix:** Use single generic message for both cases:
```typescript
if (!resource || resource.foundry_id !== foundryId) {
  return { error: 'Resource not found' }  // Same message for both
}
```

### Issue: Nested resource deletion bypasses parent check
**Cause:** Child resource deleted without verifying parent ownership  
**Fix:** Query through relationships to verify the chain. Example for blueprint expertise:
```typescript
const { data } = await supabase
  .from('blueprint_expertise')
  .select('coverage:blueprint_domain_coverage(blueprint:blueprints(foundry_id))')
  .eq('id', expertiseId)
  .single()
// Then verify the foundry_id from the nested result
```

### Issue: Database error details exposed to client
**Cause:** Returning raw Supabase error object  
**Fix:** Use `sanitizeErrorMessage(error)` to return generic message while logging full error server-side:
```typescript
if (error) {
  console.error('DB error:', error)  // Log full error
  return { error: sanitizeErrorMessage(error) }  // Generic to client
}
```

### Issue: Email addresses appearing in client responses
**Cause:** SELECT query includes email field or joins to profiles with email  
**Fix:** Explicitly list fields in SELECT, excluding sensitive data:
```typescript
// Wrong: .select('*, profile:profiles(*)')
// Right: .select('id, name, profile:profiles(id, full_name, avatar_url)')
```

## Related Skills

- [security-review](../security-review/SKILL.md) - Comprehensive security checklist for all code changes
- [secure-api-routes](../secure-api-routes/SKILL.md) - Security for API routes (use when Server Actions aren't appropriate)
- [secure-database](../secure-database/SKILL.md) - RLS policies provide defense-in-depth with server action checks
- [feature-implementation-guide](../feature-implementation-guide/SKILL.md) - Full feature implementation including security patterns
