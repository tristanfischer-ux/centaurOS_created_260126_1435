---
name: vercel-deploy
description: Full-stack deployment of CentaurOS including branch consolidation, Supabase migrations, Edge Functions, and Vercel deployment. Use when deploying to production, pushing changes, merging branches, running migrations, deploying edge functions, or when the user mentions deploy, production, Vercel, Supabase, migration, or live site.
---

# Full-Stack Deployment Skill

This skill handles the complete deployment workflow for CentaurOS including git branch consolidation, Supabase database migrations, Edge Functions, and Vercel deployment.

## Deployment Workflow

When deploying to production, follow this complete workflow:

```
Deployment Progress:
- [ ] 1. Branch consolidation (merge all feature branches into main)
- [ ] 2. Supabase deployment (migrations + Edge Functions)
- [ ] 3. Pre-deployment checks
- [ ] 4. Build locally to catch errors early
- [ ] 5. Commit and push to GitHub
- [ ] 6. Monitor Vercel deployment
- [ ] 7. Verify deployment succeeded
- [ ] 8. Fix any issues and redeploy if needed
```

## Step 1: Branch Consolidation

Before deploying, consolidate all feature branches into `main`:

### 1.1 Survey All Branches

```bash
# Fetch latest from remote
git fetch --all

# List all branches (local and remote)
git branch -a

# Show branches with their last commit date (most recent first)
git for-each-ref --sort=-committerdate refs/heads/ --format='%(committerdate:short) %(refname:short)'

# See which branches have unmerged commits relative to main
git branch --no-merged main
```

### 1.2 Review Branch Changes

For each unmerged branch, review what changes it contains:

```bash
# Compare branch to main
git log main..[branch-name] --oneline

# See the actual diff
git diff main...[branch-name] --stat
```

### 1.3 Merge Branches into Main

```bash
# Ensure main is up to date
git checkout main
git pull origin main

# Merge each feature branch
git merge [branch-name] --no-ff -m "merge: [branch-name] into main"

# If there are conflicts, resolve them:
# 1. Open conflicting files
# 2. Resolve conflicts (keep both changes where appropriate)
# 3. Stage resolved files: git add [file]
# 4. Complete merge: git commit
```

**Merge order strategy:**
1. Merge oldest branches first (less likely to have conflicts)
2. Merge dependent branches after their dependencies
3. Merge large/risky branches last

### 1.4 Handle Merge Conflicts

When conflicts occur:

```bash
# See which files have conflicts
git status

# For each conflicted file, look for conflict markers:
# <<<<<<< HEAD
# (changes from main)
# =======
# (changes from feature branch)
# >>>>>>> branch-name

# After resolving:
git add [resolved-file]
git commit -m "resolve: merge conflicts from [branch-name]"
```

**Conflict resolution guidelines:**
- Keep both changes if they don't overlap logically
- For imports, keep all unique imports
- For configuration, merge settings carefully
- When in doubt, keep the more recent change and test

### 1.5 Clean Up Merged Branches

After successful merge:

```bash
# Delete local branch
git branch -d [branch-name]

# Delete remote branch
git push origin --delete [branch-name]

# Prune stale remote tracking branches
git fetch --prune
```

### 1.6 Skip Branch Consolidation

If deploying from a specific branch without merging:

```bash
# Deploy directly from current branch (creates preview deployment)
git push origin [branch-name]

# Or deploy to production from non-main branch
vercel --prod
```

**Note:** Pushing to `main` triggers automatic production deployment on Vercel.

## Step 2: Supabase Deployment

**CRITICAL:** Apply database migrations BEFORE deploying code that depends on them.

### 2.1 Check for Pending Migrations

```bash
# List all migration files
ls -la supabase/migrations/

# Check which migrations exist locally
ls supabase/migrations/*.sql | wc -l

# View the most recent migrations
ls -t supabase/migrations/*.sql | head -5
```

### 2.2 Review Migration Content

Before applying, review what each migration does:

```bash
# Read the most recent migration
cat supabase/migrations/$(ls -t supabase/migrations/*.sql | head -1)

# Check for potentially dangerous operations
grep -l "DROP\|DELETE\|TRUNCATE" supabase/migrations/*.sql
```

**Review checklist:**
- [ ] No accidental DROP TABLE without backup plan
- [ ] RLS policies are included for new tables
- [ ] Indexes added for frequently queried columns
- [ ] Foreign keys have appropriate ON DELETE behavior

### 2.3 Link to Production Supabase

```bash
# Check current linked project
supabase projects list

# Link to production project (if not already linked)
supabase link --project-ref [project-ref]

# Verify connection
supabase db remote status
```

**Project references:**
- Production: Check `NEXT_PUBLIC_SUPABASE_URL` in `.env` or Vercel dashboard
- The project ref is the subdomain: `https://[project-ref].supabase.co`

### 2.4 Apply Migrations to Production

```bash
# Push all pending migrations to production
supabase db push

# If you need to see what would be applied first (dry run)
supabase db push --dry-run
```

**If migration fails:**

```bash
# Check the error message carefully
# Common issues:

# 1. Column already exists
# Solution: Check if migration was partially applied, may need manual fix

# 2. Foreign key constraint
# Solution: Ensure referenced table/column exists first

# 3. RLS policy conflict
# Solution: Drop existing policy before creating new one

# 4. Permission denied
# Solution: Ensure using service role, not anon key
```

### 2.5 Verify Migration Success

```bash
# Check that tables exist as expected
supabase db remote status

# Or connect directly and verify
psql $DATABASE_URL -c "\dt"

# Check specific table structure
psql $DATABASE_URL -c "\d [table_name]"
```

### 2.6 Deploy Edge Functions

Check for Edge Functions that need deployment:

```bash
# List Edge Functions in the project
ls supabase/functions/

# Check which functions have been modified
git diff main --name-only | grep "supabase/functions"
```

**Deploy Edge Functions:**

```bash
# Deploy a specific function
supabase functions deploy [function-name]

# Deploy all functions
supabase functions deploy

# Deploy with specific environment
supabase functions deploy [function-name] --project-ref [project-ref]
```

### 2.7 Verify Edge Functions

```bash
# List deployed functions
supabase functions list

# Check function logs
supabase functions logs [function-name] --project-ref [project-ref]

# Test function endpoint
curl -X POST https://[project-ref].supabase.co/functions/v1/[function-name] \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"test": true}'
```

### 2.8 Rollback Migrations (if needed)

If a migration causes issues:

```bash
# Create a rollback migration
# Name it with the next timestamp and "rollback" in the name
touch supabase/migrations/$(date +%Y%m%d%H%M%S)_rollback_[description].sql

# Write the reverse operations (DROP what was CREATEd, etc.)
# Then push the rollback
supabase db push
```

**Important:** Always create forward migrations to fix issues rather than editing existing migrations that have been applied.

### 2.9 Seed Data (if needed)

If new seed data needs to be applied:

```bash
# Run seed scripts
npx tsx scripts/seed-[specific-data].ts

# Or run the main seeder
npx tsx scripts/db_seeder.ts
```

## Step 3: Pre-Deployment Checks

After Supabase deployment, verify the codebase is ready:

```bash
# Check for uncommitted changes
git status

# Run linter
npm run lint

# Run type check
npx tsc --noEmit

# Run unit tests
npm test

# Check for any TODO/FIXME that might be blockers
grep -r "TODO\|FIXME" src/ --include="*.ts" --include="*.tsx" | head -20
```

**Stop deployment if:**
- Linter errors exist
- Type errors exist
- Tests fail
- Critical TODO items are unaddressed

## Step 4: Local Build Test

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
| Duplicate declarations | Remove duplicate imports/exports from merged code |
| Database type mismatch | Regenerate types: `supabase gen types typescript` |

## Step 5: Commit and Push

Once the local build succeeds:

```bash
# Stage all changes
git add .

# Commit with descriptive message
git commit -m "deploy: consolidated branches, applied migrations, prepared for release"

# Push to trigger Vercel deployment
git push origin main
```

**Important**: Pushing to `main` triggers automatic Vercel deployment.

## Step 6: Monitor Vercel Deployment

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

## Step 7: Verify Deployment

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
- Database operations work (test CRUD)
- Edge Functions respond correctly

## Step 8: Fix and Redeploy

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
3. Check Supabase logs:
   ```bash
   supabase functions logs --project-ref [project-ref]
   ```
4. Fix the issue in code
5. Redeploy

### Database Issues Post-Deploy

If database-related errors occur:

```bash
# Check Supabase dashboard for errors
# https://supabase.com/dashboard/project/[project-ref]/logs

# Verify RLS policies are correct
psql $DATABASE_URL -c "SELECT * FROM pg_policies WHERE tablename = '[table]';"

# Check for missing columns/tables
psql $DATABASE_URL -c "\d [table_name]"
```

## Environment Variables

CentaurOS requires these environment variables:

### Vercel Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL=https://[project-ref].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=[anon-key]
SUPABASE_SERVICE_ROLE_KEY=[service-role-key]
STRIPE_SECRET_KEY=[stripe-key]
STRIPE_WEBHOOK_SECRET=[webhook-secret]
OPENAI_API_KEY=[openai-key]
```

### Supabase Edge Function Secrets

```bash
# Set secrets for Edge Functions
supabase secrets set OPENAI_API_KEY=[key]
supabase secrets set STRIPE_SECRET_KEY=[key]

# List current secrets
supabase secrets list
```

**To add/update env vars:**
- Vercel: Dashboard → Project → Settings → Environment Variables
- Supabase: `supabase secrets set KEY=value`

## Quick Deploy Commands

```bash
# Full deployment workflow (all steps)
git fetch --all && \
git checkout main && \
git pull && \
supabase db push && \
supabase functions deploy && \
npm run lint && \
npm test && \
npm run build && \
git add . && \
git commit -m "deploy: full stack deployment" && \
git push

# Supabase only (migrations + functions)
supabase db push && supabase functions deploy

# Vercel only (skip Supabase)
npm run lint && npm test && npm run build && git push

# Merge a specific branch and full deploy
git checkout main && \
git pull && \
git merge feature-branch --no-ff && \
supabase db push && \
npm run build && \
git push

# Check if CLIs are available
which vercel || echo "Install with: npm i -g vercel"
which supabase || echo "Install with: brew install supabase/tap/supabase"

# Force redeploy without code changes
vercel --prod

# Deploy to preview (not production)
vercel
```

## Rollback

If a deployment breaks production:

### Vercel Rollback

```bash
# List recent deployments
vercel ls

# Promote a previous deployment to production
vercel promote [deployment-url]

# Or via git
git revert HEAD
git push
```

### Supabase Rollback

```bash
# Create a new migration that reverses the problematic one
# NEVER delete or modify applied migrations

# Example rollback migration
cat > supabase/migrations/$(date +%Y%m%d%H%M%S)_rollback_feature.sql << 'EOF'
-- Rollback: remove feature table
DROP TABLE IF EXISTS feature_table;

-- Restore previous state if needed
-- ALTER TABLE existing_table DROP COLUMN new_column;
EOF

# Apply the rollback
supabase db push
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

## Branch Management Best Practices

### Before Starting Work
```bash
# Always create feature branches from updated main
git checkout main
git pull origin main
git checkout -b feature/new-feature
```

### Regular Sync
```bash
# Keep feature branches up to date with main
git checkout feature/my-branch
git merge main
# Or rebase for cleaner history:
git rebase main
```

### Release Strategy
- **main**: Production-ready code, deploys automatically
- **feature/\***: Feature branches, merge into main when complete
- **fix/\***: Bug fix branches, merge into main when verified
- **hotfix/\***: Urgent production fixes, merge and deploy immediately

## Supabase CLI Reference

```bash
# Login to Supabase
supabase login

# Link to project
supabase link --project-ref [ref]

# Generate TypeScript types from database
supabase gen types typescript --project-id [ref] > src/types/database.ts

# Create a new migration
supabase migration new [migration_name]

# View migration history
supabase migration list

# Reset local database (development only!)
supabase db reset

# View logs
supabase logs --project-ref [ref]
```

## Troubleshooting Reference

See [references/vercel-errors.md](references/vercel-errors.md) for Vercel-specific errors.

### Common Supabase Issues

| Issue | Solution |
|-------|----------|
| "relation does not exist" | Migration not applied; run `supabase db push` |
| "permission denied" | RLS policy blocking; check policies |
| "duplicate key" | Data conflict; check unique constraints |
| "function not found" | Edge Function not deployed; run `supabase functions deploy` |
| "JWT expired" | Token issue; check auth configuration |
| "connection refused" | Wrong project linked; run `supabase link` |

## Post-Deployment Checklist

After successful deployment:

- [ ] Homepage loads correctly
- [ ] Authentication works
- [ ] Database connections work
- [ ] API routes respond
- [ ] Edge Functions respond
- [ ] No console errors
- [ ] Mobile responsive works
- [ ] All merged features function correctly
- [ ] Database migrations applied successfully
- [ ] RLS policies working (test as different users)
- [ ] Merged branches deleted (local and remote)
