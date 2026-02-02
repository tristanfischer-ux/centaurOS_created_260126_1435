---
name: secure-frontend
description: Security checklist for React/Next.js frontend components in CentaurOS. Use when creating components that display user-provided URLs, render external links, display user content, or handle file downloads. Use when the user mentions XSS, href, link, URL, embed, iframe, or user content display. Prevents XSS via href/src injection and content injection attacks.
---

# Secure Frontend Components

Prevent XSS and injection attacks in React components.

## URL Sanitization

**ALWAYS sanitize URLs before using in href, src, or iframe attributes.**

### Import the Sanitizer
```typescript
import { sanitizeHref, sanitizeImageSrc, sanitizeVideoEmbedUrl } from '@/lib/security/url-validation'
```

### External Links
```tsx
// ❌ WRONG - XSS via javascript: protocol
<a href={user.website_url}>Website</a>

// ✅ CORRECT - Sanitize href
{user.website_url && sanitizeHref(user.website_url) !== '#' && (
  <a 
    href={sanitizeHref(user.website_url)}
    target="_blank"
    rel="noopener noreferrer"
  >
    Website
  </a>
)}
```

### File Download Links
```tsx
// ❌ WRONG
<a href={file.url}>Download</a>

// ✅ CORRECT
{file.url && sanitizeHref(file.url) !== '#' && (
  <a href={sanitizeHref(file.url)} target="_blank" rel="noopener noreferrer">
    Download
  </a>
)}
```

### Image Sources
```tsx
// ❌ WRONG - SSRF via user-provided URL
<img src={user.avatar_url} />

// ✅ CORRECT - Validate image URL
{user.avatar_url && sanitizeImageSrc(user.avatar_url) && (
  <img src={sanitizeImageSrc(user.avatar_url)!} alt="Avatar" />
)}
```

### Video Embeds
```tsx
// ❌ WRONG
<iframe src={user.video_url} />

// ✅ CORRECT - Only allow safe embed URLs
{user.video_url && sanitizeVideoEmbedUrl(user.video_url) && (
  <iframe
    src={sanitizeVideoEmbedUrl(user.video_url)!}
    allow="accelerometer; autoplay; clipboard-write; encrypted-media"
    allowFullScreen
  />
)}
```

## Conditional Rendering Pattern

Always check both existence AND validity:

```tsx
// Pattern: {value && sanitize(value) !== '#' && (...)}

// Links
{profile.linkedin_url && sanitizeHref(profile.linkedin_url) !== '#' && (
  <a href={sanitizeHref(profile.linkedin_url)}>LinkedIn</a>
)}

// Buttons with links
{cert.verification_url && sanitizeHref(cert.verification_url) !== '#' && (
  <Button asChild>
    <a href={sanitizeHref(cert.verification_url)}>Verify</a>
  </Button>
)}
```

## Markdown/Rich Text

When rendering user-provided markdown:

```tsx
import { Markdown } from '@/components/ui/markdown'

// The Markdown component already sanitizes URLs internally
<Markdown content={userContent} />
```

For raw HTML (avoid if possible):

```tsx
import DOMPurify from 'dompurify'

// Only if absolutely necessary
<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(userHtml) }} />
```

## Data Exposure Prevention

Never expose sensitive fields in SSR/client props:

```tsx
// ❌ WRONG - Email exposed to client
const { data } = await supabase
  .from('profiles')
  .select('id, full_name, email, role')  // email exposed!

// ✅ CORRECT - Only necessary fields
const { data } = await supabase
  .from('profiles')
  .select('id, full_name, role')  // No email
```

## Console Logging

Remove debug logs before production:

```tsx
// ❌ WRONG - Exposes data in browser console
console.log('User data:', userData)
console.log('API response:', response)

// ✅ CORRECT - No sensitive data logged
// Use proper error boundaries and monitoring instead
```

## Component Security Checklist

Before committing any component:

- [ ] All `href` attributes use `sanitizeHref()`
- [ ] All `src` attributes for images use validation
- [ ] All iframe `src` uses `sanitizeVideoEmbedUrl()`
- [ ] External links have `target="_blank" rel="noopener noreferrer"`
- [ ] Conditional render checks validity: `{url && sanitize(url) !== '#' && ...}`
- [ ] No sensitive data (emails, tokens) in component props
- [ ] No `console.log` with sensitive data
- [ ] User content uses Markdown component or DOMPurify

## URL Validation Functions Reference

```typescript
// sanitizeHref(url, allowedProtocols?)
// Returns: sanitized URL or '#' if invalid
// Default protocols: http:, https:, mailto:, tel:
sanitizeHref('https://example.com')  // 'https://example.com'
sanitizeHref('javascript:alert(1)')  // '#'
sanitizeHref('//evil.com')           // '#'

// sanitizeImageSrc(url)
// Returns: URL or null if not a valid image URL
// Only allows http/https, blocks private IPs
sanitizeImageSrc('https://cdn.example.com/img.jpg')  // URL
sanitizeImageSrc('http://localhost/img.jpg')          // null (private IP)

// sanitizeVideoEmbedUrl(url)
// Returns: embed URL or null if not allowed platform
// Allowed: youtube.com, vimeo.com, loom.com
sanitizeVideoEmbedUrl('https://youtube.com/embed/xyz')  // URL
sanitizeVideoEmbedUrl('https://evil.com/video')         // null
```

## Common XSS Vectors to Avoid

| Vector | Example | Fix |
|--------|---------|-----|
| javascript: protocol | `href="javascript:alert(1)"` | `sanitizeHref()` |
| data: URL | `src="data:text/html,<script>..."` | `sanitizeImageSrc()` |
| Protocol-relative | `href="//evil.com"` | Check for `//` prefix |
| Event handlers | `<img src=x onerror="alert(1)">` | Use React, not innerHTML |
| Malicious embed | `<iframe src="evil.com">` | `sanitizeVideoEmbedUrl()` |
