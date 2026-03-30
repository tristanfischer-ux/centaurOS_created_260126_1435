'use server'

/**
 * @file strategic-planner.ts
 *
 * @description Server actions for the Strategic Timeline Planner.
 * Handles task dependency management, AI plan generation, plan application,
 * and plan overview queries.
 *
 * @security All actions require authentication and enforce foundry isolation
 * @audit Plan generation and application events logged via console
 */

import { revalidatePath } from 'next/cache'
import OpenAI from 'openai'
import { withAuth } from '@/lib/server-action-utils'
import { withAIGate } from '@/lib/ai/with-ai-gate'
import { checkRateLimit } from '@/lib/security/rate-limit'
import { buildAIContext } from '@/lib/ai-context/builder'
import type {
  DependencyType,
  TaskDependency,
  StrategicPlan,
  StrategicPlanOverview,
  StrategicObjective,
  StrategicTask,
  StrategicPhaseData,
  ResourceSuggestion,
  StrategicRisk,
  AISuggestion,
} from '@/types/strategic-planner'
import type { Json } from '@/types/database.types'

let openaiClient: OpenAI | null = null

function getOpenAIClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) {
    return null
  }

  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey })
  }

  return openaiClient
}

// ─── Task Dependency Actions ─────────────────────────────────────

/**
 * Adds a dependency between two tasks.
 *
 * @param taskId - The task that depends on another
 * @param dependsOnTaskId - The task that must complete first
 * @param dependencyType - Type of dependency relationship
 * @returns The created dependency record or error
 *
 * @security Requires authenticated user with foundry membership
 */
export async function addTaskDependency(
  taskId: string,
  dependsOnTaskId: string,
  dependencyType: DependencyType = 'finish_to_start'
): Promise<{ data?: TaskDependency; error?: string }> {
  return withAuth(async ({ supabase, foundryId }) => {
    // VALIDATION: Prevent self-dependency
    if (taskId === dependsOnTaskId) {
      return { error: 'A task cannot depend on itself' }
    }

    const { data, error } = await supabase
      .from('task_dependencies')
      .insert({
        task_id: taskId,
        depends_on_task_id: dependsOnTaskId,
        dependency_type: dependencyType,
        foundry_id: foundryId,
      })
      .select()
      .single()

    if (error) {
      // Handle duplicate constraint
      if (error.code === '23505') {
        return { error: 'This dependency already exists' }
      }
      console.error('[StrategicPlanner] Failed to add dependency:', {
        taskId,
        dependsOnTaskId,
        error: error.message,
      })
      return { error: 'Failed to add dependency' }
    }

    revalidatePath('/strategic-planner')
    return { data: data as TaskDependency }
  }) as Promise<{ data?: TaskDependency; error?: string }>
}

/**
 * Removes a dependency between two tasks.
 *
 * @param dependencyId - The ID of the dependency to remove
 * @returns Success indicator or error
 *
 * @security Requires authenticated user, foundry isolation via RLS
 */
export async function removeTaskDependency(
  dependencyId: string
): Promise<{ success?: boolean; error?: string }> {
  return withAuth(async ({ supabase }) => {
    const { error } = await supabase
      .from('task_dependencies')
      .delete()
      .eq('id', dependencyId)

    if (error) {
      console.error('[StrategicPlanner] Failed to remove dependency:', {
        dependencyId,
        error: error.message,
      })
      return { error: 'Failed to remove dependency' }
    }

    revalidatePath('/strategic-planner')
    return { success: true }
  }) as Promise<{ success?: boolean; error?: string }>
}

/**
 * Gets all dependencies for tasks within a given objective tree.
 *
 * @param objectiveId - The strategic goal objective ID
 * @returns Array of dependencies or error
 *
 * @security Foundry isolation enforced via RLS
 */
export async function getDependenciesForObjective(
  objectiveId: string
): Promise<{ data?: TaskDependency[]; error?: string }> {
  return withAuth(async ({ supabase, foundryId }) => {
    // Get all child objective IDs (phases)
    const { data: childObjectives } = await supabase
      .from('objectives')
      .select('id')
      .or(`id.eq.${objectiveId},parent_objective_id.eq.${objectiveId}`)
      .eq('foundry_id', foundryId)
      .eq('is_ghost', false)
      .is('deleted_at', null)

    if (!childObjectives || childObjectives.length === 0) {
      return { data: [] }
    }

    const objectiveIds = childObjectives.map((o) => o.id)

    // Get all tasks for these objectives
    const { data: tasks } = await supabase
      .from('tasks')
      .select('id')
      .in('objective_id', objectiveIds)
      .eq('foundry_id', foundryId)
      .eq('is_ghost', false)
      .is('deleted_at', null)

    if (!tasks || tasks.length === 0) {
      return { data: [] }
    }

    const taskIds = tasks.map((t) => t.id)

    // Get all dependencies involving these tasks
    const { data: dependencies, error } = await supabase
      .from('task_dependencies')
      .select('*')
      .or(`task_id.in.(${taskIds.join(',')}),depends_on_task_id.in.(${taskIds.join(',')})`)
      .eq('foundry_id', foundryId)

    if (error) {
      console.error('[StrategicPlanner] Failed to get dependencies:', error.message)
      return { error: 'Failed to get dependencies' }
    }

    return { data: (dependencies || []) as TaskDependency[] }
  }) as Promise<{ data?: TaskDependency[]; error?: string }>
}

// ─── AI Strategic Plan Generator ─────────────────────────────────

/**
 * Generates a strategic plan using GPT-5.3, decomposing a high-level goal
 * into phases, tasks, dependencies, resource gaps, and risks.
 *
 * @param goal - The strategic goal description (e.g., "Raise 500k seed round")
 * @param deadline - Target deadline ISO date string
 * @returns AI-generated strategic plan or error
 *
 * @security Requires authenticated user with foundry membership
 * @audit Logs plan generation events
 */
export async function generateStrategicPlan(
  goal: string,
  deadline: string
): Promise<{ plan?: StrategicPlan; error?: string }> {
  return withAIGate('strategic_planner', async ({ supabase, user, foundryId }) => {
    // SECURITY: Rate limit AI calls to prevent cost abuse
    const rateLimitError = await checkRateLimit('aiStrategicPlan', `ai:${user.id}`)
    if (rateLimitError) return { error: rateLimitError }

    // VALIDATION: Input bounds
    if (!goal?.trim() || goal.length < 5) {
      return { error: 'Please describe your goal in at least a few words.' }
    }
    if (!deadline) {
      return { error: 'Please provide a target deadline.' }
    }

    console.info('[StrategicPlanner] Generating plan:', {
      userId: user.id,
      foundryId,
      goalLength: goal.length,
      deadline,
    })

    // Build company context
    const companyContext = await buildAIContext(foundryId, user.id, {
      includeActivity: false,
      includeObjectives: true,
    })

    // Fetch team members for role matching
    const { data: members } = await supabase
      .from('foundry_memberships')
      .select(`
        user_id,
        role,
        profiles!inner(id, full_name, role, email, skills, expertise_areas)
      `)
      .eq('foundry_id', foundryId)

    const teamContext = members && members.length > 0
      ? `\nTeam members:\n${members.map((m) => {
          const p = m.profiles as unknown as {
            id: string
            full_name: string | null
            role: string | null
            skills: string[] | null
            expertise_areas: string[] | null
          }
          const skills = [...(p.skills || []), ...(p.expertise_areas || [])].join(', ')
          return `- ${p.full_name || 'Unknown'} (${m.role}${skills ? `, skills: ${skills}` : ''})`
        }).join('\n')}`
      : '\nNo team members found.'

    // Fetch org blueprint gaps for resource recommendations
    const { data: gaps } = await supabase
      .from('foundry_function_coverage')
      .select(`
        coverage_status,
        business_functions!inner(name, category, description)
      `)
      .eq('foundry_id', foundryId)
      .in('coverage_status', ['gap', 'partial'])
      .limit(20)

    const gapContext = gaps && gaps.length > 0
      ? `\nOrganizational capability gaps:\n${gaps.map((g) => {
          const fn = g.business_functions as unknown as {
            name: string
            category: string
          }
          return `- ${fn.name} (${fn.category}) - ${g.coverage_status}`
        }).join('\n')}`
      : ''

    const today = new Date().toISOString().split('T')[0]

    const systemPrompt = `You are a senior strategic planning advisor. You help founders and executives create detailed, actionable plans to achieve business goals.

Given a strategic goal and deadline, you must:
1. Backward-plan from the deadline to today
2. Break the goal into 2-5 sequential phases (child objectives)
3. Each phase has 2-6 specific, actionable tasks
4. Tasks have realistic start/end dates that work backward from the deadline
5. Identify dependencies between tasks (which must finish before others can start)
6. Suggest who on the team should own each task based on their role/skills
7. Identify resource gaps where no team member fits the needed role
8. Identify risks and suggest mitigations
9. Highlight the critical path (the chain of dependent tasks that determines minimum duration)
10. Suggest additional tasks or considerations the user might be missing

Today's date is ${today}. The deadline is ${deadline}.
${companyContext}
${teamContext}
${gapContext}

IMPORTANT:
- Be specific with dates. Use YYYY-MM-DD format.
- Task dates must not overlap illogically with their dependencies.
- suggestedRole should be a job title like "Founder", "CFO", "Legal Advisor", "Marketing Lead".
- dependsOn references other task titles within the plan (exact match).
- For resourceGaps, suggest marketplace hires for roles not covered by the current team.
- criticalPath is the ordered list of task titles forming the longest dependency chain.
- Generate 3-5 actionable AI suggestions for things the user might be overlooking.

Respond with ONLY valid JSON matching this schema (no markdown, no code fences):
{
  "phases": [
    {
      "title": "string",
      "description": "string",
      "startDate": "YYYY-MM-DD",
      "endDate": "YYYY-MM-DD",
      "tasks": [
        {
          "title": "string",
          "description": "string",
          "startDate": "YYYY-MM-DD",
          "endDate": "YYYY-MM-DD",
          "suggestedRole": "string",
          "suggestedAssigneeId": "string or null",
          "dependsOn": ["task title strings"],
          "riskLevel": "Low" | "Medium" | "High"
        }
      ]
    }
  ],
  "resourceGaps": [
    {
      "role": "string",
      "reason": "string",
      "phase": "string",
      "marketplaceMatches": [],
      "priority": "critical" | "recommended" | "nice_to_have"
    }
  ],
  "risks": [
    {
      "description": "string",
      "mitigation": "string",
      "severity": "high" | "medium" | "low",
      "relatedTaskTitle": "string or null"
    }
  ],
  "criticalPath": ["ordered task title strings"],
  "suggestions": [
    {
      "id": "string (unique)",
      "type": "add_task" | "assign_person" | "hire_resource" | "timeline_warning" | "dependency",
      "message": "string",
      "relatedPhase": "string or null",
      "relatedTaskTitle": "string or null"
    }
  ]
}`

    const openai = getOpenAIClient()
    if (!openai) {
      return { error: 'AI planning service is not configured' }
    }

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-5.4',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `My strategic goal: ${goal}\n\nTarget deadline: ${deadline}` },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
        max_tokens: 4000,
      })

      const content = response.choices[0]?.message?.content
      if (!content) {
        return { error: 'AI returned empty response. Please try again.' }
      }

      const plan = JSON.parse(content) as StrategicPlan

      // VALIDATION: Ensure plan structure is reasonable
      if (!plan.phases || plan.phases.length === 0) {
        return { error: 'AI generated an empty plan. Please try with more detail.' }
      }

      // Match team members to suggested roles
      if (members && members.length > 0) {
        for (const phase of plan.phases) {
          for (const task of phase.tasks) {
            if (!task.suggestedAssigneeId) {
              // Try to match by role
              const match = members.find((m) => {
                const roleLower = task.suggestedRole.toLowerCase()
                const memberRole = (m.role || '').toLowerCase()
                return memberRole.includes(roleLower) || roleLower.includes(memberRole)
              })
              if (match) {
                task.suggestedAssigneeId = match.user_id
              }
            }
          }
        }
      }

      console.info('[StrategicPlanner] Plan generated:', {
        userId: user.id,
        phases: plan.phases.length,
        totalTasks: plan.phases.reduce((sum, p) => sum + p.tasks.length, 0),
        resourceGaps: plan.resourceGaps?.length || 0,
        risks: plan.risks?.length || 0,
      })

      return { plan }
    } catch (err) {
      console.error('[StrategicPlanner] AI plan generation failed:', {
        error: err instanceof Error ? err.message : 'Unknown error',
      })
      return { error: 'Failed to generate plan. Please try again.' }
    }
  }) as Promise<{ plan?: StrategicPlan; error?: string }>
}

// ─── Apply Strategic Plan ────────────────────────────────────────

/**
 * Takes an AI-generated plan and creates objectives, tasks, and dependencies
 * in the database.
 *
 * @param goalTitle - Title for the strategic goal objective
 * @param goalDescription - Description for the strategic goal
 * @param deadline - Target deadline ISO date
 * @param plan - The AI-generated strategic plan
 * @returns The created strategic goal objective ID or error
 *
 * @security Requires authenticated user with foundry membership
 * @audit Logs all created entities
 */
export async function applyStrategicPlan(
  goalTitle: string,
  goalDescription: string,
  deadline: string,
  plan: StrategicPlan
): Promise<{ objectiveId?: string; error?: string }> {
  return withAuth(async ({ supabase, user, foundryId }) => {
    // VALIDATION
    if (!goalTitle?.trim()) {
      return { error: 'Goal title is required' }
    }
    if (!plan?.phases?.length) {
      return { error: 'Plan must have at least one phase' }
    }

    console.info('[StrategicPlanner] Applying plan:', {
      userId: user.id,
      foundryId,
      goalTitle,
      phases: plan.phases.length,
    })

    // 1. Create the strategic goal (top-level objective)
    const { data: goalObj, error: goalError } = await supabase
      .from('objectives')
      .insert({
        title: goalTitle,
        description: goalDescription,
        is_strategic_goal: true,
        milestone_date: deadline,
        resource_suggestions: (plan.resourceGaps || []) as unknown as Json,
        strategic_risks: (plan.risks || []) as unknown as Json,
        ai_suggestions: (plan.suggestions || []) as unknown as Json,
        creator_id: user.id,
        foundry_id: foundryId,
        status: 'In Progress',
        progress: 0,
      })
      .select('id')
      .single()

    if (goalError || !goalObj) {
      console.error('[StrategicPlanner] Failed to create goal objective:', goalError?.message)
      return { error: 'Failed to create strategic goal' }
    }

    // Track task title -> task ID for dependency creation
    const taskTitleToId = new Map<string, string>()

    // 2. Create phases (child objectives) and their tasks
    for (const phase of plan.phases) {
      const { data: phaseObj, error: phaseError } = await supabase
        .from('objectives')
        .insert({
          title: phase.title,
          description: phase.description,
          parent_objective_id: goalObj.id,
          milestone_date: phase.endDate,
          creator_id: user.id,
          foundry_id: foundryId,
          status: 'In Progress',
          progress: 0,
        })
        .select('id')
        .single()

      if (phaseError || !phaseObj) {
        console.error('[StrategicPlanner] Failed to create phase:', {
          phase: phase.title,
          error: phaseError?.message,
        })
        continue
      }

      // Create tasks for this phase
      for (const task of phase.tasks) {
        const { data: taskData, error: taskError } = await supabase
          .from('tasks')
          .insert({
            title: task.title,
            description: task.description,
            objective_id: phaseObj.id,
            start_date: task.startDate,
            end_date: task.endDate,
            risk_level: task.riskLevel,
            assignee_id: task.suggestedAssigneeId || null,
            creator_id: user.id,
            foundry_id: foundryId,
            status: 'Pending',
          })
          .select('id')
          .single()

        if (taskError || !taskData) {
          console.error('[StrategicPlanner] Failed to create task:', {
            task: task.title,
            error: taskError?.message,
          })
          continue
        }

        taskTitleToId.set(task.title, taskData.id)

        // Add assignee to task_assignees if present
        if (task.suggestedAssigneeId) {
          await supabase
            .from('task_assignees')
            .insert({
              task_id: taskData.id,
              profile_id: task.suggestedAssigneeId,
            })
            .select()
            // Ignore errors - assignee might not exist
        }
      }
    }

    // 3. Create dependencies
    for (const phase of plan.phases) {
      for (const task of phase.tasks) {
        const taskId = taskTitleToId.get(task.title)
        if (!taskId || !task.dependsOn?.length) continue

        for (const depTitle of task.dependsOn) {
          const depTaskId = taskTitleToId.get(depTitle)
          if (!depTaskId) {
            console.warn('[StrategicPlanner] Dependency target not found:', {
              task: task.title,
              dependsOn: depTitle,
            })
            continue
          }

          await supabase
            .from('task_dependencies')
            .insert({
              task_id: taskId,
              depends_on_task_id: depTaskId,
              dependency_type: 'finish_to_start',
              foundry_id: foundryId,
            })
            .select()
            // Ignore duplicate errors
        }
      }
    }

    console.info('[StrategicPlanner] Plan applied:', {
      objectiveId: goalObj.id,
      tasksCreated: taskTitleToId.size,
    })

    revalidatePath('/objectives')
    revalidatePath('/tasks')
    revalidatePath('/strategic-planner')

    return { objectiveId: goalObj.id }
  }) as Promise<{ objectiveId?: string; error?: string }>
}

// ─── Plan Overview (for rendering) ──────────────────────────────

/**
 * Fetches the full strategic plan tree for rendering the timeline canvas.
 * Includes the goal, phases, tasks, dependencies, team members, and critical path.
 *
 * @param objectiveId - The strategic goal objective ID
 * @returns Full plan overview or error
 *
 * @security Foundry isolation enforced via RLS
 */
export async function getStrategicPlanOverview(
  objectiveId: string
): Promise<{ data?: StrategicPlanOverview; error?: string }> {
  return withAuth(async ({ supabase, foundryId }) => {
    // 1. Fetch the strategic goal
    const { data: goalData, error: goalError } = await supabase
      .from('objectives')
      .select('*')
      .eq('id', objectiveId)
      .eq('foundry_id', foundryId)
      .single()

    if (goalError || !goalData) {
      return { error: 'Strategic goal not found' }
    }

    const goal: StrategicObjective = {
      id: goalData.id,
      title: goalData.title,
      description: goalData.description,
      status: goalData.status || 'In Progress',
      progress: goalData.progress || 0,
      milestone_date: goalData.milestone_date || null,
      is_strategic_goal: goalData.is_strategic_goal || false,
      resource_suggestions: (goalData.resource_suggestions as unknown as ResourceSuggestion[]) || [],
      strategic_risks: (goalData.strategic_risks as unknown as StrategicRisk[]) || [],
      ai_suggestions: (goalData.ai_suggestions as unknown as AISuggestion[]) || [],
      created_at: goalData.created_at ?? '',
    }

    // 2. Fetch child objectives (phases)
    const { data: phaseObjectives } = await supabase
      .from('objectives')
      .select('*')
      .eq('parent_objective_id', objectiveId)
      .eq('foundry_id', foundryId)
      .eq('is_ghost', false)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })

    const phases: StrategicPhaseData[] = []
    const allTaskIds: string[] = []
    const allTasks: StrategicTask[] = []

    // 3. Fetch tasks for each phase
    const phaseIds = [objectiveId, ...(phaseObjectives || []).map((p) => p.id)]

    const { data: tasksData } = await supabase
      .from('tasks')
      .select(`
        id, title, description, status, risk_level,
        start_date, end_date, progress, objective_id,
        assignee_id,
        task_assignees(
          profile_id,
          profiles:profile_id(id, full_name, role)
        )
      `)
      .in('objective_id', phaseIds)
      .eq('foundry_id', foundryId)
      .eq('is_ghost', false)
      .is('deleted_at', null)
      .order('start_date', { ascending: true })

    // 4. Fetch all dependencies for these tasks
    const taskIds = (tasksData || []).map((t) => t.id)
    allTaskIds.push(...taskIds)

    let allDependencies: TaskDependency[] = []
    if (taskIds.length > 0) {
      const { data: deps } = await supabase
        .from('task_dependencies')
        .select('*')
        .or(`task_id.in.(${taskIds.join(',')}),depends_on_task_id.in.(${taskIds.join(',')})`)
        .eq('foundry_id', foundryId)

      allDependencies = (deps || []) as TaskDependency[]
    }

    // Build tasks with dependency info
    for (const t of tasksData || []) {
      const assignees = ((t.task_assignees as unknown) as Array<{
        profile_id: string
        profiles: { id: string; full_name: string | null; role: string | null } | null
      }>) || []

      const task: StrategicTask = {
        id: t.id,
        title: t.title,
        description: t.description,
        status: t.status || 'Pending',
        risk_level: t.risk_level || 'Low',
        start_date: t.start_date,
        end_date: t.end_date,
        progress: t.progress,
        objective_id: t.objective_id,
        assignee_id: t.assignee_id,
        assignees: assignees
          .filter((a) => a.profiles)
          .map((a) => ({
            id: a.profiles!.id,
            full_name: a.profiles!.full_name,
            role: a.profiles!.role,
          })),
        dependencies: allDependencies.filter((d) => d.task_id === t.id),
        dependents: allDependencies.filter((d) => d.depends_on_task_id === t.id),
      }

      allTasks.push(task)
    }

    // Group tasks by phase
    for (const phase of phaseObjectives || []) {
      const phaseTasks = allTasks.filter((t) => t.objective_id === phase.id)
      phases.push({
        objective: {
          id: phase.id,
          title: phase.title,
          description: phase.description,
          status: phase.status || 'In Progress',
          progress: phase.progress || 0,
        },
        tasks: phaseTasks,
      })
    }

    // Also include tasks directly on the goal (if any)
    const directTasks = allTasks.filter((t) => t.objective_id === objectiveId)
    if (directTasks.length > 0) {
      phases.unshift({
        objective: {
          id: goalData.id,
          title: 'General',
          description: null,
          status: goalData.status || 'In Progress',
          progress: goalData.progress || 0,
        },
        tasks: directTasks,
      })
    }

    // 5. Calculate critical path
    const criticalPathTaskIds = calculateCriticalPath(allTasks, allDependencies)

    // 6. Fetch team members
    const { data: teamData } = await supabase
      .from('foundry_memberships')
      .select(`
        profiles!inner(id, full_name, role, email)
      `)
      .eq('foundry_id', foundryId)

    const teamMembers = (teamData || []).map((m) => {
      const p = m.profiles as unknown as {
        id: string
        full_name: string | null
        role: string | null
        email: string | null
      }
      return { id: p.id, full_name: p.full_name, role: p.role, email: p.email }
    })

    return {
      data: {
        goal,
        phases,
        allDependencies,
        criticalPathTaskIds,
        teamMembers,
      },
    }
  }) as Promise<{ data?: StrategicPlanOverview; error?: string }>
}

// ─── Update Strategic Goal Metadata ──────────────────────────────

/**
 * Updates the resource suggestions, risks, and AI suggestions on a strategic goal.
 *
 * @param objectiveId - The strategic goal ID
 * @param updates - Partial update object
 * @returns Success indicator or error
 */
export async function updateStrategicGoalMeta(
  objectiveId: string,
  updates: {
    resource_suggestions?: ResourceSuggestion[]
    strategic_risks?: StrategicRisk[]
    ai_suggestions?: AISuggestion[]
    milestone_date?: string
  }
): Promise<{ success?: boolean; error?: string }> {
  return withAuth(async ({ supabase, foundryId }) => {
    // Cast through unknown since custom types (AISuggestion[], etc.) aren't directly assignable to Json
    const dbUpdates = updates as unknown as Record<string, Json>
    const { error } = await supabase
      .from('objectives')
      .update(dbUpdates)
      .eq('id', objectiveId)
      .eq('foundry_id', foundryId)

    if (error) {
      console.error('[StrategicPlanner] Failed to update goal meta:', error.message)
      return { error: 'Failed to update strategic goal' }
    }

    revalidatePath('/strategic-planner')
    return { success: true }
  }) as Promise<{ success?: boolean; error?: string }>
}

// ─── Critical Path Calculation ───────────────────────────────────

/**
 * Calculates the critical path through a dependency graph using
 * topological sort and longest-path algorithm.
 *
 * @description The critical path is the longest chain of dependent tasks,
 * which determines the minimum time needed to complete the plan.
 * Any delay on a critical path task delays the entire plan.
 *
 * @param tasks - All tasks in the plan
 * @param dependencies - All dependencies between tasks
 * @returns Ordered array of task IDs on the critical path
 */
function calculateCriticalPath(
  tasks: StrategicTask[],
  dependencies: TaskDependency[]
): string[] {
  if (tasks.length === 0) return []

  // Build adjacency list (task -> tasks that depend on it)
  const adjacency = new Map<string, string[]>()
  const inDegree = new Map<string, number>()
  const taskMap = new Map<string, StrategicTask>()

  for (const task of tasks) {
    adjacency.set(task.id, [])
    inDegree.set(task.id, 0)
    taskMap.set(task.id, task)
  }

  for (const dep of dependencies) {
    // depends_on_task_id must complete before task_id can start
    if (adjacency.has(dep.depends_on_task_id) && inDegree.has(dep.task_id)) {
      adjacency.get(dep.depends_on_task_id)!.push(dep.task_id)
      inDegree.set(dep.task_id, (inDegree.get(dep.task_id) || 0) + 1)
    }
  }

  // Topological sort (Kahn's algorithm)
  const queue: string[] = []
  for (const [taskId, degree] of inDegree.entries()) {
    if (degree === 0) queue.push(taskId)
  }

  const topoOrder: string[] = []
  while (queue.length > 0) {
    const current = queue.shift()!
    topoOrder.push(current)

    for (const neighbor of adjacency.get(current) || []) {
      const newDegree = (inDegree.get(neighbor) || 1) - 1
      inDegree.set(neighbor, newDegree)
      if (newDegree === 0) queue.push(neighbor)
    }
  }

  // Longest path (by duration in days)
  const dist = new Map<string, number>()
  const prev = new Map<string, string | null>()

  for (const taskId of topoOrder) {
    const task = taskMap.get(taskId)!
    const duration = getTaskDurationDays(task)
    dist.set(taskId, duration)
    prev.set(taskId, null)
  }

  for (const taskId of topoOrder) {
    const currentDist = dist.get(taskId) || 0

    for (const neighbor of adjacency.get(taskId) || []) {
      const neighborTask = taskMap.get(neighbor)!
      const neighborDuration = getTaskDurationDays(neighborTask)
      const newDist = currentDist + neighborDuration

      if (newDist > (dist.get(neighbor) || 0)) {
        dist.set(neighbor, newDist)
        prev.set(neighbor, taskId)
      }
    }
  }

  // Find the task with the longest distance (end of critical path)
  let maxDist = 0
  let endTaskId: string | null = null
  for (const [taskId, d] of dist.entries()) {
    if (d >= maxDist) {
      maxDist = d
      endTaskId = taskId
    }
  }

  // Trace back to build the critical path
  const criticalPath: string[] = []
  let current = endTaskId
  while (current) {
    criticalPath.unshift(current)
    current = prev.get(current) || null
  }

  return criticalPath
}

/**
 * Calculates task duration in days from start_date and end_date.
 */
function getTaskDurationDays(task: StrategicTask): number {
  if (!task.start_date || !task.end_date) return 1

  const start = new Date(task.start_date)
  const end = new Date(task.end_date)
  const diffMs = end.getTime() - start.getTime()
  return Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)))
}
