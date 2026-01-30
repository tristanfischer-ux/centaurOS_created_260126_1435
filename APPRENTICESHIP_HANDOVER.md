# Apprenticeship Management System - Handover Document

**Date:** January 30, 2026  
**Status:** Phase 1 Complete - Ready for Testing & Phase 2

---

## 1. PROJECT CONTEXT

### Background
CentaurOS is building a **complete in-house apprenticeship management system** that matches and exceeds platforms like Multiverse, QA Apprenticeships, and ApprentiScope. 

**Critical User Requirement:** The user explicitly stated:
> "We can't outsource this. This has to be critical to what we do. We need to see what they do and do everything they do as a minimum and then be better."

This means NO linking to external platforms for talent management - everything must be built in-house.

### UK Apprenticeship Requirements (2026)
- **OTJT (Off-the-Job Training):** 20% of working hours (typically 6 hours/week for 30-hour week)
- **Legal Documents Required:** Apprenticeship Agreement, Commitment Statement, Training Plan
- **Progress Reviews:** Weekly (first month), monthly, quarterly, gateway (pre-EPA), EPA
- **Levels:** L3 (Advanced), L4 (Higher), L5 (Foundation Degree), L6 (Degree), L7 (Masters)

---

## 2. WHAT WAS IMPLEMENTED (Phase 1)

### A. Database Schema
**Migration file:** `supabase/migrations/20260130400000_apprenticeship_management.sql`

| Table | Purpose |
|-------|---------|
| `apprenticeship_programmes` | UK standards (L3-L7), duration, OTJT requirements, skills framework |
| `apprenticeship_enrollments` | Links apprentice to programme, tracks dates, mentors, documents, OTJT total |
| `learning_modules` | Content units: core, functional, ai_readiness, assessment, project |
| `module_completions` | Per-apprentice progress through modules |
| `otjt_time_logs` | Granular hours with approval workflow (pending/approved/rejected/queried) |
| `progress_reviews` | Structured check-ins with signatures |
| `apprenticeship_skills` | 5-level proficiency framework |
| `apprentice_skill_assessments` | Individual skill tracking |
| `apprenticeship_documents` | Legal docs with multi-party signatures |

**Seed Data Included:**
- 11 UK programmes (Software Developer L4, Data Analyst L4, AI Specialist L7, etc.)
- 16 skills (technical, professional, AI, functional categories)
- Sample learning modules for Software Developer programme

**Helper Functions:**
- `calculate_otjt_progress(enrollment_id)` - Returns % complete
- `is_otjt_on_track(enrollment_id)` - Returns boolean
- `get_weekly_otjt_target(enrollment_id)` - Returns hours (typically 6)
- Trigger: Auto-updates `otjt_hours_logged` when logs approved

**RLS Policies:** Complete for all tables - apprentices see own data, mentors see mentees.

### B. Server Actions

**File: `src/actions/apprenticeship-enrollment.ts`**
- `createEnrollment(input)` - Creates enrollment, initializes modules, schedules reviews
- `getEnrollmentForUser()` - Get current user's active enrollment
- `getFoundryEnrollments(foundryId)` - All enrollments for a company
- `getMenteeEnrollments()` - Enrollments where user is mentor
- `updateEnrollmentStatus(id, status)` - Change enrollment status
- `assignMentors(id, seniorMentorId?, workplaceBuddyId?)` - Assign mentors
- `getApprenticeProgrammes()` - List all programmes
- `getProgrammeWithModules(programmeId)` - Programme with learning modules

**File: `src/actions/otjt-tracking.ts`**
- `logOTJTTime(input)` - Log hours (validates < 8hrs/day, not future)
- `approveOTJTLog(logId)` - Mentor approves
- `rejectOTJTLog(logId, reason)` - Mentor rejects with reason
- `queryOTJTLog(logId, message)` - Mentor asks for clarification
- `bulkApproveOTJTLogs(logIds)` - Batch approval
- `getOTJTLogs(enrollmentId, options)` - Query logs with filters
- `getWeeklyOTJTSummary(enrollmentId, weekStart?)` - Weekly breakdown
- `getOTJTProgressSummary(enrollmentId)` - Overall progress stats
- `getPendingOTJTApprovals()` - For mentors
- `ACTIVITY_TYPE_LABELS` - Exported constant with activity descriptions

**File: `src/actions/apprenticeship-progress.ts`**
- `createProgressReview(input)` - Create/complete review
- `completeProgressReview(reviewId, input)` - Complete scheduled review
- `signProgressReview(reviewId)` - Apprentice or mentor signs
- `getProgressReviews(enrollmentId, options)` - Query reviews
- `getUpcomingReviews(enrollmentId)` - Next scheduled reviews
- `assessSkill(input)` - Update skill level
- `bulkAssessSkills(enrollmentId, assessments)` - Batch assessment
- `getSkillAssessments(enrollmentId)` - All assessments
- `getSkillsGapAnalysis(enrollmentId)` - Gaps vs programme requirements
- `startModule(completionId)` - Start a learning module
- `completeModule(completionId, enrollmentId, options)` - Complete + auto-log OTJT
- `getModuleProgress(enrollmentId)` - Module summary
- `generateComplianceReport(foundryId, startDate?, endDate?)` - Regulator reports

**File: `src/actions/onboarding.ts` (UPDATED)**
- `createApprenticeTrainingTasks(isFormalApprentice)` - Enhanced to detect existing enrollment

### C. UI Components

**Page:** `src/app/(platform)/apprenticeship/page.tsx`
- Routes to ApprenticeDashboard, MentorDashboard, or NoEnrollmentState based on user role

**Components in `src/components/apprenticeship/`:**

| Component | File | Purpose |
|-----------|------|---------|
| `ApprenticeDashboard` | `apprentice-dashboard.tsx` | Full dashboard with OTJT, modules, skills, mentors |
| `MentorDashboard` | `mentor-dashboard.tsx` | View mentees, pending approvals, at-risk alerts |
| `OTJTLoggerDialog` | `otjt-logger-dialog.tsx` | Modal to log OTJT hours |
| `ModuleProgressList` | `module-progress-list.tsx` | Start/complete learning modules |
| `SkillsGapChart` | `skills-gap-chart.tsx` | Visual bar chart of skill gaps |
| `NoEnrollmentState` | `no-enrollment-state.tsx` | Empty state for non-enrolled users |
| `index.ts` | Barrel exports |

**Loading state:** `src/app/(platform)/apprenticeship/loading.tsx`

### D. Navigation
**File:** `src/components/Sidebar.tsx`
- Added `GraduationCap` import
- Added "Apprenticeship" link to `communityNavigation` array

---

## 3. WHAT STILL NEEDS TO BE DONE (Phase 2+)

### Immediate (Phase 2)
1. **Apply Migration** - Run `supabase db push` or `supabase migration up`
2. **OTJT Approval Interface for Mentors** - UI to review/approve pending logs
3. **Document Signing UI** - View and sign legal documents
4. **Learning Module Viewer** - Full content display (video, interactive, etc.)
5. **Enrollment Creation UI** - Admin interface to enroll new apprentices

### Future Phases
6. **Skills Assessment UI** - Mentors assess apprentice skills
7. **Progress Review Form** - Complete scheduled reviews
8. **Compliance Dashboard** - Admin view of all apprentice compliance
9. **EPA (End Point Assessment) Tracking** - Gateway readiness, EPA submission
10. **Integration with existing Onboarding Modal** - Auto-enroll apprentices
11. **Notifications** - OTJT reminders, review reminders, at-risk alerts
12. **Mobile-responsive OTJT logging** - Quick log from phone
13. **Evidence Portfolio** - Upload work samples for assessment
14. **AI Integration** - CentaurOS-specific "AI Readiness" module content

---

## 4. KEY FILES REFERENCE

```
supabase/migrations/
└── 20260130400000_apprenticeship_management.sql  # Database schema

src/actions/
├── apprenticeship-enrollment.ts   # Enrollment CRUD
├── apprenticeship-progress.ts     # Reviews, skills, modules
├── otjt-tracking.ts               # OTJT logging & approval
└── onboarding.ts                  # Updated for apprentices

src/app/(platform)/apprenticeship/
├── page.tsx                       # Main routing page
└── loading.tsx                    # Skeleton loading state

src/components/apprenticeship/
├── apprentice-dashboard.tsx       # Main apprentice view
├── mentor-dashboard.tsx           # Mentor view
├── otjt-logger-dialog.tsx         # Log hours modal
├── module-progress-list.tsx       # Module cards
├── skills-gap-chart.tsx           # Skill visualization
├── no-enrollment-state.tsx        # Empty states
└── index.ts                       # Exports

src/components/Sidebar.tsx         # Navigation (updated)
```

---

## 5. DATA FLOW

### Apprentice Enrollment Flow
```
1. Admin creates enrollment via createEnrollment()
   └── Creates enrollment record
   └── Initializes module_completions for all programme modules
   └── Creates draft legal documents
   └── Creates "Week 1: Induction" objective with tasks
   └── Schedules standard progress reviews

2. Apprentice signs documents
   └── Updates apprenticeship_documents.signatures
   └── Updates enrollment.agreement_signed_at etc.

3. Apprentice completes modules
   └── startModule() -> status='in_progress'
   └── completeModule() -> status='completed', auto-logs OTJT
   └── Unlocks dependent modules

4. Apprentice logs OTJT hours
   └── logOTJTTime() -> status='pending'
   └── Mentor approves -> status='approved'
   └── Trigger updates enrollment.otjt_hours_logged
```

### Key Relationships
- `profiles.id` -> `apprenticeship_enrollments.apprentice_id`
- `apprenticeship_enrollments.id` -> `module_completions.enrollment_id`
- `apprenticeship_enrollments.id` -> `otjt_time_logs.enrollment_id`
- `apprenticeship_enrollments.id` -> `progress_reviews.enrollment_id`
- `apprenticeship_programmes.id` -> `learning_modules.programme_id`

---

## 6. TESTING CHECKLIST

After applying migration:

- [ ] Create test apprenticeship programme (should have seed data)
- [ ] Create test enrollment for an Apprentice user
- [ ] Log OTJT hours as apprentice
- [ ] Approve OTJT hours as mentor
- [ ] Start and complete a learning module
- [ ] Verify OTJT auto-logging on module completion
- [ ] Check progress reviews were auto-scheduled
- [ ] Verify skills gap analysis returns correct data
- [ ] Test RLS - apprentice cannot see other apprentice's data

---

## 7. DESIGN SYSTEM COMPLIANCE

All components follow CentaurOS design rules:
- ✅ Uses `text-foreground`, `text-muted-foreground` (no hardcoded grays)
- ✅ Uses `bg-background`, `bg-card`, `bg-muted` (no hardcoded whites)
- ✅ Uses `StatusBadge` pattern for statuses
- ✅ Uses `UserAvatar` for profile images
- ✅ Uses international-orange for active states and CTAs
- ✅ Uses Card/CardHeader/CardContent pattern
- ✅ Page headers have orange accent bar
- ✅ Accessible forms with proper aria attributes

---

## 8. IMPORTANT NOTES

1. **The migration has NOT been applied yet** - Next agent should run this first
2. **No tests written yet** - Consider adding E2E tests for critical flows
3. **Notifications table may not exist** - Server actions gracefully handle this
4. **Module content delivery** - Currently just stores URLs, actual content viewer TBD
5. **Document templates** - Template content for legal docs not yet created
6. **Mobile navigation** - Apprenticeship link not yet added to mobile nav

---

## 9. QUICK START FOR NEXT AGENT

```bash
# 1. Apply the database migration
cd /Users/tristanfischer/Library/Mobile\ Documents/com~apple~CloudDocs/Software\ development/CentaurOS\ created\ 260126\ 1435
supabase db push

# 2. Start the dev server
npm run dev

# 3. Navigate to /apprenticeship to test
```

**To test as apprentice:**
1. Create a user with role='Apprentice' in profiles table
2. Create an enrollment linking that user to a programme
3. Log in as that user and go to /apprenticeship

**To test as mentor:**
1. Create enrollment with senior_mentor_id pointing to an Executive user
2. Log in as that Executive and go to /apprenticeship

---

*End of Handover Document*
