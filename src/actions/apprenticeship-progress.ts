'use server'


import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { ProgressReviewInput, SkillAssessmentInput } from '@/types/apprenticeship'
import { sanitizeErrorMessage } from '@/lib/security/sanitize'

// =============================================
// PROGRESS REVIEWS
// =============================================

/**
 * Create or complete a progress review
 */
export async function createProgressReview(input: ProgressReviewInput) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) return { error: 'Unauthorized' }
  
  const { data: review, error } = await supabase
    .from('progress_reviews')
    .insert({
      enrollment_id: input.enrollmentId,
      reviewer_id: user.id,
      review_type: input.reviewType,
      scheduled_date: input.scheduledDate || new Date().toISOString().split('T')[0],
      completed_date: new Date().toISOString().split('T')[0],
      duration_minutes: input.durationMinutes,
      objectives_met: input.objectivesMet || [],
      skills_demonstrated: input.skillsDemonstrated || [],
      areas_for_improvement: input.areasForImprovement || [],
      apprentice_reflection: input.apprenticeReflection,
      mentor_feedback: input.mentorFeedback,
      action_items: input.actionItems || [],
      overall_rating: input.overallRating,
      on_track: input.onTrack,
      gateway_ready: input.gatewayReady,
      epa_recommendation: input.epaRecommendation
    })
    .select()
    .single()
  
  if (error) {
    console.error('Error creating review:', error)
    return { error: sanitizeErrorMessage(error) }
  }
  
  // Create follow-up tasks from action items (batch insert to fix N+1 pattern)
  if (input.actionItems && input.actionItems.length > 0) {
    const { data: enrollment } = await supabase
      .from('apprenticeship_enrollments')
      .select('apprentice_id, foundry_id')
      .eq('id', input.enrollmentId)
      .single()
    
    if (enrollment) {
      // Batch insert all tasks at once instead of one-by-one
      const tasksToInsert = input.actionItems.map(item => ({
        title: item,
        description: `Action item from ${input.reviewType} progress review`,
        creator_id: user.id,
        assignee_id: enrollment.apprentice_id,
        foundry_id: enrollment.foundry_id,
        status: 'Pending' as const,
        risk_level: 'Low' as const,
        end_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString() // Due in 2 weeks
      }))
      
      await supabase.from('tasks').insert(tasksToInsert)
    }
  }
  
  // If gateway review marked as ready, update enrollment status
  if (input.reviewType === 'gateway' && input.gatewayReady) {
    await supabase
      .from('apprenticeship_enrollments')
      .update({ status: 'gateway' })
      .eq('id', input.enrollmentId)
  }
  
  revalidatePath('/apprenticeship')
  return { success: true, review }
}

/**
 * Complete an existing scheduled review
 */
export async function completeProgressReview(
  reviewId: string, 
  input: Omit<ProgressReviewInput, 'enrollmentId' | 'reviewType' | 'scheduledDate'>
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) return { error: 'Unauthorized' }
  
  const { data: review, error } = await supabase
    .from('progress_reviews')
    .update({
      completed_date: new Date().toISOString().split('T')[0],
      duration_minutes: input.durationMinutes,
      objectives_met: input.objectivesMet || [],
      skills_demonstrated: input.skillsDemonstrated || [],
      areas_for_improvement: input.areasForImprovement || [],
      apprentice_reflection: input.apprenticeReflection,
      mentor_feedback: input.mentorFeedback,
      action_items: input.actionItems || [],
      overall_rating: input.overallRating,
      on_track: input.onTrack,
      gateway_ready: input.gatewayReady,
      epa_recommendation: input.epaRecommendation,
      updated_at: new Date().toISOString()
    })
    .eq('id', reviewId)
    .select('*, enrollment:apprenticeship_enrollments(apprentice_id, foundry_id)')
    .single()
  
  if (error) return { error: sanitizeErrorMessage(error) }
  
  // Create follow-up tasks (batch insert to fix N+1 pattern)
  if (input.actionItems && input.actionItems.length > 0 && review.enrollment) {
    const tasksToInsert = input.actionItems.map(item => ({
      title: item,
      description: `Action item from progress review`,
      creator_id: user.id,
      assignee_id: review.enrollment.apprentice_id,
      foundry_id: review.enrollment.foundry_id,
      status: 'Pending' as const,
      risk_level: 'Low' as const,
      end_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
    }))
    
    await supabase.from('tasks').insert(tasksToInsert)
  }
  
  revalidatePath('/apprenticeship')
  return { success: true, review }
}

/**
 * Sign a progress review (apprentice or mentor)
 */
export async function signProgressReview(reviewId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) return { error: 'Unauthorized' }
  
  // Get review to determine user's role
  const { data: review } = await supabase
    .from('progress_reviews')
    .select('enrollment:apprenticeship_enrollments(apprentice_id, senior_mentor_id)')
    .eq('id', reviewId)
    .single()
  
  if (!review?.enrollment) return { error: 'Review not found' }
  
  const enrollment = review.enrollment as { apprentice_id: string; senior_mentor_id: string }
  
  let updateField: string
  if (enrollment.apprentice_id === user.id) {
    updateField = 'apprentice_signed_at'
  } else if (enrollment.senior_mentor_id === user.id) {
    updateField = 'mentor_signed_at'
  } else {
    return { error: 'You are not authorized to sign this review' }
  }
  
  const { error } = await supabase
    .from('progress_reviews')
    .update({
      [updateField]: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', reviewId)
  
  if (error) return { error: sanitizeErrorMessage(error) }
  
  revalidatePath('/apprenticeship')
  return { success: true }
}

/**
 * Get progress reviews for an enrollment
 */
export async function getProgressReviews(enrollmentId: string, options?: {
  includeUpcoming?: boolean
  type?: string
  limit?: number
}) {
  const supabase = await createClient()
  
  let query = supabase
    .from('progress_reviews')
    .select(`
      *,
      reviewer:profiles!reviewer_id(full_name, avatar_url)
    `)
    .eq('enrollment_id', enrollmentId)
    .order('scheduled_date', { ascending: false })
  
  if (!options?.includeUpcoming) {
    query = query.not('completed_date', 'is', null)
  }
  
  if (options?.type) {
    query = query.eq('review_type', options.type)
  }
  
  if (options?.limit) {
    query = query.limit(options.limit)
  }
  
  const { data: reviews, error } = await query
  
  if (error) return { error: sanitizeErrorMessage(error) }
  
  return { reviews }
}

/**
 * Get upcoming reviews (scheduled but not completed)
 */
export async function getUpcomingReviews(enrollmentId: string) {
  const supabase = await createClient()
  
  const { data: reviews, error } = await supabase
    .from('progress_reviews')
    .select(`
      *,
      reviewer:profiles!reviewer_id(full_name, avatar_url)
    `)
    .eq('enrollment_id', enrollmentId)
    .is('completed_date', null)
    .gte('scheduled_date', new Date().toISOString().split('T')[0])
    .order('scheduled_date', { ascending: true })
    .limit(5)
  
  if (error) return { error: sanitizeErrorMessage(error) }
  
  return { reviews }
}

// =============================================
// SKILLS ASSESSMENT
// =============================================

/**
 * Assess a skill for an apprentice
 */
export async function assessSkill(input: SkillAssessmentInput) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) return { error: 'Unauthorized' }
  
  // Validate level is 0-5
  if (input.currentLevel < 0 || input.currentLevel > 5) {
    return { error: 'Skill level must be between 0 and 5' }
  }
  
  const { data, error } = await supabase
    .from('apprentice_skill_assessments')
    .upsert({
      enrollment_id: input.enrollmentId,
      skill_id: input.skillId,
      current_level: input.currentLevel,
      assessed_at: new Date().toISOString(),
      assessed_by: user.id,
      assessment_method: input.assessmentMethod,
      evidence: input.evidence,
      assessor_notes: input.assessorNotes,
      development_plan: input.developmentPlan,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'enrollment_id,skill_id'
    })
    .select()
    .single()
  
  if (error) return { error: sanitizeErrorMessage(error) }
  
  revalidatePath('/apprenticeship')
  return { success: true, assessment: data }
}

/**
 * Bulk assess multiple skills
 */
export async function bulkAssessSkills(
  enrollmentId: string, 
  assessments: Array<{ skillId: string; level: number; evidence?: string }>
) {
  const results = {
    success: 0,
    failed: 0,
    errors: [] as string[]
  }
  
  for (const assessment of assessments) {
    const result = await assessSkill({
      enrollmentId,
      skillId: assessment.skillId,
      currentLevel: assessment.level,
      evidence: assessment.evidence
    })
    
    if (result.success) {
      results.success++
    } else {
      results.failed++
      results.errors.push(result.error || 'Unknown error')
    }
  }
  
  return results
}

/**
 * Get skill assessments for an enrollment
 */
export async function getSkillAssessments(enrollmentId: string) {
  const supabase = await createClient()
  
  const { data: assessments, error } = await supabase
    .from('apprentice_skill_assessments')
    .select(`
      *,
      skill:apprenticeship_skills(*),
      assessor:profiles!assessed_by(full_name)
    `)
    .eq('enrollment_id', enrollmentId)
    .order('updated_at', { ascending: false })
  
  if (error) return { error: sanitizeErrorMessage(error) }
  
  return { assessments }
}

/**
 * Get skills gap analysis for an enrollment
 */
export async function getSkillsGapAnalysis(enrollmentId: string) {
  const supabase = await createClient()
  
  // Get enrollment with programme
  const { data: enrollment } = await supabase
    .from('apprenticeship_enrollments')
    .select('programme:apprenticeship_programmes(skills_framework)')
    .eq('id', enrollmentId)
    .single()
  
  if (!enrollment?.programme) {
    return { error: 'Enrollment not found' }
  }
  
  // Get current skill assessments
  const { data: assessments } = await supabase
    .from('apprentice_skill_assessments')
    .select(`
      current_level,
      target_level,
      skill:apprenticeship_skills(id, name, category)
    `)
    .eq('enrollment_id', enrollmentId)
  
  // Get all skills from programme framework
  const framework = enrollment.programme.skills_framework as Record<string, string[]> || {}
  
  // Build skills map
  const skillsMap = new Map<string, { current: number; target: number; category: string }>()
  
  // Initialize from assessments
  for (const assessment of assessments || []) {
    const skill = assessment.skill as { id: string; name: string; category: string } | null
    if (skill) {
      skillsMap.set(skill.name, {
        current: assessment.current_level,
        target: assessment.target_level || 3,
        category: skill.category
      })
    }
  }
  
  // Add any missing skills from framework with current=0
  for (const [category, skills] of Object.entries(framework)) {
    for (const skillName of skills) {
      if (!skillsMap.has(skillName)) {
        skillsMap.set(skillName, {
          current: 0,
          target: 3,
          category
        })
      }
    }
  }
  
  // Calculate gaps
  const gaps: Array<{
    skill: string
    category: string
    current: number
    target: number
    gap: number
  }> = []
  
  let skillsAtTarget = 0
  let totalSkills = 0
  
  for (const [skillName, data] of skillsMap) {
    totalSkills++
    const gap = data.target - data.current
    
    if (gap > 0) {
      gaps.push({
        skill: skillName,
        category: data.category,
        current: data.current,
        target: data.target,
        gap
      })
    } else {
      skillsAtTarget++
    }
  }
  
  // Sort by gap size (largest first)
  gaps.sort((a, b) => b.gap - a.gap)
  
  const overallProgress = totalSkills > 0 
    ? Math.round((skillsAtTarget / totalSkills) * 100) 
    : 0
  
  return {
    gaps,
    totalSkills,
    skillsAtTarget,
    skillsBelowTarget: gaps.length,
    overallProgress,
    byCategory: Object.entries(framework).map(([category, skills]) => {
      const categorySkills = skills.map(s => skillsMap.get(s))
      const atTarget = categorySkills.filter(s => s && s.current >= s.target).length
      return {
        category,
        total: skills.length,
        atTarget,
        progress: skills.length > 0 ? Math.round((atTarget / skills.length) * 100) : 0
      }
    })
  }
}

// =============================================
// MODULE COMPLETIONS
// =============================================

/**
 * Start a learning module
 */
export async function startModule(completionId: string) {
  const supabase = await createClient()
  
  const { error } = await supabase
    .from('module_completions')
    .update({
      status: 'in_progress',
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', completionId)
  
  if (error) return { error: sanitizeErrorMessage(error) }
  
  revalidatePath('/apprenticeship')
  return { success: true }
}

/**
 * Complete a learning module
 */
export async function completeModule(
  completionId: string, 
  enrollmentId: string,
  options?: {
    score?: number
    reflection?: string
    evidenceUrls?: string[]
  }
) {
  const supabase = await createClient()
  
  // Get module details for OTJT logging
  const { data: completion } = await supabase
    .from('module_completions')
    .select('module:learning_modules(id, title, estimated_hours, counts_as_otjt)')
    .eq('id', completionId)
    .single()
  
  const learningModule = completion?.module as { id: string; title: string; estimated_hours: number; counts_as_otjt: boolean } | null
  
  const { error } = await supabase
    .from('module_completions')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      score: options?.score,
      reflection: options?.reflection,
      evidence_urls: options?.evidenceUrls || [],
      hours_logged: learningModule?.estimated_hours || 0,
      updated_at: new Date().toISOString()
    })
    .eq('id', completionId)
  
  if (error) return { error: sanitizeErrorMessage(error) }
  
  // Auto-log OTJT hours if learningModule counts as OTJT
  if (learningModule?.counts_as_otjt && learningModule.estimated_hours > 0) {
    await supabase.from('otjt_time_logs').insert({
      enrollment_id: enrollmentId,
      log_date: new Date().toISOString().split('T')[0],
      hours: learningModule.estimated_hours,
      activity_type: 'learning_module',
      description: `Completed module: ${learningModule.title}`,
      module_id: learningModule.id,
      status: 'pending'
    })
  }
  
  // Unlock dependent modules
  await unlockDependentModules(enrollmentId, completion?.module?.id)
  
  revalidatePath('/apprenticeship')
  return { success: true }
}

/**
 * Get module progress for an enrollment
 */
export async function getModuleProgress(enrollmentId: string) {
  const supabase = await createClient()
  
  const { data: completions, error } = await supabase
    .from('module_completions')
    .select(`
      *,
      module:learning_modules(*)
    `)
    .eq('enrollment_id', enrollmentId)
    .order('module(order_index)', { ascending: true })
  
  if (error) return { error: sanitizeErrorMessage(error) }
  
  const modules = completions || []
  const completed = modules.filter(m => m.status === 'completed').length
  const inProgress = modules.filter(m => m.status === 'in_progress').length
  const available = modules.filter(m => m.status === 'available').length
  const locked = modules.filter(m => m.status === 'locked').length
  
  return {
    modules,
    summary: {
      total: modules.length,
      completed,
      inProgress,
      available,
      locked,
      progressPercent: modules.length > 0 ? Math.round((completed / modules.length) * 100) : 0
    }
  }
}

async function unlockDependentModules(enrollmentId: string, completedModuleId?: string) {
  if (!completedModuleId) return
  
  const supabase = await createClient()
  
  // Find modules that have this as prerequisite
  const { data: dependentModules } = await supabase
    .from('learning_modules')
    .select('id')
    .eq('prerequisite_module_id', completedModuleId)
  
  if (!dependentModules || dependentModules.length === 0) return
  
  // Update their completion status to available
  for (const depModule of dependentModules) {
    await supabase
      .from('module_completions')
      .update({ status: 'available', updated_at: new Date().toISOString() })
      .eq('enrollment_id', enrollmentId)
      .eq('module_id', depModule.id)
      .eq('status', 'locked')
  }
}

// =============================================
// COMPLIANCE REPORTING
// =============================================

/**
 * Generate compliance report for a foundry
 */
export async function generateComplianceReport(
  foundryId: string, 
  startDate?: string, 
  endDate?: string
) {
  const supabase = await createClient()
  
  const start = startDate || new Date(new Date().setMonth(new Date().getMonth() - 3)).toISOString().split('T')[0]
  const end = endDate || new Date().toISOString().split('T')[0]
  
  // Get all active enrollments
  const { data: enrollments } = await supabase
    .from('apprenticeship_enrollments')
    .select(`
      *,
      apprentice:profiles!apprentice_id(full_name, email),
      programme:apprenticeship_programmes(title, level, standard_code, duration_months)
    `)
    .eq('foundry_id', foundryId)
    .in('status', ['enrolled', 'active', 'on_break', 'gateway', 'epa'])
  
  if (!enrollments) {
    return { error: 'No enrollments found' }
  }
  
  // Build report for each apprentice
  const apprenticeReports = await Promise.all(
    enrollments.map(async (enrollment) => {
      // Calculate expected progress
      const startDateMs = new Date(enrollment.start_date).getTime()
      const endDateMs = new Date(enrollment.expected_end_date).getTime()
      const nowMs = Date.now()
      const expectedProgress = Math.min(100, ((nowMs - startDateMs) / (endDateMs - startDateMs)) * 100)
      
      // Get OTJT stats for period
      const { data: otjtLogs } = await supabase
        .from('otjt_time_logs')
        .select('hours, status')
        .eq('enrollment_id', enrollment.id)
        .gte('log_date', start)
        .lte('log_date', end)
      
      const otjtInPeriod = (otjtLogs || [])
        .filter(l => l.status === 'approved')
        .reduce((sum, l) => sum + Number(l.hours), 0)
      
      // Get review count
      const { count: reviewCount } = await supabase
        .from('progress_reviews')
        .select('*', { count: 'exact', head: true })
        .eq('enrollment_id', enrollment.id)
        .not('completed_date', 'is', null)
        .gte('completed_date', start)
        .lte('completed_date', end)
      
      const actualProgress = (enrollment.otjt_hours_logged / enrollment.otjt_hours_target) * 100
      const onTrack = actualProgress >= (expectedProgress * 0.9)
      
      const programme = enrollment.programme as { title: string; level: number; standard_code: string } | null
      const apprentice = enrollment.apprentice as { full_name: string; email: string } | null
      
      return {
        name: apprentice?.full_name || 'Unknown',
        email: apprentice?.email || '',
        programme: programme?.title || 'Unknown',
        level: programme?.level || 0,
        standardCode: programme?.standard_code || '',
        startDate: enrollment.start_date,
        expectedEndDate: enrollment.expected_end_date,
        status: enrollment.status,
        otjt: {
          logged: enrollment.otjt_hours_logged,
          target: enrollment.otjt_hours_target,
          progress: Math.round(actualProgress * 10) / 10,
          expectedProgress: Math.round(expectedProgress * 10) / 10,
          hoursInPeriod: otjtInPeriod,
          onTrack
        },
        documents: {
          agreementSigned: !!enrollment.agreement_signed_at,
          commitmentSigned: !!enrollment.commitment_statement_signed_at,
          trainingPlanApproved: !!enrollment.training_plan_approved_at
        },
        reviewsInPeriod: reviewCount || 0
      }
    })
  )
  
  // Summary stats
  const summary = {
    totalApprentices: apprenticeReports.length,
    onTrack: apprenticeReports.filter(a => a.otjt.onTrack).length,
    atRisk: apprenticeReports.filter(a => !a.otjt.onTrack).length,
    documentsPending: apprenticeReports.filter(a => !a.documents.agreementSigned || !a.documents.commitmentSigned).length,
    totalOTJTHours: apprenticeReports.reduce((sum, a) => sum + a.otjt.logged, 0),
    averageProgress: apprenticeReports.length > 0 
      ? Math.round(apprenticeReports.reduce((sum, a) => sum + a.otjt.progress, 0) / apprenticeReports.length)
      : 0
  }
  
  return {
    report: {
      generatedAt: new Date().toISOString(),
      reportPeriod: { start, end },
      foundryId,
      summary,
      apprentices: apprenticeReports
    }
  }
}
