# Manual Test Report: My Profile & Home Pages

## Test Date: February 10, 2026
## Tester: AI Code Review
## Status: Code Analysis Complete - Manual Browser Testing Required

---

## Summary

Based on code analysis, the My Profile page implementation appears solid with the following structure:

### ✅ Implemented Features

1. **Profile Hub View** (`profile-hub-view.tsx`)
   - Page header with orange accent bar
   - Hero card with avatar upload
   - Three-tab layout: Overview, Marketplace, Links & Social
   - Two edit dialogs: Basic profile (all users) and Marketplace wizard (providers)

2. **Hero Card** (`hero-card.tsx`)
   - Large avatar with camera hover overlay
   - Click to upload functionality
   - Name, headline, role badge
   - Location, member since, company metadata
   - Social links (LinkedIn, website)
   - Edit button and Public Profile link (for providers)

3. **Overview Tab** (`overview-tab.tsx`)
   - "About You" card with Edit Profile button
   - Email, role, company, phone, LinkedIn display
   - Bio section (or empty state prompt)
   - Activity stats grid: Tasks Assigned, Objectives, Team Size, Completion Rate

4. **Edit Profile Dialog** (`edit-profile-dialog.tsx`)
   - 2-step wizard with visual stepper
   - Step 1: Name & Bio
   - Step 2: Contact & Links (phone, LinkedIn)
   - Validation, character counts, error handling

5. **Links & Social Tab** (`links-tab.tsx`)
   - Edit button for all users
   - Displays LinkedIn, website, phone, location, timezone
   - Empty state with "Add Links" CTA

6. **Home/Person Hub** (`person-hub.tsx`)
   - Welcome message with first name
   - Company tiles grid (or empty state with "Create a Company" button)
   - Quick links: Marketplace, Guild, My Profile

---

## Test Plan

### Test 1: Navigate to My Profile Page

**URL:** `http://localhost:3000/my-profile`

**Expected Results:**
- ✅ Page loads without errors
- ✅ Page header shows "My Profile" with orange accent bar
- ✅ Subtitle: "Manage your presence on the platform"
- ✅ Hero card displays with gradient header band
- ✅ Avatar shows with border and shadow
- ✅ Camera icon appears on avatar hover
- ✅ Name, role badge, and metadata visible
- ✅ Edit button present in hero card
- ✅ Three tabs visible: Overview, Marketplace, Links & Social

**Potential Issues:**
- ⚠️ If avatar_url is null, should show UserAvatar with initials
- ⚠️ If user has no foundry, foundryName will be null (should show gracefully)

**How to Test:**
1. Open browser to `http://localhost:3000/my-profile`
2. Take screenshot
3. Hover over avatar - verify camera icon appears
4. Check that all metadata fields display correctly
5. Verify no console errors

---

### Test 2: Overview Tab Content

**Expected Results:**
- ✅ "About You" card visible with Edit Profile button
- ✅ Email, Role, Company displayed in grid
- ✅ Phone and LinkedIn shown if available
- ✅ Bio section displays (or empty state: "No bio yet — click Edit Profile...")
- ✅ Activity stats grid below: 4 cards (Tasks, Objectives, Team Size, Completion Rate)
- ✅ Stats show real numbers or "—" for empty states

**Potential Issues:**
- ⚠️ If bio is null, should show italic empty state message
- ⚠️ If phone_number is null, row should be hidden
- ⚠️ If linkedin_url is null, row should be hidden
- ⚠️ Stats should handle division by zero (completion rate)

**How to Test:**
1. Verify Overview tab is active by default
2. Check "About You" card content
3. Verify all fields display correctly
4. Check activity stats grid (2 columns on mobile, 4 on desktop)
5. Verify Edit Profile button is clickable

---

### Test 3: Marketplace Tab

**Expected Results:**

**For Providers (has provider_profiles record):**
- ✅ Shows MarketplaceTab component with profile data
- ✅ Edit button opens marketplace wizard

**For Apprentices without provider profile:**
- ✅ Shows "Get discovered in the Marketplace" CTA card
- ✅ Card has dashed border
- ✅ Store icon in muted circle
- ✅ Heading: "Get discovered in the Marketplace"
- ✅ Description about setting up profile
- ✅ "Set Up Marketplace Profile" button (orange)

**For Founders/Executives (not Apprentice):**
- ✅ Marketplace tab should NOT be visible

**How to Test:**
1. Click Marketplace tab
2. Verify correct content based on user role and provider status
3. If CTA card shown, verify styling (dashed border, centered content)
4. Click "Set Up Marketplace Profile" button - should open wizard

---

### Test 4: Links & Social Tab

**Expected Results:**
- ✅ "Links & Contact" card with Edit button
- ✅ Edit button visible for ALL users (not just providers)
- ✅ If data exists: Shows LinkedIn, website, phone, location, timezone
- ✅ LinkedIn and website have external link icons
- ✅ If no data: Empty state with Globe icon and "Add Links" button

**Potential Issues:**
- ⚠️ Non-providers won't have website, location, timezone (only LinkedIn, phone)
- ⚠️ Edit button should open EditProfileDialog for non-providers
- ⚠️ Edit button should open MarketplaceEditWizard for providers

**How to Test:**
1. Click "Links & Social" tab
2. Verify Edit button is present
3. Check which fields are displayed
4. If empty, verify empty state message and "Add Links" button
5. Click Edit button - verify correct dialog opens

---

### Test 5: Edit Profile Dialog (2-Step Wizard)

**Trigger:** Click "Edit" button from hero card or Overview tab

**Expected Results:**

**Step 1: Name & Bio**
- ✅ Dialog opens with title "Edit Profile"
- ✅ Visual stepper shows 2 steps with icons
- ✅ Step 1 active (orange circle with User icon)
- ✅ Heading: "What's your name?"
- ✅ Description: "This is how you'll appear across the platform..."
- ✅ Full Name input (required, marked with *)
- ✅ Bio textarea (optional, 2000 char limit)
- ✅ Character counter: "X / 2000 characters"
- ✅ Footer: Cancel button (left), Next button (right)

**Step 2: Contact & Links**
- ✅ Step 2 active (orange circle with LinkedIn icon)
- ✅ Connector line between steps is orange (completed)
- ✅ Heading: "How can people reach you?"
- ✅ Description: "Add your contact details... All fields are optional."
- ✅ Phone Number input (optional)
- ✅ LinkedIn URL input (optional)
- ✅ Helper text: "Adding your LinkedIn helps others verify your background"
- ✅ Footer: Back button (left), Save Profile button (right, orange)

**Validation:**
- ✅ Step 1: Full name required
- ✅ Step 1: Bio max 2000 characters
- ✅ Step 2: LinkedIn must start with "https://"
- ✅ Error alert appears above form if validation fails

**How to Test:**
1. Click Edit button from hero card
2. Verify Step 1 UI matches expectations
3. Try clicking Next without name - should show error
4. Enter name and bio, click Next
5. Verify Step 2 UI matches expectations
6. Verify Back button returns to Step 1
7. Enter phone and LinkedIn
8. Click Save Profile
9. Verify dialog closes and page refreshes with new data

---

### Test 6: Avatar Upload

**Expected Results:**
- ✅ Avatar has hover overlay with camera icon
- ✅ Click avatar opens file picker
- ✅ Accepts: JPEG, PNG, GIF, WebP
- ✅ Max size: 5MB
- ✅ Shows loading spinner during upload
- ✅ Success toast: "Avatar updated"
- ✅ Page refreshes with new avatar
- ✅ Error toast if file too large or wrong type

**How to Test:**
1. Hover over avatar - verify camera icon appears
2. Click avatar - file picker should open
3. Select a valid image (< 5MB, JPEG/PNG)
4. Verify loading spinner appears
5. Verify success toast and page refresh
6. Try uploading 6MB file - should show error
7. Try uploading PDF - should show error

---

### Test 7: Home Page (Person Hub)

**URL:** `http://localhost:3000/home`

**Expected Results:**

**Header:**
- ✅ Orange accent bar
- ✅ Heading: "Welcome back, [FirstName]"
- ✅ Subtitle: "Your personal hub — switch between companies..."
- ✅ Stats: "X companies" and "Y total team members"

**Company Tiles (if user has foundries):**
- ✅ Section heading: "Your Companies"
- ✅ Grid: 1 column (mobile), 2 (tablet), 3 (desktop)
- ✅ Each tile shows:
  - Company monogram (initials)
  - Company name
  - "Active" badge if current foundry
  - Role badge (orange hierarchy: Founder > Executive > Apprentice)
  - Member count
  - Chevron right icon
- ✅ Active company has orange ring
- ✅ Hover: shadow increases, slight lift
- ✅ Click: switches foundry and navigates to /dashboard

**Empty State (if no foundries):**
- ✅ Dashed border card
- ✅ Building icon in muted circle
- ✅ Heading: "No companies yet"
- ✅ Description: "You're not part of any company yet..."
- ✅ "Create a Company" button (orange)
- ✅ Button links to /join/founder

**Quick Links:**
- ✅ Section heading: "Quick Links"
- ✅ Three cards: Marketplace, Guild, My Profile
- ✅ Each card has icon, title, description
- ✅ Hover: shadow and lift effect
- ✅ Click: navigates to respective page

**How to Test:**
1. Navigate to `http://localhost:3000/home`
2. Verify header with first name
3. Check company tiles (or empty state)
4. Click a company tile - should switch and go to dashboard
5. Verify quick links section
6. Click each quick link - should navigate correctly

---

## Critical Checks

### ❌ Items That Were REMOVED (should NOT be present):

1. **Personal Details Card** - REMOVED from Overview tab
2. **Quick Links Card** - REMOVED from Overview tab (was redundant)
3. **Raw Company ID field** - REMOVED (was exposing internal UUID)
4. **profile-card.tsx** - DELETED (old settings page component)

### ✅ Items That Should BE PRESENT:

1. **About You card** - Shows email, role, company, phone, LinkedIn, bio
2. **Activity Stats grid** - Shows tasks, objectives, team size, completion rate
3. **Edit button on Links & Social tab** - For ALL users (not just providers)
4. **2-step Edit Profile wizard** - Name/Bio, then Contact/Links
5. **Visual stepper** - Orange circles with icons, connecting lines

---

## Potential Issues to Watch For

### 1. **Avatar Upload Issues**
- **Risk:** File upload might fail if storage bucket not configured
- **Check:** Verify `supabase/migrations/20260210100000_avatar_storage_bucket.sql` was applied
- **Test:** Try uploading an avatar

### 2. **Empty States**
- **Risk:** Null values might cause layout breaks
- **Check:** Test with user who has minimal profile data
- **Test:** User with no bio, no phone, no LinkedIn

### 3. **Role-Based Visibility**
- **Risk:** Marketplace tab visibility logic
- **Check:** Verify Founders/Executives don't see Marketplace tab
- **Check:** Verify Apprentices see Marketplace tab (even without provider profile)

### 4. **Edit Button Routing**
- **Risk:** Links & Social Edit button might open wrong dialog
- **Check:** Non-providers should open EditProfileDialog
- **Check:** Providers should open MarketplaceEditWizard

### 5. **Stats Calculation**
- **Risk:** Division by zero in completion rate
- **Check:** User with 0 total tasks should show "—" not "NaN%"

### 6. **Responsive Layout**
- **Risk:** Stats grid might not stack correctly on mobile
- **Check:** Test on mobile viewport (< 768px)
- **Check:** Hero card should stack vertically on mobile

---

## Browser Testing Checklist

### Desktop (1920x1080)
- [ ] Navigate to /my-profile
- [ ] Verify page header and hero card
- [ ] Check all three tabs
- [ ] Open Edit Profile dialog
- [ ] Complete 2-step wizard
- [ ] Upload avatar
- [ ] Navigate to /home
- [ ] Click company tile
- [ ] Click quick links

### Tablet (768x1024)
- [ ] Verify responsive layout
- [ ] Check grid columns adjust
- [ ] Verify hero card layout
- [ ] Test navigation

### Mobile (375x667)
- [ ] Verify single column layout
- [ ] Check hero card stacks vertically
- [ ] Verify tabs work
- [ ] Test dialog on small screen

### Accessibility
- [ ] Keyboard navigation works
- [ ] Focus visible on all interactive elements
- [ ] Screen reader labels present
- [ ] Color contrast meets WCAG AA
- [ ] Avatar upload has aria-label

---

## Console Errors to Watch For

1. **Hydration errors** - React mismatch between server/client
2. **Missing data errors** - Null reference exceptions
3. **Type errors** - TypeScript issues in browser
4. **Network errors** - Failed API calls
5. **Image load errors** - Avatar URL 404s

---

## Next Steps

1. **Run the app:** `npm run dev`
2. **Open browser:** Navigate to `http://localhost:3000/my-profile`
3. **Follow test plan** section by section
4. **Document any issues** found during manual testing
5. **Take screenshots** of each page state
6. **Test with different user roles** (Founder, Executive, Apprentice)
7. **Test with minimal data** (new user with empty profile)
8. **Test with full data** (provider with complete profile)

---

## Code Quality Assessment

### ✅ Strengths

1. **Consistent component structure** - All components follow standards
2. **Proper TypeScript types** - Full type safety
3. **Accessibility** - aria-labels, keyboard support
4. **Error handling** - Validation and error states
5. **Responsive design** - Mobile-first approach
6. **Semantic tokens** - Uses design system colors
7. **Documentation** - JSDoc comments on all components

### ⚠️ Areas to Monitor

1. **Avatar storage** - Depends on migration being applied
2. **Empty states** - Need to verify with minimal data
3. **Role-based logic** - Complex conditional rendering
4. **Stats calculation** - Division by zero handling

---

## Conclusion

The code implementation appears solid and follows all design standards. The main risk areas are:

1. **Database migration** - Avatar storage bucket must be configured
2. **Empty state handling** - Need to test with minimal profile data
3. **Role-based visibility** - Complex logic needs verification

**Recommendation:** Proceed with manual browser testing following the test plan above.
