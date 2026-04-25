'use server'

/**
 * @file actions/project-techniques.ts
 *
 * @description Server actions for the Manufacturing Techniques stickiness rebuild.
 *
 * Levers:
 *   1. project_techniques — save a technique to a project
 *   2. project_technique_annotations — project-scoped notes per saved technique
 *   4. technique_questions + technique_answers — per-technique Q&A feed
 *
 * All actions are authenticated and foundry-scoped.
 * RLS on the tables provides defence-in-depth.
 *
 * @security withAuth provides { supabase, user, foundryId }.
 *   Every query that touches project_techniques also verifies the project
 *   belongs to the caller's foundry so cross-foundry reads are impossible
 *   even if RLS policy logic changes.
 */

import { withAuth } from '@/lib/server-action-utils'

// ---------------------------------------------------------------------------
// Lever 1 — saved-per-project techniques
// ---------------------------------------------------------------------------

export interface ProjectTechnique {
  id: string
  project_id: string
  technique_id: string
  technique_title: string
  saved_by_user_id: string
  created_at: string
}

/**
 * List all techniques saved to a project.
 *
 * @param projectId - The project identifier
 */
export async function getProjectTechniques(projectId: string): Promise<{
  data: ProjectTechnique[]
  error?: string
}> {
  return withAuth(async ({ supabase, foundryId }) => {
    // Verify project belongs to this foundry before exposing data
    const { data: project } = await supabase
      .from('cad_lab_projects')
      .select('id')
      .eq('id', projectId)
      .eq('foundry_id', foundryId)
      .single()

    if (!project) return { data: [], error: 'Project not found' }

    const { data, error } = await supabase
      .from('project_techniques')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[project-techniques] getProjectTechniques failed:', error)
      return { data: [], error: error.message }
    }

    return { data: (data ?? []) as ProjectTechnique[] }
  })
}

/**
 * Save a technique to a project. Idempotent — re-saving an already-saved
 * technique returns success without creating a duplicate (unique constraint
 * on project_id + technique_id handled as success).
 *
 * @param projectId - The project identifier
 * @param techniqueId - The technique slug, e.g. "fdm"
 * @param techniqueTitle - Denormalised display title
 */
export async function saveProjectTechnique(
  projectId: string,
  techniqueId: string,
  techniqueTitle: string,
): Promise<{ data: ProjectTechnique | null; error?: string }> {
  return withAuth(async ({ supabase, user, foundryId }) => {
    // Verify project ownership
    const { data: project } = await supabase
      .from('cad_lab_projects')
      .select('id')
      .eq('id', projectId)
      .eq('foundry_id', foundryId)
      .single()

    if (!project) return { data: null, error: 'Project not found' }

    const { data, error } = await supabase
      .from('project_techniques')
      .upsert(
        {
          project_id: projectId,
          technique_id: techniqueId,
          technique_title: techniqueTitle,
          saved_by_user_id: user.id,
        },
        { onConflict: 'project_id,technique_id', ignoreDuplicates: false },
      )
      .select()
      .single()

    if (error) {
      console.error('[project-techniques] saveProjectTechnique failed:', error)
      return { data: null, error: error.message }
    }

    return { data: data as ProjectTechnique }
  })
}

/**
 * Remove a saved technique from a project.
 *
 * @param projectId - The project identifier
 * @param techniqueId - The technique slug to remove
 */
export async function removeProjectTechnique(
  projectId: string,
  techniqueId: string,
): Promise<{ error?: string }> {
  return withAuth(async ({ supabase, foundryId }) => {
    // Verify project ownership
    const { data: project } = await supabase
      .from('cad_lab_projects')
      .select('id')
      .eq('id', projectId)
      .eq('foundry_id', foundryId)
      .single()

    if (!project) return { error: 'Project not found' }

    const { error } = await supabase
      .from('project_techniques')
      .delete()
      .eq('project_id', projectId)
      .eq('technique_id', techniqueId)

    if (error) {
      console.error('[project-techniques] removeProjectTechnique failed:', error)
      return { error: error.message }
    }

    return {}
  })
}

// ---------------------------------------------------------------------------
// Lever 2 — project-scoped annotations
// ---------------------------------------------------------------------------

export interface ProjectTechniqueAnnotation {
  id: string
  project_technique_id: string
  author_user_id: string
  note: string
  created_at: string
  updated_at: string
}

/**
 * List all annotations for a saved-project-technique row.
 *
 * @param projectTechniqueId - The project_techniques row ID
 */
export async function getAnnotations(projectTechniqueId: string): Promise<{
  data: ProjectTechniqueAnnotation[]
  error?: string
}> {
  return withAuth(async ({ supabase }) => {
    const { data, error } = await supabase
      .from('project_technique_annotations')
      .select('*')
      .eq('project_technique_id', projectTechniqueId)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('[project-techniques] getAnnotations failed:', error)
      return { data: [], error: error.message }
    }

    return { data: (data ?? []) as ProjectTechniqueAnnotation[] }
  })
}

/**
 * Add an annotation note to a saved technique.
 *
 * @param projectTechniqueId - The project_techniques row ID
 * @param note - The note text
 */
export async function addAnnotation(
  projectTechniqueId: string,
  note: string,
): Promise<{ data: ProjectTechniqueAnnotation | null; error?: string }> {
  if (!note.trim()) return { data: null, error: 'Note cannot be empty' }

  return withAuth(async ({ supabase, user }) => {
    const { data, error } = await supabase
      .from('project_technique_annotations')
      .insert({
        project_technique_id: projectTechniqueId,
        author_user_id: user.id,
        note: note.trim(),
      })
      .select()
      .single()

    if (error) {
      console.error('[project-techniques] addAnnotation failed:', error)
      return { data: null, error: error.message }
    }

    return { data: data as ProjectTechniqueAnnotation }
  })
}

/**
 * Update the text of an existing annotation.
 * Only the original author can update their own annotations (enforced by RLS).
 *
 * @param annotationId - The annotation row ID
 * @param note - The updated note text
 */
export async function updateAnnotation(
  annotationId: string,
  note: string,
): Promise<{ data: ProjectTechniqueAnnotation | null; error?: string }> {
  if (!note.trim()) return { data: null, error: 'Note cannot be empty' }

  return withAuth(async ({ supabase }) => {
    const { data, error } = await supabase
      .from('project_technique_annotations')
      .update({ note: note.trim() })
      .eq('id', annotationId)
      .select()
      .single()

    if (error) {
      console.error('[project-techniques] updateAnnotation failed:', error)
      return { data: null, error: error.message }
    }

    return { data: data as ProjectTechniqueAnnotation }
  })
}

/**
 * Delete an annotation.
 *
 * @param annotationId - The annotation row ID
 */
export async function deleteAnnotation(annotationId: string): Promise<{ error?: string }> {
  return withAuth(async ({ supabase }) => {
    const { error } = await supabase
      .from('project_technique_annotations')
      .delete()
      .eq('id', annotationId)

    if (error) {
      console.error('[project-techniques] deleteAnnotation failed:', error)
      return { error: error.message }
    }

    return {}
  })
}

// ---------------------------------------------------------------------------
// Lever 4 — Q&A feed
// ---------------------------------------------------------------------------

export interface TechniqueQuestion {
  id: string
  technique_id: string
  project_id: string | null
  asker_user_id: string
  question: string
  status: 'queued' | 'answered' | 'closed'
  created_at: string
  answers?: TechniqueAnswer[]
}

export interface TechniqueAnswer {
  id: string
  question_id: string
  author_user_id: string | null
  specialist_id: string | null
  answer: string
  created_at: string
}

/**
 * Fetch all questions for a technique, including their answers.
 *
 * @param techniqueId - The technique slug
 */
export async function getTechniqueQuestions(techniqueId: string): Promise<{
  data: TechniqueQuestion[]
  error?: string
}> {
  return withAuth(async ({ supabase }) => {
    const { data, error } = await supabase
      .from('technique_questions')
      .select(`
        *,
        answers:technique_answers(*)
      `)
      .eq('technique_id', techniqueId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[project-techniques] getTechniqueQuestions failed:', error)
      return { data: [], error: error.message }
    }

    return {
      data: (data ?? []).map(row => ({
        ...row,
        answers: (row.answers ?? []) as TechniqueAnswer[],
      })) as TechniqueQuestion[],
    }
  })
}

/**
 * Submit a new question about a technique.
 *
 * @param techniqueId - The technique slug
 * @param question - The question text
 * @param projectId - Optional: associate with a specific project
 */
export async function askTechniqueQuestion(
  techniqueId: string,
  question: string,
  projectId?: string,
): Promise<{ data: TechniqueQuestion | null; error?: string }> {
  if (!question.trim()) return { data: null, error: 'Question cannot be empty' }

  return withAuth(async ({ supabase, user }) => {
    const { data, error } = await supabase
      .from('technique_questions')
      .insert({
        technique_id: techniqueId,
        project_id: projectId ?? null,
        asker_user_id: user.id,
        question: question.trim(),
        status: 'queued',
      })
      .select()
      .single()

    if (error) {
      console.error('[project-techniques] askTechniqueQuestion failed:', error)
      return { data: null, error: error.message }
    }

    return { data: data as TechniqueQuestion }
  })
}
