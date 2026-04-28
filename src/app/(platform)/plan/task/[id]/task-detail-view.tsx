"use client"

/**
 * @file task-detail-view.tsx — Client sub-component for the /plan/task/[id]
 * drill-in. Rendered by page.tsx with pre-fetched, pre-normalised data.
 *
 * Interactivity surface:
 *  - "Close task" button (wired to existing legacy `completeTask` action for V1;
 *    Chunk B.4 will swap in the new Plan server action).
 *  - Reassign / Duplicate task are V1 stubs surfaced as disabled buttons with
 *    tooltips — avoids dead interactions while Chunk B.4 is in flight.
 *
 * Reference: PLAN-MOCKUP-TASK.html · PLAN-SCHEMA.md §§4, 5.
 */

import { useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  CheckCircle2,
  Copy,
  ListChecks,
  Loader2,
  MessageSquare,
  Users,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { UserAvatar } from "@/components/ui/user-avatar"
import { Markdown } from "@/components/ui/markdown"
import { cn } from "@/lib/utils"
import { completeTask } from "@/actions/tasks"

export interface TaskDetailData {
  task: {
    id: string
    title: string
    description: string | null
    status: string | null
    riskLevel: string | null
    progress: number | null
    endDate: string | null
    startDate: string | null
    parentTaskId: string | null
    objectiveId: string | null
  }
  assignees: Array<{
    id: string
    profileId: string | null
    displayName: string
    avatarUrl: string | null
    role: string | null
    kind: "user" | "fractional" | "specialist"
  }>
  subtasks: Array<{
    id: string
    title: string
    status: string
    progress: number | null
    endDate: string | null
  }>
  comments: Array<{
    id: string
    content: string
    isSystemLog: boolean
    createdAt: string | null
    authorName: string
    authorAvatarUrl: string | null
  }>
}

function priorityVariant(risk: string | null): "default" | "warning" | "destructive" | "secondary" {
  switch ((risk ?? "").toLowerCase()) {
    case "high":
    case "critical":
      return "destructive"
    case "medium":
      return "warning"
    case "low":
      return "secondary"
    default:
      return "default"
  }
}

function statusVariant(status: string | null): "default" | "success" | "secondary" | "warning" {
  const s = (status ?? "").toLowerCase()
  if (s === "completed" || s === "done") return "success"
  if (s === "pending") return "secondary"
  if (s === "blocked") return "warning"
  return "default"
}

function formatDate(value: string | null): string {
  if (!value) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
}

export function TaskDetailView({ data }: { data: TaskDetailData }) {
  const router = useRouter()
  const [isClosing, startClosing] = useTransition()
  const { task, assignees, subtasks, comments } = data
  const isCompleted = (task.status ?? "").toLowerCase() === "completed"

  const handleClose = () => {
    startClosing(async () => {
      const result = await completeTask(task.id)
      if (result && typeof result === "object" && "error" in result && result.error) {
        const msg = typeof result.error === "string" ? result.error : "Could not close task"
        toast.error(msg)
        return
      }
      toast.success("Task closed")
      router.refresh()
    })
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-4 sm:p-6 lg:p-8">
      {/* Header ───────────────────────────────────────────────────────── */}
      <header className="flex flex-col gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/plan" className="hover:text-foreground">
            Plan
          </Link>
          <span aria-hidden="true">/</span>
          <span>Task</span>
        </div>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{task.title}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge variant={statusVariant(task.status)}>{task.status ?? "Pending"}</Badge>
              {task.riskLevel && (
                <Badge variant={priorityVariant(task.riskLevel)}>{task.riskLevel} priority</Badge>
              )}
              {task.parentTaskId && (
                <Badge variant="secondary">
                  <Link href={`/plan/task/${task.parentTaskId}`} className="hover:underline">
                    Sub-task of parent
                  </Link>
                </Badge>
              )}
            </div>
          </div>
          {/* Assignee stack */}
          {assignees.length > 0 && (
            <div className="flex -space-x-2">
              {assignees.slice(0, 4).map((a) => (
                <UserAvatar
                  key={a.id}
                  name={a.displayName}
                  role={a.role}
                  avatarUrl={a.avatarUrl}
                  size="md"
                  className="border-2 border-background"
                />
              ))}
              {assignees.length > 4 && (
                <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-background bg-muted text-xs font-medium text-muted-foreground">
                  +{assignees.length - 4}
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* Main column ────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-6">
          {/* Description */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Description</CardTitle>
            </CardHeader>
            <CardContent>
              {task.description ? (
                <Markdown content={task.description} />
              ) : (
                <p className="text-sm text-muted-foreground">No description yet.</p>
              )}
            </CardContent>
          </Card>

          {/* Sub-tasks */}
          {subtasks.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ListChecks className="h-4 w-4" aria-hidden="true" />
                  Sub-tasks ({subtasks.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {subtasks.map((st) => {
                  const done = (st.status ?? "").toLowerCase() === "completed"
                  return (
                    <Link
                      key={st.id}
                      href={`/plan/task/${st.id}`}
                      className="flex items-center gap-3 rounded-md border border-border p-3 text-sm transition-colors hover:bg-muted/50"
                    >
                      <CheckCircle2
                        className={cn(
                          "h-4 w-4 shrink-0",
                          done ? "text-status-success-dark" : "text-muted-foreground",
                        )}
                        aria-hidden="true"
                      />
                      <span className={cn("flex-1 truncate", done && "line-through text-muted-foreground")}>
                        {st.title}
                      </span>
                      {st.endDate && (
                        <span className="text-xs text-muted-foreground">{formatDate(st.endDate)}</span>
                      )}
                    </Link>
                  )
                })}
              </CardContent>
            </Card>
          )}

          {/* Thread */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <MessageSquare className="h-4 w-4" aria-hidden="true" />
                Thread ({comments.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {comments.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No messages yet. Comments posted on this task will appear here.
                </p>
              ) : (
                <ul className="space-y-4">
                  {comments.map((c) => (
                    <li key={c.id} className="flex gap-3">
                      <UserAvatar
                        name={c.authorName}
                        avatarUrl={c.authorAvatarUrl}
                        size="sm"
                        showTooltip={false}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className="text-sm font-medium">{c.authorName}</span>
                          <span className="text-xs text-muted-foreground">
                            {formatDate(c.createdAt)}
                          </span>
                          {c.isSystemLog && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                              system
                            </Badge>
                          )}
                        </div>
                        <div className="mt-1 text-sm text-foreground whitespace-pre-wrap break-words">
                          {c.content}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar ───────────────────────────────────────────────────── */}
        <aside className="flex flex-col gap-4">
          <Card>
            <CardContent className="flex flex-col gap-3 p-4 sm:p-6">
              <Button
                onClick={handleClose}
                disabled={isClosing || isCompleted}
                className="w-full"
              >
                {isClosing ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                )}
                {isCompleted ? "Task closed" : "Close task"}
              </Button>
              <Button
                variant="outline"
                className="w-full"
                disabled
                title="Duplicate task · V1 cut"
              >
                <Copy className="h-4 w-4" aria-hidden="true" />
                Duplicate task
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Users className="h-4 w-4" aria-hidden="true" />
                Assignees
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {assignees.length === 0 ? (
                <p className="text-sm text-muted-foreground">Unassigned.</p>
              ) : (
                assignees.map((a) => (
                  <div key={a.id} className="flex items-center gap-3">
                    <UserAvatar
                      name={a.displayName}
                      role={a.role}
                      avatarUrl={a.avatarUrl}
                      size="sm"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{a.displayName}</div>
                      {a.role && (
                        <div className="text-xs text-muted-foreground truncate">{a.role}</div>
                      )}
                    </div>
                  </div>
                ))
              )}
              <Separator />
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start"
                disabled
                title="Reassign · coming in Chunk B.4"
              >
                Reassign
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-2 p-4 sm:p-6 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Due</span>
                <span className="font-medium">{formatDate(task.endDate)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Started</span>
                <span className="font-medium">{formatDate(task.startDate)}</span>
              </div>
              {typeof task.progress === "number" && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Progress</span>
                  <span className="font-medium">{task.progress}%</span>
                </div>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  )
}
