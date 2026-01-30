import { useState, useEffect, useRef, useCallback } from "react"
import { getTaskAttachments } from "@/actions/tasks"
import { uploadTaskAttachment } from "@/actions/attachments"
import { toast } from "sonner"

interface TaskAttachment {
  id: string
  file_name: string
  file_path: string
  file_size: number
  mime_type: string
  uploaded_by: string
  created_at: string
}

interface UseTaskCardStateProps {
  taskId: string
  expanded: boolean
}

export function useTaskCardState({ taskId, expanded }: UseTaskCardStateProps) {
  // Loading states
  const [isLoading, setIsLoading] = useState(false)
  const [aiRunning, setAiRunning] = useState(false)

  // Dialog states
  const [rejectOpen, setRejectOpen] = useState(false)
  const [forwardOpen, setForwardOpen] = useState(false)
  const [showThread, setShowThread] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [rubberStampOpen, setRubberStampOpen] = useState(false)
  const [fullViewOpen, setFullViewOpen] = useState(false)
  const [assigneePopoverOpen, setAssigneePopoverOpen] = useState(false)
  const [assigneePopoverOpen2, setAssigneePopoverOpen2] = useState(false)

  // Forward dialog attachment states
  const [forwardAttachments, setForwardAttachments] = useState<TaskAttachment[]>([])
  const [forwardAttachmentsLoading, setForwardAttachmentsLoading] = useState(false)
  const [forwardUploading, setForwardUploading] = useState(false)
  const forwardFileInputRef = useRef<HTMLInputElement>(null)

  // Close inline panels when card collapses
  useEffect(() => {
    if (!expanded) {
      setShowThread(false)
      setShowHistory(false)
    }
  }, [expanded])

  // Load attachments when forward dialog opens
  useEffect(() => {
    if (forwardOpen) {
      setForwardAttachmentsLoading(true)
      getTaskAttachments(taskId).then(res => {
        if (res.data) {
          setForwardAttachments(res.data as TaskAttachment[])
        }
        setForwardAttachmentsLoading(false)
      })
    }
  }, [forwardOpen, taskId])

  // Handle file upload in forward dialog
  const handleForwardFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    setForwardUploading(true)
    try {
      for (const file of Array.from(files)) {
        const formData = new FormData()
        formData.append('file', file)
        const result = await uploadTaskAttachment(taskId, formData)
        if (result.error) {
          toast.error(`Failed to upload ${file.name}: ${result.error}`)
        }
      }
      // Refresh attachments
      const res = await getTaskAttachments(taskId)
      if (res.data) {
        setForwardAttachments(res.data as TaskAttachment[])
      }
    } finally {
      setForwardUploading(false)
      if (forwardFileInputRef.current) {
        forwardFileInputRef.current.value = ''
      }
    }
  }, [taskId])

  return {
    // Loading states
    isLoading,
    setIsLoading,
    aiRunning,
    setAiRunning,

    // Dialog states
    rejectOpen,
    setRejectOpen,
    forwardOpen,
    setForwardOpen,
    showThread,
    setShowThread,
    editOpen,
    setEditOpen,
    showHistory,
    setShowHistory,
    rubberStampOpen,
    setRubberStampOpen,
    fullViewOpen,
    setFullViewOpen,
    assigneePopoverOpen,
    setAssigneePopoverOpen,
    assigneePopoverOpen2,
    setAssigneePopoverOpen2,

    // Forward dialog attachment states
    forwardAttachments,
    forwardAttachmentsLoading,
    forwardUploading,
    forwardFileInputRef,
    handleForwardFileUpload,
  }
}
