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
