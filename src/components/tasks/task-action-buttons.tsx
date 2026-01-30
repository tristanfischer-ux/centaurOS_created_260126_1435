"use client"

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { CardFooter } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { ForwardTaskDialog } from "@/components/tasks/forward-task-dialog"
import { ClientNudgeButton } from "@/components/smart-airlock/ClientNudgeButton"
import {
  Check,
  X,
  Pencil,
  Copy,
  HistoryIcon,
  MessageSquare,
  Maximize2,
  Bot,
  ShieldCheck,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface TaskAttachment {
  id: string
  file_name: string
  file_path: string
  file_size: number
  mime_type: string
  uploaded_by: string
  created_at: string
}

interface Member {
  id: string
  full_name: string
  role: string
}

interface TaskActionButtonsProps {
  task: {
    id: string
    status: string
    client_visible: boolean
    last_nudge_at: string | null
  }
  isAssignee: boolean
  isCreator: boolean
  isExecutive: boolean
  isAITask: boolean
  userRole?: string
  isLoading: boolean
  aiRunning: boolean
  rejectOpen: boolean
  setRejectOpen: (open: boolean) => void
  editOpen: boolean
  setEditOpen: (open: boolean) => void
  forwardOpen: boolean
  setForwardOpen: (open: boolean) => void
  showHistory: boolean
  setShowHistory: (show: boolean) => void
  showThread: boolean
  setShowThread: (show: boolean) => void
  fullViewOpen: boolean
  setFullViewOpen: (open: boolean) => void
  rubberStampOpen: boolean
  setRubberStampOpen: (open: boolean) => void
  handleAccept: () => void
  handleReject: (formData: FormData) => void
  handleComplete: () => void
  handleDuplicate: () => void
  handleRunAI: () => void
  handleForward: (formData: FormData) => void
  sortedMembers: Member[]
  forwardAttachments: TaskAttachment[]
  forwardAttachmentsLoading: boolean
  forwardUploading: boolean
  forwardFileInputRef: React.RefObject<HTMLInputElement>
  handleForwardFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void
  handleRemoveAttachment: (fileId: string) => void
}

export function TaskActionButtons({
  task,
  isAssignee,
  isCreator,
  isExecutive,
  isAITask,
  userRole,
  isLoading,
  aiRunning,
  rejectOpen,
  setRejectOpen,
  editOpen,
  setEditOpen,
  forwardOpen,
  setForwardOpen,
  showHistory,
  setShowHistory,
  showThread,
  setShowThread,
  fullViewOpen,
  setFullViewOpen,
  rubberStampOpen,
  setRubberStampOpen,
  handleAccept,
  handleReject,
  handleComplete,
  handleDuplicate,
  handleRunAI,
  handleForward,
  sortedMembers,
  forwardAttachments,
  forwardAttachmentsLoading,
  forwardUploading,
  forwardFileInputRef,
  handleForwardFileUpload,
  handleRemoveAttachment,
}: TaskActionButtonsProps) {
  const showAcceptReject = task.status === "Pending" && isAssignee
  const showMarkComplete =
    task.status === "Accepted" && (isAssignee || userRole === "Executive" || isCreator)
  const showCertify = task.status === "Pending_Executive_Approval" && isExecutive
  const hasPrimaryActions = showAcceptReject || showMarkComplete || showCertify

  return (
    <CardFooter className="bg-muted p-4 flex flex-col gap-4 mt-auto">
      {/* Primary Workflow Actions */}
      {hasPrimaryActions && (
        <>
          <div className="flex gap-4 w-full">
            {showAcceptReject && (
              <>
                <Button
                  onClick={handleAccept}
                  variant="success"
                  disabled={isLoading}
                  className="flex-1 shadow-sm font-medium"
                >
                  <Check className="h-4 w-4" /> Accept
                </Button>

                <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
                  <DialogTrigger asChild>
                    <Button
                      variant="secondary"
                      disabled={isLoading}
                      className="flex-1 border-destructive/30 text-destructive hover:bg-destructive/10 hover:border-destructive/50 shadow-sm font-medium"
                    >
                      <X className="h-4 w-4" /> Reject
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="bg-background shadow-xl text-foreground">
                    <DialogHeader>
                      <DialogTitle>Reject Task</DialogTitle>
                    </DialogHeader>
                    <form action={handleReject} className="space-y-4">
                      <Textarea
                        name="reason"
                        placeholder="Reason for rejection..."
                        required
                        className="bg-muted"
                      />
                      <Button type="submit" variant="destructive" className="w-full">
                        Confirm Rejection
                      </Button>
                    </form>
                  </DialogContent>
                </Dialog>
              </>
            )}

            {showMarkComplete && (
              <Button
                onClick={handleComplete}
                disabled={isLoading}
                className="w-full bg-foreground hover:bg-foreground/90 text-background shadow-sm font-medium"
              >
                <Check className="h-4 w-4" /> Mark Complete
              </Button>
            )}

            {showCertify && (
              <Button
                onClick={() => setRubberStampOpen(true)}
                variant="success"
                disabled={isLoading}
                className="w-full shadow-sm font-medium"
              >
                <ShieldCheck className="h-4 w-4" /> Certify Release
              </Button>
            )}
          </div>
          <Separator className="bg-muted/60" />
        </>
      )}

      {/* Secondary & Meta Actions */}
      <div className="flex items-center justify-between w-full gap-2 flex-wrap">
        {/* Tools Area */}
        <div className="flex items-center gap-1 flex-wrap">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditOpen(true)}
                disabled={isLoading}
                className="text-muted-foreground hover:text-electric-blue hover:bg-electric-blue-light active:text-electric-blue active:bg-electric-blue-light/80 active:scale-[0.98] transition-all duration-200 px-2 shrink-0"
              >
                <Pencil className="h-4 w-4" /> <span className="hidden xs:inline">Edit</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Edit task details</TooltipContent>
          </Tooltip>

          <ForwardTaskDialog
            taskId={task.id}
            open={forwardOpen}
            onOpenChange={setForwardOpen}
            isLoading={isLoading}
            sortedMembers={sortedMembers}
            forwardAttachments={forwardAttachments}
            forwardAttachmentsLoading={forwardAttachmentsLoading}
            forwardUploading={forwardUploading}
            forwardFileInputRef={forwardFileInputRef}
            handleForwardFileUpload={handleForwardFileUpload}
            handleRemoveAttachment={handleRemoveAttachment}
            handleForward={handleForward}
          />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDuplicate}
                disabled={isLoading}
                className="text-muted-foreground hover:text-indigo-600 hover:bg-indigo-50 active:text-indigo-700 active:bg-indigo-100 active:scale-[0.98] transition-all duration-200 px-2 shrink-0"
              >
                <Copy className="h-4 w-4" /> <span className="hidden xs:inline">Copy</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Duplicate this task</TooltipContent>
          </Tooltip>
        </div>

        {/* Meta Area - History & Notes */}
        <div className="flex items-center gap-1 flex-wrap">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "h-8 px-2 gap-1.5 text-xs transition-all duration-200 shrink-0",
                  showHistory
                    ? "text-electric-blue bg-electric-blue-light"
                    : "text-muted-foreground hover:text-foreground"
                )}
                onClick={() => {
                  setShowHistory(!showHistory)
                  setShowThread(false)
                }}
              >
                <HistoryIcon className="h-3.5 w-3.5" />
                <span className="hidden xs:inline">Audit Log</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>View task history</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "h-8 px-2 gap-1.5 text-xs transition-all duration-200 shrink-0",
                  showThread
                    ? "text-electric-blue bg-electric-blue-light"
                    : "text-muted-foreground hover:text-foreground"
                )}
                onClick={() => {
                  setShowThread(!showThread)
                  setShowHistory(false)
                }}
              >
                <MessageSquare className="h-3.5 w-3.5" />
                <span className="hidden xs:inline">Notes</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Add notes and attachments</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 gap-1.5 text-xs transition-all duration-200 shrink-0 text-muted-foreground hover:text-international-orange hover:bg-accent/10"
                onClick={() => setFullViewOpen(true)}
              >
                <Maximize2 className="h-3.5 w-3.5" />
                <span className="hidden xs:inline">Expand</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Open full view</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Special Actions Block */}
      {(isAITask || (!task.client_visible && task.status !== "Completed")) && (
        <div className="flex flex-col gap-2 pt-2 mt-2 bg-muted/50 -mx-4 px-4 pb-2">
          {isAITask && (task.status === "Pending" || task.status === "Accepted") && (
            <Button
              onClick={handleRunAI}
              disabled={aiRunning}
              size="sm"
              variant="secondary"
              className="w-full bg-status-info-light text-status-info-dark hover:bg-status-info-light/80 border border-status-info"
            >
              <Bot className="h-4 w-4" /> {aiRunning ? "AI Working..." : "Trigger AI Agent"}
            </Button>
          )}

          {!task.client_visible && task.status !== "Completed" && (
            <div className="w-full flex justify-center">
              <ClientNudgeButton taskId={task.id} lastNudge={task.last_nudge_at} />
            </div>
          )}
        </div>
      )}
    </CardFooter>
  )
}
