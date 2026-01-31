/**
 * Utility functions for objective planning
 */

/**
 * Helper function to calculate task dates based on dependencies
 * Takes a start date and array of task durations, returns dates for each task
 * 
 * @param startDate - The date to start planning from
 * @param taskDurations - Array of {index, durationDays, dependsOn} objects
 * @returns Array of {startDate, endDate} for each task index
 */
export function calculateTaskDates(
    startDate: Date,
    taskDurations: Array<{
        index: number
        durationDays: number
        dependsOn?: number[] // Indices of tasks this depends on
    }>
): Array<{ index: number; startDate: string; endDate: string }> {
    const results: Map<number, { startDate: Date; endDate: Date }> = new Map()
    
    // Sort by dependency order (tasks with no deps first)
    const sorted = [...taskDurations].sort((a, b) => {
        const aDeps = a.dependsOn?.length || 0
        const bDeps = b.dependsOn?.length || 0
        return aDeps - bDeps
    })

    for (const task of sorted) {
        let taskStart: Date

        if (!task.dependsOn || task.dependsOn.length === 0) {
            // No dependencies - start from the global start date
            taskStart = new Date(startDate)
        } else {
            // Has dependencies - start after all dependencies complete
            const depEndDates = task.dependsOn.map(depIndex => {
                const dep = results.get(depIndex)
                return dep ? dep.endDate : startDate
            })
            const latestDepEnd = new Date(Math.max(...depEndDates.map(d => d.getTime())))
            taskStart = new Date(latestDepEnd)
            taskStart.setDate(taskStart.getDate() + 1) // Start day after dependency ends
        }

        const taskEnd = new Date(taskStart)
        taskEnd.setDate(taskEnd.getDate() + task.durationDays - 1) // -1 because start day counts

        results.set(task.index, { startDate: taskStart, endDate: taskEnd })
    }

    return Array.from(results.entries()).map(([index, dates]) => ({
        index,
        startDate: dates.startDate.toISOString(),
        endDate: dates.endDate.toISOString()
    }))
}
