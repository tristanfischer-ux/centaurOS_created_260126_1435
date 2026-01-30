import { createClient } from '@/lib/supabase/server'
import { getEnrollmentForUser, getMenteeEnrollments, getFoundryEnrollments } from '@/actions/apprenticeship-enrollment'
import { getWeeklyOTJTSummary, getOTJTProgressSummary } from '@/actions/otjt-tracking'
import { getSkillsGapAnalysis, getModuleProgress, getUpcomingReviews } from '@/actions/apprenticeship-progress'
import { ApprenticeDashboard } from '@/components/apprenticeship/apprentice-dashboard'
import { MentorDashboard } from '@/components/apprenticeship/mentor-dashboard'
import { AdminDashboard } from '@/components/apprenticeship/admin-dashboard'
import { NoEnrollmentState } from '@/components/apprenticeship/no-enrollment-state'
import { redirect } from 'next/navigation'

export const metadata = {
  title: 'Apprenticeship | CentaurOS',
  description: 'Your apprenticeship dashboard - track progress, log OTJT hours, and complete learning modules.'
}

export default async function ApprenticeshipPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
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
  
  // If user is an apprentice with enrollment, show apprentice dashboard
  if (enrollment) {
    // Get week start (Monday)
    const now = new Date()
    const day = now.getDay()
    const diff = now.getDate() - day + (day === 0 ? -6 : 1)
    const weekStart = new Date(now.setDate(diff)).toISOString().split('T')[0]
    
    const [otjtSummary, otjtProgress, skillsGap, moduleProgress, upcomingReviews] = await Promise.all([
      getWeeklyOTJTSummary(enrollment.id, weekStart),
      getOTJTProgressSummary(enrollment.id),
      getSkillsGapAnalysis(enrollment.id),
      getModuleProgress(enrollment.id),
      getUpcomingReviews(enrollment.id)
    ])
    
    // Handle error cases
    if ('error' in otjtProgress || 'error' in skillsGap || 'error' in moduleProgress) {
      return <div className="p-8 text-center text-muted-foreground">Error loading progress data</div>
    }
    
    return (
      <ApprenticeDashboard
        enrollment={enrollment}
        otjtWeeklySummary={otjtSummary}
        otjtProgress={otjtProgress}
        skillsGap={skillsGap}
        moduleProgress={moduleProgress}
        upcomingReviews={upcomingReviews.reviews || []}
      />
    )
  }
  
  // If user is a mentor (Executive/Founder) with mentees, show mentor dashboard
  if (menteeEnrollments && menteeEnrollments.length > 0) {
    return <MentorDashboard mentees={menteeEnrollments} />
  }
  
  // If user is an Executive/Founder, show admin dashboard
  if (profile?.role && ['Executive', 'Founder'].includes(profile.role) && profile.foundry_id) {
    const { enrollments: allEnrollments } = await getFoundryEnrollments(profile.foundry_id)
    return (
      <AdminDashboard 
        enrollments={allEnrollments || []} 
        foundryId={profile.foundry_id}
        userRole={profile.role as 'Executive' | 'Founder'}
      />
    )
  }
  
  // If user is an apprentice without enrollment, show enrollment prompt
  if (profile?.role === 'Apprentice') {
    return <NoEnrollmentState />
  }
  
  // Otherwise, show empty state or redirect
  return <NoEnrollmentState showMentorInfo />
}
