'use server'


import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { EnrollmentInput, Enrollment } from '@/types/apprenticeship'
import { isValidUUID } from '@/lib/security/sanitize'

// NOTE: Types are in @/types/apprenticeship - import directly from there

// =============================================
// ENROLLMENT MANAGEMENT
// =============================================

/**
 * Create a new apprenticeship enrollment
 */
export async function createEnrollment(input: EnrollmentInput) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) return { error: 'Unauthorized' }
  
  // Get programme details for duration/OTJT calculation
  const { data: programme, error: progError } = await supabase
    .from('apprenticeship_programmes')
    .select('*')
    .eq('id', input.programmeId)
    .single()
  
  if (progError || !programme) {
    return { error: 'Programme not found' }
  }
  
  // Calculate dates
  const startDate = new Date(input.startDate)
  const expectedEndDate = new Date(startDate)
  expectedEndDate.setMonth(expectedEndDate.getMonth() + programme.duration_months)
  
  // Flying start = 1 week after start
  const flyingStartDate = new Date(startDate)
  flyingStartDate.setDate(flyingStartDate.getDate() + 7)
  
  // Create enrollment
  const { data: enrollment, error } = await supabase
    .from('apprenticeship_enrollments')
    .insert({
      apprentice_id: input.apprenticeId,
      programme_id: input.programmeId,
      foundry_id: input.foundryId,
      start_date: startDate.toISOString().split('T')[0],
      expected_end_date: expectedEndDate.toISOString().split('T')[0],
      flying_start_date: flyingStartDate.toISOString().split('T')[0],
      otjt_hours_target: programme.otjt_hours_required,
      workplace_buddy_id: input.workplaceBuddyId || null,
      senior_mentor_id: input.seniorMentorId || null,
      hourly_rate: input.hourlyRate,
      wage_band: input.wageBand,
      employment_type: input.employmentType || 'full_time',
      weekly_hours: input.weeklyHours || 30,
      status: 'enrolled'
    })
    .select()
    .single()
  
  if (error) {
    console.error('Error creating enrollment:', error)
    return { error: error.message }
  }
  
  // Initialize module completions for all programme modules
  await initializeModuleCompletions(enrollment.id, input.programmeId)
  
  // Create required legal documents
  await createRequiredDocuments(enrollment.id)
  
  // Create Week 1 training objective and tasks
  await createInductionObjective(enrollment.id, input.apprenticeId, input.foundryId, programme.title)
  
  // Schedule standard progress reviews
  await scheduleStandardReviews(enrollment.id, input.seniorMentorId || user.id)
  
  revalidatePath('/apprenticeship')
  revalidatePath('/dashboard')
  revalidatePath('/guild')
  
  return { success: true, enrollment }
}

/**
 * Get enrollment for current user (if they're an apprentice)
 */
export async function getEnrollmentForUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) return null
  
  const { data: enrollment } = await supabase
    .from('apprenticeship_enrollments')
    .select(`
      *,
      apprentice:profiles!apprentice_id(id, full_name, email, avatar_url),
      programme:apprenticeship_programmes(*),
      workplace_buddy:profiles!workplace_buddy_id(id, full_name, avatar_url),
      senior_mentor:profiles!senior_mentor_id(id, full_name, avatar_url)
    `)
    .eq('apprentice_id', user.id)
    .in('status', ['enrolled', 'active', 'gateway', 'epa'])
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
  
  return enrollment as Enrollment | null
}

/**
 * Get all enrollments for a foundry (for managers/mentors)
 */
export async function getFoundryEnrollments(foundryId: string) {
  const supabase = await createClient()
  
  const { data: enrollments, error } = await supabase
    .from('apprenticeship_enrollments')
    .select(`
      *,
      apprentice:profiles!apprentice_id(id, full_name, email, avatar_url),
      programme:apprenticeship_programmes(id, title, level, standard_code),
      workplace_buddy:profiles!workplace_buddy_id(id, full_name, avatar_url),
      senior_mentor:profiles!senior_mentor_id(id, full_name, avatar_url)
    `)
    .eq('foundry_id', foundryId)
    .in('status', ['enrolled', 'active', 'on_break', 'gateway', 'epa'])
    .order('start_date', { ascending: false })
  
  if (error) {
    console.error('Error fetching enrollments:', error)
    return { error: error.message }
  }
  
  return { enrollments: enrollments as unknown as Enrollment[] }
}

/**
 * Get enrollments where user is a mentor
 */
export async function getMenteeEnrollments() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) return { error: 'Unauthorized' }
  
  // Validate user ID is a valid UUID before using in query
  if (!isValidUUID(user.id)) {
    return { error: 'Invalid user ID' }
  }
  
  // Get enrollments using separate queries instead of .or() with string interpolation
  const [mentorResult, buddyResult] = await Promise.all([
    supabase
      .from('apprenticeship_enrollments')
      .select(`
        *,
        apprentice:profiles!apprentice_id(id, full_name, email, avatar_url),
        programme:apprenticeship_programmes(id, title, level, standard_code)
      `)
      .eq('senior_mentor_id', user.id)
      .in('status', ['enrolled', 'active', 'on_break', 'gateway', 'epa']),
    supabase
      .from('apprenticeship_enrollments')
      .select(`
        *,
        apprentice:profiles!apprentice_id(id, full_name, email, avatar_url),
        programme:apprenticeship_programmes(id, title, level, standard_code)
      `)
      .eq('workplace_buddy_id', user.id)
      .in('status', ['enrolled', 'active', 'on_break', 'gateway', 'epa'])
  ])
  
  // Combine and deduplicate results by ID
  const enrollmentMap = new Map<string, typeof mentorResult.data[0]>()
  for (const e of [...(mentorResult.data || []), ...(buddyResult.data || [])]) {
    if (e && !enrollmentMap.has(e.id)) {
      enrollmentMap.set(e.id, e)
    }
  }
  const enrollments = Array.from(enrollmentMap.values())
    .sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime())
  
  const error = mentorResult.error || buddyResult.error
  
  if (error) {
    console.error('Error fetching mentee enrollments:', error)
    return { error: error.message }
  }
  
  // Get pending OTJT approvals for each enrollment
  const enrollmentsWithPending = await Promise.all(
    (enrollments || []).map(async (enrollment) => {
      const { count } = await supabase
        .from('otjt_time_logs')
        .select('*', { count: 'exact', head: true })
        .eq('enrollment_id', enrollment.id)
        .eq('status', 'pending')
      
      // Get next scheduled review
      const { data: nextReview } = await supabase
        .from('progress_reviews')
        .select('review_type, scheduled_date')
        .eq('enrollment_id', enrollment.id)
        .is('completed_date', null)
        .gte('scheduled_date', new Date().toISOString().split('T')[0])
        .order('scheduled_date', { ascending: true })
        .limit(1)
        .single()
      
      return {
        ...enrollment,
        pendingApprovals: count || 0,
        upcomingReview: nextReview ? {
          type: nextReview.review_type,
          date: nextReview.scheduled_date
        } : null
      }
    })
  )
  
  return { enrollments: enrollmentsWithPending }
}

/**
 * Update enrollment status
 */
export async function updateEnrollmentStatus(
  enrollmentId: string, 
  status: 'enrolled' | 'active' | 'on_break' | 'gateway' | 'epa' | 'completed' | 'withdrawn'
) {
  const supabase = await createClient()
  
  const updateData: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString()
  }
  
  // If completing or withdrawing, set actual end date
  if (status === 'completed' || status === 'withdrawn') {
    updateData.actual_end_date = new Date().toISOString().split('T')[0]
  }
  
  const { error } = await supabase
    .from('apprenticeship_enrollments')
    .update(updateData)
    .eq('id', enrollmentId)
  
  if (error) {
    return { error: error.message }
  }
  
  revalidatePath('/apprenticeship')
  return { success: true }
}

/**
 * Assign mentors to an enrollment
 */
export async function assignMentors(
  enrollmentId: string,
  seniorMentorId?: string,
  workplaceBuddyId?: string
) {
  const supabase = await createClient()
  
  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString()
  }
  
  if (seniorMentorId !== undefined) {
    updates.senior_mentor_id = seniorMentorId || null
  }
  if (workplaceBuddyId !== undefined) {
    updates.workplace_buddy_id = workplaceBuddyId || null
  }
  
  const { error } = await supabase
    .from('apprenticeship_enrollments')
    .update(updates)
    .eq('id', enrollmentId)
  
  if (error) {
    return { error: error.message }
  }
  
  // Create introduction tasks if mentors assigned
  const { data: enrollment } = await supabase
    .from('apprenticeship_enrollments')
    .select('apprentice_id, foundry_id, senior_mentor:profiles!senior_mentor_id(full_name), workplace_buddy:profiles!workplace_buddy_id(full_name)')
    .eq('id', enrollmentId)
    .single()
  
  if (enrollment) {
    if (seniorMentorId && enrollment.senior_mentor) {
      await supabase.from('tasks').insert({
        title: `Meet your Senior Mentor: ${(enrollment.senior_mentor as { full_name: string }).full_name}`,
        description: 'Schedule a 30-min intro call to discuss your goals, training plan, and expectations.',
        creator_id: seniorMentorId,
        assignee_id: enrollment.apprentice_id,
        foundry_id: enrollment.foundry_id,
        status: 'Pending',
        risk_level: 'Low',
        end_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      })
    }
    
    if (workplaceBuddyId && enrollment.workplace_buddy) {
      await supabase.from('tasks').insert({
        title: `Meet your Workplace Buddy: ${(enrollment.workplace_buddy as { full_name: string }).full_name}`,
        description: 'Grab coffee (virtual or IRL) with your buddy this week. They\'ll help you navigate the workplace.',
        creator_id: workplaceBuddyId,
        assignee_id: enrollment.apprentice_id,
        foundry_id: enrollment.foundry_id,
        status: 'Pending',
        risk_level: 'Low',
        end_date: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString()
      })
    }
  }
  
  revalidatePath('/apprenticeship')
  return { success: true }
}

// =============================================
// HELPER FUNCTIONS
// =============================================

async function initializeModuleCompletions(enrollmentId: string, programmeId: string) {
  const supabase = await createClient()
  
  // Get all modules for the programme
  const { data: modules } = await supabase
    .from('learning_modules')
    .select('id, unlock_after_days, prerequisite_module_id')
    .eq('programme_id', programmeId)
    .eq('is_active', true)
    .order('order_index')
  
  if (!modules || modules.length === 0) return
  
  // Create completion records
  const completions = modules.map(module => ({
    enrollment_id: enrollmentId,
    module_id: module.id,
    // Available if no unlock delay and no prerequisite, otherwise locked
    status: (module.unlock_after_days === 0 && !module.prerequisite_module_id) 
      ? 'available' 
      : 'locked'
  }))
  
  await supabase.from('module_completions').insert(completions)
}

async function createRequiredDocuments(enrollmentId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  const documents = [
    {
      enrollment_id: enrollmentId,
      document_type: 'apprenticeship_agreement',
      title: 'Apprenticeship Agreement',
      description: 'Your formal apprenticeship employment contract.',
      status: 'draft',
      created_by: user?.id
    },
    {
      enrollment_id: enrollmentId,
      document_type: 'commitment_statement',
      title: 'Commitment Statement',
      description: 'Three-way agreement between you, your employer, and CentaurOS as training provider.',
      status: 'draft',
      created_by: user?.id
    },
    {
      enrollment_id: enrollmentId,
      document_type: 'training_plan',
      title: 'Individual Training Plan',
      description: 'Your personalized training plan outlining learning objectives and milestones.',
      status: 'draft',
      created_by: user?.id
    }
  ]
  
  await supabase.from('apprenticeship_documents').insert(documents)
}

async function createInductionObjective(
  enrollmentId: string, 
  apprenticeId: string, 
  foundryId: string,
  programmeTitle: string
) {
  const supabase = await createClient()
  
  // Create Week 1 objective
  const { data: objective, error: objError } = await supabase
    .from('objectives')
    .insert({
      title: 'Week 1: Apprenticeship Induction',
      description: `Complete your ${programmeTitle} apprenticeship setup: sign documents, complete AI readiness training, and meet your mentors.`,
      creator_id: apprenticeId,
      foundry_id: foundryId,
      status: 'on_track'
    })
    .select()
    .single()
  
  if (objError || !objective) {
    console.error('Error creating induction objective:', objError)
    return
  }
  
  // Create induction tasks
  const inductionTasks: Array<{
    title: string
    description: string
    end_date: string
    risk_level: 'Low' | 'Medium' | 'High'
  }> = [
    {
      title: '📋 Sign Apprenticeship Agreement',
      description: 'Review and sign your formal apprenticeship employment contract. This is a legal requirement before you can start.',
      end_date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
      risk_level: 'High'
    },
    {
      title: '📋 Sign Commitment Statement',
      description: 'Three-way agreement between you, your employer, and CentaurOS outlining training responsibilities.',
      end_date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
      risk_level: 'High'
    },
    {
      title: '🤖 Complete AI Readiness Training',
      description: 'Set up your Digital Body: Install Cursor IDE, configure Claude/ChatGPT access, and complete AI safety training. You\'ll use these tools daily.',
      end_date: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
      risk_level: 'Medium'
    },
    {
      title: '👤 Complete Your Profile',
      description: 'Add your bio, skills, and interests to help us match you with the right projects and mentors.',
      end_date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      risk_level: 'Low'
    },
    {
      title: '📖 Read the Guild Handbook',
      description: 'Understand how the Centaur Guild works, your path to becoming a founder, OTJT requirements, and how to get the most from your mentors.',
      end_date: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString(),
      risk_level: 'Low'
    },
    {
      title: '⏱️ Log Your First OTJT Hours',
      description: 'Log at least 6 hours of off-the-job training this week. This is a legal requirement (20% of your working hours).',
      end_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      risk_level: 'Medium'
    }
  ]
  
  for (const task of inductionTasks) {
    await supabase.from('tasks').insert({
      ...task,
      objective_id: objective.id,
      creator_id: apprenticeId,
      assignee_id: apprenticeId,
      foundry_id: foundryId,
      status: 'Pending'
    })
  }
}

async function scheduleStandardReviews(enrollmentId: string, reviewerId: string) {
  const supabase = await createClient()
  
  const { data: enrollment } = await supabase
    .from('apprenticeship_enrollments')
    .select('start_date, expected_end_date')
    .eq('id', enrollmentId)
    .single()
  
  if (!enrollment) return
  
  const startDate = new Date(enrollment.start_date)
  const endDate = new Date(enrollment.expected_end_date)
  const durationMonths = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 30))
  
  const reviews: Array<{ type: string; date: Date }> = []
  
  // Weekly reviews for first month
  for (let week = 1; week <= 4; week++) {
    const reviewDate = new Date(startDate)
    reviewDate.setDate(reviewDate.getDate() + (week * 7))
    reviews.push({ type: 'weekly', date: reviewDate })
  }
  
  // Monthly reviews after first month
  for (let month = 2; month <= durationMonths; month++) {
    const reviewDate = new Date(startDate)
    reviewDate.setMonth(reviewDate.getMonth() + month)
    reviews.push({ type: 'monthly', date: reviewDate })
  }
  
  // Quarterly reviews (in addition to monthly)
  for (let quarter = 1; quarter <= Math.floor(durationMonths / 3); quarter++) {
    const reviewDate = new Date(startDate)
    reviewDate.setMonth(reviewDate.getMonth() + (quarter * 3))
    reviews.push({ type: 'quarterly', date: reviewDate })
  }
  
  // Mid-programme review
  const midDate = new Date(startDate)
  midDate.setMonth(midDate.getMonth() + Math.floor(durationMonths / 2))
  reviews.push({ type: 'mid_programme', date: midDate })
  
  // Gateway review (90% through programme)
  const gatewayDate = new Date(startDate)
  gatewayDate.setMonth(gatewayDate.getMonth() + Math.floor(durationMonths * 0.9))
  reviews.push({ type: 'gateway', date: gatewayDate })
  
  // Insert reviews (only future dates)
  const now = new Date()
  const futureReviews = reviews.filter(r => r.date > now)
  
  for (const review of futureReviews) {
    await supabase.from('progress_reviews').insert({
      enrollment_id: enrollmentId,
      reviewer_id: reviewerId,
      review_type: review.type,
      scheduled_date: review.date.toISOString().split('T')[0]
    })
  }
}

// =============================================
// PROGRAMME QUERIES
// =============================================

/**
 * Get all active apprenticeship programmes
 */
export async function getApprenticeProgrammes() {
  const supabase = await createClient()
  
  const { data: programmes, error } = await supabase
    .from('apprenticeship_programmes')
    .select('*')
    .eq('is_active', true)
    .order('level', { ascending: true })
    .order('title', { ascending: true })
  
  if (error) {
    console.error('Error fetching programmes:', error)
    return { error: error.message }
  }
  
  return { programmes }
}

/**
 * Get programme by ID with modules
 */
export async function getProgrammeWithModules(programmeId: string) {
  const supabase = await createClient()
  
  const { data: programme, error } = await supabase
    .from('apprenticeship_programmes')
    .select(`
      *,
      modules:learning_modules(*)
    `)
    .eq('id', programmeId)
    .single()
  
  if (error) {
    return { error: error.message }
  }
  
  return { programme }
}

// =============================================
// ADMIN QUERIES
// =============================================

/**
 * Get eligible apprentices (Apprentice role users without active enrollment)
 */
export async function getEligibleApprentices(foundryId: string) {
  const supabase = await createClient()
  
  // Get users with Apprentice role in this foundry
  const { data: apprentices, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, avatar_url')
    .eq('foundry_id', foundryId)
    .eq('role', 'Apprentice')
    .order('full_name', { ascending: true })
  
  if (error) {
    console.error('Error fetching apprentices:', error)
    return { error: error.message }
  }
  
  // Filter out those with active enrollments
  const { data: activeEnrollments } = await supabase
    .from('apprenticeship_enrollments')
    .select('apprentice_id')
    .eq('foundry_id', foundryId)
    .in('status', ['enrolled', 'active', 'on_break', 'gateway', 'epa'])
  
  const enrolledIds = new Set((activeEnrollments || []).map(e => e.apprentice_id))
  const eligibleApprentices = (apprentices || []).filter(a => !enrolledIds.has(a.id))
  
  return { apprentices: eligibleApprentices }
}

/**
 * Get potential mentors (Executives in the foundry)
 */
export async function getPotentialMentors(foundryId: string) {
  const supabase = await createClient()
  
  const { data: mentors, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, avatar_url, role')
    .eq('foundry_id', foundryId)
    .in('role', ['Executive', 'Founder'])
    .order('full_name', { ascending: true })
  
  if (error) {
    console.error('Error fetching potential mentors:', error)
    return { error: error.message }
  }
  
  return { mentors }
}
