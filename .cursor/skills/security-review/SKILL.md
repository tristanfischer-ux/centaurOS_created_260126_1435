---
name: security-review
description: Comprehensive security review checklist for CentaurOS code changes. Use before committing code, during code review, when creating PRs, or when the user mentions security review, audit, vulnerability check, or secure code. Systematically checks for IDOR, XSS, injection, authentication, rate limiting, and data exposure issues.
role: |
  You are a security auditor who assumes every system is already compromised.
  You check authentication first, then authorization, then data isolation.
  You never skip a check because "it's probably fine" - you verify everything.
  You flag issues even if they seem unlikely to be exploited. Better safe than breached.
---

# Security Review Checklist

Use this checklist to review code changes for security vulnerabilities before committing.

## Quick Scan (< 2 minutes)

Run these checks on every code change:

### 1. Authentication Check
```bash
# Every server action/API route should have auth
rg "export async function" src/actions/ | head -20
# Look for getUser() call near the top of each function
```

**Red flags:**
- Missing `await supabase.auth.getUser()` 
- Missing `if (!user)` check

### 2. IDOR Check
```bash
# Find functions that take an ID parameter
rg "async function \w+\(.*[Ii]d.*:" src/actions/
# Verify each has foundry/ownership verification
```

**Red flags:**
- `.eq('id', someId)` without `.eq('foundry_id', foundryId)` 
- Missing ownership verification before update/delete

### 3. Rate Limit Check
```bash
# API routes should have rate limiting
rg "export async function (GET|POST|PUT|DELETE)" src/app/api/ -A 20 | rg -A 5 "rateLimit"
```

**Red flags:**
- AI endpoints without rate limiting
- Authentication endpoints without rate limiting

### 4. XSS Check
```bash
# Find href/src attributes with variables
rg "href=\{" src/components/ --type tsx
rg "src=\{" src/components/ --type tsx
# Verify sanitizeHref/sanitizeImageSrc used
```

**Red flags:**
- `href={user.url}` without `sanitizeHref()`
- `src={user.image}` without validation

## Deep Review (5-10 minutes)

For new features or security-sensitive changes:

### Server Actions (src/actions/*.ts)

| Check | How to Verify |
|-------|---------------|
| Auth first | `getUser()` called before any DB operation |
| Foundry isolation | `getFoundryIdCached()` for shared resources |
| Ownership check | ID-based queries include owner filter |
| Error sanitization | `sanitizeErrorMessage()` for DB errors |
| No email exposure | `email` not in select queries |

### API Routes (src/app/api/**/*.ts)

| Check | How to Verify |
|-------|---------------|
| Auth check | `getUser()` with 401 response |
| Rate limiting | `rateLimit()` with appropriate limits |
| Input validation | Zod schema for request body |
| File validation | Size, type, name checks for uploads |
| Secure random | `crypto.getRandomValues()` not `Math.random()` |
| Generic errors | No stack traces or internal details |

### Frontend Components (src/components/**/*.tsx)

| Check | How to Verify |
|-------|---------------|
| URL sanitization | `sanitizeHref()` for all `href` |
| Image validation | `sanitizeImageSrc()` for user images |
| Video validation | `sanitizeVideoEmbedUrl()` for iframes |
| No sensitive props | No emails/tokens passed to client |
| External links | `target="_blank" rel="noopener noreferrer"` |

### Database Migrations (supabase/migrations/*.sql)

| Check | How to Verify |
|-------|---------------|
| RLS enabled | `ENABLE ROW LEVEL SECURITY` |
| RLS forced | `FORCE ROW LEVEL SECURITY` |
| Policies exist | SELECT/INSERT/UPDATE/DELETE policies |
| No recursion | Uses `get_my_foundry_id()` helper |
| Audit immutability | Triggers prevent UPDATE/DELETE |

## Vulnerability Categories

### Critical (Fix immediately)
- [ ] Missing authentication on data-modifying endpoints
- [ ] Direct ID access without ownership check (IDOR)
- [ ] Missing rate limiting on AI/payment endpoints
- [ ] Insecure randomness for security tokens

### High (Fix before merge)
- [ ] XSS via unsanitized href/src
- [ ] Email/PII exposure in API responses
- [ ] Missing foundry isolation
- [ ] Detailed error messages to clients

### Medium (Fix soon)
- [ ] Missing rate limiting on general endpoints
- [ ] Console.log with sensitive data
- [ ] Weak input validation
- [ ] Missing storage bucket policies

## Common Patterns Found in CentaurOS Audit

These specific issues were found and should never be reintroduced:

### IDOR Pattern
```typescript
// ❌ Found 25+ times - Missing foundry check
const { data } = await supabase.from('blueprints').eq('id', id).single()

// ✅ Fixed pattern
const foundryId = await getFoundryIdCached()
const { data } = await supabase.from('blueprints')
  .eq('id', id)
  .eq('foundry_id', foundryId)
  .single()
```

### XSS Pattern
```tsx
// ❌ Found 8+ times - Unsanitized URL
<a href={item.project_url}>Link</a>

// ✅ Fixed pattern
{item.project_url && sanitizeHref(item.project_url) !== '#' && (
  <a href={sanitizeHref(item.project_url)}>Link</a>
)}
```

### Rate Limit Pattern
```typescript
// ❌ Found 7+ times - Missing rate limit
export async function POST(req: NextRequest) {
  const { data: { user } } = await supabase.auth.getUser()
  // Direct to business logic

// ✅ Fixed pattern
const rateLimitResult = await rateLimit('api', `endpoint:${user.id}`, { limit: 10, window: 60 })
if (!rateLimitResult.success) {
  return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
}
```

### Notification Ownership Pattern
```typescript
// ❌ Found 2 times - Missing ownership
await supabase.from('notifications').delete().eq('id', notificationId)

// ✅ Fixed pattern
await supabase.from('notifications')
  .delete()
  .eq('id', notificationId)
  .eq('user_id', user.id)  // Ownership check
```

## Pre-Commit Checklist

Before every commit that touches:

**Actions file:**
- [ ] Every function has authentication
- [ ] ID-based operations verify ownership
- [ ] Errors use `sanitizeErrorMessage()`

**API route:**
- [ ] Has rate limiting with appropriate limits
- [ ] Input validated with Zod
- [ ] Uses `crypto.getRandomValues()` not `Math.random()`

**Component with URLs:**
- [ ] href uses `sanitizeHref()`
- [ ] External links have `rel="noopener noreferrer"`

**Migration:**
- [ ] RLS enabled and forced
- [ ] Appropriate policies for all operations

## Anti-Patterns

**BAD:** "This is internal-only, we don't need auth"
**WHY:** Internal APIs get exposed. Attackers find them. Always authenticate.

**BAD:** "RLS will handle it, I don't need server-side checks"
**WHY:** Defense in depth. RLS is the last line, not the only line.

**BAD:** "It's just a read operation, IDOR doesn't matter"
**WHY:** Reading other users' data is a breach. Every ID-based query needs ownership verification.

**BAD:** "Rate limiting slows down legitimate users"
**WHY:** Without it, one attacker can DoS your API or brute-force auth. 10 req/min is fine for humans.

**BAD:** "The error message helps users debug"
**WHY:** Detailed errors help attackers more. Use generic messages externally, detailed logs internally.

**BAD:** Checking `if (user.role === 'admin')` in the frontend
**WHY:** Frontend checks are bypassable. Always verify permissions server-side.

## Evaluation (Before Completing)

Before approving code as secure, verify:

- [ ] **Auth check present?** Does every endpoint verify the user is authenticated?
- [ ] **IDOR prevented?** Do ID-based queries include ownership/foundry filter?
- [ ] **Rate limiting?** Are abuse-prone endpoints (AI, auth, payments) rate limited?
- [ ] **Input validated?** Is user input validated with Zod before use?
- [ ] **Errors sanitized?** Do error responses hide internal details?
- [ ] **RLS enforced?** Do new tables have RLS enabled AND policies defined?
- [ ] **No secrets exposed?** Are API keys, tokens, emails excluded from responses?

## Examples

### Example 1: IDOR in Task Deletion

**Code submitted:**
```typescript
export async function deleteTask(taskId: string) {
  const supabase = await createClient()
  await supabase.from('tasks').delete().eq('id', taskId)
}
```

**Security issue:** Any user can delete any task by guessing IDs.

**Fixed code:**
```typescript
export async function deleteTask(taskId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')
  
  const foundryId = await getFoundryIdCached()
  await supabase.from('tasks')
    .delete()
    .eq('id', taskId)
    .eq('foundry_id', foundryId) // Ownership check
}
```

---

### Example 2: XSS via User URL

**Code submitted:**
```tsx
<a href={project.website_url}>Visit Website</a>
```

**Security issue:** If `website_url` is `javascript:alert('xss')`, clicking executes code.

**Fixed code:**
```tsx
import { sanitizeHref } from '@/lib/security/sanitize'

{project.website_url && sanitizeHref(project.website_url) !== '#' && (
  <a 
    href={sanitizeHref(project.website_url)}
    target="_blank"
    rel="noopener noreferrer"
  >
    Visit Website
  </a>
)}
```

---

### Example 3: Missing Rate Limit on AI Endpoint

**Code submitted:**
```typescript
export async function POST(req: NextRequest) {
  const { prompt } = await req.json()
  const response = await openai.chat.completions.create({...})
  return NextResponse.json({ result: response })
}
```

**Security issue:** Attacker can spam endpoint, running up AI costs.

**Fixed code:**
```typescript
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  
  const rateLimitResult = await rateLimit('ai', `ai:${user.id}`, { limit: 10, window: 60 })
  if (!rateLimitResult.success) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
  }
  
  const { prompt } = await req.json()
  const response = await openai.chat.completions.create({...})
  return NextResponse.json({ result: response })
}
```
