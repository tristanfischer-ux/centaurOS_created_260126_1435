# QA Testing System - Setup Instructions

The automated QA testing system has been successfully installed. Follow these steps to complete the configuration.

## ✅ Completed

- [x] Database migration applied (`qa_test_runs` table created)
- [x] E2E tests created for Executive, Founder, Apprentice personas
- [x] GitHub Actions workflow created (`.github/workflows/qa-day-in-life.yml`)
- [x] API endpoints created (`/api/admin/qa-tests`)
- [x] Admin UI page created (`/admin/qa`)

## 📋 Required Configuration

### 1. GitHub Repository Secrets

Add these secrets in GitHub Settings > Secrets and variables > Actions:

```
TEST_EXECUTIVE_EMAIL=exec-test@your-foundry.com
TEST_EXECUTIVE_PASSWORD=your-secure-password

TEST_FOUNDER_EMAIL=founder-test@your-foundry.com  
TEST_FOUNDER_PASSWORD=your-secure-password

TEST_APPRENTICE_EMAIL=apprentice-test@your-foundry.com
TEST_APPRENTICE_PASSWORD=your-secure-password

GITHUB_TOKEN=ghp_your_personal_access_token
GITHUB_REPO=your-org/centauros

STAGING_URL=https://staging.fractionalforge.app
PRODUCTION_URL=https://fractionalforge.app
```

#### GitHub Token Setup

The `GITHUB_TOKEN` needs these permissions:
1. Go to GitHub Settings > Developer settings > Personal access tokens > Tokens (classic)
2. Generate new token with:
   - `repo` (Full control of private repositories)
   - `workflow` (Update GitHub Action workflows)
3. Copy the token and add it as `GITHUB_TOKEN` secret

### 2. Environment Variables

Add to your `.env.local` (for local development) and Vercel environment variables:

```bash
# GitHub Integration
GITHUB_TOKEN=ghp_your_personal_access_token
GITHUB_REPO=your-org/centauros

# Test account credentials (for local testing)
TEST_EXECUTIVE_EMAIL=exec-test@your-foundry.com
TEST_EXECUTIVE_PASSWORD=your-secure-password
TEST_FOUNDER_EMAIL=founder-test@your-foundry.com
TEST_FOUNDER_PASSWORD=your-secure-password
TEST_APPRENTICE_EMAIL=apprentice-test@your-foundry.com
TEST_APPRENTICE_PASSWORD=your-secure-password
```

### 3. Create Test Accounts

You need to create three test accounts in your Supabase database:

#### Executive Test Account
```sql
-- Sign up via the app UI first, then update role
UPDATE profiles 
SET role = 'Executive' 
WHERE email = 'exec-test@your-foundry.com';
```

#### Founder Test Account
```sql
UPDATE profiles 
SET role = 'Founder' 
WHERE email = 'founder-test@your-foundry.com';
```

#### Apprentice Test Account (Optional - for apprenticeship testing)
```sql
UPDATE profiles 
SET role = 'Apprentice' 
WHERE email = 'apprentice-test@your-foundry.com';

-- Optionally enroll in apprenticeship
INSERT INTO apprenticeship_enrollments (
  apprentice_id,
  programme_id,
  senior_mentor_id,
  status
) VALUES (
  (SELECT id FROM profiles WHERE email = 'apprentice-test@your-foundry.com'),
  (SELECT id FROM apprenticeship_programmes LIMIT 1),
  (SELECT id FROM profiles WHERE email = 'founder-test@your-foundry.com'),
  'active'
);
```

**Important:** All three accounts should be in the same foundry for proper testing.

### 4. Seed Test Data (Optional but Recommended)

For better test coverage, add some test data:

```sql
-- Create a test task (assigned to Executive)
INSERT INTO tasks (
  title,
  creator_id,
  foundry_id,
  status
) VALUES (
  'Test Task for QA',
  (SELECT id FROM profiles WHERE email = 'exec-test@your-foundry.com'),
  (SELECT foundry_id FROM profiles WHERE email = 'exec-test@your-foundry.com' LIMIT 1),
  'Not_Started'
);

-- Create a test conversation
INSERT INTO conversations (
  conversation_type,
  is_group,
  creator_id,
  foundry_id
) VALUES (
  'direct',
  false,
  (SELECT id FROM profiles WHERE email = 'founder-test@your-foundry.com'),
  (SELECT foundry_id FROM profiles WHERE email = 'founder-test@your-foundry.com' LIMIT 1)
);
```

## 🚀 How to Use

### Via Admin Panel (Recommended)

1. Log in to CentaurOS as an Executive or Founder
2. Go to **Admin Panel** > **QA Testing**
3. Select environment (Staging or Production)
4. Click **"Run Tests"**
5. Monitor progress in the test history

### Via GitHub Actions UI

1. Go to your GitHub repository > Actions
2. Select "QA - Day in the Life Tests" workflow
3. Click "Run workflow"
4. Select environment (staging/production)
5. Click "Run workflow"

### Via API

```bash
curl -X POST https://fractionalforge.app/api/admin/qa-tests \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_SESSION_TOKEN" \
  -d '{"environment": "staging"}'
```

## 📊 What Gets Tested

### Executive Persona (7+ tests)
- ✅ Login and dashboard load
- ✅ Sidebar navigation (14+ pages)
- ✅ Messaging (view & send)
- ✅ Task creation
- ✅ Admin panel access
- ✅ Team management access
- ✅ Pending approvals visibility

### Founder Persona (5+ tests)
- ✅ All Executive tests
- ✅ Full admin access (all sub-pages)
- ✅ Foundry settings access
- ✅ Role management capabilities

### Apprentice Persona (8+ tests)
- ✅ Login and dashboard (limited view)
- ✅ Sidebar navigation
- ✅ Messaging
- ✅ Task creation (own tasks)
- ✅ Guild/apprenticeship pages
- ✅ OTJT logging UI
- ✅ No admin access (negative test)
- ✅ No approval access (negative test)

## 📝 Test Results

Results are stored in the `qa_test_runs` table and displayed in the admin UI:

- **Status**: pending → running → passed/failed
- **Per-persona results**: Executive, Founder, Apprentice (passed/failed/skipped)
- **Duration**: How long tests took
- **Artifacts**: Link to Playwright HTML report in GitHub Actions
- **Error messages**: If tests failed

## 🔧 Troubleshooting

### Tests immediately fail with "Failed to trigger GitHub workflow"

**Cause:** `GITHUB_TOKEN` not configured or insufficient permissions

**Solution:** 
1. Verify `GITHUB_TOKEN` is set in environment variables
2. Verify token has `repo` and `workflow` scopes
3. Verify `GITHUB_REPO` matches your repository (e.g., `your-org/centauros`)

### Tests fail during login

**Cause:** Test account credentials incorrect or accounts don't exist

**Solution:**
1. Verify test accounts exist in Supabase
2. Verify credentials match in GitHub Secrets
3. Try logging in manually with those credentials
4. Check email verification status

### Tests timeout or hang

**Cause:** Test environment is slow or unresponsive

**Solution:**
1. Check if staging/production URL is accessible
2. Verify environment is not under heavy load
3. Check Playwright timeout settings in `playwright.config.ts`

### "Permission denied" errors in tests

**Cause:** RLS policies blocking test accounts

**Solution:**
1. Verify test accounts are in the same foundry
2. Check that Executive/Founder have proper roles
3. Verify foundry_id is set correctly on test accounts

## 📖 Related Documentation

- [Manual QA Checklist](tasks/qa-day-in-the-life.md) - Manual testing script
- [Playwright Config](playwright.config.ts) - Test configuration
- [GitHub Workflow](.github/workflows/qa-day-in-life.yml) - CI workflow

## 🎯 Next Steps

### Required User Actions (Cannot be automated):

1. **Configure GitHub Secrets** - Go to GitHub repo Settings > Secrets and variables > Actions:
   - `TEST_EXECUTIVE_EMAIL` / `TEST_EXECUTIVE_PASSWORD`
   - `TEST_FOUNDER_EMAIL` / `TEST_FOUNDER_PASSWORD`
   - `TEST_APPRENTICE_EMAIL` / `TEST_APPRENTICE_PASSWORD`
   - `GITHUB_TOKEN` (with `repo` and `workflow` scopes)
   - `GITHUB_REPO` (e.g., `tristanfischer-ux/centaurOS_created_260126_1435`)

2. **Create test accounts** in Supabase (see SQL above)

3. **Seed test data** (optional but recommended)

4. **Run first test** via admin panel (`/admin/qa`)

### Already Complete:

- ✅ GitHub Actions workflow created
- ✅ E2E test files for all 3 personas
- ✅ Admin UI page at `/admin/qa`
- ✅ Weekly scheduled runs configured (Mondays 6am UTC)

---

**Questions?** Check the test logs in GitHub Actions or review the manual checklist at `tasks/qa-day-in-the-life.md`.
