"use client"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { UserAvatar } from "@/components/ui/user-avatar"
import { AttachmentList } from "@/components/tasks/attachment-list"
import { ArrowRight, Paperclip, Upload, Loader2 } from "lucide-react"

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

interface ForwardTaskDialogProps {
  taskId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  isLoading: boolean
  sortedMembers: Member[]
  forwardAttachments: TaskAttachment[]
  forwardAttachmentsLoading: boolean
  forwardUploading: boolean
  forwardFileInputRef: React.RefObject<HTMLInputElement>
  handleForwardFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void
  handleRemoveAttachment: (fileId: string) => void
  handleForward: (formData: FormData) => void
}

export function ForwardTaskDialog({
  taskId,
  open,
  onOpenChange,
  isLoading,
  sortedMembers,
  forwardAttachments,
  forwardAttachmentsLoading,
  forwardUploading,
  forwardFileInputRef,
  handleForwardFileUpload,
  handleRemoveAttachment,
  handleForward,
}: ForwardTaskDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              disabled={isLoading}
              className="text-muted-foreground hover:text-status-warning hover:bg-status-warning-light active:text-status-warning-dark active:bg-status-warning-light/80 active:scale-[0.98] transition-all duration-200 px-2 shrink-0"
            >
              <ArrowRight className="h-4 w-4" /> <span className="hidden xs:inline">Forward</span>
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent>Forward or reassign task</TooltipContent>
      </Tooltip>
      <DialogContent className="bg-background shadow-xl text-foreground">
        <DialogHeader>
          <DialogTitle>Forward Task</DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Reassign this task and provide context for the new assignee
          </p>
        </DialogHeader>
        <form action={handleForward} className="space-y-4">
          <div className="grid gap-2">
            <label className="text-sm font-medium text-foreground">New Assignee</label>
            <Select name="new_assignee_id" required>
              <SelectTrigger className="bg-background">
                <SelectValue placeholder="Select person..." />
              </SelectTrigger>
              <SelectContent className="bg-background shadow-lg z-50">
                {sortedMembers.map((member) => (
                  <SelectItem key={member.id} value={member.id}>
                    <div className="flex items-center gap-3">
                      <UserAvatar name={member.full_name} role={member.role} size="md" showBorder />
                      <span>
                        {member.full_name}
                        {member.role === "AI_Agent" && " 🤖"}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium text-foreground">Handover Information</label>
            <p className="text-xs text-muted-foreground">
              Provide context, instructions, or any important details for the new assignee
            </p>
            <Textarea
              name="reason"
              placeholder="e.g., 'Please review the attached documents and coordinate with the legal team. The deadline is urgent - client needs this by end of week.'"
              required
              className="bg-muted min-h-[120px] resize-y"
            />
          </div>

          {/* Attachments Section */}
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-foreground flex items-center gap-2">
                <Paperclip className="h-4 w-4" />
                Attachments
              </label>
              <div>
                <input
                  type="file"
                  ref={forwardFileInputRef}
                  onChange={handleForwardFileUpload}
                  className="hidden"
                  accept="*/*"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => forwardFileInputRef.current?.click()}
                  disabled={forwardUploading}
                  className="gap-2"
                >
                  {forwardUploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  Add File
                </Button>
              </div>
            </div>
            <div className="bg-muted rounded-lg p-3 max-h-[200px] overflow-y-auto">
              {forwardAttachmentsLoading ? (
                <div className="flex items-center justify-center py-4 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Loading attachments...
                </div>
              ) : (
                <AttachmentList
                  taskId={taskId}
                  attachments={forwardAttachments}
                  canDelete={true}
                  onDelete={handleRemoveAttachment}
                />
              )}
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => onOpenChange(false)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="default"
              className="flex-1 bg-status-warning hover:bg-status-warning-dark"
            >
              Forward Task
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
