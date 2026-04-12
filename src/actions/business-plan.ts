"use server"

import { createClient } from '@/lib/supabase/server'
import { withAuth } from '@/lib/server-action-utils'
import type {
  BusinessPlanAnalysis,
  MergeReviewState,
  SavedHiringRequirement,
  SavedFundingRequirement,
} from '@/lib/business-plan-types'
import { sanitizeErrorMessage } from '@/lib/security/sanitize'

// INTENT: Save the raw AI analysis to the DB so we can reference it
// when creating hiring/funding records and support re-analysis history.
/**
 * @description Persists a business plan analysis result to the database.
 * @param analysis - The parsed AI analysis output
 * @param fileName - Original file name for reference
 * @returns The new analysis record ID or an error
 */
export async function saveBusinessPlanAnalysis(
  analysis: BusinessPlanAnalysis,
  fileName: string
): Promise<{ analysisId?: string; error?: string }> {
  return withAuth(async ({ user }) => {
    const supabase = await createClient()

    const { data: profile } = await supabase
      .from('profiles')
      .select('foundry_id')
      .eq('id', user.id)
      .single()

    if (!profile?.foundry_id) return { error: 'No foundry found' }

    const { data, error } = await supabase
      .from('business_plan_analyses')
      .insert({
        foundry_id: profile.foundry_id,
        file_name: fileName,
        analysis_json: JSON.parse(JSON.stringify(analysis)),
        created_by: user.id,
      })
      .select('id')
      .single()

    if (error) {
      console.error('[business-plan] Failed to save analysis:', {
        error: error.message,
        foundryId: profile.foundry_id,
      })
      return { error: 'Failed to save analysis' }
    }

    return { analysisId: data.id }
  })
}

// INTENT: Smart merge compares the AI-suggested objectives against what
// the foundry already has. Returns a MergeReviewState the user can
// review and selectively adopt.
/**
 * @description Compares AI-suggested objectives against existing ones using
 * Jaccard word-overlap similarity, returning a merge review state.
 * @param analysis - The AI analysis output
 * @param analysisId - The saved analysis record ID
 * @returns A MergeReviewState for the review dialog
 */
export async function buildSmartMerge(
  analysis: BusinessPlanAnalysis,
  analysisId: string
): Promise<{ mergeState?: MergeReviewState; error?: string }> {
  return withAuth(async ({ user }) => {
    const supabase = await createClient()

    const { data: profile } = await supabase
      .from('profiles')
      .select('foundry_id')
      .eq('id', user.id)
      .single()

    if (!profile?.foundry_id) return { error: 'No foundry found' }

    const { data: existingObjectives } = await supabase
      .from('objectives')
      .select('id, title')
      .eq('foundry_id', profile.foundry_id)
      .eq('is_ghost', false)
      .is('deleted_at', null)

    const existing = existingObjectives || []

    // DECISION: Using word-overlap (Jaccard coefficient) for similarity.
    // This avoids an AI embedding call per objective which would be slow
    // and expensive. For objective titles (typically 5-10 words), word
    // overlap is surprisingly effective.
    // GOTCHA: We filter stopwords (the, and, for, etc.) not by length,
    // because short domain terms like "AI", "ML", "VR", "IoT" are critical.
    const STOPWORDS = new Set([
      'the', 'and', 'for', 'with', 'from', 'that', 'this', 'into', 'our',
      'your', 'will', 'can', 'are', 'was', 'has', 'have', 'been', 'not',
    ])
    function jaccardSimilarity(a: string, b: string): number {
      const tokenize = (s: string): Set<string> =>
        new Set(s.toLowerCase().split(/\s+/).filter(w => w.length > 0 && !STOPWORDS.has(w)))
      const setA = tokenize(a)
      const setB = tokenize(b)
      const intersection = new Set([...setA].filter(x => setB.has(x)))
      const union = new Set([...setA, ...setB])
      if (union.size === 0) return 0
      return intersection.size / union.size
    }

    const SIMILARITY_THRESHOLD = 0.35

    console.log('[buildSmartMerge] analysis.objectives count:', analysis.objectives.length)
    console.log('[buildSmartMerge] existing objectives count:', existing.length)

    const suggestions = analysis.objectives.map((aiObj, index) => {
      let bestMatch: { id: string; title: string; similarity: number } | null = null

      for (const existingObj of existing) {
        const similarity = jaccardSimilarity(aiObj.title, existingObj.title)
        if (similarity > SIMILARITY_THRESHOLD) {
          if (!bestMatch || similarity > bestMatch.similarity) {
            bestMatch = { id: existingObj.id, title: existingObj.title, similarity }
          }
        }
      }

      return {
        id: `suggestion-${index}`,
        aiObjective: aiObj,
        existingObjectiveId: bestMatch?.id,
        existingObjectiveTitle: bestMatch?.title,
        similarity: bestMatch?.similarity,
        disposition: bestMatch ? ('merge' as const) : ('adopt' as const),
      }
    })

    return {
      mergeState: {
        objectiveSuggestions: suggestions,
        hiringRequirements: analysis.hiringRequirements,
        capacityRequirements: analysis.capacityRequirements,
        fundingRequirements: analysis.fundingRequirements,
        extractedProducts: analysis.products ?? [],
        analysisId,
      },
    }
  })
}

// INTENT: Apply adopted/merged suggestions from the review dialog.
// Creates objectives+tasks, hiring requirements, and funding requirements
// in the DB based on what the user accepted.
/**
 * @description Writes the user-approved merge review to the database,
 * creating objectives, tasks, hiring requirements, and funding events.
 * @param mergeState - The final merge state after user review
 * @returns An error string if something failed, empty object on success
 */
export async function applyMergeReview(
  mergeState: MergeReviewState
): Promise<{ error?: string; warnings?: string[] }> {
  return withAuth(async ({ user }) => {
    const supabase = await createClient()

    const { data: profile } = await supabase
      .from('profiles')
      .select('foundry_id')
      .eq('id', user.id)
      .single()

    if (!profile?.foundry_id) return { error: 'No foundry found' }
    const foundryId = profile.foundry_id

    const warnings: string[] = []
    const objectiveIdMap: Record<string, string> = {}

    for (const suggestion of mergeState.objectiveSuggestions) {
      if (suggestion.disposition === 'skip') continue

      if (suggestion.disposition === 'adopt') {
        // DECISION: Imported objectives are strategic goals so they appear on
        // the Strategy page. Previously set to false — objectives were invisible
        // because Strategy only shows is_strategic_goal=true.
        const { data: newObj, error: objError } = await supabase
          .from('objectives')
          .insert({
            foundry_id: foundryId,
            creator_id: user.id,
            title: suggestion.aiObjective.title,
            description: suggestion.aiObjective.description,
            is_strategic_goal: true,
            start_date: suggestion.aiObjective.suggestedStartDate || null,
            end_date: suggestion.aiObjective.suggestedEndDate || null,
            status: 'Not Started',
          })
          .select('id')
          .single()

        if (objError) {
          console.error('[business-plan] Failed to create objective:', {
            title: suggestion.aiObjective.title,
            error: objError.message,
          })
          warnings.push(`Failed to create objective "${suggestion.aiObjective.title}"`)
          continue
        }

        if (newObj) {
          objectiveIdMap[suggestion.aiObjective.title] = newObj.id

          // DECISION: Create each AI "task" as a child objective under the
          // strategic goal, then create a task under that child objective.
          // The Strategy River needs child objectives (not just tasks) to
          // render the river visualization with tributaries.
          for (const task of suggestion.aiObjective.tasks) {
            // DECISION: Pass task-level dates to child objectives so the
            // Strategy River renders properly with staggered timelines.
            const { data: childObj } = await supabase
              .from('objectives')
              .insert({
                foundry_id: foundryId,
                creator_id: user.id,
                title: task.title,
                description: task.description,
                is_strategic_goal: false,
                parent_objective_id: newObj.id,
                start_date: task.suggestedStartDate || suggestion.aiObjective.suggestedStartDate || null,
                end_date: task.suggestedEndDate || suggestion.aiObjective.suggestedEndDate || null,
                status: 'Not Started',
              })
              .select('id')
              .single()

            if (childObj) {
              await supabase.from('tasks').insert({
                foundry_id: foundryId,
                creator_id: user.id,
                objective_id: childObj.id,
                title: task.title,
                description: task.description || `${task.role ?? 'Executive'} task`,
                status: 'Pending',
              })
            }
          }
        }
      } else if (suggestion.disposition === 'merge' && suggestion.existingObjectiveId) {
        objectiveIdMap[suggestion.aiObjective.title] = suggestion.existingObjectiveId
      }
    }

    if (mergeState.hiringRequirements.length > 0) {
      const hiringInserts = mergeState.hiringRequirements.map(hr => ({
        foundry_id: foundryId,
        analysis_id: mergeState.analysisId,
        role_title: hr.roleTitle,
        role_type: hr.roleType,
        reason: hr.reason,
        linked_objective_id: objectiveIdMap[hr.linkedObjectiveTitle] || null,
        ai_suggested_date: hr.suggestedDate || null,
        status: 'planned' as const,
      }))

      const { error } = await supabase.from('hiring_requirements').insert(hiringInserts)
      if (error) {
        console.error('[business-plan] Failed to insert hiring requirements:', {
          error: error.message,
          count: hiringInserts.length,
        })
        warnings.push(`Failed to save ${hiringInserts.length} hiring requirement(s)`)
      }

      // DECISION: Also create tasks for each hire so they appear as actionable
      // items on the Tasks page. Hiring requirements table is a separate system
      // that most users never see.
      for (const hr of mergeState.hiringRequirements) {
        const linkedObjId = objectiveIdMap[hr.linkedObjectiveTitle]
        if (!linkedObjId) continue // Tasks require an objective_id
        const roleLabel = hr.roleType === 'full_time' ? 'Full-time' : hr.roleType === 'fractional' ? 'Fractional' : 'Apprentice'
        await supabase.from('tasks').insert({
          foundry_id: foundryId,
          creator_id: user.id,
          title: `Hire: ${hr.roleTitle} (${roleLabel})`,
          description: `${hr.reason}${hr.suggestedDate ? `. Target start: ${hr.suggestedDate}` : ''}`,
          status: 'Pending',
          objective_id: linkedObjId,
        }).then(({ error: taskErr }) => {
          if (taskErr) console.error('[business-plan] Failed to create hiring task:', taskErr.message)
        })
      }
    }

    if (mergeState.fundingRequirements.length > 0) {
      const fundingInserts = mergeState.fundingRequirements.map(fr => ({
        foundry_id: foundryId,
        analysis_id: mergeState.analysisId,
        title: fr.title,
        amount_usd: fr.amountUsd || null,
        reason: fr.reason,
        needed_by_date: fr.neededByDate || null,
        funding_type: fr.fundingType || null,
        linked_objective_ids: fr.linkedObjectiveTitles
          .map(title => objectiveIdMap[title])
          .filter(Boolean),
        status: 'projected' as const,
      }))

      const { error } = await supabase.from('funding_requirements').insert(fundingInserts)
      if (error) {
        console.error('[business-plan] Failed to insert funding requirements:', {
          error: error.message,
          count: fundingInserts.length,
        })
        warnings.push(`Failed to save ${fundingInserts.length} funding requirement(s)`)
      }

      // DECISION: Also create tasks for each funding event so they appear as
      // actionable items. Users expect "Seed Round" to show up as a task.
      for (const fr of mergeState.fundingRequirements) {
        // Link to first matching objective if possible
        const linkedObjId = fr.linkedObjectiveTitles
          .map(title => objectiveIdMap[title])
          .find(Boolean)
        if (!linkedObjId) continue // Tasks require an objective_id
        const amountStr = fr.amountUsd ? ` ($${(fr.amountUsd / 1000).toFixed(0)}K)` : ''
        await supabase.from('tasks').insert({
          foundry_id: foundryId,
          creator_id: user.id,
          title: `Funding: ${fr.title}${amountStr}`,
          description: `${fr.reason}${fr.fundingType ? `. Type: ${fr.fundingType}` : ''}${fr.neededByDate ? `. Needed by: ${fr.neededByDate}` : ''}`,
          status: 'Pending',
          objective_id: linkedObjId,
        }).then(({ error: taskErr }) => {
          if (taskErr) console.error('[business-plan] Failed to create funding task:', taskErr.message)
        })
      }
    }

    return { warnings: warnings.length > 0 ? warnings : undefined }
  })
}

/**
 * @description Fetches hiring requirements for the team page hiring timeline.
 * @returns Array of hiring requirements with linked objective titles
 */
export async function getHiringRequirements(): Promise<{
  data?: SavedHiringRequirement[]
  error?: string
}> {
  return withAuth(async ({ user }) => {
    const supabase = await createClient()

    const { data: profile } = await supabase
      .from('profiles')
      .select('foundry_id')
      .eq('id', user.id)
      .single()

    if (!profile?.foundry_id) return { error: 'No foundry found' }

    const { data, error } = await supabase
      .from('hiring_requirements')
      .select(`
        *,
        objectives!linked_objective_id ( title )
      `)
      .eq('foundry_id', profile.foundry_id)
      .order('ai_suggested_date', { ascending: true })

    if (error) {
      console.error('[business-plan] Failed to fetch hiring requirements:', {
        error: error.message,
        foundryId: profile.foundry_id,
      })
      return { error: sanitizeErrorMessage(error) }
    }

    // GOTCHA: Supabase join returns objectives as an object, not array.
    const mapped = (data || []).map(row => ({
      ...row,
      linked_objective_title: (row.objectives as { title: string } | null)?.title ?? null,
    })) as SavedHiringRequirement[]

    return { data: mapped }
  })
}

/**
 * @description Updates the user-overridden date for a hiring requirement.
 * @param id - The hiring requirement ID
 * @param date - ISO date string or null to clear
 */
export async function updateHiringRequirementDate(
  id: string,
  date: string | null
): Promise<{ error?: string }> {
  return withAuth(async ({ user }) => {
    const supabase = await createClient()

    const { data: profile } = await supabase
      .from('profiles')
      .select('foundry_id')
      .eq('id', user.id)
      .single()

    if (!profile?.foundry_id) return { error: 'No foundry found' }

    // RLS: scoped to foundry to prevent cross-foundry updates
    const { error } = await supabase
      .from('hiring_requirements')
      .update({ user_override_date: date, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('foundry_id', profile.foundry_id)

    if (error) {
      console.error('[business-plan] Failed to update hire date:', {
        error: error.message,
        hiringRequirementId: id,
      })
      return { error: sanitizeErrorMessage(error) }
    }

    return {}
  })
}

/**
 * @description Fetches funding requirements for the /funding page.
 * @returns Array of funding requirements ordered by needed_by_date
 */
export async function getFundingRequirements(): Promise<{
  data?: SavedFundingRequirement[]
  error?: string
}> {
  return withAuth(async ({ user }) => {
    const supabase = await createClient()

    const { data: profile } = await supabase
      .from('profiles')
      .select('foundry_id')
      .eq('id', user.id)
      .single()

    if (!profile?.foundry_id) return { error: 'No foundry found' }

    const { data, error } = await supabase
      .from('funding_requirements')
      .select('*')
      .eq('foundry_id', profile.foundry_id)
      .order('needed_by_date', { ascending: true })

    if (error) {
      console.error('[business-plan] Failed to fetch funding requirements:', {
        error: error.message,
        foundryId: profile.foundry_id,
      })
      return { error: sanitizeErrorMessage(error) }
    }

    return { data: (data || []) as SavedFundingRequirement[] }
  })
}

/**
 * @description Updates a funding requirement's status (e.g. mark as secured).
 * @param id - The funding requirement ID
 * @param status - The new status value
 */
export async function updateFundingRequirementStatus(
  id: string,
  status: 'projected' | 'seeking' | 'secured' | 'cancelled'
): Promise<{ error?: string }> {
  return withAuth(async ({ user }) => {
    const supabase = await createClient()

    const { data: profile } = await supabase
      .from('profiles')
      .select('foundry_id')
      .eq('id', user.id)
      .single()

    if (!profile?.foundry_id) return { error: 'No foundry found' }

    const { error } = await supabase
      .from('funding_requirements')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('foundry_id', profile.foundry_id)

    if (error) {
      console.error('[business-plan] Failed to update funding status:', {
        error: error.message,
        fundingRequirementId: id,
      })
      return { error: sanitizeErrorMessage(error) }
    }

    return {}
  })
}

/**
 * @description Returns the timestamp of the most recent business plan analysis
 * for the user's foundry, or null if none exists.
 */
export async function getLastAnalyzedAt(): Promise<{ date: string | null; error?: string }> {
  return withAuth(async ({ user }) => {
    const supabase = await createClient()

    const { data: profile } = await supabase
      .from('profiles')
      .select('foundry_id')
      .eq('id', user.id)
      .single()

    if (!profile?.foundry_id) return { date: null }

    const { data } = await supabase
      .from('business_plan_analyses')
      .select('analyzed_at')
      .eq('foundry_id', profile.foundry_id)
      .order('analyzed_at', { ascending: false })
      .limit(1)
      .single()

    return { date: data?.analyzed_at ?? null }
  })
}

/**
 * @description Updates a hiring requirement's status (planned → recruiting → hired).
 * @param id - The hiring requirement ID
 * @param status - The new status value
 */
export async function updateHiringRequirementStatus(
  id: string,
  status: 'planned' | 'recruiting' | 'hired' | 'cancelled'
): Promise<{ error?: string }> {
  return withAuth(async ({ user }) => {
    const supabase = await createClient()

    const { data: profile } = await supabase
      .from('profiles')
      .select('foundry_id')
      .eq('id', user.id)
      .single()

    if (!profile?.foundry_id) return { error: 'No foundry found' }

    const { error } = await supabase
      .from('hiring_requirements')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('foundry_id', profile.foundry_id)

    if (error) {
      console.error('[business-plan] Failed to update hiring status:', {
        error: error.message,
        hiringRequirementId: id,
      })
      return { error: sanitizeErrorMessage(error) }
    }

    return {}
  })
}
