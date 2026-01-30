'use server'
// @ts-nocheck - Database types out of sync

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { 
  ActivityType, 
  OTJTLogInput, 
  OTJTLog, 
  WeeklySummary 
} from '@/types/apprenticeship'

// =============================================
// LOGGING OTJT HOURS
// =============================================

/**
 * Log off-the-job training hours
 */
export async function logOTJTTime(input: OTJTLogInput) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) return { error: 'Unauthorized' }
  
  // Validate that user owns this enrollment
  const { data: enrollment } = await supabase
    .from('apprenticeship_enrollments')
    .select('apprentice_id, senior_mentor_id, weekly_hours')
    .eq('id', input.enrollmentId)
    .single()
  
  if (!enrollment) {
    return { error: 'Enrollment not found' }
  }
  
  if (enrollment.apprentice_id !== user.id) {
    return { error: 'You can only log hours for your own enrollment' }
  }
  
  // Validate hours (max 8 per day for OTJT)
  if (input.hours <= 0 || input.hours > 8) {
    return { error: 'Hours must be between 0.5 and 8 per day' }
  }
  
  // Check existing hours for this day
  const { data: existingLogs } = await supabase
    .from('otjt_time_logs')
    .select('hours')
    .eq('enrollment_id', input.enrollmentId)
    .eq('log_date', input.logDate)
  
  const totalToday = (existingLogs || []).reduce((sum, log) => sum + Number(log.hours), 0)
  if (totalToday + input.hours > 8) {
    return { 
      error: `Cannot log more than 8 OTJT hours per day. You've already logged ${totalToday} hours for ${input.logDate}.` 
    }
  }
  
  // Validate date is not in the future
  const logDate = new Date(input.logDate)
  const today = new Date()
  today.setHours(23, 59, 59, 999)
  
  if (logDate > today) {
    return { error: 'Cannot log hours for future dates' }
  }
  
  // Create the log entry
  const { data: log, error } = await supabase
    .from('otjt_time_logs')
    .insert({
      enrollment_id: input.enrollmentId,
      log_date: input.logDate,
      hours: input.hours,
      activity_type: input.activityType,
      description: input.description || null,
      learning_outcomes: input.learningOutcomes || null,
      module_id: input.moduleId || null,
      task_id: input.taskId || null,
      evidence_url: input.evidenceUrl || null,
      status: 'pending'
    })
    .select()
    .single()
  
  if (error) {
    console.error('Error logging OTJT time:', error)
    return { error: error.message }
  }
  
  // Notify mentor for approval
  if (enrollment.senior_mentor_id) {
    await createApprovalNotification(enrollment.senior_mentor_id, log.id, input.enrollmentId)
  }
  
  revalidatePath('/apprenticeship')
  revalidatePath('/dashboard')
  
  return { success: true, log }
}

/**
 * Approve an OTJT time log
 */
export async function approveOTJTLog(logId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) return { error: 'Unauthorized' }
  
  // Verify user is a mentor for this enrollment
  const { data: log } = await supabase
    .from('otjt_time_logs')
    .select('enrollment_id')
    .eq('id', logId)
    .single()
  
  if (!log) return { error: 'Log not found' }
  
  const { data: enrollment } = await supabase
    .from('apprenticeship_enrollments')
    .select('senior_mentor_id, workplace_buddy_id')
    .eq('id', log.enrollment_id)
    .single()
  
  if (!enrollment) return { error: 'Enrollment not found' }
  
  if (enrollment.senior_mentor_id !== user.id && enrollment.workplace_buddy_id !== user.id) {
    return { error: 'Only mentors can approve OTJT logs' }
  }
  
  const { error } = await supabase
    .from('otjt_time_logs')
    .update({
      status: 'approved',
      approved_by: user.id,
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', logId)
  
  if (error) return { error: error.message }
  
  revalidatePath('/apprenticeship')
  return { success: true }
}

/**
 * Reject an OTJT time log
 */
export async function rejectOTJTLog(logId: string, reason: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) return { error: 'Unauthorized' }
  
  if (!reason || reason.trim().length === 0) {
    return { error: 'Rejection reason is required' }
  }
  
  // Verify user is a mentor for this enrollment
  const { data: log } = await supabase
    .from('otjt_time_logs')
    .select('enrollment_id')
    .eq('id', logId)
    .single()
  
  if (!log) return { error: 'Log not found' }
  
  const { data: enrollment } = await supabase
    .from('apprenticeship_enrollments')
    .select('senior_mentor_id, workplace_buddy_id, apprentice_id')
    .eq('id', log.enrollment_id)
    .single()
  
  if (!enrollment) return { error: 'Enrollment not found' }
  
  if (enrollment.senior_mentor_id !== user.id && enrollment.workplace_buddy_id !== user.id) {
    return { error: 'Only mentors can reject OTJT logs' }
  }
  
  const { error } = await supabase
    .from('otjt_time_logs')
    .update({
      status: 'rejected',
      rejection_reason: reason.trim(),
      updated_at: new Date().toISOString()
    })
    .eq('id', logId)
  
  if (error) return { error: error.message }
  
  // Notify apprentice of rejection
  await createRejectionNotification(enrollment.apprentice_id, logId, reason)
  
  revalidatePath('/apprenticeship')
  return { success: true }
}

/**
 * Query an OTJT log (ask apprentice for clarification)
 */
export async function queryOTJTLog(logId: string, message: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) return { error: 'Unauthorized' }
  
  if (!message || message.trim().length === 0) {
    return { error: 'Query message is required' }
  }
  
  const { error } = await supabase
    .from('otjt_time_logs')
    .update({
      status: 'queried',
      query_message: message.trim(),
      updated_at: new Date().toISOString()
    })
    .eq('id', logId)
  
  if (error) return { error: error.message }
  
  revalidatePath('/apprenticeship')
  return { success: true }
}

/**
 * Bulk approve multiple OTJT logs
 */
export async function bulkApproveOTJTLogs(logIds: string[]) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) return { error: 'Unauthorized' }
  
  let approved = 0
  let failed = 0
  
  for (const logId of logIds) {
    const result = await approveOTJTLog(logId)
    if (result.success) {
      approved++
    } else {
      failed++
    }
  }
  
  return { success: true, approved, failed }
}

// =============================================
// QUERYING OTJT DATA
// =============================================

/**
 * Get OTJT logs for an enrollment
 */
export async function getOTJTLogs(
  enrollmentId: string, 
  options?: { 
    startDate?: string
    endDate?: string
    status?: 'pending' | 'approved' | 'rejected' | 'queried'
    limit?: number
  }
) {
  const supabase = await createClient()
  
  let query = supabase
    .from('otjt_time_logs')
    .select(`
      *,
      module:learning_modules(title),
      task:tasks(title),
      approver:profiles!approved_by(full_name)
    `)
    .eq('enrollment_id', enrollmentId)
    .order('log_date', { ascending: false })
  
  if (options?.startDate) {
    query = query.gte('log_date', options.startDate)
  }
  if (options?.endDate) {
    query = query.lte('log_date', options.endDate)
  }
  if (options?.status) {
    query = query.eq('status', options.status)
  }
  if (options?.limit) {
    query = query.limit(options.limit)
  }
  
  const { data: logs, error } = await query
  
  if (error) {
    console.error('Error fetching OTJT logs:', error)
    return { error: error.message }
  }
  
  return { logs: logs as OTJTLog[] }
}

/**
 * Get weekly OTJT summary for an enrollment
 */
export async function getWeeklyOTJTSummary(
  enrollmentId: string, 
  weekStartDate?: string
): Promise<WeeklySummary> {
  const supabase = await createClient()
  
  // Calculate week start (Monday) and end (Sunday)
  let weekStart: Date
  if (weekStartDate) {
    weekStart = new Date(weekStartDate)
  } else {
    weekStart = new Date()
    const day = weekStart.getDay()
    const diff = weekStart.getDate() - day + (day === 0 ? -6 : 1) // Adjust for Sunday
    weekStart.setDate(diff)
  }
  weekStart.setHours(0, 0, 0, 0)
  
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 6)
  weekEnd.setHours(23, 59, 59, 999)
  
  const weekStartStr = weekStart.toISOString().split('T')[0]
  const weekEndStr = weekEnd.toISOString().split('T')[0]
  
  // Get logs for this week
  const { data: logs } = await supabase
    .from('otjt_time_logs')
    .select(`
      *,
      module:learning_modules(title),
      task:tasks(title)
    `)
    .eq('enrollment_id', enrollmentId)
    .gte('log_date', weekStartStr)
    .lte('log_date', weekEndStr)
    .order('log_date', { ascending: true })
  
  // Get weekly target from enrollment
  const { data: enrollment } = await supabase
    .from('apprenticeship_enrollments')
    .select('weekly_hours')
    .eq('id', enrollmentId)
    .single()
  
  // Calculate 20% of working hours, capped at 6 hours (based on 30-hour week cap)
  const weeklyHours = enrollment?.weekly_hours || 30
  const targetWeeklyHours = Math.min(weeklyHours * 0.2, 6)
  
  // Calculate totals
  const allLogs = (logs || []) as OTJTLog[]
  const totalHours = allLogs.reduce((sum, log) => sum + Number(log.hours), 0)
  const approvedHours = allLogs
    .filter(log => log.status === 'approved')
    .reduce((sum, log) => sum + Number(log.hours), 0)
  const pendingHours = allLogs
    .filter(log => log.status === 'pending')
    .reduce((sum, log) => sum + Number(log.hours), 0)
  const rejectedHours = allLogs
    .filter(log => log.status === 'rejected')
    .reduce((sum, log) => sum + Number(log.hours), 0)
  
  const onTrack = totalHours >= targetWeeklyHours
  const shortfall = Math.max(0, targetWeeklyHours - totalHours)
  
  return {
    logs: allLogs,
    totalHours,
    approvedHours,
    pendingHours,
    rejectedHours,
    targetWeeklyHours,
    onTrack,
    shortfall,
    weekStartDate: weekStartStr,
    weekEndDate: weekEndStr
  }
}

/**
 * Get OTJT progress summary for an enrollment
 */
export async function getOTJTProgressSummary(enrollmentId: string) {
  const supabase = await createClient()
  
  const { data: enrollment } = await supabase
    .from('apprenticeship_enrollments')
    .select('otjt_hours_logged, otjt_hours_target, start_date, expected_end_date, weekly_hours')
    .eq('id', enrollmentId)
    .single()
  
  if (!enrollment) {
    return { error: 'Enrollment not found' }
  }
  
  // Get pending approvals count
  const { count: pendingCount } = await supabase
    .from('otjt_time_logs')
    .select('*', { count: 'exact', head: true })
    .eq('enrollment_id', enrollmentId)
    .eq('status', 'pending')
  
  // Calculate expected progress based on time elapsed
  const startDate = new Date(enrollment.start_date)
  const endDate = new Date(enrollment.expected_end_date)
  const now = new Date()
  
  const totalDuration = endDate.getTime() - startDate.getTime()
  const elapsed = Math.max(0, now.getTime() - startDate.getTime())
  const expectedProgressPercent = Math.min(100, (elapsed / totalDuration) * 100)
  
  const actualProgressPercent = (enrollment.otjt_hours_logged / enrollment.otjt_hours_target) * 100
  
  // On track if within 10% of expected progress
  const onTrack = actualProgressPercent >= (expectedProgressPercent * 0.9)
  
  // Calculate weekly metrics
  const weeklyTarget = Math.min((enrollment.weekly_hours || 30) * 0.2, 6)
  const weeksElapsed = Math.floor(elapsed / (7 * 24 * 60 * 60 * 1000))
  const expectedHours = weeklyTarget * weeksElapsed
  
  return {
    hoursLogged: enrollment.otjt_hours_logged,
    hoursTarget: enrollment.otjt_hours_target,
    hoursRemaining: enrollment.otjt_hours_target - enrollment.otjt_hours_logged,
    progressPercent: Math.round(actualProgressPercent * 10) / 10,
    expectedProgressPercent: Math.round(expectedProgressPercent * 10) / 10,
    onTrack,
    pendingApprovals: pendingCount || 0,
    weeklyTarget,
    expectedHoursByNow: Math.round(expectedHours * 10) / 10,
    aheadBehindHours: Math.round((enrollment.otjt_hours_logged - expectedHours) * 10) / 10
  }
}

/**
 * Get pending OTJT approvals for a mentor
 */
export async function getPendingOTJTApprovals() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) return { error: 'Unauthorized' }
  
  // Get enrollments where user is mentor
  const { data: enrollments } = await supabase
    .from('apprenticeship_enrollments')
    .select('id')
    .or(`senior_mentor_id.eq.${user.id},workplace_buddy_id.eq.${user.id}`)
  
  if (!enrollments || enrollments.length === 0) {
    return { logs: [] }
  }
  
  const enrollmentIds = enrollments.map(e => e.id)
  
  const { data: logs, error } = await supabase
    .from('otjt_time_logs')
    .select(`
      *,
      enrollment:apprenticeship_enrollments(
        apprentice:profiles!apprentice_id(full_name, avatar_url),
        programme:apprenticeship_programmes(title)
      ),
      module:learning_modules(title),
      task:tasks(title)
    `)
    .in('enrollment_id', enrollmentIds)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
  
  if (error) {
    console.error('Error fetching pending approvals:', error)
    return { error: error.message }
  }
  
  return { logs }
}

// =============================================
// HELPER FUNCTIONS
// =============================================

async function createApprovalNotification(
  mentorId: string, 
  logId: string, 
  enrollmentId: string
) {
  const supabase = await createClient()
  
  // Check if notifications table exists
  try {
    await supabase.from('notifications').insert({
      user_id: mentorId,
      type: 'otjt_approval_required',
      title: 'OTJT Hours Pending Approval',
      message: 'An apprentice has logged training hours that need your approval.',
      data: { log_id: logId, enrollment_id: enrollmentId },
      read: false
    })
  } catch (error) {
    // Notifications table may not exist, silently fail
    console.log('Could not create notification:', error)
  }
}

async function createRejectionNotification(
  apprenticeId: string,
  logId: string,
  reason: string
) {
  const supabase = await createClient()
  
  try {
    await supabase.from('notifications').insert({
      user_id: apprenticeId,
      type: 'otjt_rejected',
      title: 'OTJT Log Rejected',
      message: `Your OTJT log was rejected: ${reason}`,
      data: { log_id: logId },
      read: false
    })
  } catch (error) {
    console.log('Could not create notification:', error)
  }
}

// NOTE: ACTIVITY_TYPE_LABELS is exported from @/types/apprenticeship
