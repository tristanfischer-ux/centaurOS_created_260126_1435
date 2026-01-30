'use server'
// @ts-nocheck - Database types out of sync

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'

/**
 * Get all available apprentices from the Guild pool
 * These are apprentices in the "centaur-guild" foundry who can be assigned to projects
 */
export async function getGuildApprentices(): Promise<{
  apprentices: Array<{
    id: string
    fullName: string
    email: string
    avatarUrl: string | null
    bio: string | null
    skills: string[]
    activeAssignments: number
  }>
  error?: string
}> {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { apprentices: [], error: 'Unauthorized' }
  }
  
  // Verify user is a Founder or Executive
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, foundry_id')
    .eq('id', user.id)
    .single()
  
  if (!profile || (profile.role !== 'Founder' && profile.role !== 'Executive')) {
    return { apprentices: [], error: 'Only Founders and Executives can browse the Guild pool' }
  }
  
  // Get apprentices from the Guild
  const { data: apprentices, error } = await supabase
    .from('profiles')
    .select(`
      id,
      full_name,
      email,
      avatar_url,
      bio,
      skills
    `)
    .eq('foundry_id', 'centaur-guild')
    .eq('role', 'Apprentice')
    .order('full_name')
  
  if (error) {
    console.error('Failed to fetch guild apprentices:', error)
    return { apprentices: [], error: 'Failed to load apprentices' }
  }
  
  // Get active assignment counts for each apprentice
  const apprenticeIds = apprentices?.map(a => a.id) || []
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: assignments } = await (supabase as any)
    .from('project_assignments')
    .select('apprentice_id')
    .in('apprentice_id', apprenticeIds)
    .eq('status', 'active')
  
  const assignmentCounts = new Map<string, number>()
  assignments?.forEach(a => {
    assignmentCounts.set(a.apprentice_id, (assignmentCounts.get(a.apprentice_id) || 0) + 1)
  })
  
  return {
    apprentices: (apprentices || []).map(a => ({
      id: a.id,
      fullName: a.full_name || 'Unknown',
      email: a.email,
      avatarUrl: a.avatar_url,
      bio: a.bio,
      skills: a.skills || [],
      activeAssignments: assignmentCounts.get(a.id) || 0
    }))
  }
}

/**
 * Assign a Guild apprentice to a project
 */
export async function assignApprenticeToProject(
  apprenticeId: string,
  projectName: string,
  projectDescription?: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: 'Unauthorized' }
  }
  
  // Verify user is a Founder or Executive
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, foundry_id')
    .eq('id', user.id)
    .single()
  
  if (!profile || (profile.role !== 'Founder' && profile.role !== 'Executive')) {
    return { success: false, error: 'Only Founders and Executives can assign apprentices' }
  }
  
  // Verify the apprentice is in the Guild
  const { data: apprentice } = await supabase
    .from('profiles')
    .select('id, foundry_id, role')
    .eq('id', apprenticeId)
    .single()
  
  if (!apprentice) {
    return { success: false, error: 'Apprentice not found' }
  }
  
  if (apprentice.foundry_id !== 'centaur-guild' || apprentice.role !== 'Apprentice') {
    return { success: false, error: 'Only Guild apprentices can be assigned to projects' }
  }
  
  // Get the user's foundry ID
  const foundryId = profile.foundry_id
  
  // Get the foundry UUID (since foundry_id might be a string)
  const { data: foundry } = await supabase
    .from('foundries')
    .select('id')
    .eq('id', foundryId)
    .single()
  
  if (!foundry) {
    return { success: false, error: 'Your company is not properly set up' }
  }
  
  // Create the assignment
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('project_assignments')
    .insert({
      apprentice_id: apprenticeId,
      foundry_id: foundry.id,
      project_name: projectName,
      project_description: projectDescription || null,
      assigned_by: user.id,
      status: 'active'
    })
  
  if (error) {
    console.error('Failed to create assignment:', error)
    return { success: false, error: 'Failed to assign apprentice' }
  }
  
  revalidatePath('/team')
  revalidatePath('/guild')
  
  return { success: true }
}

/**
 * Get project assignments for the current foundry
 */
export async function getFoundryAssignments(): Promise<{
  assignments: Array<{
    id: string
    apprenticeId: string
    apprenticeName: string
    apprenticeEmail: string
    projectName: string
    projectDescription: string | null
    status: string
    startedAt: string
    endedAt: string | null
  }>
  error?: string
}> {
  const supabase = await createClient()
  
  const foundryId = await getFoundryIdCached()
  if (!foundryId) {
    return { assignments: [], error: 'Not in a foundry' }
  }
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('project_assignments')
    .select(`
      id,
      apprentice_id,
      project_name,
      project_description,
      status,
      started_at,
      ended_at,
      profiles!project_assignments_apprentice_id_fkey(full_name, email)
    `)
    .eq('foundry_id', foundryId)
    .order('started_at', { ascending: false })
  
  if (error) {
    console.error('Failed to fetch assignments:', error)
    return { assignments: [], error: 'Failed to load assignments' }
  }
  
  return {
    assignments: (data || []).map(a => ({
      id: a.id,
      apprenticeId: a.apprentice_id,
      apprenticeName: (a.profiles as any)?.full_name || 'Unknown',
      apprenticeEmail: (a.profiles as any)?.email || '',
      projectName: a.project_name || 'Unnamed Project',
      projectDescription: a.project_description,
      status: a.status,
      startedAt: a.started_at,
      endedAt: a.ended_at
    }))
  }
}

/**
 * Get assignments for the current apprentice (if they're an apprentice)
 */
export async function getMyAssignments(): Promise<{
  assignments: Array<{
    id: string
    foundryName: string
    projectName: string
    projectDescription: string | null
    status: string
    startedAt: string
    assignedByName: string
  }>
  error?: string
}> {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { assignments: [], error: 'Unauthorized' }
  }
  
  // Verify user is an apprentice
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  
  if (!profile || profile.role !== 'Apprentice') {
    return { assignments: [], error: 'Only apprentices have project assignments' }
  }
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('project_assignments')
    .select(`
      id,
      foundry_id,
      project_name,
      project_description,
      status,
      started_at,
      assigned_by,
      foundries!project_assignments_foundry_id_fkey(name),
      profiles!project_assignments_assigned_by_fkey(full_name)
    `)
    .eq('apprentice_id', user.id)
    .order('started_at', { ascending: false })
  
  if (error) {
    console.error('Failed to fetch my assignments:', error)
    return { assignments: [], error: 'Failed to load assignments' }
  }
  
  return {
    assignments: (data || []).map(a => ({
      id: a.id,
      foundryName: (a.foundries as any)?.name || 'Unknown Company',
      projectName: a.project_name || 'Unnamed Project',
      projectDescription: a.project_description,
      status: a.status,
      startedAt: a.started_at,
      assignedByName: (a.profiles as any)?.full_name || 'Unknown'
    }))
  }
}

/**
 * Update assignment status (complete or cancel)
 */
export async function updateAssignmentStatus(
  assignmentId: string,
  status: 'completed' | 'cancelled'
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: 'Unauthorized' }
  }
  
  const foundryId = await getFoundryIdCached()
  if (!foundryId) {
    return { success: false, error: 'Not in a foundry' }
  }
  
  // Verify user has permission (Founder/Executive of the foundry)
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  
  if (!profile || (profile.role !== 'Founder' && profile.role !== 'Executive')) {
    return { success: false, error: 'Only Founders and Executives can update assignments' }
  }
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('project_assignments')
    .update({
      status,
      ended_at: new Date().toISOString()
    })
    .eq('id', assignmentId)
    .eq('foundry_id', foundryId)
  
  if (error) {
    console.error('Failed to update assignment:', error)
    return { success: false, error: 'Failed to update assignment' }
  }
  
  revalidatePath('/team')
  revalidatePath('/guild')
  
  return { success: true }
}
