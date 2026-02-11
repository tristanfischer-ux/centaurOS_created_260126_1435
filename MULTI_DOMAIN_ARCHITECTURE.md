# Multi-Domain Architecture - Complete!

**Date:** January 30, 2026
**Status:** ✅ LIVE AND OPERATIONAL

> **UPDATE (February 2026):** The architecture has been consolidated to a **single domain**: `fractionalforge.app`. The dual-domain split described below is no longer in effect. All routes (marketing, app, ops, staging) now live under `fractionalforge.app`.

---

## 🎯 Architecture Overview

ForgeOS now operates on a **single-domain architecture** under `fractionalforge.app`:

### 🏢 Company Domain: **fractionalforge.app**
- **Purpose**: Public-facing marketing and information
- **Routes**:
  - `/` - Marketing homepage
  - `/join/*` - Signup flows (founder, executive, apprentice, etc.)
- **Audience**: Prospective users, general public
- **Features**: No authentication required

### 🚀 App Domain: **fractionalforge.app**  
- **Purpose**: Authenticated application (the actual ForgeOS platform)
- **Routes**:
  - `/login` - Login page
  - `/dashboard` - User dashboard (post-login)
  - `/marketplace` - AI marketplace
  - All other authenticated routes
- **Audience**: Registered users
- **Features**: Full authentication required

---

## 🔄 User Flow

### New User Journey:
1. User visits **fractionalforge.app** (marketing site)
2. Clicks "Login" → redirects to **fractionalforge.app/login**
3. Enters credentials → redirects to **fractionalforge.app/dashboard**
4. All subsequent navigation happens on **fractionalforge.app**

### Signup Flow:
1. User visits **fractionalforge.app**
2. Clicks "Begin Induction" (or other signup CTA)
3. Completes signup at **fractionalforge.app/join/founder** (etc.)
4. After signup → redirects to **fractionalforge.app/dashboard**

---

## 🛠️ Technical Implementation

### 1. Middleware (`middleware.ts`)
Handles domain-based routing:
- Redirects marketing routes (/, /join/*) from fractionalforge.app → fractionalforge.app
- Redirects app routes from fractionalforge.app → fractionalforge.app
- Redirects /login from fractionalforge.app → fractionalforge.app

### 2. Supabase Middleware (`src/lib/supabase/middleware.ts`)
Handles authentication:
- Public routes: /, /login, /auth, /join/*, /invite/*
- Protected routes: All others (require authentication)
- Redirects unauthenticated users to marketing domain login

### 3. Marketing Page (`src/app/page.tsx`)
Updated all login links to use full URLs:
```javascript
const APP_DOMAIN = process.env.NEXT_PUBLIC_APP_DOMAIN || 'https://fractionalforge.app'
// All login buttons link to: `${APP_DOMAIN}/login`
```

### 4. Login Page (`src/app/login/page.tsx`)
"Return to Site" link points to marketing domain:
```javascript
const marketingDomain = process.env.NEXT_PUBLIC_MARKETING_DOMAIN || 'https://fractionalforge.app'
```

### 5. Environment Variables
Added to Vercel:
```bash
NEXT_PUBLIC_MARKETING_DOMAIN=https://fractionalforge.app
NEXT_PUBLIC_APP_DOMAIN=https://fractionalforge.app
```

---

## ✅ Verification Tests

### Test 1: Marketing Site
```bash
curl -I https://fractionalforge.app
# Expected: 200 OK (shows marketing page)
```

### Test 2: Login Page
```bash
curl -I https://fractionalforge.app/login
# Expected: 200 OK (shows login page)
```

### Test 3: App Root Redirect
```bash
curl -I https://fractionalforge.app
# Expected: 307 redirect to https://fractionalforge.app/
```

### Test 4: Cross-Domain Login Link
Visit https://fractionalforge.app, click "Login" button
# Expected: Redirects to https://fractionalforge.app/login

---

## 🔒 Security Benefits

1. **Isolation**: Marketing site separate from authenticated app
2. **Attack Surface Reduction**: Public-facing content doesn't expose app routes
3. **Cookie Security**: Auth cookies only set on app domain
4. **Clearer Security Boundaries**: Easier to implement domain-specific security policies

---

## 📊 Domain Configuration

### DNS Records (Namecheap)

**fractionalforge.app:**
```
A Record:    @ → 76.76.21.21
CNAME Record: www → cname.vercel-dns.com
```

**fractionalforge.app:**
```
A Record:    @ → 76.76.21.21
CNAME Record: www → cname.vercel-dns.com
```

### Vercel Configuration

Both domains point to the same Vercel project:
- Project: `centaur-os-created-260126-1435`
- Domains:
  - ✅ fractionalforge.app
  - ✅ fractionalforge.app

The middleware handles routing based on hostname.

---

## 🚀 Deployment

### Current Status:
- ✅ Code deployed to production
- ✅ Environment variables configured
- ✅ Both domains live and operational
- ✅ SSL certificates active on both domains
- ✅ All routing logic working correctly

### Latest Deployment:
- **Commit**: `ce8e3b6` - fix: add root path to public routes for marketing page
- **Status**: Ready
- **URL**: https://centaur-os-created-260126-1435-o04dfsr9q.vercel.app

---

## 📝 Future Enhancements

### Phase 2 (Optional):
1. **Separate Marketing Repo**: Move marketing site to separate Next.js project
2. **Blog on Marketing Domain**: Add /blog to fractionalforge.app
3. **Documentation Site**: docs.fractionalforge.app or docs.fractionalforge.app
4. **Status Page**: status.fractionalforge.app for uptime monitoring
5. **API Documentation**: api.fractionalforge.app for API docs

### Advanced Optimizations:
1. **CDN Configuration**: Optimize caching for marketing vs. app content
2. **Analytics Split**: Separate analytics for marketing vs. app
3. **A/B Testing**: Test marketing page variations on fractionalforge.app
4. **Multi-Region**: Deploy marketing site closer to target audiences

---

## 🎉 Summary

**What We Built:**
- ✅ Dual-domain architecture separating marketing from app
- ✅ Intelligent middleware for domain-based routing
- ✅ Seamless cross-domain authentication flow
- ✅ Updated all marketing links to use full URLs
- ✅ Deployed and verified both domains

**Live URLs:**
- **Marketing**: https://fractionalforge.app
- **App**: https://fractionalforge.app

**User Experience:**
- Marketing site on company domain (fractionalforge.app)
- App on product domain (fractionalforge.app)
- Seamless login flow between domains
- Clear separation of concerns

---

**Status**: ✅ Complete and Operational
**Next Steps**: User can now test the full flow by visiting https://fractionalforge.app
