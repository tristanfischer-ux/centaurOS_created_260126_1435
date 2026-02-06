'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'
import { sanitizeErrorMessage } from '@/lib/security/sanitize'
import type {
  ReviewGate,
  CreateReviewGateInput,
  SubmitReviewInput,
  ReviewGateStatus,
} from '@/types/review-gates'

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Get all review gates for a specific task
 */
export async function getReviewGatesForTask(
  taskId: string
): Promise<{ data: ReviewGate[]; error: string | null }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: [], error: 'Not authenticated' }

    const { data, error } = await supabase
      .from('review_gates')
      .select(`
        *,
        reviewer:profiles!review_gates_reviewer_id_fkey(id, full_name, avatar_url, role),
        created_by_profile:profiles!review_gates_created_by_fkey(id, full_name)
      `)
      .eq('task_id', taskId)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Error fetching review gates for task:', error)
      return { data: [], error: sanitizeErrorMessage(error) }
    }

    return { data: (data || []) as ReviewGate[], error: null }
  } catch (err) {
    console.error('Failed to fetch review gates:', err)
    return { data: [], error: 'Failed to fetch review gates' }
  }
}

/**
 * Get all review gates for a specific objective
 */
export async function getReviewGatesForObjective(
  objectiveId: string
): Promise<{ data: ReviewGate[]; error: string | null }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: [], error: 'Not authenticated' }

    const { data, error } = await supabase
      .from('review_gates')
      .select(`
        *,
        reviewer:profiles!review_gates_reviewer_id_fkey(id, full_name, avatar_url, role),
        created_by_profile:profiles!review_gates_created_by_fkey(id, full_name)
      `)
      .eq('objective_id', objectiveId)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Error fetching review gates for objective:', error)
      return { data: [], error: sanitizeErrorMessage(error) }
    }

    return { data: (data || []) as ReviewGate[], error: null }
  } catch (err) {
    console.error('Failed to fetch review gates:', err)
    return { data: [], error: 'Failed to fetch review gates' }
  }
}

/**
 * Get all pending reviews for the current user (as reviewer)
 */
export async function getPendingReviews(): Promise<{
  data: ReviewGate[]
  error: string | null
}> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: [], error: 'Not authenticated' }

    const foundryId = await getFoundryIdCached()
    if (!foundryId) return { data: [], error: 'No foundry context' }

    const { data, error } = await supabase
      .from('review_gates')
      .select(`
        *,
        reviewer:profiles!review_gates_reviewer_id_fkey(id, full_name, avatar_url, role),
        created_by_profile:profiles!review_gates_created_by_fkey(id, full_name)
      `)
      .eq('foundry_id', foundryId)
      .in('status', ['pending', 'in_review'])
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Error fetching pending reviews:', error)
      return { data: [], error: sanitizeErrorMessage(error) }
    }

    return { data: (data || []) as ReviewGate[], error: null }
  } catch (err) {
    console.error('Failed to fetch pending reviews:', err)
    return { data: [], error: 'Failed to fetch pending reviews' }
  }
}

/**
 * Get review gate stats for the dashboard
 */
export async function getReviewGateStats(): Promise<{
  data: { total: number; pending: number; approved: number; rejected: number } | null
  error: string | null
}> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const foundryId = await getFoundryIdCached()
    if (!foundryId) return { data: null, error: 'No foundry context' }

    const { data, error } = await supabase
      .from('review_gates')
      .select('status')
      .eq('foundry_id', foundryId)

    if (error) {
      console.error('Error fetching review gate stats:', error)
      return { data: null, error: sanitizeErrorMessage(error) }
    }

    const gates = data || []
    return {
      data: {
        total: gates.length,
        pending: gates.filter((g) => g.status === 'pending' || g.status === 'in_review').length,
        approved: gates.filter((g) => g.status === 'approved').length,
        rejected: gates.filter((g) => g.status === 'rejected').length,
      },
      error: null,
    }
  } catch (err) {
    console.error('Failed to fetch review gate stats:', err)
    return { data: null, error: 'Failed to fetch review gate stats' }
  }
}

// ============================================================================
// MUTATIONS
// ============================================================================

/**
 * Create a new review gate on a task or objective
 */
export async function createReviewGate(
  input: CreateReviewGateInput
): Promise<{ data: ReviewGate | null; error: string | null }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const foundryId = await getFoundryIdCached()
    if (!foundryId) return { data: null, error: 'No foundry context' }

    // Validate: must have either task_id or objective_id
    if (!input.task_id && !input.objective_id) {
      return { data: null, error: 'A review gate must be attached to a task or objective' }
    }

    const { data, error } = await supabase
      .from('review_gates')
      .insert({
        foundry_id: foundryId,
        task_id: input.task_id || null,
        objective_id: input.objective_id || null,
        gate_type: input.gate_type,
        title: input.title,
        description: input.description || null,
        required_skills: input.required_skills || [],
        sector: input.sector || null,
        reviewer_id: input.reviewer_id || null,
        status: 'pending' as ReviewGateStatus,
        created_by: user.id,
      })
      .select(`
        *,
        reviewer:profiles!review_gates_reviewer_id_fkey(id, full_name, avatar_url, role),
        created_by_profile:profiles!review_gates_created_by_fkey(id, full_name)
      `)
      .single()

    if (error) {
      console.error('Error creating review gate:', error)
      return { data: null, error: sanitizeErrorMessage(error) }
    }

    // Revalidate relevant paths
    if (input.task_id) revalidatePath('/tasks')
    if (input.objective_id) revalidatePath('/objectives')
    revalidatePath('/updates')

    return { data: data as ReviewGate, error: null }
  } catch (err) {
    console.error('Failed to create review gate:', err)
    return { data: null, error: 'Failed to create review gate' }
  }
}

/**
 * Submit a review decision (approve, reject, or waive)
 */
export async function submitReview(
  input: SubmitReviewInput
): Promise<{ data: ReviewGate | null; error: string | null }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const { data, error } = await supabase
      .from('review_gates')
      .update({
        status: input.status,
        review_notes: input.review_notes || null,
        reviewed_at: new Date().toISOString(),
        reviewer_id: user.id,
      })
      .eq('id', input.gate_id)
      .select(`
        *,
        reviewer:profiles!review_gates_reviewer_id_fkey(id, full_name, avatar_url, role),
        created_by_profile:profiles!review_gates_created_by_fkey(id, full_name)
      `)
      .single()

    if (error) {
      console.error('Error submitting review:', error)
      return { data: null, error: sanitizeErrorMessage(error) }
    }

    revalidatePath('/tasks')
    revalidatePath('/objectives')
    revalidatePath('/updates')

    return { data: data as ReviewGate, error: null }
  } catch (err) {
    console.error('Failed to submit review:', err)
    return { data: null, error: 'Failed to submit review' }
  }
}

/**
 * Assign a reviewer to a review gate
 */
export async function assignReviewer(
  gateId: string,
  reviewerId: string
): Promise<{ error: string | null }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated' }

    const { error } = await supabase
      .from('review_gates')
      .update({
        reviewer_id: reviewerId,
        status: 'in_review' as ReviewGateStatus,
      })
      .eq('id', gateId)

    if (error) {
      console.error('Error assigning reviewer:', error)
      return { error: sanitizeErrorMessage(error) }
    }

    revalidatePath('/tasks')
    revalidatePath('/updates')

    return { error: null }
  } catch (err) {
    console.error('Failed to assign reviewer:', err)
    return { error: 'Failed to assign reviewer' }
  }
}
