---
name: vercel-deploy
description: Deploy CentaurOS to Vercel, verify deployment succeeded, and automatically fix any build errors. Use when deploying to production, pushing changes to Vercel, checking deployment status, fixing build failures, or when the user mentions deploy, production, Vercel, or live site.
---

# Vercel Deployment Skill

This skill handles the complete deployment workflow to Vercel including pushing, verifying, and auto-fixing any issues.

## Deployment Workflow

When deploying to Vercel, follow this complete workflow:

```
Deployment Progress:
- [ ] 1. Pre-deployment checks
- [ ] 2. Build locally to catch errors early
- [ ] 3. Commit and push to GitHub
- [ ] 4. Monitor Vercel deployment
- [ ] 5. Verify deployment succeeded
- [ ] 6. Fix any issues and redeploy if needed
```

## Step 1: Pre-Deployment Checks

Before deploying, verify the codebase is ready:

```bash
# Check for uncommitted changes
git status

# Run linter
npm run lint

# Run type check
npx tsc --noEmit

# Check for any TODO/FIXME that might be blockers
grep -r "TODO\|FIXME" src/ --include="*.ts" --include="*.tsx" | head -20
```

**Stop deployment if:**
- Linter errors exist
- Type errors exist
- Critical TODO items are unaddressed

## Step 2: Local Build Test

**Always build locally first to catch errors before they hit Vercel:**

```bash
npm run build
```

If the build fails:
1. Read the error output carefully
2. Fix the identified issues
3. Re-run the build
4. Repeat until successful

**Common build errors and fixes:**

| Error | Solution |
|-------|----------|
| Type error | Fix type mismatch in indicated file |
| Import error | Check path aliases, missing exports |
| Missing env var | Add to `.env.local` or Vercel dashboard |
| Module not found | Run `npm install` |

## Step 3: Commit and Push

Once the local build succeeds:

```bash
# Stage all changes
git add .

# Commit with descriptive message
git commit -m "feat: description of changes"

# Push to trigger Vercel deployment
git push origin main
```

**Important**: Pushing to `main` triggers automatic Vercel deployment.

## Step 4: Monitor Vercel Deployment

After pushing, monitor the deployment:

```bash
# Check recent deployments using Vercel CLI (if installed)
vercel ls

# Or use the Vercel API
curl -s -H "Authorization: Bearer $VERCEL_TOKEN" \
  "https://api.vercel.com/v6/deployments?projectId=$VERCEL_PROJECT_ID&limit=5"
```

**If Vercel CLI is not installed:**
- Inform user to check https://vercel.com/dashboard
- Or install CLI: `npm i -g vercel && vercel login`

## Step 5: Verify Deployment

After deployment completes, verify it works:

```bash
# Get the deployment URL (usually https://centauros.vercel.app or similar)
# Test the health endpoint
curl -s https://[deployment-url]/api/health | jq .

# Or simply fetch the homepage
curl -s -o /dev/null -w "%{http_code}" https://[deployment-url]
```

**Success criteria:**
- HTTP 200 response
- No console errors in browser
- Key functionality works

## Step 6: Fix and Redeploy

If deployment fails or the site has issues:

### Build Failures on Vercel

1. Check the Vercel build logs:
   ```bash
   vercel logs [deployment-url]
   ```

2. Common Vercel-specific issues:

   | Issue | Solution |
   |-------|----------|
   | Missing env vars | Add to Vercel project settings |
   | Node version mismatch | Add `engines` field to package.json |
   | Memory exceeded | Optimize build or upgrade plan |
   | Edge function error | Check Supabase Edge Function logs |

3. Fix the issue locally
4. Test with `npm run build`
5. Commit and push again

### Runtime Errors

If the site deploys but has runtime errors:

1. Check browser console for errors
2. Check Vercel Function logs:
   ```bash
   vercel logs [deployment-url] --follow
   ```
3. Fix the issue in code
4. Redeploy

## Environment Variables

CentaurOS requires these environment variables on Vercel:

```
NEXT_PUBLIC_SUPABASE_URL=https://[project].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=[anon-key]
SUPABASE_SERVICE_ROLE_KEY=[service-role-key]
STRIPE_SECRET_KEY=[stripe-key]
STRIPE_WEBHOOK_SECRET=[webhook-secret]
OPENAI_API_KEY=[openai-key]
```

**To add/update env vars:**
- Go to Vercel Dashboard → Project → Settings → Environment Variables
- Or use CLI: `vercel env add VARIABLE_NAME`

## Quick Deploy Commands

```bash
# Full deployment workflow (run in sequence)
npm run lint && npm run build && git add . && git commit -m "deploy: updates" && git push

# Check if Vercel CLI is available
which vercel || echo "Install with: npm i -g vercel"

# Force redeploy without code changes
vercel --prod

# Deploy to preview (not production)
vercel
```

## Rollback

If a deployment breaks production:

```bash
# List recent deployments
vercel ls

# Promote a previous deployment to production
vercel promote [deployment-url]

# Or via git
git revert HEAD
git push
```

## Automated Fix Pattern

When deployment fails, follow this pattern:

1. **Capture the error** - Read build logs completely
2. **Identify root cause** - Match error to known patterns
3. **Fix locally** - Make the code change
4. **Verify locally** - Run `npm run build`
5. **Commit descriptively** - Include "fix:" prefix
6. **Push and monitor** - Watch deployment succeed
7. **Verify live** - Test the deployed site

**Never leave a broken deployment. Always iterate until it works.**

## Troubleshooting Reference

See [references/vercel-errors.md](references/vercel-errors.md) for a comprehensive list of common Vercel errors and their solutions.

## Post-Deployment Checklist

After successful deployment:

- [ ] Homepage loads correctly
- [ ] Authentication works
- [ ] Database connections work
- [ ] API routes respond
- [ ] No console errors
- [ ] Mobile responsive works
