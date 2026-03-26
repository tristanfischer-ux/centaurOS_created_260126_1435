"use client"

import { useState, useCallback, useMemo } from "react"
import Image from "next/image"
import Link from "next/link"
import { Target, CheckSquare, Loader2, Check, X, Archive, Trash2, ChevronDown, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { createObjective, createStrategicObjective } from "@/actions/objectives"
import { archiveObjectiveByTitle } from "@/actions/objectives"
import { createTask } from "@/actions/tasks"
import { archiveTaskByTitle } from "@/actions/tasks"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import { scheduleTaskDates, addWorkingDays } from "@/lib/schedule-task-dates"
import { isDestructiveAction } from "@/lib/agents/message-parsers"
import type { ProposedAction } from "@/lib/agents/message-parsers"
import type { Specialist } from "@/lib/agents/specialists-config"

/** Maximum number of days into the future we allow for proposed dates (2 years). */
const MAX_DATE_HORIZON_DAYS = 730

/**
 * Clamps a date string to within MAX_DATE_HORIZON_DAYS from today.
 * Returns null if the date is invalid or in the past.
 *
 * @param dateStr - ISO date string (YYYY-MM-DD)
 * @returns Clamped ISO date string, or null if invalid
 */
function clampDate(dateStr: string): string | null {
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) {
        console.warn("[ProposedActions] Invalid date from proposal, skipping:", dateStr)
        return null
    }
    const maxDate = new Date()
    maxDate.setDate(maxDate.getDate() + MAX_DATE_HORIZON_DAYS)
    if (date > maxDate) {
        console.warn("[ProposedActions] Clamping date beyond 2-year horizon:", dateStr, "→", maxDate.toISOString().split("T")[0])
        return maxDate.toISOString().split("T")[0]
    }
    return date.toISOString().split("T")[0]
}

/**
 * Resolves start/end dates from a ProposedAction when explicit dates are provided.
 * Returns null when no explicit dates exist, allowing the wave-based scheduler to handle placement.
 *
 * @param proposal - The proposed action to extract dates from
 * @returns Object with startDate/endDate strings, or null if no dates available
 */
function resolveDatesFromProposal(proposal: ProposedAction): { startDate: string; endDate: string } | null {
    let startDate = proposal.startDate ? clampDate(proposal.startDate) : null
    let endDate = proposal.endDate ? clampDate(proposal.endDate) : null

    // If explicit dates are partially set, fill in the gap
    if (startDate && !endDate) {
        endDate = startDate // single-day default; better than nothing
    }
    if (!startDate && endDate) {
        startDate = new Date().toISOString().split("T")[0] // start today
    }

    // If we have explicit dates, use them
    if (startDate && endDate) {
        return { startDate, endDate }
    }

    return null
}

interface ProposedActionsCardProps {
    proposals: ProposedAction[]
    specialist: Specialist
    onDismiss: () => void
    onCreated?: (count: number) => void
    /** Rollout id from execute response; attached to created tasks for reward attribution. */
    rolloutId?: string | null
    /** Forge thread id; stored as source_thread_id in task/objective metadata for provenance. */
    sourceThreadId?: string | null
}

/** Tracks which proposals have been executed (by index). */
type ExecutedState = Record<number, { success: boolean; id?: string }>

/**
 * Normalizes a title for fuzzy matching by stripping non-alphanumeric characters
 * and collapsing whitespace.
 *
 * @param title - Raw title string
 * @returns Normalized lowercase string for comparison
 */
function normalizeTitle(title: string): string {
    return title
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, "")
        .replace(/\s+/g, " ")
        .trim()
}

/**
 * Creates a fuzzy title resolver from a list of {id, title} records.
 *
 * @description Returns a resolver function that tries:
 * 1. Exact case-insensitive match
 * 2. Normalized match (strips punctuation, collapses whitespace)
 * 3. Substring match (LLM title contains a record title or vice versa)
 *
 * This handles common LLM mismatches like extra punctuation, slight rephrasing,
 * or partial title references.
 *
 * @param records - Array of {id, title} to build the resolver from
 * @param label - Label for logging (e.g. "strategic goal", "objective")
 * @returns Resolver function for fuzzy matching
 */
function buildFuzzyResolver(
    records: { id: string; title: string }[],
    label: string
): (llmTitle: string) => string | undefined {
    const exactMap = new Map<string, string>()
    const normalizedMap = new Map<string, string>()
    const items: { id: string; title: string; normalized: string }[] = []

    for (const row of records) {
        const trimmed = row.title.trim()
        exactMap.set(trimmed.toLowerCase(), row.id)
        const norm = normalizeTitle(trimmed)
        normalizedMap.set(norm, row.id)
        items.push({ id: row.id, title: trimmed, normalized: norm })
    }

    return function resolve(llmTitle: string): string | undefined {
        const lower = llmTitle.trim().toLowerCase()
        // 1. Exact case-insensitive match
        const exactId = exactMap.get(lower)
        if (exactId) return exactId

        // 2. Normalized match (strips punctuation, collapses whitespace)
        const norm = normalizeTitle(llmTitle)
        const normId = normalizedMap.get(norm)
        if (normId) return normId

        // 3. Substring / containment match (LLM might abbreviate or extend)
        for (const item of items) {
            if (norm.includes(item.normalized) || item.normalized.includes(norm)) {
                console.info(`[ProposedActions] Fuzzy-matched ${label}:`, {
                    llmTitle,
                    matched: item.title,
                })
                return item.id
            }
        }

        return undefined
    }
}

/**
 * Looks up active strategic goals in the user's foundry with fuzzy title matching.
 *
 * @description Fetches all objectives where is_strategic_goal = true
 * and deleted_at is null.
 *
 * @returns Object with the resolver and list of goal titles
 */
async function fetchStrategicGoalMap(): Promise<{
    resolve: (llmTitle: string) => string | undefined
    goalTitles: string[]
}> {
    const supabase = createClient()
    const { data } = await supabase
        .from("objectives")
        .select("id, title")
        .eq("is_strategic_goal", true)
        .is("deleted_at", null)

    const records = data ?? []
    return {
        goalTitles: records.map((g) => g.title.trim()),
        resolve: buildFuzzyResolver(records, "strategic goal"),
    }
}

/**
 * Looks up active objectives (non-strategic-goal, non-milestone) in the user's
 * foundry with fuzzy title matching.
 *
 * @description Used to resolve task → objective links when the specialist
 * references an existing objective by title.
 *
 * @returns Resolver function for fuzzy matching objective titles to IDs
 */
async function fetchObjectiveMap(): Promise<(llmTitle: string) => string | undefined> {
    const supabase = createClient()
    const { data } = await supabase
        .from("objectives")
        .select("id, title")
        .is("deleted_at", null)
        .eq("is_strategic_goal", false)

    return buildFuzzyResolver(data ?? [], "objective")
}

/**
 * Executes the "create" portion of proposed actions with automatic hierarchy creation.
 *
 * @description Handles the full hierarchy: if a proposed objective references a
 * strategic goal that doesn't exist, it's auto-created first. If a proposed task
 * references an objective that doesn't exist (and wasn't created in this batch),
 * the objective is auto-created under the best-fit strategic goal.
 *
 * Phases:
 *   0 — Auto-create missing strategic goals
 *   1 — Create proposed objectives (linking to existing or auto-created strategic goals)
 *   1.5 — Auto-create missing objectives for orphan tasks
 *   2 — Create proposed tasks (linking to existing, batch-created, or auto-created objectives)
 *
 * @param params - All parameters needed for the creation flow
 * @returns Results map, rejection lists, and auto-created item names
 */
async function executeCreateActions(params: {
    proposals: ProposedAction[]
    createIndices: number[]
    selected: Set<number>
    executed: ExecutedState
    userId: string
    rolloutId?: string | null
    sourceThreadId?: string | null
    onProgress?: (completed: number, total: number, currentTitle: string) => void
    onItemComplete?: (index: number, result: { success: boolean; id?: string }) => void
}): Promise<{
    results: ExecutedState
    rejectedObjectives: string[]
    rejectedTasks: string[]
    failedTasks: { title: string; error: string }[]
    autoCreatedGoals: string[]
    autoCreatedObjectives: string[]
}> {
    const { proposals, createIndices, selected, executed, userId, rolloutId, sourceThreadId, onProgress, onItemComplete } = params
    const results: ExecutedState = { ...executed }
    const rejectedObjectives: string[] = []
    const rejectedTasks: string[] = []
    const failedTasks: { title: string; error: string }[] = []
    const autoCreatedGoals: string[] = []
    const autoCreatedObjectives: string[] = []

    const { resolve: resolveGoal } = await fetchStrategicGoalMap()
    const resolveExistingObjective = await fetchObjectiveMap()

    const newGoalTitleToId = new Map<string, string>()
    const objectiveTitleToId = new Map<string, string>()

    /** Fuzzy-match against batch-created objectives (handles "&" vs "and", etc.) */
    function resolveBatchObjective(llmTitle: string): string | undefined {
        const norm = normalizeTitle(llmTitle)
        // Exact normalized match first
        for (const [key, id] of objectiveTitleToId) {
            if (normalizeTitle(key) === norm) return id
        }
        // Substring containment fallback
        for (const [key, id] of objectiveTitleToId) {
            const normKey = normalizeTitle(key)
            if (norm.includes(normKey) || normKey.includes(norm)) return id
        }
        return undefined
    }

    // ── Phase 0: Auto-create missing strategic goals ─────────────────────────
    // Collect all strategic goal titles referenced by proposed objectives and
    // check if they exist. Create any that are missing so Phase 1 always succeeds.
    const neededGoalTitles = new Set<string>()
    for (const i of createIndices) {
        if (!selected.has(i) || executed[i]) continue
        const p = proposals[i]
        if (p.type === "objective" && p.strategicGoalTitle?.trim()) {
            if (!resolveGoal(p.strategicGoalTitle)) {
                neededGoalTitles.add(p.strategicGoalTitle.trim())
            }
        }
    }

    for (const goalTitle of neededGoalTitles) {
        const result = await createStrategicObjective(goalTitle)
        if (result && "data" in result && result.data) {
            newGoalTitleToId.set(goalTitle, result.data.id)
            autoCreatedGoals.push(goalTitle)
            console.info("[ProposedActions] Auto-created strategic goal:", { title: goalTitle, id: result.data.id })
        } else {
            const errorMsg = result && "error" in result ? result.error : "Unknown error"
            console.warn("[ProposedActions] Failed to auto-create strategic goal:", { title: goalTitle, error: errorMsg })
        }
    }

    // Combined resolver: checks auto-created goals first, then existing
    function resolveGoalCombined(llmTitle: string): string | undefined {
        const norm = normalizeTitle(llmTitle)
        for (const [title, id] of newGoalTitleToId) {
            const normTitle = normalizeTitle(title)
            if (normTitle === norm || norm.includes(normTitle) || normTitle.includes(norm)) {
                return id
            }
        }
        return resolveGoal(llmTitle)
    }

    // ── Phase 1: Create objectives ───────────────────────────────────────────
    const totalItems = createIndices.filter((i) => selected.has(i) && !executed[i]).length
    let completedItems = 0

    for (const i of createIndices) {
        if (!selected.has(i) || executed[i]) continue
        const p = proposals[i]
        if (p.type !== "objective") continue

        onProgress?.(completedItems, totalItems, p.title)

        if (!p.strategicGoalTitle?.trim()) {
            rejectedObjectives.push(p.title)
            results[i] = { success: false }
            onItemComplete?.(i, { success: false })
            completedItems++
            console.warn("[ProposedActions] Rejected objective — missing strategicGoalTitle:", { title: p.title })
            continue
        }

        const goalId = resolveGoalCombined(p.strategicGoalTitle)
        if (!goalId) {
            rejectedObjectives.push(p.title)
            results[i] = { success: false }
            onItemComplete?.(i, { success: false })
            completedItems++
            console.warn("[ProposedActions] Rejected objective — strategic goal not found:", {
                title: p.title,
                strategicGoalTitle: p.strategicGoalTitle,
            })
            continue
        }

        const fd = new FormData()
        fd.set("title", p.title.trim().slice(0, 200))
        if (p.description?.trim()) {
            fd.set("description", p.description.trim().slice(0, 10000))
        }
        fd.set("parent_objective_id", goalId)
        if (sourceThreadId) fd.set("source_thread_id", sourceThreadId)

        // INTENT: Pass dates from the proposal so objectives land on the timeline
        const objDates = resolveDatesFromProposal(p)
        if (objDates) {
            fd.set("start_date", objDates.startDate)
            fd.set("end_date", objDates.endDate)
        }

        const result = await createObjective(fd)
        if (result.error) {
            results[i] = { success: false }
            onItemComplete?.(i, { success: false })
            completedItems++
            console.warn("[ProposedActions] Failed to create objective:", { title: p.title, error: result.error })
            continue
        }
        if ("objectiveId" in result && result.objectiveId) {
            results[i] = { success: true, id: result.objectiveId }
            objectiveTitleToId.set(p.title.trim(), result.objectiveId)
            onItemComplete?.(i, { success: true, id: result.objectiveId })
            completedItems++
        }
    }

    // ── Phase 1.5: Auto-create missing objectives for orphan tasks ───────────
    // If a task references an objective title that wasn't in the batch and doesn't
    // exist yet, auto-create it under the best-fit strategic goal.
    const neededObjectiveTitles = new Set<string>()
    for (const i of createIndices) {
        if (!selected.has(i) || executed[i]) continue
        const p = proposals[i]
        if (p.type !== "task" || !p.objectiveTitle?.trim()) continue

        const objTitle = p.objectiveTitle.trim()
        if (!resolveBatchObjective(objTitle) && !resolveExistingObjective(objTitle)) {
            neededObjectiveTitles.add(objTitle)
        }
    }

    if (neededObjectiveTitles.size > 0) {
        // Pick the best default strategic goal: prefer the first auto-created one,
        // then fall back to any existing one, then create "General" as last resort.
        let defaultGoalId: string | undefined
        if (newGoalTitleToId.size > 0) {
            defaultGoalId = newGoalTitleToId.values().next().value as string
        }
        if (!defaultGoalId) {
            const supabase = createClient()
            const { data: anyGoal } = await supabase
                .from("objectives")
                .select("id")
                .eq("is_strategic_goal", true)
                .is("deleted_at", null)
                .limit(1)
                .single()
            defaultGoalId = anyGoal?.id
        }
        if (!defaultGoalId) {
            const result = await createStrategicObjective("General")
            if (result && "data" in result && result.data) {
                defaultGoalId = result.data.id
                autoCreatedGoals.push("General")
            }
        }

        if (defaultGoalId) {
            for (const objTitle of neededObjectiveTitles) {
                const fd = new FormData()
                fd.set("title", objTitle.slice(0, 200))
                fd.set("parent_objective_id", defaultGoalId)

                const result = await createObjective(fd)
                if ("objectiveId" in result && result.objectiveId) {
                    objectiveTitleToId.set(objTitle, result.objectiveId)
                    autoCreatedObjectives.push(objTitle)
                    console.info("[ProposedActions] Auto-created objective:", { title: objTitle, id: result.objectiveId })
                } else {
                    console.warn("[ProposedActions] Failed to auto-create objective:", { title: objTitle, error: result.error })
                }
            }
        }
    }

    // ── Phase 2: Schedule and create tasks ─────────────────────────────────
    // Group task indices by objective so we can stagger dates within each objective
    const tasksByObjective = new Map<string, number[]>()
    for (const i of createIndices) {
        if (!selected.has(i) || executed[i]) continue
        const p = proposals[i]
        if (p.type !== "task" || !p.objectiveTitle?.trim()) continue
        const objTitle = p.objectiveTitle.trim()
        const existing = tasksByObjective.get(objTitle) ?? []
        existing.push(i)
        tasksByObjective.set(objTitle, existing)
    }

    // INTENT: Objectives run in parallel with a small stagger (1 work week per
    // objective) so the timeline shows overlapping work streams, not a sequential
    // waterfall that bunches everything at the end.
    const OBJECTIVE_STAGGER_DAYS = 5
    const taskDatesMap = new Map<number, { start_date: string; end_date: string }>()
    let objectiveIndex = 0
    for (const [, taskIndices] of tasksByObjective) {
        const scheduleInputs = taskIndices.map((i) => ({
            title: proposals[i].title,
            estimatedDays: proposals[i].estimatedWeeks
                ? proposals[i].estimatedWeeks * 5 // weeks → working days
                : undefined,
        }))
        const startFrom = objectiveIndex > 0
            ? addWorkingDays(new Date(), objectiveIndex * OBJECTIVE_STAGGER_DAYS)
            : undefined
        const scheduled = scheduleTaskDates(scheduleInputs, startFrom)
        taskIndices.forEach((taskIdx, schedIdx) => {
            taskDatesMap.set(taskIdx, scheduled[schedIdx])
        })
        objectiveIndex++
    }

    // Now create tasks with their scheduled dates
    for (const i of createIndices) {
        if (!selected.has(i) || executed[i]) continue
        const p = proposals[i]
        if (p.type !== "task") continue

        onProgress?.(completedItems, totalItems, p.title)

        if (!p.objectiveTitle?.trim()) {
            rejectedTasks.push(p.title)
            results[i] = { success: false }
            onItemComplete?.(i, { success: false })
            completedItems++
            console.warn("[ProposedActions] Rejected task — missing objectiveTitle:", { title: p.title })
            continue
        }

        let objectiveId = resolveBatchObjective(p.objectiveTitle)
        if (!objectiveId) {
            objectiveId = resolveExistingObjective(p.objectiveTitle)
        }

        if (!objectiveId) {
            rejectedTasks.push(p.title)
            results[i] = { success: false }
            onItemComplete?.(i, { success: false })
            completedItems++
            console.warn("[ProposedActions] Rejected task — objective not found:", {
                title: p.title,
                objectiveTitle: p.objectiveTitle,
            })
            continue
        }

        const fd = new FormData()
        fd.set("title", p.title.trim().slice(0, 500))
        if (p.description?.trim()) {
            fd.set("description", p.description.trim().slice(0, 10000))
        }
        fd.set("assignee_id", userId)
        fd.set("assignee_ids", JSON.stringify([userId]))
        fd.set("objective_id", objectiveId)
        if (rolloutId) fd.set("rollout_id", rolloutId)
        if (sourceThreadId) fd.set("source_thread_id", sourceThreadId)

        // INTENT: Explicit dates from the LLM override staggered schedule
        const explicitDates = resolveDatesFromProposal(p)
        if (explicitDates) {
            fd.set("start_date", explicitDates.startDate)
            fd.set("end_date", explicitDates.endDate)
        } else {
            // Fall back to staggered dates from schedule computation
            const dates = taskDatesMap.get(i)
            if (dates) {
                fd.set("start_date", dates.start_date)
                fd.set("end_date", dates.end_date)
            }
        }

        const result = await createTask(fd)
        if (result.error) {
            results[i] = { success: false }
            failedTasks.push({ title: p.title, error: result.error })
            onItemComplete?.(i, { success: false })
            completedItems++
            console.warn("[ProposedActions] Failed to create task:", { title: p.title, error: result.error })
            continue
        }
        if ("taskId" in result && result.taskId) {
            results[i] = { success: true, id: result.taskId }
            onItemComplete?.(i, { success: true, id: result.taskId })
            completedItems++
        }
    }

    return { results, rejectedObjectives, rejectedTasks, failedTasks, autoCreatedGoals, autoCreatedObjectives }
}

export function ProposedActionsCard({
    proposals,
    specialist,
    onDismiss,
    onCreated,
    rolloutId,
    sourceThreadId,
}: ProposedActionsCardProps) {
    const [isExecuting, setIsExecuting] = useState(false)
    const [dismissed, setDismissed] = useState(false)
    const [executed, setExecuted] = useState<ExecutedState>({})

    // Track which section is currently running so we can disable the other
    const [activeSection, setActiveSection] = useState<"archive" | "create" | "all" | null>(null)

    // Selection state: all items start selected
    const [selected, setSelected] = useState<Set<number>>(
        () => new Set(proposals.map((_, i) => i))
    )

    // Collapsible groups (strategic goals) — start expanded so all tasks are visible
    const [collapsedGoals, setCollapsedGoals] = useState<Set<string>>(() => new Set())

    // Progress indicator during execution
    const [progress, setProgress] = useState<{ completed: number; total: number; current: string } | null>(null)

    const toggleItem = useCallback((index: number) => {
        setSelected((prev) => {
            const next = new Set(prev)
            if (next.has(index)) {
                next.delete(index)
            } else {
                next.add(index)
            }
            return next
        })
    }, [])

    const toggleGoal = useCallback((goalTitle: string) => {
        setCollapsedGoals((prev) => {
            const next = new Set(prev)
            if (next.has(goalTitle)) {
                next.delete(goalTitle)
            } else {
                next.add(goalTitle)
            }
            return next
        })
    }, [])

    // Derived counts
    const archiveIndices = useMemo(
        () => proposals.map((p, i) => ({ p, i })).filter(({ p }) => isDestructiveAction(p)).map(({ i }) => i),
        [proposals]
    )
    const createIndices = useMemo(
        () => proposals.map((p, i) => ({ p, i })).filter(({ p }) => !isDestructiveAction(p)).map(({ i }) => i),
        [proposals]
    )

    const selectedArchiveCount = useMemo(
        () => archiveIndices.filter((i) => selected.has(i)).length,
        [archiveIndices, selected]
    )
    const selectedCreateCount = useMemo(
        () => createIndices.filter((i) => selected.has(i)).length,
        [createIndices, selected]
    )

    const hasArchiveActions = archiveIndices.length > 0
    const hasCreateActions = createIndices.length > 0

    // Track if all archives are done (to auto-collapse)
    const allArchivesDone = useMemo(
        () => archiveIndices.length > 0 && archiveIndices.every((i) => executed[i] !== undefined),
        [archiveIndices, executed]
    )
    const allCreatesDone = useMemo(
        () => createIndices.length > 0 && createIndices.every((i) => executed[i] !== undefined),
        [createIndices, executed]
    )

    /** Groups create-actions into strategic goal → objectives → tasks hierarchy for display. */
    const hierarchyGroups = useMemo(() => {
        type ObjectiveGroup = {
            title: string
            index: number // proposal index (-1 if not in batch, just referenced by tasks)
            tasks: number[] // proposal indices
        }
        type GoalGroup = {
            title: string
            objectives: ObjectiveGroup[]
            allIndices: number[] // all proposal indices under this goal
        }

        const goalMap = new Map<string, { objectives: Map<string, ObjectiveGroup> }>()

        // Pass 1: register objectives under their strategic goals
        for (const i of createIndices) {
            const p = proposals[i]
            if (p.type !== "objective") continue
            const goalTitle = p.strategicGoalTitle?.trim() || "Uncategorized"
            if (!goalMap.has(goalTitle)) goalMap.set(goalTitle, { objectives: new Map() })
            goalMap.get(goalTitle)!.objectives.set(normalizeTitle(p.title), {
                title: p.title.trim(),
                index: i,
                tasks: [],
            })
        }

        // Pass 2: assign tasks to their objectives using fuzzy matching
        for (const i of createIndices) {
            const p = proposals[i]
            if (p.type !== "task") continue
            const objTitleNorm = normalizeTitle(p.objectiveTitle || "")
            let placed = false

            for (const [, group] of goalMap) {
                // Exact normalized match
                if (group.objectives.has(objTitleNorm)) {
                    group.objectives.get(objTitleNorm)!.tasks.push(i)
                    placed = true
                    break
                }
                // Substring fuzzy match
                for (const [normKey, obj] of group.objectives) {
                    if (objTitleNorm.includes(normKey) || normKey.includes(objTitleNorm)) {
                        obj.tasks.push(i)
                        placed = true
                        break
                    }
                }
                if (placed) break
            }

            if (!placed && p.objectiveTitle?.trim()) {
                const fallbackGoal = "Other"
                if (!goalMap.has(fallbackGoal)) goalMap.set(fallbackGoal, { objectives: new Map() })
                const objGroup = goalMap.get(fallbackGoal)!.objectives
                if (!objGroup.has(objTitleNorm)) {
                    objGroup.set(objTitleNorm, { title: p.objectiveTitle.trim(), index: -1, tasks: [] })
                }
                objGroup.get(objTitleNorm)!.tasks.push(i)
            }
        }

        // Convert to array sorted by first objective index
        const groups: GoalGroup[] = []
        for (const [goalTitle, { objectives }] of goalMap) {
            const objs = Array.from(objectives.values())
            const allIndices = objs.flatMap((o) => [
                ...(o.index >= 0 ? [o.index] : []),
                ...o.tasks,
            ])
            groups.push({ title: goalTitle, objectives: objs, allIndices })
        }
        return groups
    }, [proposals, createIndices])

    // ─── Execute only archive actions ────────────────────────────────────────────
    const handleExecuteArchives = useCallback(async () => {
        setIsExecuting(true)
        setActiveSection("archive")
        const results: ExecutedState = { ...executed }

        try {
            for (const i of archiveIndices) {
                if (!selected.has(i)) continue
                if (executed[i]) continue // already processed
                const p = proposals[i]

                if (p.type === "archive_objective") {
                    const result = await archiveObjectiveByTitle(p.title)
                    if ("error" in result) {
                        console.warn("[ProposedActions] Failed to archive objective:", { title: p.title, error: result.error })
                        results[i] = { success: false }
                    } else {
                        results[i] = { success: true, id: result.objectiveId }
                    }
                } else if (p.type === "archive_task") {
                    const result = await archiveTaskByTitle(p.title)
                    if ("error" in result) {
                        console.warn("[ProposedActions] Failed to archive task:", { title: p.title, error: result.error })
                        results[i] = { success: false }
                    } else {
                        results[i] = { success: true, id: result.taskId }
                    }
                }
            }

            setExecuted(results)

            const archivedCount = archiveIndices
                .filter((i) => results[i]?.success)
                .length
            if (archivedCount > 0) {
                toast.success(`${archivedCount} item${archivedCount > 1 ? "s" : ""} archived`)
            }
            const failedCount = archiveIndices
                .filter((i) => selected.has(i) && results[i] && !results[i].success)
                .length
            if (failedCount > 0) {
                toast.warning(`${failedCount} item${failedCount > 1 ? "s" : ""} could not be found to archive`)
            }

            onCreated?.(archivedCount)
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to archive"
            toast.error(message)
        } finally {
            setIsExecuting(false)
            setActiveSection(null)
        }
    }, [proposals, selected, executed, archiveIndices, onCreated])

    // ─── Execute only create actions ─────────────────────────────────────────────
    const handleExecuteCreates = useCallback(async () => {
        const supabase = createClient()
        const {
            data: { user },
        } = await supabase.auth.getUser()
        if (!user) {
            toast.error("You must be signed in")
            return
        }

        setIsExecuting(true)
        setActiveSection("create")
        setProgress({ completed: 0, total: 0, current: "" })

        try {
            const {
                results,
                rejectedObjectives,
                rejectedTasks,
                failedTasks,
                autoCreatedGoals,
                autoCreatedObjectives,
            } = await executeCreateActions({
                proposals,
                createIndices,
                selected,
                executed,
                userId: user.id,
                rolloutId,
                sourceThreadId,
                onProgress: (completed, total, current) => setProgress({ completed, total, current }),
                onItemComplete: (index, result) => setExecuted((prev) => ({ ...prev, [index]: result })),
            })

            setExecuted(results)

            const createdCount = createIndices.filter((i) => results[i]?.success).length
            if (createdCount > 0) {
                toast.success(`${createdCount} item${createdCount > 1 ? "s" : ""} created`)
            }
            if (autoCreatedGoals.length > 0) {
                toast.info(
                    `Auto-created ${autoCreatedGoals.length} strategic goal${autoCreatedGoals.length > 1 ? "s" : ""}: ${autoCreatedGoals.join(", ")}`,
                    { duration: 5000 }
                )
            }
            if (autoCreatedObjectives.length > 0) {
                toast.info(
                    `Auto-created ${autoCreatedObjectives.length} objective${autoCreatedObjectives.length > 1 ? "s" : ""}: ${autoCreatedObjectives.join(", ")}`,
                    { duration: 5000 }
                )
            }
            if (rejectedObjectives.length > 0) {
                toast.error(
                    `${rejectedObjectives.length} objective${rejectedObjectives.length > 1 ? "s" : ""} rejected — must belong to a strategic goal`,
                    { duration: 6000 }
                )
            }
            if (rejectedTasks.length > 0) {
                toast.error(
                    `${rejectedTasks.length} task${rejectedTasks.length > 1 ? "s" : ""} rejected — must belong to an objective`,
                    { duration: 6000 }
                )
            }
            if (failedTasks.length > 0) {
                toast.error(
                    `${failedTasks.length} task${failedTasks.length > 1 ? "s" : ""} failed: ${failedTasks[0].error}`,
                    { duration: 6000 }
                )
            }

            onCreated?.(createdCount)
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to create"
            toast.error(message)
        } finally {
            setIsExecuting(false)
            setActiveSection(null)
            setProgress(null)
        }
    }, [proposals, selected, executed, createIndices, onCreated, rolloutId])

    // ─── Execute all: archive first, then create ─────────────────────────────────
    const handleExecuteAll = useCallback(async () => {
        const supabase = createClient()
        const {
            data: { user },
        } = await supabase.auth.getUser()
        if (!user) {
            toast.error("You must be signed in")
            return
        }

        if (selected.size === 0) {
            toast.error("No items selected")
            return
        }

        setIsExecuting(true)
        setActiveSection("all")
        setProgress({ completed: 0, total: 0, current: "" })
        const archiveResults: ExecutedState = { ...executed }

        try {
            // Phase 1: Archive actions first
            for (const i of archiveIndices) {
                if (!selected.has(i)) continue
                if (executed[i]) continue
                const p = proposals[i]

                if (p.type === "archive_objective") {
                    const result = await archiveObjectiveByTitle(p.title)
                    if ("error" in result) {
                        console.warn("[ProposedActions] Failed to archive objective:", { title: p.title, error: result.error })
                        archiveResults[i] = { success: false }
                    } else {
                        archiveResults[i] = { success: true, id: result.objectiveId }
                    }
                } else if (p.type === "archive_task") {
                    const result = await archiveTaskByTitle(p.title)
                    if ("error" in result) {
                        console.warn("[ProposedActions] Failed to archive task:", { title: p.title, error: result.error })
                        archiveResults[i] = { success: false }
                    } else {
                        archiveResults[i] = { success: true, id: result.taskId }
                    }
                }
            }

            // Phase 2+: Create with auto-hierarchy (strategic goals + objectives auto-created)
            const {
                results: createResults,
                rejectedObjectives,
                rejectedTasks,
                failedTasks,
                autoCreatedGoals,
                autoCreatedObjectives,
            } = await executeCreateActions({
                proposals,
                createIndices,
                selected,
                executed: archiveResults,
                userId: user.id,
                rolloutId,
                sourceThreadId,
                onProgress: (completed, total, current) => setProgress({ completed, total, current }),
                onItemComplete: (index, result) => setExecuted((prev) => ({ ...prev, [index]: result })),
            })

            const allResults = { ...archiveResults, ...createResults }
            setExecuted(allResults)

            // Summary toasts
            const archivedCount = archiveIndices.filter((i) => allResults[i]?.success).length
            const createdCount = createIndices.filter((i) => allResults[i]?.success).length
            const parts: string[] = []
            if (archivedCount > 0) parts.push(`${archivedCount} archived`)
            if (createdCount > 0) parts.push(`${createdCount} created`)
            if (parts.length > 0) toast.success(parts.join(", "), { duration: 3000 })

            if (autoCreatedGoals.length > 0) {
                toast.info(
                    `Auto-created ${autoCreatedGoals.length} strategic goal${autoCreatedGoals.length > 1 ? "s" : ""}: ${autoCreatedGoals.join(", ")}`,
                    { duration: 5000 }
                )
            }
            if (autoCreatedObjectives.length > 0) {
                toast.info(
                    `Auto-created ${autoCreatedObjectives.length} objective${autoCreatedObjectives.length > 1 ? "s" : ""}: ${autoCreatedObjectives.join(", ")}`,
                    { duration: 5000 }
                )
            }
            if (rejectedObjectives.length > 0) {
                toast.error(
                    `${rejectedObjectives.length} objective${rejectedObjectives.length > 1 ? "s" : ""} rejected — must belong to a strategic goal`,
                    { duration: 6000 }
                )
            }
            if (rejectedTasks.length > 0) {
                toast.error(
                    `${rejectedTasks.length} task${rejectedTasks.length > 1 ? "s" : ""} rejected — must belong to an objective`,
                    { duration: 6000 }
                )
            }
            if (failedTasks.length > 0) {
                toast.error(
                    `${failedTasks.length} task${failedTasks.length > 1 ? "s" : ""} failed: ${failedTasks[0].error}`,
                    { duration: 6000 }
                )
            }

            onCreated?.(archivedCount + createdCount)
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to execute"
            toast.error(message)
        } finally {
            setIsExecuting(false)
            setActiveSection(null)
            setProgress(null)
        }
    }, [proposals, selected, executed, archiveIndices, createIndices, onCreated, rolloutId])

    const handleDismiss = useCallback(() => {
        setDismissed(true)
        onDismiss()
    }, [onDismiss])

    if (dismissed) return null

    const allDone =
        Object.keys(executed).length > 0 &&
        [...selected].every((i) => executed[i] !== undefined)

    // Global button label (for "Apply all selected")
    function getGlobalButtonLabel(): string {
        const totalSelected = selectedArchiveCount + selectedCreateCount
        if (totalSelected === 0) return "Apply selected"
        if (selectedArchiveCount > 0 && selectedCreateCount > 0) {
            return `Apply all ${totalSelected} selected`
        }
        if (selectedArchiveCount > 0) {
            return `Archive ${selectedArchiveCount} selected`
        }
        return `Create ${selectedCreateCount} selected`
    }

    return (
        <div className="mb-4 p-3 rounded-lg bg-international-orange/5 border border-international-orange/20">
            {/* Header */}
            <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                    {specialist.avatarImage ? (
                        <div className="relative h-6 w-6 rounded-full overflow-hidden flex-shrink-0">
                            <Image
                                src={specialist.avatarImage}
                                alt={specialist.name}
                                fill
                                unoptimized
                                className="object-cover"
                                sizes="24px"
                            />
                        </div>
                    ) : null}
                    <p className="text-xs font-medium text-international-orange">
                        Suggested actions
                    </p>
                </div>
                <div className="flex items-center gap-1">
                    {!allDone ? (
                        <>
                            <Button
                                variant="secondary"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={handleDismiss}
                                disabled={isExecuting}
                            >
                                <X className="h-3 w-3 mr-1" />
                                Dismiss
                            </Button>
                            {/* Global "Apply all" only when both sections exist */}
                            {hasArchiveActions && hasCreateActions && !allArchivesDone && !allCreatesDone ? (
                                <Button
                                    size="sm"
                                    className="h-7 text-xs bg-international-orange hover:bg-international-orange-hover"
                                    onClick={handleExecuteAll}
                                    disabled={isExecuting || selected.size === 0}
                                >
                                    {isExecuting && activeSection === "all" ? (
                                        <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                    ) : null}
                                    {getGlobalButtonLabel()}
                                </Button>
                            ) : null}
                        </>
                    ) : null}
                </div>
            </div>

            {/* ─── Archive section ───────────────────────────────────────────────── */}
            {hasArchiveActions ? (
                <div className={cn("space-y-1.5", allArchivesDone ? "mb-2" : "mb-3")}>
                    <div className="flex items-center justify-between">
                        <p className="text-xs font-medium text-destructive flex items-center gap-1">
                            <Archive className="h-3 w-3" />
                            Remove
                        </p>
                        {!allArchivesDone ? (
                            <Button
                                variant="destructive"
                                size="sm"
                                className="h-6 text-[11px] px-2"
                                onClick={handleExecuteArchives}
                                disabled={isExecuting || selectedArchiveCount === 0}
                            >
                                {isExecuting && activeSection === "archive" ? (
                                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                ) : null}
                                {selectedArchiveCount === archiveIndices.length
                                    ? `Archive all (${selectedArchiveCount})`
                                    : `Archive ${selectedArchiveCount} selected`}
                            </Button>
                        ) : (
                            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                                <Check className="h-3 w-3" /> Done
                            </span>
                        )}
                    </div>

                    {/* Collapse completed archive items */}
                    {allArchivesDone ? (
                        <p className="text-xs text-muted-foreground">
                            {archiveIndices.length} item{archiveIndices.length > 1 ? "s" : ""} archived
                        </p>
                    ) : (
                        proposals.map((p, i) => {
                            if (!isDestructiveAction(p)) return null
                            const result = executed[i]
                            const isSelected = selected.has(i)
                            const isArchiveObj = p.type === "archive_objective"
                            const isDone = result !== undefined

                            return (
                                <button
                                    type="button"
                                    key={`${p.type}-${i}-${p.title}`}
                                    onClick={() => { if (!isDone && !isExecuting) toggleItem(i) }}
                                    disabled={isDone || isExecuting}
                                    className={cn(
                                        "flex items-center gap-2 rounded-md border px-3 py-2 text-sm w-full text-left transition-colors",
                                        isDone && result.success
                                            ? "bg-muted border-muted line-through opacity-60"
                                            : isDone && !result.success
                                              ? "bg-status-error-light border-destructive"
                                              : isSelected
                                                ? "bg-destructive/5 border-destructive/20 hover:bg-destructive/10"
                                                : "bg-muted/30 border-muted opacity-50 hover:opacity-70"
                                    )}
                                >
                                    {!isDone ? (
                                        <Checkbox
                                            checked={isSelected}
                                            onCheckedChange={() => toggleItem(i)}
                                            disabled={isExecuting}
                                            className={cn(
                                                "flex-shrink-0",
                                                isSelected
                                                    ? "border-destructive data-[state=checked]:bg-destructive data-[state=checked]:border-destructive"
                                                    : ""
                                            )}
                                            aria-label={`${isSelected ? "Deselect" : "Select"}: ${p.title}`}
                                        />
                                    ) : (
                                        <Trash2 className={cn(
                                            "h-3.5 w-3.5 flex-shrink-0",
                                            result.success ? "text-muted-foreground" : "text-destructive"
                                        )} />
                                    )}
                                    <div className="min-w-0 flex-1">
                                        <p className={cn(
                                            "font-medium truncate",
                                            isDone && result.success ? "text-muted-foreground" : "text-foreground"
                                        )}>
                                            {p.title}
                                        </p>
                                        {p.description ? (
                                            <p className="text-xs text-muted-foreground truncate">
                                                {p.description}
                                            </p>
                                        ) : null}
                                    </div>
                                    {isDone && result.success ? (
                                        <div className="flex items-center gap-1 flex-shrink-0">
                                            <Check className="h-4 w-4 text-muted-foreground" />
                                            <span className="text-xs text-muted-foreground">Archived</span>
                                        </div>
                                    ) : isDone && !result.success ? (
                                        <span className="text-xs text-destructive flex-shrink-0">Not found</span>
                                    ) : (
                                        <span className="text-xs text-destructive/60 flex-shrink-0">
                                            {isArchiveObj ? "Objective" : "Task"}
                                        </span>
                                    )}
                                </button>
                            )
                        })
                    )}
                </div>
            ) : null}

            {/* ─── Create section (grouped by strategic goal → objective → tasks) ── */}
            {hasCreateActions ? (
                <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                        <p className="text-xs font-medium text-status-success flex items-center gap-1">
                            <Target className="h-3 w-3" />
                            {hasArchiveActions ? "Replace with" : "Suggested actions"}
                        </p>
                        {!allCreatesDone ? (
                            <Button
                                size="sm"
                                className="h-6 text-[11px] px-2 bg-international-orange hover:bg-international-orange-hover"
                                onClick={handleExecuteCreates}
                                disabled={isExecuting || selectedCreateCount === 0}
                            >
                                {isExecuting && activeSection === "create" ? (
                                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                ) : null}
                                {selectedCreateCount === createIndices.length
                                    ? `Create all (${selectedCreateCount})`
                                    : `Create ${selectedCreateCount} selected`}
                            </Button>
                        ) : (
                            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                                <Check className="h-3 w-3" /> Done
                            </span>
                        )}
                    </div>

                    {/* Progress indicator during execution */}
                    {isExecuting && progress && progress.total > 0 ? (
                        <div className="space-y-1">
                            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                                <span className="truncate flex-1 mr-2">Creating: {progress.current}</span>
                                <span className="flex-shrink-0 font-medium">{progress.completed}/{progress.total}</span>
                            </div>
                            <div className="h-1 rounded-full bg-muted overflow-hidden">
                                <div
                                    className="h-full bg-international-orange rounded-full transition-all duration-300"
                                    style={{ width: `${Math.round((progress.completed / progress.total) * 100)}%` }}
                                />
                            </div>
                        </div>
                    ) : null}

                    {allCreatesDone ? (
                        <p className="text-xs text-muted-foreground">
                            {createIndices.length} item{createIndices.length > 1 ? "s" : ""} created
                        </p>
                    ) : (
                        <div className="space-y-1">
                            {hierarchyGroups.map((group) => {
                                const isExpanded = !collapsedGoals.has(group.title)
                                const groupDoneCount = group.allIndices.filter((i) => executed[i]?.success).length
                                const groupTotal = group.allIndices.length
                                const groupAllDone = groupTotal > 0 && group.allIndices.every((i) => executed[i] !== undefined)

                                return (
                                    <div key={group.title} className="rounded-md border border-muted overflow-hidden">
                                        {/* Strategic goal header — collapsible */}
                                        <button
                                            type="button"
                                            onClick={() => toggleGoal(group.title)}
                                            className={cn(
                                                "flex items-center gap-2 w-full px-3 py-2 text-left text-xs font-semibold transition-colors",
                                                groupAllDone
                                                    ? "bg-status-success-light/50 text-status-success-dark"
                                                    : "bg-muted/30 text-foreground hover:bg-muted/50"
                                            )}
                                        >
                                            {isExpanded ? (
                                                <ChevronDown className="h-3 w-3 flex-shrink-0" />
                                            ) : (
                                                <ChevronRight className="h-3 w-3 flex-shrink-0" />
                                            )}
                                            <Target className="h-3 w-3 flex-shrink-0 text-international-orange" />
                                            <span className="truncate flex-1">{group.title}</span>
                                            <span className="flex-shrink-0 text-[10px] font-normal text-muted-foreground">
                                                {groupAllDone ? (
                                                    <span className="flex items-center gap-1 text-status-success">
                                                        <Check className="h-3 w-3" /> {groupDoneCount}/{groupTotal}
                                                    </span>
                                                ) : groupDoneCount > 0 ? (
                                                    `${groupDoneCount}/${groupTotal} done`
                                                ) : (
                                                    `${groupTotal} item${groupTotal > 1 ? "s" : ""}`
                                                )}
                                            </span>
                                        </button>

                                        {/* Expanded content: objectives and tasks */}
                                        {isExpanded ? (
                                            <div className="px-2 py-1 space-y-0.5">
                                                {group.objectives.map((obj) => {
                                                    const objProposal = obj.index >= 0 ? proposals[obj.index] : null
                                                    const objResult = obj.index >= 0 ? executed[obj.index] : undefined
                                                    const objDone = objResult !== undefined
                                                    const objSelected = obj.index >= 0 && selected.has(obj.index)

                                                    return (
                                                        <div key={obj.title} className="space-y-0.5">
                                                            {/* Objective row */}
                                                            {objProposal ? (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => { if (!objDone && !isExecuting && obj.index >= 0) toggleItem(obj.index) }}
                                                                    disabled={objDone || isExecuting}
                                                                    className={cn(
                                                                        "flex items-center gap-2 rounded px-2 py-1.5 text-xs w-full text-left transition-colors",
                                                                        objDone && objResult?.success
                                                                            ? "bg-status-success-light/50"
                                                                            : objDone
                                                                              ? "bg-status-error-light/50"
                                                                              : objSelected
                                                                                ? "hover:bg-muted/30"
                                                                                : "opacity-50"
                                                                    )}
                                                                >
                                                                    {!objDone ? (
                                                                        <Checkbox
                                                                            checked={objSelected}
                                                                            onCheckedChange={() => obj.index >= 0 && toggleItem(obj.index)}
                                                                            disabled={isExecuting}
                                                                            className="flex-shrink-0 h-3.5 w-3.5"
                                                                            aria-label={`${objSelected ? "Deselect" : "Select"}: ${obj.title}`}
                                                                        />
                                                                    ) : (
                                                                        <Target className={cn("h-3.5 w-3.5 flex-shrink-0", objResult?.success ? "text-status-success" : "text-destructive")} />
                                                                    )}
                                                                    <span className={cn("font-semibold truncate flex-1", objDone && !objResult?.success ? "text-destructive" : "text-foreground")}>
                                                                        {obj.title}
                                                                    </span>
                                                                    {objDone && objResult?.success && objResult.id ? (
                                                                        <Link
                                                                            href={`/new-objectives?objectiveId=${objResult.id}`}
                                                                            className="text-[10px] text-international-orange hover:underline flex-shrink-0"
                                                                            onClick={(e) => e.stopPropagation()}
                                                                        >
                                                                            View
                                                                        </Link>
                                                                    ) : null}
                                                                </button>
                                                            ) : (
                                                                <p className="px-2 py-1 text-xs font-semibold text-muted-foreground flex items-center gap-2">
                                                                    <Target className="h-3 w-3 flex-shrink-0" />
                                                                    {obj.title}
                                                                </p>
                                                            )}

                                                            {/* Tasks under this objective */}
                                                            {obj.tasks.map((taskIdx) => {
                                                                const tp = proposals[taskIdx]
                                                                const taskResult = executed[taskIdx]
                                                                const taskDone = taskResult !== undefined
                                                                const taskSelected = selected.has(taskIdx)

                                                                return (
                                                                    <button
                                                                        type="button"
                                                                        key={`task-${taskIdx}`}
                                                                        onClick={() => { if (!taskDone && !isExecuting) toggleItem(taskIdx) }}
                                                                        disabled={taskDone || isExecuting}
                                                                        className={cn(
                                                                            "flex items-center gap-2 rounded px-2 py-1.5 ml-5 text-xs w-full text-left transition-colors",
                                                                            taskDone && taskResult?.success
                                                                                ? "bg-status-success-light/50"
                                                                                : taskDone
                                                                                  ? "bg-status-error-light/50"
                                                                                  : taskSelected
                                                                                    ? "hover:bg-muted/30"
                                                                                    : "opacity-50"
                                                                        )}
                                                                    >
                                                                        {!taskDone ? (
                                                                            <Checkbox
                                                                                checked={taskSelected}
                                                                                onCheckedChange={() => toggleItem(taskIdx)}
                                                                                disabled={isExecuting}
                                                                                className="flex-shrink-0 h-3.5 w-3.5"
                                                                                aria-label={`${taskSelected ? "Deselect" : "Select"}: ${tp.title}`}
                                                                            />
                                                                        ) : (
                                                                            <CheckSquare className={cn("h-3 w-3 flex-shrink-0", taskResult?.success ? "text-status-success" : "text-destructive")} />
                                                                        )}
                                                                        <div className="min-w-0 flex-1">
                                                                            <p className={cn("truncate", taskDone && !taskResult?.success ? "text-destructive" : "text-foreground")}>
                                                                                {tp.title}
                                                                            </p>
                                                                            {tp.description ? (
                                                                                <p className="text-[10px] text-muted-foreground truncate">{tp.description}</p>
                                                                            ) : null}
                                                                        </div>
                                                                        {taskDone && taskResult?.success && taskResult.id ? (
                                                                            <Link
                                                                                href={`/new-tasks?taskId=${taskResult.id}`}
                                                                                className="text-[10px] text-international-orange hover:underline flex-shrink-0"
                                                                                onClick={(e) => e.stopPropagation()}
                                                                            >
                                                                                View
                                                                            </Link>
                                                                        ) : null}
                                                                    </button>
                                                                )
                                                            })}
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        ) : null}
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
            ) : null}

            {/* ─── Completion message ────────────────────────────────────────────── */}
            {allDone ? (
                <p className="text-xs text-muted-foreground mt-2">
                    {hasArchiveActions && hasCreateActions
                        ? "Strategy updated. Old items archived, new items created."
                        : hasArchiveActions
                          ? "Items archived. You can continue the conversation."
                          : "All items created. You can continue the conversation or open them from Plan."}
                </p>
            ) : null}
        </div>
    )
}
