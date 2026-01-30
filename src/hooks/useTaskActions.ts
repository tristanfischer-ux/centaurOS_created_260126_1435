import { useCallback } from "react"
import {
  acceptTask,
  rejectTask,
  forwardTask,
  completeTask,
  duplicateTask,
  triggerAIWorker,
  updateTaskDates,
  updateTaskAssignees,
} from "@/actions/tasks"
import { toast } from "sonner"

interface TaskAssignee {
  id: string
  full_name: string | null
  role: string
  email: string
  avatar_url?: string | null
}

interface Member {
  id: string
  full_name: string
  role: string
}

interface UseTaskActionsProps {
  taskId: string
  taskStartDate: string | null
  taskEndDate: string | null
  currentAssignees: TaskAssignee[]
  members: Member[]
  setIsLoading: (loading: boolean) => void
  setAiRunning: (running: boolean) => void
  setRejectOpen: (open: boolean) => void
  setForwardOpen: (open: boolean) => void
  setOptimisticAssignees: (assignees: TaskAssignee[]) => void
}

export function useTaskActions({
  taskId,
  taskStartDate,
  taskEndDate,
  currentAssignees,
  members,
  setIsLoading,
  setAiRunning,
  setRejectOpen,
  setForwardOpen,
  setOptimisticAssignees,
}: UseTaskActionsProps) {
  const handleAccept = useCallback(async () => {
    setIsLoading(true)
    const res = await acceptTask(taskId)
    setIsLoading(false)
    if (res.error) toast.error(res.error)
    else toast.success("Task accepted")
  }, [taskId, setIsLoading])

  const handleReject = useCallback(
    async (formData: FormData) => {
      setIsLoading(true)
      const reason = formData.get("reason") as string
      const res = await rejectTask(taskId, reason)
      setIsLoading(false)
      setRejectOpen(false)
      if (res.error) toast.error(res.error)
      else toast.success("Task rejected")
    },
    [taskId, setIsLoading, setRejectOpen]
  )

  const handleForward = useCallback(
    async (formData: FormData) => {
      setIsLoading(true)
      const newAssigneeId = formData.get("new_assignee_id") as string
      const reason = formData.get("reason") as string
      const res = await forwardTask(taskId, newAssigneeId, reason)
      setIsLoading(false)
      setForwardOpen(false)
      if (res.error) toast.error(res.error)
      else toast.success("Task forwarded")
    },
    [taskId, setIsLoading, setForwardOpen]
  )

  const handleComplete = useCallback(async () => {
    setIsLoading(true)
    const res = await completeTask(taskId)
    setIsLoading(false)
    if (res.error) toast.error(res.error)
    else {
      if (res.newStatus === "Completed") {
        toast.success("Task completed")
      } else {
        toast.info(`Task moved to ${res.newStatus?.replace(/_/g, " ")}`)
      }
    }
  }, [taskId, setIsLoading])

  const handleDuplicate = useCallback(async () => {
    setIsLoading(true)
    const res = await duplicateTask(taskId)
    setIsLoading(false)
    if (res.error) toast.error(res.error)
    else toast.success("Task duplicated")
  }, [taskId, setIsLoading])

  const handleRunAI = useCallback(async () => {
    setAiRunning(true)
    const res = await triggerAIWorker(taskId)
    setAiRunning(false)
    if (res.error) toast.error(res.error)
    else toast.success("AI Agent triggered")
  }, [taskId, setAiRunning])

  const handleDateUpdate = useCallback(
    async (type: "start" | "end", date: Date | undefined) => {
      if (!date) return
      const newDateStr = date.toISOString()
      const currentStart = taskStartDate || new Date().toISOString()
      const currentEnd = taskEndDate || new Date().toISOString()
      setIsLoading(true)
      if (type === "start") {
        await updateTaskDates(taskId, newDateStr, currentEnd)
      } else {
        await updateTaskDates(taskId, currentStart, newDateStr)
      }
      setIsLoading(false)
      toast.success("Date updated")
    },
    [taskId, taskStartDate, taskEndDate, setIsLoading]
  )

  const handleAssigneeToggle = useCallback(
    async (memberId: string) => {
      const currentIds = currentAssignees.map((a) => a.id)
      const previousAssignees = [...currentAssignees]
      let newAssignees: typeof currentAssignees

      if (currentIds.includes(memberId)) {
        // Remove
        if (currentAssignees.length <= 1) {
          toast.error("Task must have at least one assignee")
          return
        }
        newAssignees = currentAssignees.filter((a) => a.id !== memberId)
      } else {
        // Add - find the member from the members list
        const memberToAdd = members.find((m) => m.id === memberId)
        if (memberToAdd) {
          newAssignees = [
            ...currentAssignees,
            { ...memberToAdd, email: "", avatar_url: null },
          ]
        } else {
          return
        }
      }

      // Optimistic update - immediately update UI
      setOptimisticAssignees(newAssignees)

      // Server update in background
      const newIds = newAssignees.map((a) => a.id)
      const result = await updateTaskAssignees(taskId, newIds)

      if (result.error) {
        // Revert on error
        setOptimisticAssignees(previousAssignees)
        toast.error(result.error)
      }
      // No toast on success - the instant UI update is feedback enough
    },
    [taskId, currentAssignees, members, setOptimisticAssignees]
  )

  return {
    handleAccept,
    handleReject,
    handleForward,
    handleComplete,
    handleDuplicate,
    handleRunAI,
    handleDateUpdate,
    handleAssigneeToggle,
  }
}
