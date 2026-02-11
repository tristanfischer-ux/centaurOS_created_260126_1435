import { createClient } from '@/lib/supabase/server'
import {
  getEnrollmentForUser,
  getMenteeEnrollments,
  getFoundryEnrollments,
  getApprenticeProgrammes,
} from '@/actions/apprenticeship-enrollment'
import {
  getWeeklyOTJTSummary,
  getOTJTProgressSummary,
} from '@/actions/otjt-tracking'
import {
  getSkillsGapAnalysis,
  getModuleProgress,
  getUpcomingReviews,
  generateComplianceReport,
} from '@/actions/apprenticeship-progress'
import { ApprenticeDashboard } from '@/components/apprenticeship/apprentice-dashboard'
import { MentorDashboard } from '@/components/apprenticeship/mentor-dashboard'
import { AdminDashboard } from '@/components/apprenticeship/admin-dashboard'
import type { ComplianceReport } from '@/components/apprenticeship/admin-dashboard'
import { ApprenticeshipHub } from './apprenticeship-hub'
import { redirect } from 'next/navigation'
import type { Programme } from '@/components/apprenticeship/programme-detail-card'

export const metadata = {
  title: 'Apprenticeship | CentaurOS',
  description:
    'Your apprenticeship dashboard - track progress, log OTJT hours, and complete learning modules.',
}

/**
 * Main apprenticeship page. Routes to the appropriate view based on user role
 * and enrollment status.
 *
 * @description For enrolled apprentices → tabbed apprentice dashboard.
 * For mentors with mentees → tabbed mentor dashboard.
 * For admins with apprentices → tabbed admin dashboard with programmes + compliance.
 * For admins without apprentices → Discover hub with programmes.
 * For unenrolled apprentices → Discover hub.
 */
export default async function ApprenticeshipPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Get user profile to check role and foundry
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, foundry_id')
    .eq('id', user.id)
    .single()

  // Check if user is an apprentice with an enrollment
  const enrollment = await getEnrollmentForUser()

  // Check if user is a mentor with mentees
  const { enrollments: menteeEnrollments } = await getMenteeEnrollments()

  // --- Enrolled Apprentice → Apprentice Dashboard ---
  if (enrollment) {
    // Get week start (Monday)
    const now = new Date()
    const day = now.getDay()
    const diff = now.getDate() - day + (day === 0 ? -6 : 1)
    const weekStart = new Date(now.setDate(diff)).toISOString().split('T')[0]

    const [otjtSummary, otjtProgress, skillsGap, moduleProgress, upcomingReviews] =
      await Promise.all([
        getWeeklyOTJTSummary(enrollment.id, weekStart),
        getOTJTProgressSummary(enrollment.id),
        getSkillsGapAnalysis(enrollment.id),
        getModuleProgress(enrollment.id),
        getUpcomingReviews(enrollment.id),
      ])

    // Handle error cases
    if ('error' in otjtProgress || 'error' in skillsGap || 'error' in moduleProgress) {
      return (
        <div className="p-8 text-center text-muted-foreground">
          Error loading progress data
        </div>
      )
    }

    // Transform server action data to match component prop types
    const safeOtjtProgress = {
      ...otjtProgress,
      hoursLogged: otjtProgress.hoursLogged ?? 0,
    }

    const safeModuleProgress = {
      ...moduleProgress,
      modules: moduleProgress.modules.map((m: Record<string, unknown>) => ({
        id: m.id as string,
        status: m.status as 'locked' | 'available' | 'in_progress' | 'completed' | 'failed',
        started_at: m.started_at as string | undefined,
        completed_at: m.completed_at as string | undefined,
        hours_logged: m.hours_logged as number | undefined,
        module: m.module as {
          id: string
          title: string
          description?: string
          module_type: string
          estimated_hours: number
          content_type?: string
        },
      })),
    }

    const safeUpcomingReviews = (upcomingReviews.reviews || []).map(
      (r: Record<string, unknown>) => ({
        id: r.id as string,
        review_type: r.review_type as string,
        scheduled_date: r.scheduled_date as string,
        reviewer: r.reviewer as { full_name: string } | undefined,
      })
    )

    return (
      <ApprenticeDashboard
        enrollment={enrollment}
        otjtWeeklySummary={otjtSummary}
        otjtProgress={safeOtjtProgress}
        skillsGap={skillsGap}
        moduleProgress={safeModuleProgress}
        upcomingReviews={safeUpcomingReviews}
      />
    )
  }

  // --- Mentor with Mentees → Mentor Dashboard ---
  if (menteeEnrollments && menteeEnrollments.length > 0) {
    return <MentorDashboard mentees={menteeEnrollments} />
  }

  // --- Executive/Founder → Admin Dashboard or Discover Hub ---
  if (
    profile?.role &&
    ['Executive', 'Founder'].includes(profile.role) &&
    profile.foundry_id
  ) {
    const [{ enrollments: allEnrollments }, { programmes }] = await Promise.all([
      getFoundryEnrollments(profile.foundry_id),
      getApprenticeProgrammes(),
    ])

    // If they have apprentices, show full admin dashboard with programmes + compliance
    if (allEnrollments && allEnrollments.length > 0) {
      let complianceReport: ComplianceReport | null = null
      try {
        const reportResult = await generateComplianceReport(profile.foundry_id)
        if (!('error' in reportResult) && reportResult.report) {
          complianceReport = {
            summary: reportResult.report.summary,
            apprentices: reportResult.report.apprentices,
          }
        }
      } catch {
        // Compliance report is optional — don't break the page if it fails
        console.warn('[ApprenticeshipPage] Compliance report generation failed')
      }

      return (
        <AdminDashboard
          enrollments={allEnrollments}
          foundryId={profile.foundry_id}
          userRole={profile.role as 'Executive' | 'Founder'}
          programmes={(programmes || []) as Programme[]}
          complianceReport={complianceReport}
        />
      )
    }

    // No apprentices yet — show Discover hub so they learn about apprenticeships
    return (
      <ApprenticeshipHub
        foundryId={profile.foundry_id}
        canEnroll
        programmes={(programmes || []) as Programme[]}
      />
    )
  }

  // --- Unenrolled Apprentice or Other Role → Discover Hub ---
  const { programmes: discoverProgrammes } = await getApprenticeProgrammes()
  return (
    <ApprenticeshipHub
      foundryId={profile?.foundry_id || undefined}
      canEnroll={false}
      programmes={(discoverProgrammes || []) as Programme[]}
    />
  )
}
