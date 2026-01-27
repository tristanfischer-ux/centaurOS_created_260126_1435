'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'

export async function createSampleData() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) return { error: 'Unauthorized' }
  
  // Get user's foundry using cached helper
  const foundry_id = await getFoundryIdCached()
  if (!foundry_id) return { error: 'User not in a foundry' }
  
  // Create sample objective
  const { data: objective, error: objError } = await supabase
    .from('objectives')
    .insert({
      title: 'Sample Objective: Q1 Goals',
      description: 'This is a sample objective to help you get started. Feel free to edit or delete it.',
      creator_id: user.id,
      foundry_id
    })
    .select()
    .single()
  
  if (objError) return { error: objError.message }
  
  // Create sample tasks
  const sampleTasks = [
    { title: 'Review project requirements', description: 'Go through the initial requirements document' },
    { title: 'Set up development environment', description: 'Install necessary tools and dependencies' },
    { title: 'Create project timeline', description: 'Define milestones and deadlines' }
  ]
  
  for (const task of sampleTasks) {
    await supabase.from('tasks').insert({
      ...task,
      objective_id: objective.id,
      creator_id: user.id,
      assignee_id: user.id,
      foundry_id,
      status: 'Pending',
      risk_level: 'Medium'
    })
  }
  
  revalidatePath('/objectives')
  revalidatePath('/tasks')
  
  return { success: true }
}
