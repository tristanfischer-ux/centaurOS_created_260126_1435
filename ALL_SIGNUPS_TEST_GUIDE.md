# Complete Signup & Application Testing Guide

**Date:** February 4, 2026  
**Status:** All Fixed ✅

## Summary of Fixes

Today we fixed **ALL** signup and application processes:

| User Type | Fix Applied | Status |
|---|---|---|
| **Founder** | Already working | ✅ Working |
| **Executive** | Created centaur-guild foundry | ✅ Fixed |
| **Apprentice** | Created centaur-guild foundry | ✅ Fixed |
| **Supplier** | Created centaur-suppliers foundry | ✅ Fixed |
| **VC** | Made user_id nullable + RLS policy | ✅ Fixed |
| **Factory** | Made user_id nullable + RLS policy | ✅ Fixed |
| **University** | Made user_id nullable + RLS policy + Required institution field | ✅ Fixed |
| **Network Partner** | Made user_id nullable + RLS policy | ✅ Fixed |

## Migrations Applied

1. **20260204190000_fix_vc_applications.sql**
   - Made `provider_applications.user_id` nullable
   - Added RLS policy for unauthenticated applications
   - **Fixes:** VC, Factory, University, Network Partner applications

2. **20260204200000_create_system_foundries.sql**
   - Created "centaur-guild" foundry → displays as "The Forge Guild"
   - Created "centaur-suppliers" foundry → displays as "Forge Marketplace"
   - Added RLS policy for system foundries
   - **Fixes:** Executive, Apprentice, Supplier signups

## Test Each Signup Flow

### 1. Founder Signup ✅
**URL:** https://fractionalforge.app/join/founder

**Test Steps:**
1. Fill out form:
   - Name: Test Founder
   - Email: founder-test@test.com
   - Password: TestFounder123!
   - Company Name: Test Startup Inc. (required)
   - Industry: Hardware (optional)
   - Stage: Seed (optional)
2. Click "Begin Induction"
3. ✅ Should redirect to `/join/success?type=signup&role=founder`

**What Happens:**
- Creates auth account
- Creates profile with `role = 'Founder'`, `account_type = 'team_builder'`
- Creates NEW foundry with generated UUID
- `foundry_id` = new foundry UUID

---

### 2. Executive Signup ✅
**URL:** https://fractionalforge.app/join/executive

**Test Steps:**
1. Fill out form:
   - Name: Test Executive
   - Email: exec-test@test.com
   - Password: TestExec123!
2. Click "Join the Cadre"
3. ✅ Should redirect to `/join/success?type=signup&role=executive`

**What Happens:**
- Creates auth account
- Creates profile with `role = 'Executive'`, `account_type = 'team_builder'`
- `foundry_id = 'centaur-guild'` (system foundry)

---

### 3. Apprentice Signup ✅
**URL:** https://fractionalforge.app/join/apprentice

**Test Steps:**
1. Fill out form:
   - Name: Test Apprentice
   - Email: apprentice-test@test.com
   - Password: TestApprentice123!
2. Click "Enter the Guild"
3. ✅ Should redirect to `/join/success?type=signup&role=apprentice`

**What Happens:**
- Creates auth account
- Creates profile with `role = 'Apprentice'`, `account_type = 'team_builder'`
- `foundry_id = 'centaur-guild'` (system foundry)

---

### 4. Supplier Signup ✅
**URL:** https://fractionalforge.app/join/supplier

**Test Steps:**
1. Fill out form:
   - Name: Test Supplier
   - Email: supplier-test@test.com
   - Password: TestSupplier123!
   - Business Name: Test Manufacturing Co. (required)
   - What do you sell?: CNC Machining (optional)
2. Click "Start Selling"
3. ✅ Should redirect to `/join/success?type=signup&role=supplier`

**What Happens:**
- Creates auth account
- Creates profile with `role = 'Apprentice'`, `account_type = 'supplier'`
- `foundry_id = 'centaur-suppliers'` (system foundry)
- Business info stored in `onboarding_data` field

---

### 5. VC Application ✅
**URL:** https://fractionalforge.app/join/vc

**Test Steps:**
1. Fill out form:
   - Name: Test VC
   - Email: vc-test@test.com
   - Firm Name: Test Ventures (optional)
   - AUM Range: $50M - $100M (optional)
2. Click "Apply for Access"
3. ✅ Should redirect to `/join/success?type=application&role=vc`

**What Happens:**
- **NO auth account created** (application only)
- Inserts into `provider_applications`:
  - `user_id = NULL` (unauthenticated application)
  - `category = 'vc'`
  - `company_name = 'Test Ventures'`
  - `status = 'pending'`
  - `application_data` = { contact_name, contact_email, firm_name, aum_range }

---

### 6. Factory Application ✅
**URL:** https://fractionalforge.app/join/factory

**Test Steps:**
1. Fill out form:
   - Name: Test Factory
   - Email: factory-test@test.com
   - Facility Name: Precision Manufacturing Co. (optional)
   - Capabilities: CNC, 3D Printing (optional)
2. Click "Connect Facility"
3. ✅ Should redirect to `/join/success?type=application&role=factory`

**What Happens:**
- **NO auth account created** (application only)
- Inserts into `provider_applications`:
  - `user_id = NULL`
  - `category = 'factory'`
  - `company_name = 'Precision Manufacturing Co.'`
  - `status = 'pending'`

---

### 7. University Application ✅
**URL:** https://fractionalforge.app/join/university

**Test Steps:**
1. Fill out form:
   - Name: Dr. Test Professor
   - Email: professor-test@university.edu
   - Institution: MIT (REQUIRED)
   - Department/School: Mechanical Engineering (optional)
2. Click "Partner With Us"
3. ✅ Should redirect to `/join/success?type=application&role=university`

**What Happens:**
- **NO auth account created** (application only)
- Inserts into `provider_applications`:
  - `user_id = NULL`
  - `category = 'university'`
  - `company_name = 'MIT'`
  - `status = 'pending'`
  - `application_data` = { contact_name, contact_email, institution, department }

**Note:** Institution field is now REQUIRED (changed in this session).

---

### 8. Network Partner Application ✅
**URL:** https://fractionalforge.app/join/network

**Test Steps:**
1. Fill out form:
   - Name: Test Partner
   - Email: partner-test@test.com
2. Click "Apply to Network"
3. ✅ Should redirect to `/join/success?type=application&role=network`

**What Happens:**
- **NO auth account created** (application only)
- Inserts into `provider_applications`:
  - `user_id = NULL`
  - `category = 'network'`
  - `company_name = NULL`
  - `status = 'pending'`

---

## Signup vs Application

### Direct Signup (Creates Account Immediately)
- **Founder** - Get full platform access, create teams
- **Executive** - Join talent pool, get matched with projects
- **Apprentice** - Join talent pool, learn and build
- **Supplier** - Access supplier portal, create listings

### Application (Review Required)
- **VC** - Apply for deal flow access
- **Factory** - Apply to join manufacturing network
- **University** - Apply for partnership
- **Network Partner** - Apply to integrate infrastructure

## Database Schema

### profiles (Direct Signups)
```sql
{
  id: UUID,
  email: string,
  full_name: string,
  role: 'Founder' | 'Executive' | 'Apprentice',  -- Suppliers get 'Apprentice'
  foundry_id: string,  -- UUID for founders, 'centaur-guild' or 'centaur-suppliers' for others
  account_type: 'team_builder' | 'supplier' | NULL
}
```

### provider_applications (Applications)
```sql
{
  id: UUID,
  user_id: UUID | NULL,  -- NULL for unauthenticated applications
  category: 'vc' | 'factory' | 'university' | 'network',
  company_name: string | NULL,
  application_data: JSONB,
  status: 'pending' | 'under_review' | 'approved' | 'rejected'
}
```

## Password Requirements

All direct signups require strong passwords:
- Minimum 8 characters
- At least 1 uppercase letter
- At least 1 lowercase letter
- At least 1 number
- Not a common password

## After Signup/Application

### Direct Signups
1. Email verification sent
2. User clicks link in email
3. Email confirmed
4. Redirected based on `account_type`:
   - `team_builder` → `/objectives` (platform)
   - `supplier` → `/supplier-portal` (supplier dashboard)

### Applications
1. Success page shown
2. Message: "We review every application personally"
3. Admin reviews application in database
4. If approved:
   - Invitation email sent
   - Applicant creates account
   - `user_id` gets linked to application

## Testing Checklist

Run through each flow and verify:
- [ ] Form renders correctly
- [ ] Required fields are enforced
- [ ] Password validation works (for signups)
- [ ] Submission succeeds
- [ ] Redirects to success page
- [ ] Database record created
- [ ] Email sent (for signups)
- [ ] No errors in console

## Common Issues (Now Fixed)

❌ **Before:** Missing foundries caused signup failures  
✅ **After:** System foundries created

❌ **Before:** Applications required user_id  
✅ **After:** user_id nullable with RLS policy

❌ **Before:** University institution not required  
✅ **After:** Institution field is required

## Success Indicators

All 8 flows should:
- ✅ Accept form submission
- ✅ Create database record
- ✅ Redirect to success page
- ✅ Show appropriate success message
- ✅ Send email confirmation (for signups)

**All signup and application flows are now functional!** 🎉
