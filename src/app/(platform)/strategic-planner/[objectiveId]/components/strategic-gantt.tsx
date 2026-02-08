"use client"

/**
 * @description Simple Gantt chart view using gantt-task-react.
 * Secondary visualization toggle for users who prefer a traditional Gantt.
 */

import React, { useMemo } from "react"
import { Gantt, ViewMode, type Task as GanttTask } from "gantt-task-react"
import "gantt-task-react/dist/index.css"
import type { StrategicPlanOverview, CanvasGrouping } from "@/types/strategic-planner"

interface StrategicGanttProps {
  planData: StrategicPlanOverview
  grouping: CanvasGrouping
}

export function StrategicGantt({ planData, grouping }: StrategicGanttProps) {
  const ganttTasks = useMemo(() => {
    const tasks: GanttTask[] = []
    const today = new Date()

    if (grouping === 'phase') {
      for (const phase of planData.phases) {
        // Phase as a project-level task
        const phaseTasks = phase.tasks.filter((t) => t.start_date && t.end_date)
        if (phaseTasks.length === 0) continue

        const phaseStart = new Date(
          Math.min(...phaseTasks.map((t) => new Date(t.start_date!).getTime()))
        )
        const phaseEnd = new Date(
          Math.max(...phaseTasks.map((t) => new Date(t.end_date!).getTime()))
        )

        tasks.push({
          start: phaseStart,
          end: phaseEnd,
          name: phase.objective.title,
          id: `phase-${phase.objective.id}`,
          type: 'project',
          progress: phase.objective.progress || 0,
          isDisabled: false,
          hideChildren: false,
          styles: {
            backgroundColor: 'hsl(var(--international-orange) / 0.15)',
            backgroundSelectedColor: 'hsl(var(--international-orange) / 0.25)',
            progressColor: 'hsl(var(--international-orange))',
            progressSelectedColor: 'hsl(var(--international-orange))',
          },
        })

        // Tasks within this phase
        for (const task of phaseTasks) {
          const isCritical = planData.criticalPathTaskIds.includes(task.id)
          const deps = task.dependencies.map((d) => `task-${d.depends_on_task_id}`)

          tasks.push({
            start: new Date(task.start_date!),
            end: new Date(task.end_date!),
            name: task.title,
            id: `task-${task.id}`,
            type: 'task',
            progress: task.progress ?? 0,
            project: `phase-${phase.objective.id}`,
            dependencies: deps,
            isDisabled: false,
            styles: isCritical
              ? {
                  backgroundColor: 'hsl(var(--international-orange) / 0.3)',
                  backgroundSelectedColor: 'hsl(var(--international-orange) / 0.5)',
                  progressColor: 'hsl(var(--international-orange))',
                  progressSelectedColor: 'hsl(var(--international-orange))',
                }
              : undefined,
          })
        }
      }
    } else {
      // Person grouping
      const allTasks = planData.phases.flatMap((p) => p.tasks)
      const tasksByPerson = new Map<string, typeof allTasks>()

      for (const task of allTasks) {
        if (!task.start_date || !task.end_date) continue
        const key = task.assignees[0]?.full_name || 'Unassigned'
        const existing = tasksByPerson.get(key) || []
        existing.push(task)
        tasksByPerson.set(key, existing)
      }

      for (const [name, personTasks] of tasksByPerson.entries()) {
        const start = new Date(
          Math.min(...personTasks.map((t) => new Date(t.start_date!).getTime()))
        )
        const end = new Date(
          Math.max(...personTasks.map((t) => new Date(t.end_date!).getTime()))
        )

        const personId = `person-${name.replace(/\s+/g, '-').toLowerCase()}`

        tasks.push({
          start,
          end,
          name,
          id: personId,
          type: 'project',
          progress: 0,
          isDisabled: false,
          hideChildren: false,
        })

        for (const task of personTasks) {
          const deps = task.dependencies.map((d) => `task-${d.depends_on_task_id}`)

          tasks.push({
            start: new Date(task.start_date!),
            end: new Date(task.end_date!),
            name: task.title,
            id: `task-${task.id}`,
            type: 'task',
            progress: task.progress ?? 0,
            project: personId,
            dependencies: deps,
            isDisabled: false,
          })
        }
      }
    }

    return tasks
  }, [planData, grouping])

  if (ganttTasks.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <p>No tasks with dates to display in Gantt view.</p>
      </div>
    )
  }

  return (
    <div className="w-full h-full overflow-auto p-4">
      <Gantt
        tasks={ganttTasks}
        viewMode={ViewMode.Week}
        listCellWidth=""
        columnWidth={60}
        barCornerRadius={4}
        todayColor="hsl(var(--international-orange) / 0.08)"
        arrowColor="hsl(var(--muted-foreground) / 0.4)"
        arrowIndent={20}
        fontSize="12"
        headerHeight={50}
        rowHeight={40}
        barFill={70}
      />
    </div>
  )
}
