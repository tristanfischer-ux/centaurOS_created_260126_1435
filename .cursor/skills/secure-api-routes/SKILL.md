---
name: secure-api-routes
description: Security checklist for Next.js API routes in CentaurOS. Use when creating or modifying any API route in src/app/api/, when adding endpoints that accept user input, when implementing file uploads, or when the user mentions API, endpoint, route handler, POST, GET, PUT, DELETE. Prevents missing rate limiting, input validation bypass, and authentication issues.
---

# Secure API Routes

Every API route in CentaurOS MUST follow these security patterns.

## Required Security Template

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { rateLimit, getClientIP } from '@/lib/security/rate-limit'

// 1. Define input schema with Zod
const InputSchema = z.object({
  field: z.string().max(1000),
  number: z.number().min(0).max(100),
})

export async function POST(req: NextRequest) {
  try {
    // 2. AUTHENTICATION
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 3. RATE LIMITING (adjust limits based on endpoint)
    const headersList = await headers()
    const clientIP = getClientIP(headersList)
    const rateLimitResult = await rateLimit('api', `endpoint-name:${user.id}`, { 
      limit: 10,  // requests allowed
      window: 60  // per X seconds
    })
    
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.' },
        { status: 429 }
      )
    }

    // 4. INPUT VALIDATION
    const body = await req.json()
    const validation = InputSchema.safeParse(body)
    
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid input' },
        { status: 400 }
      )
    }

    const { field, number } = validation.data

    // 5. Business logic here...
    
    return NextResponse.json({ success: true })
  } catch (error) {
    // 6. ERROR HANDLING - Never expose internal errors
    console.error('API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
```

## Rate Limiting Guidelines

| Endpoint Type | Limit | Window | Example |
|--------------|-------|--------|---------|
| AI/OpenAI calls | 5-10 | 60s | `ai-search:${user.id}` |
| File uploads | 10 | 60s | `upload:${user.id}` |
| Authentication | 5 | 900s | `login:${ip}` |
| Code generation | 3 | 900s | `code-gen:${user.id}` |
| General API | 60 | 60s | `api:${user.id}` |
| Webhooks | By IP | 60s | `webhook:${ip}` |

```typescript
// AI endpoint - expensive, tight limits
await rateLimit('api', `ai-search:${user.id}`, { limit: 10, window: 60 })

// Login - prevent brute force
await rateLimit('api', `login:${clientIP}`, { limit: 5, window: 900 })

// File upload - moderate limits
await rateLimit('api', `upload:${user.id}`, { limit: 10, window: 60 })
```

## Input Validation Patterns

### String Validation
```typescript
const Schema = z.object({
  name: z.string().min(1).max(100),
  bio: z.string().max(2000).optional(),
  email: z.string().email().max(255),
  url: z.string().url().max(2000).optional(),
})
```

### UUID Validation
```typescript
const UUIDSchema = z.string().uuid()

// Or inline
z.object({
  resourceId: z.string().uuid(),
})
```

### File Upload Validation
```typescript
const ALLOWED_MIME_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]

const MAX_FILE_SIZE = 10 * 1024 * 1024  // 10MB

// In route handler:
const file = formData.get('file') as File
if (!file) {
  return NextResponse.json({ error: 'No file provided' }, { status: 400 })
}

if (file.size > MAX_FILE_SIZE) {
  return NextResponse.json({ error: 'File too large' }, { status: 400 })
}

if (!ALLOWED_MIME_TYPES.includes(file.type)) {
  return NextResponse.json({ error: 'File type not allowed' }, { status: 400 })
}
```

### Path/Filename Sanitization
```typescript
import { sanitizeFileName } from '@/lib/security/sanitize'

const safeName = sanitizeFileName(file.name)

// Prevent path traversal
if (path.includes('..') || path.includes('//')) {
  return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
}
```

## Secure Randomness

**NEVER use Math.random() for security-sensitive operations:**

```typescript
// ❌ WRONG - Predictable
const code = Math.random().toString(36).slice(2)

// ✅ CORRECT - Cryptographically secure
function generateSecureCode(length: number = 6): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const randomValues = new Uint8Array(length)
  crypto.getRandomValues(randomValues)
  return Array.from(randomValues)
    .map(byte => chars[byte % chars.length])
    .join('')
}
```

## Webhook Security

For external webhooks (Stripe, Telegram, etc.):

```typescript
export async function POST(req: NextRequest) {
  // 1. Verify signature BEFORE parsing body
  const signature = req.headers.get('x-webhook-signature')
  const secret = process.env.WEBHOOK_SECRET
  
  if (!secret) {
    console.error('Webhook secret not configured')
    return NextResponse.json({ error: 'Configuration error' }, { status: 500 })
  }
  
  const body = await req.text()
  
  if (!verifySignature(body, signature, secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }
  
  // 2. Parse and process
  const payload = JSON.parse(body)
  
  // 3. Implement idempotency for critical operations
  // ...
}
```

## Checklist Before Committing

- [ ] Authentication: User verified with `getUser()`
- [ ] Rate limiting: Appropriate limits for endpoint type
- [ ] Input validation: Zod schema for all inputs
- [ ] File validation: Size, type, and name sanitized
- [ ] Error handling: Generic messages, no stack traces
- [ ] Secure randomness: `crypto.getRandomValues()` not `Math.random()`
- [ ] Webhook verification: Signature checked before processing

## Common Vulnerabilities

| Vulnerability | Example | Fix |
|--------------|---------|-----|
| No rate limit | AI endpoint without limits | Add rate limiting |
| Weak validation | `const { id } = body` | Use Zod schema |
| File bomb | No size limit | Check `file.size` |
| Path traversal | User controls file path | Sanitize, check for `..` |
| Insecure random | `Math.random()` for codes | Use `crypto.getRandomValues()` |
| Error exposure | `return { error: err.message }` | Generic error message |
